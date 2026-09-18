import { describe, it, expect } from 'vitest';
import { diffGraphs } from './graph-diff';
import type { GraphData, GraphNode } from './graph';

const N = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/prd.md', line: 1, ...over });
const G = (nodes: GraphNode[]): GraphData => ({ generatedAt: '', modules: [], files: [], nodes, edges: [], fieldIndex: {} });

describe('diffGraphs', () => {
  it('reports added, changed and removed defined nodes with their document', () => {
    const before = G([N('req:a', { title: 'A', body: 'when: x' }), N('rule:b', { status: 'shipped' }), N('req:gone'), N('field:x', { kind: 'field' })]);
    const after = G([N('req:a', { title: 'A', body: 'when: y' }), N('rule:b', { status: 'shipped' }), N('decision:new', { title: 'New', file: 'data/products/p/projects/v2/docs/plan.md' }), N('field:y', { kind: 'field' })]);
    expect(diffGraphs(before, after, '2026-09-18T00:00:00Z')).toEqual([
      { id: 'req:a', change: 'changed', doc: 'module:prd', title: 'A', at: '2026-09-18T00:00:00Z' },
      { id: 'decision:new', change: 'added', doc: 'module:plan', title: 'New', at: '2026-09-18T00:00:00Z' },
      { id: 'req:gone', change: 'removed', doc: 'module:prd', title: 'req:gone', at: '2026-09-18T00:00:00Z' },
    ]);
  });
  it('a status change counts as changed; a paragraph is a block: node with its text as title', () => {
    const before = G([N('task:t', { status: 'open' })]);
    const after = G([N('task:t', { status: 'done' }), N('block:prd.abc', { kind: 'block', title: 'A new paragraph of prose.' })]);
    expect(diffGraphs(before, after, 't').map(c => [c.id, c.change, c.title])).toEqual([['task:t', 'changed', 'task:t'], ['block:prd.abc', 'added', 'A new paragraph of prose.']]);
  });
  it('the app\'s own task-link write (session / produced only) is not a change', () => {
    const before = G([N('task:t', { body: 'text: Do it\nsession: a' })]);
    const after = G([N('task:t', { body: 'text: Do it\nsession: a b\nproduced: module:x' })]);
    expect(diffGraphs(before, after, 't')).toEqual([]);
  });
  it('nothing changed → empty; undefined (referenced only) nodes are ignored', () => {
    const g = G([N('req:a'), N('req:ref', { defined: false })]);
    expect(diffGraphs(g, G([N('req:a'), N('req:other', { defined: false })]), 't')).toEqual([]);
  });
});

import { mergeBlocks } from './artifacts';
describe('mergeBlocks', () => {
  const b = (id: string, change: 'added' | 'changed' | 'removed', at = 't1') => ({ id, change, doc: 'module:prd', title: id, at });
  it('keeps one entry per block: added then changed stays added, added then removed disappears, changed then removed is removed', () => {
    expect(mergeBlocks([b('req:a', 'added'), b('req:b', 'added'), b('req:c', 'changed')], [b('req:a', 'changed', 't2'), b('req:b', 'removed', 't2'), b('req:c', 'removed', 't2'), b('req:d', 'added', 't2')]).map(x => [x.id, x.change, x.at]))
      .toEqual([['req:a', 'added', 't2'], ['req:c', 'removed', 't2'], ['req:d', 'added', 't2']]);
  });
});
