import dagre from '@dagrejs/dagre';
import type { GraphEdge, GraphNode } from './graph';

export const TREE_VERBS = ['refines', 'has'];
export const NODE_W = 180, NODE_H = 36;

export function layoutMindMap(nodes: GraphNode[], edges: GraphEdge[], focus: string | null) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  const treeEdges = new Set<string>();
  for (const e of edges) {
    if (!TREE_VERBS.includes(e.verb)) continue;
    // refines points child → parent; has points parent → child. Draw the tree parent → child.
    const parent = e.verb === 'refines' ? e.to : e.from, child = e.verb === 'refines' ? e.from : e.to;
    if (parent === child) continue;
    g.setEdge(parent, child);
    treeEdges.add(`${e.from}|${e.verb}|${e.to}`);
  }
  if (focus && g.hasNode(focus)) g.setNode(focus, { width: NODE_W, height: NODE_H, rank: 0 });
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) { const p = g.node(n.id); positions.set(n.id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 }); }
  return { positions, treeEdges };
}
