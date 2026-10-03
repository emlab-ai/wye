import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fastPrompt, runFast } from './fast';
import { spawnClaude } from './claude';
import type { Hit } from './types';

const FX = path.join(__dirname, 'fixtures');
beforeAll(() => { process.env.WYE_CLAUDE_BIN = `node ${path.join(FX, 'claude-stub.mjs')}`; });
const hit = (id: string, text: string): Hit => ({ id, source: 'node', ref: id.slice(5), title: id, text, nodes: [], score: 1, href: null });

describe('fastPrompt', () => {
  it('numbers the sources from 1 and carries the question and history', () => {
    const p = fastPrompt('why no invite email?', [hit('node:decision:a', 'we stopped'), hit('node:req:b', 'invite')], [{ q: 'earlier?', a: 'yes' }]);
    expect(p).toContain('[1] node decision:a'); expect(p).toContain('[2] node req:b');
    expect(p).toContain('why no invite email?'); expect(p).toContain('earlier?');
  });
});
describe('runFast', () => {
  it('yields the text deltas', async () => {
    process.env.STUB_JSONL = path.join(FX, 'fast.jsonl');
    const out: string[] = []; for await (const t of runFast('p', { signal: new AbortController().signal })) out.push(t);
    expect(out.join('')).toBe('The invite email was dropped in favour of links [1][3].');
  });
  it('throws when the binary fails', async () => {
    process.env.STUB_JSONL = path.join(FX, 'fast.jsonl'); process.env.STUB_EXIT = '3';
    await expect((async () => { for await (const _ of runFast('p', { signal: new AbortController().signal })) void _; })()).rejects.toThrow(/exited 3/);
    delete process.env.STUB_EXIT;
  });
  it('ends quietly and kills the child on abort', async () => {
    process.env.STUB_JSONL = path.join(FX, 'fast.jsonl'); process.env.STUB_DELAY = '200';
    const ac = new AbortController(); const got: unknown[] = [];
    const run = (async () => { for await (const l of spawnClaude([], '', { signal: ac.signal })) { got.push(l); ac.abort(); } })();
    await expect(run).resolves.toBeUndefined(); expect(got.length).toBe(1);
    delete process.env.STUB_DELAY;
  });
});
