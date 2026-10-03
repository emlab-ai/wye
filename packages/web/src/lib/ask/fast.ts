// The fast lane (decision:wf2.ask-two-lanes): the retrieved passages, numbered, and the question go to one tool-less
// model call; its answer streams back token by token with [n] citations into that numbering.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../products';
import type { Hit } from './types';
import { spawnClaude } from './claude';

export const ASK_MODEL = process.env.WYE_ASK_MODEL || 'claude-sonnet-5-5';
const brief = () => readFileSync(path.join(REPO_ROOT, 'prompts/ask-fast.md'), 'utf8');

export function fastPrompt(q: string, hits: Hit[], history: { q: string; a: string }[] = []): string {
  const src = hits.map((h, i) => `[${i + 1}] ${h.source} ${h.ref}${h.via ? ` (via ${h.via})` : ''} — ${h.title}\n${h.text}`).join('\n\n');
  const hist = history.length ? `\n## Earlier in this conversation\n${history.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n')}\n` : '';
  return `${brief()}\n${hist}\n## Sources\n${src || '(none found)'}\n\n## Question\n${q}\n`;
}

export async function* runFast(prompt: string, opts: { signal: AbortSignal }): AsyncGenerator<string> {
  let streamed = false;
  for await (const l of spawnClaude(['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', ASK_MODEL, '--tools', ''], prompt, { signal: opts.signal, timeoutMs: 90000 })) {
    const ev = l.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (l.type === 'stream_event' && ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) { streamed = true; yield ev.delta.text; }
    else if (l.type === 'result' && !streamed && typeof l.result === 'string') yield l.result;
  }
}
