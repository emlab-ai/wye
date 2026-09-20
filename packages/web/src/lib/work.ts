// Work (goal:exec.work-and-impact, decision:exec.task-is-the-unit): every task of the product as one list, whoever
// holds it. Pure: the rows are computed from the graph (task lines anywhere in the documents, the requests they sit on,
// what they are part of) and the session records (which shift holds a task, and what it is doing now). The status on
// the line is the person's or agent's word; the derived `state` says what is happening (req:exec.work-states).
import type { GraphData, GraphIndex, GraphNode } from './graph';
import { docRoute } from './doc';
import type { SessionStatus } from './session-types';

// what lib/work needs of a session record — the API passes the records, tests build these by hand
export type WorkSession = { id: string; status: SessionStatus; agent: string; refs: string[]; createdAt: string; updatedAt?: string; finishedAt?: string; result?: string; prDoc?: string; live?: boolean; busy?: boolean; artifacts?: { blocks?: { id: string }[] } };
// queued: a session on it waits for a runner; working: a session on it is running; stalled: the last session on it
// failed or was cancelled with the task not done; unassigned: no worker and no session; held: a worker, nothing running
export type WorkState = 'queued' | 'working' | 'stalled' | 'unassigned' | 'held' | 'done';
export type WorkItem = {
  id: string; title: string; status: string; state: WorkState; ready: boolean; worker?: string; priority?: number; due?: string;
  blockedBy: string[]; blocked: boolean;                       // blocked: a blocked-by that is not done
  pr?: { id: string; slug: string; title: string; status: string; task?: string }; // the request document the task is on; `task` the one it was assigned for
  requestTask?: boolean;                                      // the plan's own request task (task:<plan-slug>)
  doc: { project: string; slug: string } | null; file: string; line: number;
  partOf: string[];                                           // goals, requirements, nodes it serves (not plans)
  sessions: { id: string; status: SessionStatus; agent: string; live?: boolean; busy?: boolean; result?: string }[];
  change?: string; by?: string; archived: boolean; produced: number;
  definition?: { total: number; agreed: number; open: number; defined: boolean; contradicted: number }; // the plan's Definition (set by work-io)
  children: WorkItem[];
};

const prop = (body: string, key: string) => body.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1].trim() || undefined;
const ids = (s?: string) => (s ?? '').split(/[\s,]+/).filter(Boolean);
export const PR_TASK = /^task:(pr-[a-z0-9-]+)$/;

// Which sessions hold a task: the ones its `session:` names plus the ones whose refs name it.
function sessionsOf(n: GraphNode, sessions: WorkSession[]): WorkSession[] {
  const named = new Set(ids(prop(n.body, 'session')));
  return sessions.filter(s => named.has(s.id) || s.refs.includes(n.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function stateOf(status: string, worker: string | undefined, held: WorkSession[]): WorkState {
  if (status === 'done') return 'done';
  if (held.some(s => s.status === 'queued')) return 'queued';
  if (held.some(s => s.status === 'running' || s.live)) return 'working';
  const last = held[held.length - 1];
  if (last && (last.status === 'failed' || last.status === 'cancelled')) return 'stalled';
  return worker ? 'held' : 'unassigned';
}

// The rows: one per task node, nested — a sub-task under its task (part-of task), a plan's tasks under the plan's
// request task — sorted by priority (lower first, unset last), then document and line (decision:exec.order-is-document-then-priority).
export function workItems(g: GraphData, idx: GraphIndex, sessions: WorkSession[]): WorkItem[] {
  const tasks = g.nodes.filter(n => n.kind === 'task' && n.defined);
  const plansByFile = new Map(g.nodes.filter(n => n.kind === 'pr' && n.defined).map(n => [n.file, n]));
  const byId = new Map<string, WorkItem>();
  for (const n of tasks) {
    const held = sessionsOf(n, sessions);
    const worker = prop(n.body, 'worker');
    const out = idx.out.get(n.id) ?? [];
    const blockedBy = out.filter(e => e.verb === 'blocked-by').map(e => e.to);
    const plan = plansByFile.get(n.file);
    const m = n.id.match(PR_TASK);
    const r = docRoute(n.file);
    const priority = Number(prop(n.body, 'priority'));
    byId.set(n.id, {
      id: n.id, title: n.title, status: n.status || 'open', state: stateOf(n.status, worker, held), ready: prop(n.body, 'ready') === 'true', worker, priority: Number.isFinite(priority) && prop(n.body, 'priority') ? priority : undefined, due: prop(n.body, 'due'),
      blockedBy, blocked: blockedBy.some(b => idx.byId.get(b)?.status !== 'done'),
      pr: plan ? { id: plan.id, slug: plan.id.slice(3), title: plan.title, status: plan.status, task: prop(plan.body, 'task') } : undefined,
      requestTask: !!m && plan?.id === `pr:${m[1]}`,
      doc: r ? { project: r.project, slug: r.doc } : null, file: n.file, line: n.line,
      partOf: out.filter(e => e.verb === 'part-of' && !e.to.startsWith('pr:') && !e.to.startsWith('task:')).map(e => e.to),
      sessions: held.map(s => ({ id: s.id, status: s.status, agent: s.agent, live: s.live, busy: s.busy, result: s.result })),
      change: prop(n.body, 'change'), by: prop(n.body, 'by'), archived: !!n.archived,
      produced: held.reduce((a, s) => a + (s.artifacts?.blocks?.length ?? 0), 0),
      children: [],
    });
  }
  const roots: WorkItem[] = [];
  for (const it of byId.values()) {
    const out = idx.out.get(it.id) ?? [];
    const parentTask = out.find(e => e.verb === 'part-of' && e.to.startsWith('task:') && byId.has(e.to) && e.to !== it.id)?.to;
    const parentPlan = !it.requestTask ? out.find(e => e.verb === 'part-of' && e.to.startsWith('pr:'))?.to : undefined;
    // a plan's tasks nest under its request task, or under the task the plan was assigned for
    const planNode = parentPlan ? g.nodes.find(n => n.id === parentPlan) : undefined;
    const parent = parentTask ? byId.get(parentTask) : parentPlan ? (byId.get(`task:${parentPlan.slice(3)}`) ?? (planNode && byId.get(prop(planNode.body, 'task') ?? ''))) : undefined;
    if (parent && parent !== it) parent.children.push(it); else roots.push(it);
  }
  const order = (a: WorkItem, b: WorkItem) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.file.localeCompare(b.file) || a.line - b.line;
  for (const it of byId.values()) it.children.sort(order);
  return roots.sort(order);
}

export type WorkGroupBy = 'status' | 'goal' | 'pr' | 'document' | 'worker' | 'state';
export type WorkFilter = { q?: string; status?: string; state?: string; worker?: string; goal?: string; pr?: string; doc?: string; done?: boolean; mine?: string };

const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// Rows that match a filter, keeping a parent whose child matches. Done work (and archived tasks that are done) is
// out unless `done` (decision:memory.forgetting); a task in review always shows.
export function filterWork(rows: WorkItem[], f: WorkFilter): WorkItem[] {
  const q = (f.q ?? '').trim().toLowerCase();
  const one = (r: WorkItem): boolean =>
    (f.done || (r.status !== 'done' && !(r.archived && r.status === 'done')))
    && (!q || r.id.toLowerCase().includes(q) || plain(r.title).toLowerCase().includes(q) || (r.worker ?? '').toLowerCase().includes(q))
    && (!f.status || r.status === f.status)
    && (!f.state || r.state === f.state)
    && (!f.worker || (f.worker === '—' ? !r.worker : r.worker === f.worker))
    && (!f.mine || r.worker === f.mine)
    && (!f.goal || r.partOf.includes(f.goal))
    && (!f.pr || r.pr?.id === f.pr)
    && (!f.doc || (r.doc ? `${r.doc.project}/${r.doc.slug}` : '') === f.doc);
  const keep = (r: WorkItem): WorkItem | null => { const kids = r.children.map(keep).filter(Boolean) as WorkItem[]; return one(r) || kids.length ? { ...r, children: kids } : null; };
  return rows.map(keep).filter(Boolean) as WorkItem[];
}

// Grouping flattens the tree and buckets the rows; a group's key is the label the view shows.
export const STATUS_ORDER = ['review', 'in-progress', 'blocked', 'open', 'todo', 'done'];
export const STATE_ORDER: WorkState[] = ['working', 'queued', 'stalled', 'held', 'unassigned', 'done'];
export function groupWork(rows: WorkItem[], by: WorkGroupBy): [string, WorkItem[]][] {
  const flat: WorkItem[] = []; const walk = (r: WorkItem) => { flat.push({ ...r, children: [] }); r.children.forEach(walk); }; rows.forEach(walk);
  const keys = (r: WorkItem): string[] => by === 'status' ? [r.status] : by === 'state' ? [r.state] : by === 'goal' ? (r.partOf.length ? r.partOf : ['— no goal']) : by === 'pr' ? [r.pr?.id ?? '— no plan'] : by === 'document' ? [r.doc ? `${r.doc.project}/${r.doc.slug}` : r.file] : [r.worker ?? '— unassigned'];
  const m = new Map<string, WorkItem[]>();
  for (const r of flat) for (const k of keys(r)) { if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  const rank = (k: string) => by === 'status' ? STATUS_ORDER.indexOf(k) : by === 'state' ? STATE_ORDER.indexOf(k as WorkState) : k.startsWith('—') ? 1e9 : 0;
  return [...m].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

// Counts per status and per state over the tree.
export function workCounts(rows: WorkItem[]): { status: Record<string, number>; state: Record<string, number>; total: number } {
  const status: Record<string, number> = {}; const state: Record<string, number> = {}; let total = 0;
  const walk = (r: WorkItem) => { total++; status[r.status] = (status[r.status] ?? 0) + 1; state[r.state] = (state[r.state] ?? 0) + 1; r.children.forEach(walk); };
  rows.forEach(walk);
  return { status, state, total };
}

// The next task a runner may take (req:exec.ready-for-runners): the oldest ready, unblocked, unassigned, not-done
// task — of a goal when given — in the Work view's order; never one without the ready mark.
export function nextReady(rows: WorkItem[], goal?: string): WorkItem | null {
  const flat: WorkItem[] = []; const walk = (r: WorkItem) => { flat.push(r); r.children.forEach(walk); }; rows.forEach(walk);
  const ok = flat.filter(r => r.ready && !r.blocked && !r.worker && r.status !== 'done' && r.state === 'unassigned' && !r.archived && (!goal || r.partOf.includes(goal)) && r.pr?.status !== 'refining');
  return ok[0] ?? null;
}

// Why a task cannot be assigned (req:exec.dispatch): done, or blocked by something not done.
export function assignRefusal(item: Pick<WorkItem, 'status' | 'blocked' | 'blockedBy'>): string | null {
  if (item.status === 'done') return 'the task is done';
  if (item.blocked) return `blocked by ${item.blockedBy.join(', ')} — not done yet`;
  return null;
}
