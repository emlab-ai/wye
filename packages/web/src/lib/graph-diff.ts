// What changed between two builds of the graph: the defined nodes — typed blocks and prose paragraphs (block:)
// alike — that are new, changed (title, status, body) or gone. The watcher records the result on every running
// session as its block-level attribution (req:wf2.sessions.block-attribution); nothing is written to documents.
import type { GraphData, GraphNode } from './graph';
import type { BlockChange } from './session-types';
export type { BlockChange };

const docOf = (n: GraphNode) => { const m = n.file.match(/\/docs\/([^/]+)\.md$/); return m ? `module:${m[1]}` : ''; };
// the app's own task links (rule:task-artifacts) are tracking, not knowledge: drop them before comparing bodies
const essence = (n: GraphNode) => [n.title, n.status, n.body.split('\n').filter(l => !/^(session|produced):/.test(l)).join('\n')].join('|');
const visible = (n: GraphNode) => n.defined && n.kind !== 'field' && n.kind !== 'prop';

export function diffGraphs(before: GraphData, after: GraphData, at: string): BlockChange[] {
  const old = new Map(before.nodes.filter(visible).map(n => [n.id, n]));
  const out: BlockChange[] = [];
  const seen = new Set<string>();
  for (const n of after.nodes) {
    if (!visible(n)) continue;
    seen.add(n.id);
    const o = old.get(n.id);
    if (!o) out.push({ id: n.id, change: 'added', doc: docOf(n), title: n.title, at });
    else if (essence(o) !== essence(n)) out.push({ id: n.id, change: 'changed', doc: docOf(n), title: n.title, at });
  }
  for (const [id, o] of old) if (!seen.has(id)) out.push({ id, change: 'removed', doc: docOf(o), title: o.title, at });
  return out;
}
