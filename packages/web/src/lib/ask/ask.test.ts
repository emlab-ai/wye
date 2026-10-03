import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { ask, resolveRef, type AskEnvLike } from './ask';
import { openStore, apply, hashOf } from './store';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ChunkRow } from './types';
import { indexGraph, type GraphData } from '../graph';
import type { AskEvent } from './types';

const FX = path.join(__dirname, 'fixtures');
const g = { generatedAt: '', modules: [], files: [], fieldIndex: {}, edges: [], nodes: [{ id: 'decision:no-email', kind: 'decision', title: 'No invite email', status: 'approved', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 1 }] } as unknown as GraphData;
async function env(): Promise<AskEnvLike> {
  const store = await openStore(await mkdtemp(path.join(tmpdir(), 'ask-o-')), 2);
  const row = (c: ChunkRow) => ({ ...c, scope: 's', hash: hashOf(c), model: 'm', vector: [1, 0] });
  await apply(store, [], [row({ id: 'node:decision:no-email', source: 'node', ref: 'decision:no-email', title: 'No invite email', text: 'we stopped sending the invite email', nodes: ['decision:no-email'] }),
    row({ id: 'code:lib/invite.ts:1-9', source: 'code', ref: 'lib/invite.ts:1-9', title: 'lib/invite.ts', text: 'function sendInvite', nodes: [] })]);
  return { ctx: { product: 'p', store, idx: indexGraph(g), embed: null }, productDir: '/REPO/data/products/p', codeRoot: '/REPO' };
}
// the stub picks the deep fixture itself when its args carry --allowedTools
beforeAll(() => { process.env.WYE_CLAUDE_BIN = `node ${path.join(FX, 'claude-stub.mjs')}`; process.env.STUB_JSONL = path.join(FX, 'fast.jsonl'); process.env.STUB_DEEP = path.join(FX, 'deep.jsonl'); });
afterEach(() => { delete process.env.STUB_EXIT_DEEP; delete process.env.STUB_DELAY; });
const collect = async (it: AsyncGenerator<AskEvent>) => { const out: AskEvent[] = []; for await (const e of it) out.push(e); return out; };

describe('ask', () => {
  it('streams results, both answers, live found sources, one numbering, then done', async () => {
    const ev = await collect(ask(await env(), { q: 'why no invite email?' }, { signal: new AbortController().signal, wfUrl: 'http://x' }));
    const types = ev.map(e => e.type);
    expect(types[0]).toBe('results'); expect(types.at(-1)).toBe('done');
    expect(types).toContain('fast.done'); expect(types).toContain('deep.done'); expect(types).toContain('step');
    const found = ev.filter(e => e.type === 'found').map(e => (e as Extract<AskEvent, { type: 'found' }>).citation.ref);
    expect(found).toEqual(expect.arrayContaining(['lib/invite.ts:10-29']));
    const deep = ev.find(e => e.type === 'deep.done') as Extract<AskEvent, { type: 'deep.done' }>;
    const deepText = ev.filter(e => e.type === 'deep.delta').map(e => (e as { text: string }).text).join('');
    const n = deep.citations.find(c => c.ref === 'decision:no-email')!.n;
    const hits = (ev[0] as Extract<AskEvent, { type: 'results' }>).hits;
    expect(n).toBe(hits.findIndex(h => h.ref === 'decision:no-email') + 1);   // the number the fast lane's prompt gave it
    expect(deepText).toContain(`[${n}]`); expect(deepText).not.toContain('[[');
  });
  it('a failing lane reports an error and the other still answers', async () => {
    process.env.STUB_EXIT_DEEP = '2';
    const ev = await collect(ask(await env(), { q: 'why no invite email?' }, { signal: new AbortController().signal, wfUrl: 'http://x' }));
    expect(ev.some(e => e.type === 'error' && e.lane === 'deep')).toBe(true);
    expect(ev.some(e => e.type === 'fast.done')).toBe(true); expect(ev.at(-1)!.type).toBe('done');
  });
  it('abort ends the stream without more events', async () => {
    const ac = new AbortController(); const ev: AskEvent[] = [];
    for await (const e of ask(await env(), { q: 'why no invite email?' }, { signal: ac.signal, wfUrl: 'http://x' })) { ev.push(e); if (e.type === 'results') ac.abort(); }
    expect(ev.map(e => e.type)).toEqual(['results']);
  });
  it('at its tool cap the deep lane still answers, from what it found', async () => {
    const ev = await collect(ask(await env(), { q: 'why no invite email?', lanes: ['deep'] }, { signal: new AbortController().signal, wfUrl: 'http://x', maxTools: 1 }));
    const done = ev.find(e => e.type === 'deep.done') as Extract<AskEvent, { type: 'deep.done' }>;
    expect(done.cut).toBe(true);
    expect(ev.filter(e => e.type === 'deep.delta').map(e => (e as { text: string }).text).join('')).toContain('invite email was dropped');
  });
  it('turns [[ref]] into [n] even when the brackets arrive in different chunks', async () => {
    process.env.STUB_DEEP = path.join(FX, 'deep-split.jsonl');
    try {
      const ev = await collect(ask(await env(), { q: 'why no invite email?', lanes: ['deep'] }, { signal: new AbortController().signal, wfUrl: 'http://x' }));
      const text = ev.filter(e => e.type === 'deep.delta').map(e => (e as { text: string }).text).join('');
      expect(text).not.toContain('[['); expect(text).toMatch(/^Dropped, see \[\d+\] and \[\d+\]\.$/);
    } finally { process.env.STUB_DEEP = path.join(FX, 'deep.jsonl'); }
  });
  it('runs only the lanes asked for', async () => {
    const ev = await collect(ask(await env(), { q: 'why no invite email?', lanes: ['fast'] }, { signal: new AbortController().signal, wfUrl: 'http://x' }));
    expect(ev.some(e => e.type.startsWith('deep') || e.type === 'step')).toBe(false);
  });
});
describe('resolveRef', () => {
  it('resolves node ids, chunk ids and code paths', async () => {
    const e = await env();
    expect((await resolveRef('decision:no-email', e))?.source).toBe('node');
    expect((await resolveRef('code:lib/invite.ts:1-9', e))?.ref).toBe('lib/invite.ts:1-9');
    expect(await resolveRef('lib/other.ts:5-9', e)).toMatchObject({ source: 'code', ref: 'lib/other.ts:5-9' });
    expect(await resolveRef('nonsense', e)).toBeNull();
  });
});
