import { STRUCTURAL, neighborhood, type GraphData, type GraphEdge, type GraphIndex, type GraphNode } from './graph';

export type PresetName = 'Requirements' | 'Mechanics' | 'Data' | 'Drift' | 'Everything';
export const ALL_KINDS = ['req', 'rule', 'entity', 'field', 'op', 'page', 'action', 'state', 'flag', 'gate', 'value', 'test', 'ui-test', 'drift', 'decision', 'question', 'module', 'product', 'goal', 'task'];

export const PRESETS: Record<PresetName, { kinds: string[]; verbs: string[] | null; onlyTouching?: string }> = {
  Requirements: { kinds: ['req'], verbs: ['refines'] },
  Mechanics: { kinds: ['req', 'rule', 'entity', 'op', 'page', 'action', 'state', 'flag', 'gate', 'decision'], verbs: ['refines', 'satisfied-by', 'governed-by', 'gated-by', 'has', 'refs', 'owns', 'calls', 'has-action', 'reads', 'writes', 'navigates', 'triggers', 'set-by', 'embedded-in', 'governs', 'resolves'] },
  Data: { kinds: ['entity', 'field', 'value', 'flag', 'state'], verbs: ['has', 'typed-as', 'refs', 'owns', 'embedded-in'] },
  Drift: { kinds: ['drift', 'rule', 'op', 'entity', 'page', 'gate', 'req', 'flag', 'decision'], verbs: ['contradicts'], onlyTouching: 'drift' },
  Everything: { kinds: ALL_KINDS, verbs: null },
};

export function visibleSubgraph(g: GraphData, idx: GraphIndex, preset: PresetName, focus: string | null, depth = 2): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const P = PRESETS[preset];
  let ids: Set<string>;
  if (focus && idx.byId.has(focus)) {
    ids = neighborhood(idx, focus, depth, true);
  } else {
    ids = new Set(g.nodes.filter(n => P.kinds.includes(n.kind)).map(n => n.id));
    if (P.onlyTouching) {
      const keep = new Set<string>();
      for (const e of g.edges) {
        const a = idx.byId.get(e.from), b = idx.byId.get(e.to);
        if (a?.kind === P.onlyTouching || b?.kind === P.onlyTouching) { keep.add(e.from); keep.add(e.to); }
      }
      ids = new Set([...ids].filter(i => keep.has(i)));
    }
  }
  const verbs = focus ? null : P.verbs;
  const edges = g.edges.filter(e => ids.has(e.from) && ids.has(e.to)
    && (verbs ? verbs.includes(e.verb) : (preset === 'Everything' || STRUCTURAL.has(e.verb))));
  const connected = new Set<string>(); for (const e of edges) { connected.add(e.from); connected.add(e.to); }
  const keepIsolated = preset === 'Everything' || !!focus;
  const nodes = [...ids].filter(i => connected.has(i) || keepIsolated || idx.byId.get(i)?.kind === 'req').map(i => idx.byId.get(i)!).filter(Boolean);
  return { nodes, edges };
}
