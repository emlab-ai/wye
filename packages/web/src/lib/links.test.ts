import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { candidateText, judgeText, confidentIds, linksFor } from './links';
import type { GraphData, GraphNode } from './graph';
import type { JevClient } from './jev';

// automatic links (Jev auto-linking design §3): the search finds candidates, Jev judges them, the confident ones are
// the links; a block's verdict is cached by its text so it is never judged twice
const node = (id: string, body: string): GraphNode => ({ id, kind: id.split(':')[0], title: '', status: '', section: '', subsection: '', file: 'x.md', line: 1, body, defined: true });
const graph = (nodes: GraphNode[]): GraphData => ({ generatedAt: '', modules: [], files: [], nodes, edges: [], fieldIndex: {} });
const fakeJev = (ps: Record<string, number>, calls: string[] = []): JevClient => ({
  enabled: true, model: 'fake', ask: async () => ({ model: 'fake', answers: {}, usage: {} }),
  judgeLinks: async (text, cands) => { calls.push(text); return cands.map(c => ({ id: c.id, p: ps[c.id] ?? 0 })); },
  judgeKind: async () => ({ kind: 'note', p: 0 }),
});
const off: JevClient = { ...fakeJev({}), enabled: false };
let searches = 0;
const searchFn = async () => { searches++; return Object.assign([{ id: 'rule:round', score: 0.7, semantic: 0.7, keyword: 0, snippet: '' }, { id: 'req:login', score: 0.4, semantic: 0.4, keyword: 0, snippet: '' }], { hidden: 0 }); };

describe('links', () => {
  const g = graph([node('rule:round', 'statement: prices round half-up'), node('req:login', 'title: Login\nwhen: a user signs in')]);
  it('candidateText takes the prose keys of a node', () => {
    expect(candidateText(g.nodes[0])).toBe('prices round half-up');
    expect(candidateText(g.nodes[1])).toBe('Login. a user signs in');
  });
  it('judgeText attaches p to every hit; disabled → p 0, no call; given hits → no search', async () => {
    const calls: string[] = [];
    const hits = await judgeText('/tmp/none', g, 'Checkout rounds half-up', { jev: fakeJev({ 'rule:round': 0.93, 'req:login': 0.1 }, calls), searchFn: searchFn as never });
    expect(hits).toEqual([{ id: 'rule:round', score: 0.7, p: 0.93 }, { id: 'req:login', score: 0.4, p: 0.1 }]);
    expect(calls).toEqual(['Checkout rounds half-up']);
    expect(confidentIds(hits)).toEqual(['rule:round']);
    const cold = await judgeText('/tmp/none', g, 'Checkout rounds half-up', { jev: off, searchFn: searchFn as never });
    expect(cold.map(h => h.p)).toEqual([0, 0]);
    const before = searches;
    const given = await judgeText('/tmp/none', g, 'Checkout rounds half-up', { jev: fakeJev({ 'req:login': 0.9 }), hits: [{ id: 'req:login', score: 0.2 }] });
    expect(given).toEqual([{ id: 'req:login', score: 0.2, p: 0.9 }]); expect(searches).toBe(before);
  });
  it('linksFor judges each block once and leaves out what it already links', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-links-')); await mkdir(path.join(dir, '_build'), { recursive: true });
    const calls: string[] = [];
    const j = fakeJev({ 'rule:round': 0.93, 'req:login': 0.9 }, calls);
    const blocks = [{ key: 'b1', text: 'Checkout rounds half-up', linked: ['req:login'] }, { key: 'b2', text: 'short', linked: [] }];
    expect(await linksFor(dir, g, blocks, j, searchFn as never)).toEqual({ b1: ['rule:round'] });
    expect(calls).toEqual(['Checkout rounds half-up']); // b2 is under the minimum length
    expect(await linksFor(dir, g, blocks, j, searchFn as never)).toEqual({ b1: ['rule:round'] });
    expect(calls.length).toBe(1); // cached
    const cache = JSON.parse(await readFile(path.join(dir, '_build/jev.json'), 'utf8'));
    expect(Object.keys(cache.entries).length).toBe(1);
    expect(await linksFor(dir, g, blocks, off, searchFn as never)).toEqual({});
  });
});
