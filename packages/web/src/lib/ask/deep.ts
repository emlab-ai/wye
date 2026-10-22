// The deep lane (decision:wf2.ask-two-lanes): a read-only agent — wye search, graph and document reads, Read / Grep /
// Glob in the product's code — that investigates until it can answer. It never writes or proposes
// (constraint:wf2.pr-is-the-persons). Capped at 20 tool calls or 120 s; then it is stopped and its partial answer stands.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../products';
import { spawnClaude } from './claude';
import { ASK_MODEL } from './fast';
import { stepText, refsFromToolUse, refsFromToolResult } from './refs';

export type DeepEvent = { type: 'step'; text: string } | { type: 'refs'; refs: string[] } | { type: 'delta'; text: string } | { type: 'done'; cut: boolean };
const HOLD = 400;
export type DeepOpts ={ signal: AbortSignal; product: string; productDir: string; codeRoot: string; wfUrl: string; known: (id: string) => boolean; maxTools?: number; timeoutMs?: number; model?: string; graph?: string; planned?: boolean };

export function deepArgs(o: { product: string; productDir: string; codeRoot: string; wfUrl: string; model?: string }): string[] {
  const brief = readFileSync(path.join(REPO_ROOT, 'prompts/ask-deep.md'), 'utf8').replaceAll('{{product}}', o.product).replaceAll('{{code}}', o.codeRoot || '(this product names no code folder)').replaceAll('{{docs}}', o.productDir);
  return ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', o.model || ASK_MODEL, '--append-system-prompt', brief,
    '--tools', 'Bash,Read,Grep,Glob', '--permission-mode', 'default', '--strict-mcp-config',
    ...(o.codeRoot ? ['--add-dir', o.codeRoot] : []), '--add-dir', o.productDir,
    '--allowedTools', 'Bash(wye:*)', 'Read', 'Grep', 'Glob',
    '--disallowedTools', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash(git:*)', 'Bash(rm:*)', 'Bash(npm:*)', 'Bash(node:*)', 'Agent', 'Task', 'WebFetch', 'WebSearch'];
}

// the agent's environment: wye pointed at this product, read-only, and never inside someone's session
export function deepEnv(o: { product: string; wfUrl: string }, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...base, WYE_URL: o.wfUrl, WYE_PRODUCT: o.product, WYE_READONLY: '1' };
  for (const k of ['WYE_SESSION', 'WF_SESSION']) delete e[k];
  return e;
}
export async function* runDeep(q: string, history: { q: string; a: string }[], o: DeepOpts): AsyncGenerator<DeepEvent> {
  const max = o.maxTools ?? 20; let tools = 0; let cut = false; let streamed = false; let held = ''; let live = false;
  const inner = new AbortController(); const stop = () => inner.abort(); o.signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => { cut = true; inner.abort(); }, o.timeoutMs ?? 120000);
  const roots = { code: o.codeRoot, product: o.productDir };
  const prompt = `${history.length ? `Earlier in this conversation:\n${history.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n')}\n\n` : ''}${o.graph ? `${o.planned ? 'The query plan for this question and what its queries returned (start from it; confirm a row in its source before you use it):' : 'What the knowledge graph links to this question (start from it, open what you need):'}\n${o.graph}\n\n` : ''}Question: ${q}`;
  try {
    for await (const l of spawnClaude(deepArgs(o), prompt, { signal: inner.signal, cwd: o.codeRoot && existsSync(o.codeRoot) ? o.codeRoot : existsSync(o.productDir) ? o.productDir : undefined, env: deepEnv(o) })) {
      const content = ((l.message as { content?: unknown[] } | undefined)?.content ?? []) as Record<string, unknown>[];
      if (l.type === 'assistant') for (const c of content) if (c.type === 'tool_use') {
        const input = (c.input ?? {}) as Record<string, unknown>;
        yield { type: 'step', text: stepText(String(c.name), input, roots) };
        const refs = refsFromToolUse(String(c.name), input, roots); if (refs.length) yield { type: 'refs', refs };
        if (++tools >= max) { cut = true; inner.abort(); }
      }
      if (l.type === 'user') for (const c of content) if (c.type === 'tool_result') {
        const t = typeof c.content === 'string' ? c.content : Array.isArray(c.content) ? (c.content as { text?: string }[]).map(x => x.text ?? '').join('\n') : '';
        const refs = refsFromToolResult(t, o.known); if (refs.length) yield { type: 'refs', refs };
      }
      // the answer is the text of the agent's last message: what it writes before a tool call ("Let me check the
      // session…") is its working, held back until the message shows it is no tool call (it ends, or runs past
      // HOLD characters) — 95 of 1,986 LoCoMo answers began with such notes (MemoryBench 2026-10-21)
      const ev = l.event as { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; content_block?: { type?: string } } | undefined;
      if (l.type === 'stream_event' && ev?.type === 'message_start') { held = ''; live = false; }
      else if (l.type === 'stream_event' && ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use' && !live) held = '';
      else if (l.type === 'stream_event' && ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        if (live) { yield { type: 'delta', text: ev.delta.text }; continue; }
        held += ev.delta.text;
        if (held.length > HOLD) { live = streamed = true; yield { type: 'delta', text: held }; held = ''; }
      }
      else if (l.type === 'stream_event' && ev?.type === 'message_delta' && ev.delta?.stop_reason && ev.delta.stop_reason !== 'tool_use' && held) { streamed = true; yield { type: 'delta', text: held }; held = ''; }
      else if (l.type === 'result' && !streamed) { streamed = true; const t = held || (typeof l.result === 'string' ? l.result : ''); held = ''; if (t) yield { type: 'delta', text: t }; }
    }
  } finally { clearTimeout(timer); o.signal.removeEventListener('abort', stop); }
  // cut off mid-answer: what it had written stands (the partial answer), unless it was a note before a tool call
  if (!streamed && held.trim() && !o.signal.aborted) yield { type: 'delta', text: held };
  if (!o.signal.aborted) yield { type: 'done', cut };
}
