import dagre from '@dagrejs/dagre';
import type { GraphEdge, GraphNode } from './graph';

export const TREE_VERBS = ['refines', 'has'];
export const NODE_W = 180, NODE_H = 36;

export type Size = { width: number; height: number };

// `sizes` gives a node's real box when the caller has measured it (the graph page's cards vary in height);
// a node without one is laid out as the default pill.
export function layoutMindMap(nodes: GraphNode[], edges: GraphEdge[], focus: string | null, sizes?: Map<string, Size>) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const box = (id: string) => sizes?.get(id) ?? { width: NODE_W, height: NODE_H };
  for (const n of nodes) g.setNode(n.id, box(n.id));
  const treeEdges = new Set<string>();
  // Every visible edge ranks the layout so non-tree presets (Drift, Data) still spread into layers;
  // only refines/has are marked as tree edges for styling. refines points child → parent; has points
  // parent → child; both are ranked parent → child. Other verbs rank from → to.
  for (const e of edges) {
    const tree = TREE_VERBS.includes(e.verb);
    const parent = e.verb === 'refines' ? e.to : e.from, child = e.verb === 'refines' ? e.from : e.to;
    if (parent === child || !g.hasNode(parent) || !g.hasNode(child)) continue;
    g.setEdge(parent, child);
    if (tree) treeEdges.add(`${e.from}|${e.verb}|${e.to}`);
  }
  if (focus && g.hasNode(focus)) g.setNode(focus, { ...box(focus), rank: 0 });
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) { const p = g.node(n.id), b = box(n.id); positions.set(n.id, { x: p.x - b.width / 2, y: p.y - b.height / 2 }); }
  return { positions, treeEdges };
}
