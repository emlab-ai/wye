import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addInboxItem, linkInboxItem, listInboxItems, suggestFiling } from './inbox';
import type { GraphData, GraphNode } from './graph';
import type { JevClient } from './jev';

// an inbox item is linked on arrival (Jev auto-linking design §2): refs merged with the confident candidates,
// linked-by: jev, and an untyped note takes the kind Jev is sure of
const node = (id: string, body: string, file = 'data/products/p/projects/x/docs/prd.md'): GraphNode => ({ id, kind: id.split(':')[0], title: '', status: '', section: '', subsection: '', file, line: 1, body, defined: true });
const g: GraphData = { generatedAt: '', modules: [], files: [], nodes: [node('rule:round', 'statement: prices round half-up'), node('req:login', 'title: Login')], edges: [], fieldIndex: {} };
const searchFn = async () => Object.assign([{ id: 'rule:round', score: 0.7, semantic: 0.7, keyword: 0, snippet: '' }, { id: 'req:login', score: 0.4, semantic: 0.4, keyword: 0, snippet: '' }], { hidden: 0 });
const jev = (ps: Record<string, number>, kind = { kind: 'decision', p: 0.92 }): JevClient => ({ enabled: true, model: 'fake', ask: async () => ({ model: '', answers: {}, usage: {} }), judgeLinks: async (_t, c) => c.map(x => ({ id: x.id, p: ps[x.id] ?? 0 })), judgeKind: async () => kind });

describe('inbox + jev', () => {
  it('merges confident refs, marks linked-by, types an untyped note', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-jev-'));
    const name = await addInboxItem(dir, { text: 'We round half-up at checkout because of the accountant.', refs: ['req:login'] });
    const r = await linkInboxItem(dir, g, name, jev({ 'rule:round': 0.95, 'req:login': 0.2 }), searchFn as never);
    expect(r).toEqual({ refs: ['rule:round'], type: 'decision' });
    const md = await readFile(path.join(dir, 'inbox', name), 'utf8');
    expect(md).toMatch(/^refs: req:login, rule:round$/m); // explicit first, then the judged
    expect(md).toMatch(/^linked-by: jev$/m);
    expect(md).toMatch(/^type: decision$/m);
    const item = (await listInboxItems(dir)).find(i => i.name === name)!;
    expect(item.refs).toEqual(['req:login', 'rule:round']); expect(item.type).toBe('decision');
  });
  it('keeps an explicit type and writes nothing when nothing is confident', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-jev-'));
    const name = await addInboxItem(dir, { type: 'question', title: 'Which rounding?' });
    expect(await linkInboxItem(dir, g, name, jev({ 'rule:round': 0.5 }), searchFn as never)).toEqual({ refs: [] });
    const md = await readFile(path.join(dir, 'inbox', name), 'utf8');
    expect(md).not.toMatch(/linked-by/); expect(md).toMatch(/^type: question$/m);
  });
  it('suggestFiling carries p on the similar hits when a client is given', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-jev-'));
    const name = await addInboxItem(dir, { text: 'Rounding at checkout' });
    const item = (await listInboxItems(dir)).find(i => i.name === name)!;
    const s = await suggestFiling(dir, g, 'p', item, jev({ 'rule:round': 0.9 }), searchFn as never);
    expect(s.similar[0]).toEqual({ id: 'rule:round', score: 0.7, p: 0.9 });
  });
});
