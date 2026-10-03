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
export type DeepOpts = { signal: AbortSignal; product: string; productDir: string; codeRoot: string; wfUrl: string; known: (id: string) => boolean; maxTools?: number; timeoutMs?: number };

export function deepArgs(o: { product: string; productDir: string; codeRoot: string; wfUrl: string }): string[] {
  const brief = readFileSync(path.join(REPO_ROOT, 'prompts/ask-deep.md'), 'utf8').replaceAll('{{product}}', o.product).replaceAll('{{code}}', o.codeRoot).replaceAll('{{docs}}', o.productDir);
  return ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', ASK_MODEL, '--append-system-prompt', brief,
    '--add-dir', o.codeRoot, '--add-dir', o.productDir,
    '--allowedTools', 'Bash(wye:*)', 'Read', 'Grep', 'Glob',
    '--disallowedTools', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash(git:*)', 'Bash(rm:*)', 'Bash(npm:*)', 'Bash(node:*)', 'Agent', 'Task', 'WebFetch', 'WebSearch'];
}

export async function* runDeep(q: string, history: { q: string; a: string }[], o: DeepOpts): AsyncGenerator<DeepEvent> {
  const max = o.maxTools ?? 20; let tools = 0; let cut = false; let streamed = false;
  const inner = new AbortController(); const stop = () => inner.abort(); o.signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => { cut = true; inner.abort(); }, o.timeoutMs ?? 120000);
  const roots = { code: o.codeRoot, product: o.productDir };
  const prompt = `${history.length ? `Earlier in this conversation:\n${history.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n')}\n\n` : ''}Question: ${q}`;
  try {
    for await (const l of spawnClaude(deepArgs(o), prompt, { signal: inner.signal, cwd: existsSync(o.codeRoot) ? o.codeRoot : undefined, env: { ...process.env, WYE_URL: o.wfUrl, WYE_PRODUCT: o.product } })) {
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
      const ev = l.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
      if (l.type === 'stream_event' && ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) { streamed = true; yield { type: 'delta', text: ev.delta.text }; }
      else if (l.type === 'result' && !streamed && typeof l.result === 'string') yield { type: 'delta', text: l.result };
    }
  } finally { clearTimeout(timer); o.signal.removeEventListener('abort', stop); }
  if (!o.signal.aborted) yield { type: 'done', cut };
}
