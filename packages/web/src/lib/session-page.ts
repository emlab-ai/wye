// What the session page shows, derived from the session record and the current graph (req:wf2.sessions.page,
// decision:wf2.session-page-derived): the todo rows — tasks the session added or changed, tasks among its refs,
// tasks whose `session:` names it — with the state the graph has now; every other block by kind with its status
// now; the pages the session opened (`open` events of the transcript). Pure; nothing is stored.
import type { GraphData, GraphNode } from './graph';
import type { BlockChange, Session } from './session-types';

export type TodoRow = { id: string; title: string; done: boolean; exists: boolean; status: string; doc: string; partOf?: string; change?: BlockChange['change'] };
export type KindRow = { id: string; change: BlockChange['change']; title: string; status: string; exists: boolean; doc: string; at: string };
export type KindGroup = { kind: string; rows: KindRow[] };
export type Opened = { path: string; doc: string; node?: string; at: string };
export type SessionPageData = { todo: TodoRow[]; todoDone: number; kinds: KindGroup[]; prose: number; counts: { added: number; changed: number; removed: number }; opened: Opened[] };

// the order kinds are shown in: what was required and decided first, then the rest alphabetically
const KIND_ORDER = ['req', 'decision', 'question', 'rule', 'goal', 'page', 'component', 'lib', 'op', 'action', 'entity', 'type', 'ui-test', 'test'];
const kindRank = (k: string) => { const i = KIND_ORDER.indexOf(k); return i === -1 ? KIND_ORDER.length : i; };
const docOf = (n: GraphNode) => `module:${n.file.split('/').pop()?.replace(/\.md$/, '')}`;
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

export function sessionPage(s: Session, g: GraphData): SessionPageData {
  const byId = new Map(g.nodes.filter(n => n.defined).map(n => [n.id, n]));
  const partOf = new Map<string, string>();
  for (const e of g.edges) if (e.verb === 'part-of' && !partOf.has(e.from)) partOf.set(e.from, e.to);
  const blocks = s.artifacts?.blocks ?? [];
  const change = new Map(blocks.map(b => [b.id, b]));
  // todo: tasks from the blocks (in the order they were touched), then task refs, then back-links — once each
  const named = new RegExp(`^session:.*\\b${s.id}\\b`, 'm');
  const taskIds = [...new Set([
    ...blocks.filter(b => b.id.startsWith('task:')).map(b => b.id),
    ...s.refs.filter(r => r.startsWith('task:')),
    ...g.nodes.filter(n => n.defined && n.kind === 'task' && named.test(n.body)).map(n => n.id),
  ])];
  const todo = taskIds.map((id): TodoRow => {
    const n = byId.get(id); const c = change.get(id);
    return { id, title: plain(n?.title ?? c?.title ?? id), done: n?.status === 'done', exists: !!n, status: n?.status ?? '', doc: n ? docOf(n) : c?.doc ?? '', ...(partOf.get(id) ? { partOf: partOf.get(id) } : {}), ...(c ? { change: c.change } : {}) };
  });
  // the other blocks, by kind
  const groups = new Map<string, KindRow[]>();
  const counts = { added: 0, changed: 0, removed: 0 };
  let prose = 0;
  for (const b of blocks) {
    const kind = b.id.split(':')[0];
    if (kind === 'task') continue;
    if (kind === 'block') { prose++; continue; }
    const n = byId.get(b.id);
    counts[b.change]++;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push({ id: b.id, change: b.change, title: plain(n?.title ?? b.title), status: n?.status ?? '', exists: !!n, doc: n ? docOf(n) : b.doc, at: b.at });
  }
  const kinds = [...groups.entries()].map(([kind, rows]) => ({ kind, rows: rows.sort((a, b) => a.at.localeCompare(b.at)) })).sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.kind.localeCompare(b.kind));
  // opened pages: the last time each path was opened, latest first
  const seen = new Map<string, Opened>();
  for (const e of s.transcript ?? []) {
    if (e.kind !== 'open' || !e.text) continue;
    const m = e.text.match(/\/d\/([^/#?]+)(?:#n-([^&]+))?/);
    seen.set(e.text, { path: e.text, doc: m?.[1] ?? e.text, node: m?.[2] ? decodeURIComponent(m[2]) : undefined, at: e.t });
  }
  const opened = [...seen.values()].sort((a, b) => b.at.localeCompare(a.at));
  return { todo, todoDone: todo.filter(t => t.done).length, kinds, prose, counts, opened };
}
