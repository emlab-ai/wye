import { describe, it, expect } from 'vitest';
import { indexGraph, sidebarTree, neighborhood, parseBody, relations, type GraphData } from './graph';

const fixture: GraphData = {
  generatedAt: '2026-09-14T00:00:00Z',
  modules: [{ id: 'module:m', title: 'M', file: 'docs/context-graph/m.md', verified: '', sourceRoots: ['.'] }],
  files: ['docs/context-graph/m.md'],
  fieldIndex: {},
  nodes: [
    { id: 'module:m', kind: 'module', title: 'M', status: '', section: '', subsection: '', body: 'id: module:m', defined: true, file: 'docs/context-graph/m.md', line: 1 },
    { id: 'req:m.a', kind: 'req', title: 'A', status: 'shipped', section: 'R. Requirements', subsection: 'R.1 Cap', body: 'id: req:m.a\ntitle: A\nwhen: x\nthen: y\nsatisfied-by: [rule:r1]', defined: true, file: 'docs/context-graph/m.md', line: 10 },
    { id: 'req:m.a.b', kind: 'req', title: 'B', status: 'proposed', section: 'R. Requirements', subsection: 'R.1 Cap', body: 'id: req:m.a.b\nrefines: req:m.a', defined: true, file: 'docs/context-graph/m.md', line: 20 },
    { id: 'rule:r1', kind: 'rule', title: 'R1', status: '', section: '6. Rules', subsection: '', body: 'id: rule:r1\nstatement: >\n  two lines\n  of prose\nsource: a.js:1', defined: true, file: 'docs/context-graph/m.md', line: 30 },
    { id: 'entity:e', kind: 'entity', title: 'E', status: '', section: '1. Entities', subsection: '', body: 'id: entity:e\nfields:\n  alpha: string', defined: true, file: 'docs/context-graph/m.md', line: 40 },
    { id: 'field:e.alpha', kind: 'field', title: 'alpha', status: '', section: '1. Entities', subsection: 'entity:e', body: 'on: entity:e', defined: true, file: 'docs/context-graph/m.md', line: 40, owner: 'entity:e' },
    { id: 'test:t', kind: 'test', title: 't', status: '', section: '', subsection: '', body: '', defined: false, file: '', line: 0 },
  ],
  edges: [
    { from: 'req:m.a', to: 'rule:r1', verb: 'satisfied-by' },
    { from: 'req:m.a.b', to: 'req:m.a', verb: 'refines' },
    { from: 'entity:e', to: 'field:e.alpha', verb: 'has' },
    { from: 'rule:r1', to: 'field:e.alpha', verb: 'mentions' },
    { from: 'req:m.a', to: 'test:t', verb: 'verified-by' },
  ],
};

describe('indexGraph', () => {
  it('builds byId, out and inc', () => {
    const idx = indexGraph(fixture);
    expect(idx.byId.get('req:m.a')?.title).toBe('A');
    expect(idx.out.get('req:m.a')?.map(e => e.verb)).toEqual(['satisfied-by', 'verified-by']);
    expect(idx.inc.get('req:m.a')?.[0].from).toBe('req:m.a.b');
  });
});

describe('sidebarTree', () => {
  it('groups defined nodes by module file and section in file order, skipping fields and stubs', () => {
    const tree = sidebarTree(fixture);
    expect(tree).toHaveLength(1);
    expect(tree[0].module.id).toBe('module:m');
    expect(tree[0].sections.map(s => s.title)).toEqual(['R. Requirements', '6. Rules', '1. Entities']);
    expect(tree[0].sections[0].nodes.map(n => n.id)).toEqual(['req:m.a', 'req:m.a.b']);
    const all = tree[0].sections.flatMap(s => s.nodes.map(n => n.id));
    expect(all).not.toContain('field:e.alpha');
    expect(all).not.toContain('test:t');
  });
});

describe('neighborhood', () => {
  it('follows edges both ways to the given depth', () => {
    const idx = indexGraph(fixture);
    expect([...neighborhood(idx, 'rule:r1', 1, false)].sort()).toEqual(['field:e.alpha', 'req:m.a', 'rule:r1']);
    expect([...neighborhood(idx, 'rule:r1', 2, false)].sort()).toEqual(['entity:e', 'field:e.alpha', 'req:m.a', 'req:m.a.b', 'rule:r1', 'test:t']);
  });
  it('ignores mentions when structuralOnly', () => {
    const idx = indexGraph(fixture);
    expect([...neighborhood(idx, 'rule:r1', 1, true)].sort()).toEqual(['req:m.a', 'rule:r1']);
  });
});

describe('parseBody', () => {
  it('splits top-level keys, marks prose keys and block scalars, keeps nested text', () => {
    const rows = parseBody('id: req:m.a\ntitle: A\nwhen: x\nsatisfied-by: [rule:r1]\nnote: hazard\nstatement: >\n  two lines\n  of prose\nfields:\n  alpha: string   # note');
    expect(rows.map(r => r.key)).toEqual(['title', 'when', 'satisfied-by', 'note', 'statement', 'fields']);
    expect(rows.find(r => r.key === 'note')?.prose).toBe(true);
    expect(rows.find(r => r.key === 'when')?.prose).toBe(false);
    expect(rows.find(r => r.key === 'statement')).toEqual({ key: 'statement', value: 'two lines of prose', prose: true });
    expect(rows.find(r => r.key === 'fields')?.value).toBe('alpha: string   # note');
  });
});

describe('relations', () => {
  it('groups outgoing and incoming edges by verb', () => {
    const idx = indexGraph(fixture);
    const r = relations(idx, 'req:m.a');
    expect(r.out).toEqual([['satisfied-by', ['rule:r1']], ['verified-by', ['test:t']]]);
    expect(r.inc).toEqual([['refines', ['req:m.a.b']]]);
  });
});
