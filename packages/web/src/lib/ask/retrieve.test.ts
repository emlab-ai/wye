import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { retrieve, hrefFor } from './retrieve';
import { openStore, apply, hashOf } from './store';
import { indexGraph, type GraphData } from '../graph';
import type { ChunkRow } from './types';

const n = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: id.split(':')[0], title: id, status: 'approved', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 1, ...extra });
const g = { generatedAt: '', modules: [], files: [], fieldIndex: {}, nodes: [n('decision:no-email'), n('req:invite'), n('component:signup-form'), n('decision:old', { status: 'superseded' })],
  edges: [{ from: 'decision:no-email', to: 'req:invite', verb: 'affects' }, { from: 'req:invite', to: 'component:signup-form', verb: 'satisfied-by' }] } as unknown as GraphData;
const idx = indexGraph(g);
const c = (source: ChunkRow['source'], ref: string, text: string, vector: number[], nodes: string[] = []) => { const x: ChunkRow = { id: `${source}:${ref}`, source, ref, title: ref, text, nodes }; return { ...x, scope: 's', hash: hashOf(x), model: 'm', vector }; };

async function setup() {
  const s = await openStore(await mkdtemp(path.join(tmpdir(), 'ask-ret-')), 2);
  await apply(s, [], [
    c('node', 'decision:no-email', 'we stopped sending the invite email', [1, 0], ['decision:no-email']),
    c('node', 'req:invite', 'a person can invite a teammate', [0.6, 0.8], ['req:invite']),
    c('node', 'component:signup-form', 'the form a person fills in', [0, 1], ['component:signup-form']),
    c('node', 'decision:old', 'send an invite email on signup', [0.9, 0.1], ['decision:old']),
    c('doc', 'v2/m#b-1', 'background on why the email went away', [0.8, 0.2], ['decision:no-email']),
    c('code', 'lib/invite.ts:1-9', 'function sendInvite() {}', [0, 1]),
  ]);
  return s;
}

describe('retrieve', () => {
  it('fuses text and vector hits and hides ended nodes', async () => {
    const hits = await retrieve({ product: 'p', store: await setup(), idx, embed: async () => [[1, 0]] }, 'invite email');
    const ids = hits.map(h => h.id);
    expect(ids[0]).toBe('node:decision:no-email');
    expect(ids).toContain('doc:v2/m#b-1');                      // no shared words: found by its vector
    expect(ids).not.toContain('node:decision:old');
  });
  it('expands one hop along structural edges and to passages that mention a hit', async () => {
    const hits = await retrieve({ product: 'p', store: await setup(), idx, embed: null }, 'teammate', { expand: true });
    expect(hits[0].id).toBe('node:req:invite');
    expect(hits.find(h => h.id === 'node:component:signup-form')?.via).toBe('req:invite satisfied-by');
    expect(hits.find(h => h.id === 'node:decision:no-email')?.via).toBe('req:invite affects');
    expect(hits.find(h => h.id === 'node:decision:no-email')!.score).toBeLessThan(hits[0].score);
  });
  it('can show ended nodes with all', async () => {
    const hits = await retrieve({ product: 'p', store: await setup(), idx, embed: null }, 'invite email signup', { all: true });
    expect(hits.map(h => h.id)).toContain('node:decision:old');
  });
  it('filters by source and works without vectors', async () => {
    const hits = await retrieve({ product: 'p', store: await setup(), idx, embed: null }, 'sendInvite', { sources: ['code'] });
    expect(hits.map(h => h.id)).toEqual(['code:lib/invite.ts:1-9']);
  });
  it('reorders by the reranker when asked', async () => {
    const rerank = async (_q: string, texts: string[]) => texts.map(t => (t.includes('teammate') ? 10 : 0));
    const hits = await retrieve({ product: 'p', store: await setup(), idx, embed: null, rerank }, 'invite', { rerank: true });
    expect(hits[0].id).toBe('node:req:invite');
  });
  it('pins a node whose id is typed, exactly or as a prefix', async () => {
    // titles are prose, as in real nodes; another passage repeats the id's words many times
    const s = await openStore(await mkdtemp(path.join(tmpdir(), 'ask-pin-')), 2);
    const row = (id: string, title: string, text: string) => { const x: ChunkRow = { id: 'node:' + id, source: 'node', ref: id, title, text, nodes: [id] }; return { ...x, scope: 's', hash: hashOf(x), model: 'm', vector: [0, 1] }; };
    await apply(s, [], [row('req:invite', 'People bring colleagues', 'a person can add a teammate'), row('decision:no-email', 'Links not mail', 'no mail is sent'),
      { ...c('doc', 'v2/m#b-9', 'req invite req invite req invite the invite req page', [1, 0]) }]);
    const ctx = { product: 'p', store: s, idx, embed: async () => [[1, 0]] };
    expect((await retrieve(ctx, 'req:invite'))[0].id).toBe('node:req:invite');
    expect((await retrieve(ctx, 'what about decision:no-em'))[0].id).toBe('node:decision:no-email');
  });
  it('narrows to one kind on the server, and lists the kind when there is no text', async () => {
    const ctx = { product: 'p', store: await setup(), idx, embed: async () => [[1, 0]] };
    expect((await retrieve(ctx, 'invite', { kind: 'decision' })).map(h => h.id)).toEqual(['node:decision:no-email']);
    expect((await retrieve(ctx, '', { kind: 'decision' })).map(h => h.id)).toEqual(['node:decision:no-email']);
    expect((await retrieve(ctx, '', { kind: 'decision', all: true })).map(h => h.id).sort()).toEqual(['node:decision:no-email', 'node:decision:old']);
  });
  it('a query of stop words finds nothing, even with vectors', async () => {
    expect(await retrieve({ product: 'p', store: await setup(), idx, embed: async () => [[1, 0]] }, 'the and of')).toEqual([]);
  });
  it('returns nothing for a query with no words', async () => {
    expect(await retrieve({ product: 'p', store: await setup(), idx, embed: null }, ' ? ')).toEqual([]);
  });
  it('trims to the character budget, keeping at least one', async () => {
    const hits = await retrieve({ product: 'p', store: await setup(), idx, embed: null }, 'invite', { budgetChars: 10 });
    expect(hits.length).toBe(1);
  });
});

describe('hrefFor', () => {
  const row = (source: ChunkRow['source'], ref: string): ChunkRow => ({ id: `${source}:${ref}`, source, ref, title: '', text: '', nodes: [] });
  it('links nodes, doc blocks, sessions; code has no page', () => {
    expect(hrefFor('p', row('node', 'req:invite'), idx)).toBe('/p/v2/d/m#n-req%3Ainvite');
    expect(hrefFor('p', row('doc', 'v2/m#b-abc'), idx)).toBe('/p/v2/d/m#b-abc');
    expect(hrefFor('p', row('session', 'abc123#2'), idx)).toBe('/p/sessions/abc123');
    expect(hrefFor('p', row('code', 'lib/a.ts:1-9'), idx)).toBeNull();
  });
});
