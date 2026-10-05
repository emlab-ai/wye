import { describe, it, expect } from 'vitest';
import { graphDelta, mergeDeltas, EVERYTHING, NOTHING, DELTA_CAP } from './graph-delta';
import type { GraphEdge, GraphNode } from './graph';

const N = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body: '', defined: true, file: 'docs/prd.md', line: 1, ...over });
const E = (from: string, verb: string, to: string): GraphEdge => ({ from, verb, to });
const G = (nodes: GraphNode[], edges: GraphEdge[] = []) => ({ nodes, edges });

describe('graphDelta', () => {
  it('a build that changed nothing touches nothing — a line that moved is not a change', () => {
    const before = G([N('req:a'), N('rule:b', { line: 4 })], [E('req:a', 'governed-by', 'rule:b')]);
    const after = G([N('req:a'), N('rule:b', { line: 9 })], [E('req:a', 'governed-by', 'rule:b')]);
    expect(graphDelta(before, after)).toEqual(NOTHING);
  });
  it('an id defined twice is compared as its last record', () => {
    const twice = [N('when:x', { title: 'one' }), N('when:x', { title: 'two' })];
    expect(graphDelta(G(twice), G(twice.map(n => ({ ...n })))).ids).toEqual([]);
  });
  it('an edge the graph holds twice is one edge', () => {
    const nodes = [N('req:a'), N('rule:b')]; const e = E('req:a', 'governed-by', 'rule:b');
    expect(graphDelta(G(nodes, [e, e]), G(nodes, [e, e]))).toEqual(NOTHING);
  });
  it('a new paragraph touches its block and its page, and is not knowledge', () => {
    const before = G([N('module:prd'), N('req:a')]);
    const after = G([N('module:prd'), N('req:a'), N('block:prd.x1', { title: 'A new paragraph.' })], [E('block:prd.x1', 'part-of', 'module:prd'), E('module:prd', 'has', 'block:prd.x1')]);
    const d = graphDelta(before, after);
    expect(d.knowledge).toBe(false);
    expect(new Set(d.ids)).toEqual(new Set(['block:prd.x1', 'module:prd']));
  });
  it('a node that changed, came or went is knowledge, by id', () => {
    const before = G([N('req:a', { status: 'draft' }), N('req:gone'), N('rule:same')]);
    const after = G([N('req:a', { status: 'approved' }), N('decision:new'), N('rule:same')]);
    const d = graphDelta(before, after);
    expect(d.knowledge).toBe(true);
    expect(new Set(d.ids)).toEqual(new Set(['req:a', 'req:gone', 'decision:new']));
  });
  it('a relation that came or went touches both ends: a paragraph that mentions a node is knowledge of that node', () => {
    const nodes = [N('req:a'), N('rule:b'), N('block:prd.x1')];
    const d = graphDelta(G(nodes), G(nodes, [E('block:prd.x1', 'mentions', 'rule:b')]));
    expect(d).toEqual({ ids: ['block:prd.x1', 'rule:b'], knowledge: true });
    expect(graphDelta(G(nodes, [E('req:a', 'governed-by', 'rule:b')]), G(nodes)).ids).toEqual(['req:a', 'rule:b']);
  });
  it('a typed node placed under another is knowledge (only a paragraph\'s place is not)', () => {
    const nodes = [N('goal:g'), N('task:t')];
    expect(graphDelta(G(nodes), G(nodes, [E('task:t', 'part-of', 'goal:g')])).knowledge).toBe(true);
  });
  it('more than the cap is everything', () => {
    const many = Array.from({ length: DELTA_CAP + 1 }, (_, i) => N(`req:n${i}`));
    expect(graphDelta(G([]), G(many))).toEqual(EVERYTHING);
  });
});

describe('mergeDeltas', () => {
  it('unions the ids, keeps knowledge, and unknown wins', () => {
    expect(mergeDeltas([])).toEqual(NOTHING);
    expect(mergeDeltas([{ ids: ['a'], knowledge: false }, { ids: ['a', 'b'], knowledge: true }])).toEqual({ ids: ['a', 'b'], knowledge: true });
    expect(mergeDeltas([{ ids: ['a'], knowledge: false }, EVERYTHING])).toEqual(EVERYTHING);
  });
});
