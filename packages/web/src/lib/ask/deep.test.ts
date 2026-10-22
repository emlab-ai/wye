import { describe, it, expect, vi } from 'vitest';

// the agent's stream, as claude -p --output-format stream-json --include-partial-messages writes it
let lines: Record<string, unknown>[] = []; let prompt = '';
vi.mock('./claude', () => ({ spawnClaude: async function* (_a: string[], p: string) { prompt = p; for (const l of lines) yield l; } }));
const { runDeep } = await import('./deep');

const se = (event: Record<string, unknown>) => ({ type: 'stream_event', event });
const text = (t: string) => se({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } });
const msg = (parts: Record<string, unknown>[], stop: string) => [se({ type: 'message_start' }), ...parts, se({ type: 'message_delta', delta: { stop_reason: stop } })];
const tool = [se({ type: 'content_block_start', content_block: { type: 'tool_use' } }), { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'wye node x' } }] } }];
async function answer(): Promise<string> {
  let s = ''; for await (const e of runDeep('q', [], { signal: new AbortController().signal, product: 'p', productDir: '/nowhere', codeRoot: '', wfUrl: 'http://x', known: () => true })) if (e.type === 'delta') s += e.text;
  return s;
}

describe('the deep lane\'s answer', () => {
  it('is its last message: the notes it writes before a tool call are not', async () => {
    lines = [...msg([text('Let me check the session.'), ...tool], 'tool_use'), ...msg([text('Need the date; '), text('search again.'), ...tool], 'tool_use'), ...msg([text('Alaska.'), text(' Mount Talkeetna is there.')], 'end_turn')];
    expect(await answer()).toBe('Alaska. Mount Talkeetna is there.');
  });
  it('streams a long answer as it comes', async () => {
    const long = 'x'.repeat(500);
    lines = msg([text(long), text(' and more')], 'end_turn');
    expect(await answer()).toBe(`${long} and more`);
  });
  it('starts from the query plan and its rows when one ran (plan:ask-query-plan)', async () => {
    lines = msg([text('Two.')], 'end_turn');
    for await (const _ of runDeep('q', [], { signal: new AbortController().signal, product: 'p', productDir: '/nowhere', codeRoot: '', wfUrl: 'http://x', known: () => true, graph: 'Plan: shape count\n\nQuery results:\n- races: 2 row(s)', planned: true })) void _;
    expect(prompt).toContain('The query plan for this question and what its queries returned'); expect(prompt).toContain('races: 2 row(s)');
    for await (const _ of runDeep('q', [], { signal: new AbortController().signal, product: 'p', productDir: '/nowhere', codeRoot: '', wfUrl: 'http://x', known: () => true, graph: '- a node' })) void _;
    expect(prompt).toContain('What the knowledge graph links to this question');
  });
});
