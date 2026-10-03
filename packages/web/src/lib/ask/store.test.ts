import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore, state, apply, search, getChunks, chunksMentioning, ftsText, hashOf, type StoredRow } from './store';
import type { ChunkRow } from './types';

const DIM = 3;
const tmp = () => mkdtemp(path.join(tmpdir(), 'ask-store-'));
const r = (source: ChunkRow['source'], ref: string, text: string, o: { nodes?: string[]; scope?: string; vector?: number[]; model?: string } = {}): StoredRow => {
  const c: ChunkRow = { id: `${source}:${ref}`, source, ref, title: ref, text, nodes: o.nodes ?? [] };
  return { ...c, scope: o.scope ?? 's', hash: hashOf(c), model: o.model ?? 'm', vector: o.vector ?? [0, 0, 1] };
};

describe('store', () => {
  it('adds and removes rows, and reports id → scope/hash/model in one scan', async () => {
    const s = await openStore(await tmp(), DIM);
    expect((await state(s)).size).toBe(0);
    await apply(s, [], [r('doc', 'a', 'invite email flow', { scope: 'f1' }), r('doc', 'b', 'billing', { scope: 'f1' })]);
    await apply(s, ['doc:b'], [r('doc', 'c', 'new thing', { scope: 'f2' })]);
    const st = await state(s);
    expect([...st.keys()].sort()).toEqual(['doc:a', 'doc:c']);
    expect(st.get('doc:a')).toMatchObject({ scope: 'f1', model: 'm' });
    expect((await getChunks(s, ['doc:a', 'doc:b', 'doc:c'])).map(c => c.id)).toEqual(['doc:a', 'doc:c']);
  });
  it('persists across reopen', async () => {
    const dir = await tmp();
    await apply(await openStore(dir, DIM), [], [r('node', 'req:a', 'invite')]);
    expect((await getChunks(await openStore(dir, DIM), ['node:req:a'])).length).toBe(1);
  });
  it('full-text search ranks matches and filters by source', async () => {
    const s = await openStore(await tmp(), DIM);
    await apply(s, [], [r('node', 'req:a', 'the invite email is sent on signup'), r('node', 'req:b', 'billing runs monthly'), r('code', 'lib/invite.ts:1-9', 'function sendInvite() { email invite }')]);
    const all = await search(s, 'invite email', null, { limit: 5 });
    expect(all.map(h => h.id).sort()).toEqual(['code:lib/invite.ts:1-9', 'node:req:a']);
    expect((await search(s, 'invite email', null, { limit: 5, sources: ['node'] })).map(h => h.id)).toEqual(['node:req:a']);
  });
  it('hybrid search fuses text and vector rankings', async () => {
    const s = await openStore(await tmp(), DIM);
    await apply(s, [], [r('node', 'a', 'invite email', { vector: [1, 0, 0] }), r('node', 'b', 'unrelated words', { vector: [0, 0.9, 0.1] }), r('node', 'c', 'invite', { vector: [0, 1, 0] })]);
    const h = await search(s, 'invite', [0, 1, 0], { limit: 3 });
    expect(h.map(x => x.id)).toContain('node:b');           // found by the vector alone
    expect(h[0].id).toBe('node:c');                          // in both lists
  });
  it('treats query syntax in user text as plain words', async () => {
    const s = await openStore(await tmp(), DIM);
    await apply(s, [], [r('node', 'req:x.y', 'req:x.y NEAR "quoted" thing')]);
    for (const q of ['"quoted', 'req:x.y', 'NEAR AND OR', 'a-b*', '(thing)', "it's"]) await expect(search(s, q, null, { limit: 5 })).resolves.toBeDefined();
    expect((await search(s, 'quoted thing', null, { limit: 5 })).map(h => h.id)).toEqual(['node:req:x.y']);
  });
  it('a query with no searchable word and no vector finds nothing', async () => {
    expect(ftsText('')).toBeNull(); expect(ftsText('a ?')).toBeNull(); expect(ftsText('the of and')).toBeNull();
    const s = await openStore(await tmp(), DIM); await apply(s, [], [r('node', 'a', 'x')]);
    expect(await search(s, 'the ?', null, { limit: 5 })).toEqual([]);
  });
  it('finds chunks that mention a node', async () => {
    const s = await openStore(await tmp(), DIM);
    await apply(s, [], [r('doc', 'p#1', 'about req:a', { nodes: ['req:a'] }), r('doc', 'p#2', 'other', { nodes: ['req:ab'] })]);
    expect((await chunksMentioning(s, 'req:a', 5)).map(c => c.id)).toEqual(['doc:p#1']);
  });
  it('search on an empty store is empty, not an error', async () => {
    expect(await search(await openStore(await tmp(), DIM), 'anything', [1, 0, 0], { limit: 5 })).toEqual([]);
  });
});
