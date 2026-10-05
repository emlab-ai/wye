// What one build changed, for the pages that are open (decision:wf2.change-names-what-changed): the ids a change
// touched and whether any of it is knowledge. A save of prose rebuilds the whole graph and changes almost none of it;
// the change event carries this, so a card asks again only when its own node is in `ids`, and a view, a table and the
// node index only when `knowledge` is true. Pure (no node: imports): the client reads the same shape (lib/change).
import { HIDDEN_KINDS, type GraphData, type GraphNode } from './graph';

// ids: every node whose record changed (a paragraph's block: node too), was added or removed, or that gained or lost a
//   relation — null when it is not known (the first graph, more than the cap), which reads as "anything may have changed"
// knowledge: a node a list shows (not a block:, field: or prop:) changed, or a relation other than a paragraph's place
export interface GraphDelta { ids: string[] | null; knowledge: boolean }
export const EVERYTHING: GraphDelta = { ids: null, knowledge: true };
export const NOTHING: GraphDelta = { ids: [], knowledge: false };
// more ids than this in one change (an import, a rename across the product) is said as "everything"
export const DELTA_CAP = 400;

// a node as the pages show it: all of its record but the line it is on, which moves whenever text above it changes
const sig = (n: GraphNode) => [n.kind, n.title, n.status, n.section, n.subsection, n.body, n.defined ? 1 : 0, n.file, n.owner ?? '', n.form ?? '', n.since ?? '', n.until ?? '', n.by ?? '', n.supersededBy ?? '', n.archived ? 1 : 0, (n.partKeys ?? []).join(',')].join('\u0001');
const hiddenId = (id: string) => HIDDEN_KINDS.has(id.slice(0, id.indexOf(':')));
const PLACE = new Set(['part-of', 'has']);

export function graphDelta(before: Pick<GraphData, 'nodes' | 'edges'>, after: Pick<GraphData, 'nodes' | 'edges'>): GraphDelta {
  const ids = new Set<string>(); let knowledge = false;
  const touch = (id: string, known: boolean) => { ids.add(id); if (known) knowledge = true; };
  // an id defined twice (a check error) is two records under one id: the last one stands on both sides
  const old = new Map(before.nodes.map(n => [n.id, n]));
  for (const n of new Map(after.nodes.map(n => [n.id, n])).values()) {
    const o = old.get(n.id);
    if (o) { old.delete(n.id); if (o !== n && sig(o) !== sig(n)) touch(n.id, !HIDDEN_KINDS.has(n.kind) || !HIDDEN_KINDS.has(o.kind)); }
    else touch(n.id, !HIDDEN_KINDS.has(n.kind));
  }
  for (const o of old.values()) touch(o.id, !HIDDEN_KINDS.has(o.kind));
  // relations: both ends of an edge that came or went. Where a paragraph sits (block part-of its page, and the
  // generated `has` back) is the page's content, not knowledge: the ends are touched, the lists are not
  const key = (e: { from: string; to: string; verb: string }) => `${e.from}\u0001${e.verb}\u0001${e.to}`;
  const was = new Set<string>(); for (const e of before.edges) was.add(key(e));
  const edge = (k: string) => { const [from, verb, to] = k.split('\u0001'); const known = !(PLACE.has(verb) && (hiddenId(from) || hiddenId(to))); touch(from, known); touch(to, known); };
  const now = new Set<string>(); for (const e of after.edges) now.add(key(e)); // a set: the graph may hold an edge twice
  for (const k of now) if (!was.has(k)) edge(k);
  for (const k of was) if (!now.has(k)) edge(k);
  if (ids.size > DELTA_CAP) return EVERYTHING;
  return { ids: [...ids], knowledge };
}

// Several changes as one (the events of one burst, the builds since a subscriber last heard).
export function mergeDeltas(ds: GraphDelta[]): GraphDelta {
  if (!ds.length) return NOTHING;
  if (ds.some(d => d.ids === null)) return EVERYTHING;
  const ids = new Set(ds.flatMap(d => d.ids!));
  return ids.size > DELTA_CAP ? EVERYTHING : { ids: [...ids], knowledge: ds.some(d => d.knowledge) };
}
