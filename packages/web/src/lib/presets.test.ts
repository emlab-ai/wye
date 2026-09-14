import { describe, it, expect } from 'vitest';
import { PRESETS, visibleSubgraph } from './presets';
import { indexGraph, type GraphData } from './graph';

const n = (id: string, status = '', defined = true) => ({ id, kind: id.split(':')[0], title: id, status, section: '', subsection: '', body: '', defined, file: 'f', line: 1 });
const g: GraphData = {
  generatedAt: '', modules: [], files: [], fieldIndex: {},
  nodes: [n('req:a'), n('req:a.b'), n('rule:r'), n('entity:e'), n('field:e.x'), n('drift:m.1', 'drift')],
  edges: [
    { from: 'req:a.b', to: 'req:a', verb: 'refines' },
    { from: 'req:a', to: 'rule:r', verb: 'satisfied-by' },
    { from: 'entity:e', to: 'field:e.x', verb: 'has' },
    { from: 'rule:r', to: 'field:e.x', verb: 'mentions' },
    { from: 'drift:m.1', to: 'rule:r', verb: 'contradicts' },
  ],
};
const idx = indexGraph(g);

describe('visibleSubgraph', () => {
  it('Requirements shows reqs and refines only', () => {
    const v = visibleSubgraph(g, idx, 'Requirements', null);
    expect(v.nodes.map(x => x.id).sort()).toEqual(['req:a', 'req:a.b']);
    expect(v.edges.map(e => e.verb)).toEqual(['refines']);
  });
  it('Mechanics hides fields and mentions', () => {
    const v = visibleSubgraph(g, idx, 'Mechanics', null);
    expect(v.nodes.map(x => x.id)).not.toContain('field:e.x');
    expect(v.edges.map(e => e.verb)).not.toContain('mentions');
  });
  it('Drift keeps only nodes touching a drift node', () => {
    const v = visibleSubgraph(g, idx, 'Drift', null);
    expect(v.nodes.map(x => x.id).sort()).toEqual(['drift:m.1', 'rule:r']);
  });
  it('focus overrides the preset with a 2-hop structural neighbourhood', () => {
    const v = visibleSubgraph(g, idx, 'Requirements', 'rule:r');
    expect(v.nodes.map(x => x.id).sort()).toEqual(['drift:m.1', 'req:a', 'req:a.b', 'rule:r']);
  });
  it('Everything includes mentions', () => {
    const v = visibleSubgraph(g, idx, 'Everything', null);
    expect(v.edges.map(e => e.verb)).toContain('mentions');
    expect(PRESETS.Everything.verbs).toBeNull();
  });
});
