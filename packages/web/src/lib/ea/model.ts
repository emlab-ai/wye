// The executive assistant's knowledge, the pure part (decision:ea.kinds): person, project, commitment, meeting, risk
// and Wye's own decision, read from graph nodes into plain records — card values off the node's body (hooks#cardValue,
// a prose row's `(k: v)` group and a yaml card read the same), a commitment's moves and a project's updates off the
// lines of its content (`- move:<c>-<n> from A to B on C because why`, `- update:<slug> text (from:, date:)`). Name
// matching (a person by name or alias, a project by title, name or slug), commitment history and slip counts live
// here too. The IO — which nodes, which files — is ea/read.ts.
import { cardValue } from '../hooks';
import type { GraphNode } from '../graph';

export type Move = { id: string; n: number; from: string; to: string; on: string; why: string };
export type Update = { id: string; text: string; date: string; from: string };
export type EaPerson = { id: string; title: string; name: string; role: string; aliases: string[]; reportsTo: string; status: string };
export type EaProject = { id: string; title: string; status: string; owner: string; target: string; pace: string; people: string[]; updates: Update[] };
export type EaCommitment = { id: string; title: string; status: string; owner: string; due: string; state: string; project: string; from: string; to: string[]; metOn: string; reason: string; moves: Move[] };
export type EaMeeting = { id: string; title: string; status: string; date: string; attendees: string[]; projects: string[]; source: string; type: string };
export type EaDecision = { id: string; title: string; status: string; owner: string; project: string; from: string };
export type EaRisk = { id: string; title: string; status: string; owner: string; project: string; severity: string; from: string };
export type EaModel = { people: EaPerson[]; projects: EaProject[]; commitments: EaCommitment[]; meetings: EaMeeting[]; decisions: EaDecision[]; risks: EaRisk[] };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (s: unknown): s is string => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
// whole days from a to b (b - a), both YYYY-MM-DD
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const addDays = (d: string, n: number) => { const t = Date.parse(d + 'T00:00:00Z'); return Number.isNaN(t) ? '' : new Date(t + n * 86400000).toISOString().slice(0, 10); };   // '' for a day that is not one
// the local calendar day — a director's morning is local, not UTC
export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// A list value as written: `[a, b]`, a yaml `- item` list (cardValue joins it with newlines), or `a, b`.
export function listValue(raw: string): string[] {
  return raw.replace(/^\[|\]$/g, '').split(/[\n,]/).map(s => s.trim().replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean);
}
const val = (n: Pick<GraphNode, 'body'>, k: string) => cardValue(n.body ?? '', k).trim();
const ref = (n: Pick<GraphNode, 'body'>, k: string) => (val(n, k).match(/^[a-z-]+:[A-Za-z0-9_./#\-]+/)?.[0] ?? val(n, k));

// The moves of a commitment from the lines of its content (or its child nodes), in the order they were made (n).
export function commitmentHistory(node: Pick<GraphNode, 'id'>, children: (string | Pick<GraphNode, 'id' | 'body'>)[]): Move[] {
  const out: Move[] = [];
  for (const c of children) {
    const line = typeof c === 'string' ? c : `${c.id} ${cardValue(c.body, 'text')}`;
    const m = line.match(/^\s*(?:[-*+]\s+)?(move:[A-Za-z0-9_.\-]+)\s+from\s+(\d{4}-\d\d-\d\d)\s+to\s+(\d{4}-\d\d-\d\d)\s+on\s+(\d{4}-\d\d-\d\d)\s+because\s+(.*?)\s*(?:#[a-z-]+\s*)*(?:\([a-z-]+:[^()]*\))?\s*$/i);
    if (!m) continue;
    out.push({ id: m[1], n: Number(m[1].match(/-(\d+)$/)?.[1] ?? out.length + 1), from: m[2], to: m[3], on: m[4], why: m[5] });
  }
  void node;
  return out.sort((a, b) => a.n - b.n || a.on.localeCompare(b.on));
}
export function projectUpdates(children: string[]): Update[] {
  const out: Update[] = [];
  for (const l of children) {
    const m = l.match(/^\s*(?:[-*+]\s+)?(update:[A-Za-z0-9_.\-]+)\s+(.*)$/); if (!m) continue;
    let text = m[2]; const g = text.match(/\s*\(([a-z-]+:[^()]*)\)\s*$/); const props: Record<string, string> = {};
    if (g) { text = text.slice(0, g.index); for (const kv of g[1].split(/,\s*(?=[a-z-]+:\s)/)) { const i = kv.indexOf(':'); props[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } }
    out.push({ id: m[1], text: text.replace(/\s*#[a-z-]+\s*$/, '').trim(), date: props.date ?? '', from: props.from ?? '' });
  }
  return out;
}

export function toPerson(n: GraphNode): EaPerson {
  return { id: n.id, title: n.title, name: val(n, 'name') || n.title, role: val(n, 'role'), aliases: listValue(val(n, 'aliases')), reportsTo: ref(n, 'reports-to'), status: n.status };
}
export function toProject(n: GraphNode, content: string[] = []): EaProject {
  return { id: n.id, title: n.title, status: n.status, owner: ref(n, 'owner') || n.owner || '', target: val(n, 'target'), pace: val(n, 'pace'), people: listValue(val(n, 'people')), updates: projectUpdates(content) };
}
export function toCommitment(n: GraphNode, content: string[] = []): EaCommitment {
  return { id: n.id, title: n.title, status: n.status, owner: ref(n, 'owner') || n.owner || '', due: val(n, 'due'), state: val(n, 'state') || 'open', project: ref(n, 'project'), from: ref(n, 'from'), to: listValue(val(n, 'to')), metOn: val(n, 'met-on'), reason: val(n, 'reason'), moves: commitmentHistory(n, content) };
}
export function toMeeting(n: GraphNode): EaMeeting {
  return { id: n.id, title: n.title, status: n.status, date: val(n, 'date'), attendees: listValue(val(n, 'attendees')), projects: listValue(val(n, 'projects')), source: val(n, 'source'), type: val(n, 'format') || val(n, 'type') };
}
export function toDecision(n: GraphNode): EaDecision { return { id: n.id, title: n.title, status: n.status, owner: ref(n, 'owner') || n.owner || '', project: ref(n, 'project'), from: ref(n, 'from') }; }
export function toRisk(n: GraphNode): EaRisk { return { id: n.id, title: n.title, status: n.status, owner: ref(n, 'owner') || n.owner || '', project: ref(n, 'project'), severity: val(n, 'severity'), from: ref(n, 'from') }; }

// How many times a project's dates slipped: the moves across its commitments (test:ea.project-slip-count).
export function slipCount(project: string | Pick<EaProject, 'id'>, commitments: Pick<EaCommitment, 'project' | 'moves'>[]): number {
  const id = typeof project === 'string' ? project : project.id;
  return commitments.filter(c => c.project === id).reduce((s, c) => s + c.moves.length, 0);
}

// --- names (req:ea.meeting-lands-in-place): case-insensitive, trimmed; an id names its node directly ---
export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const slugPart = (id: string) => { const s = id.slice(id.indexOf(':') + 1); return s.includes('.') ? s.slice(s.indexOf('.') + 1) : s; };
export function personNames(p: Pick<EaPerson, 'id' | 'name' | 'title' | 'aliases'>): string[] {
  return [...new Set([p.name, p.title, ...p.aliases, slugPart(p.id)].filter(Boolean).map(norm))];
}
// Every person the name may mean: one is a match, two are ambiguous, none unknown.
export function matchPeople(people: EaPerson[], name: string): EaPerson[] {
  const n = norm(name); if (!n) return [];
  const byId = people.filter(p => p.id === name.trim()); if (byId.length) return byId;
  return people.filter(p => personNames(p).includes(n));
}
export function matchProjects(projects: EaProject[], name: string, names: (p: EaProject) => string[] = p => [p.title]): EaProject[] {
  const n = norm(name); if (!n) return [];
  const byId = projects.filter(p => p.id === name.trim()); if (byId.length) return byId;
  const slug = n.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slugOf = (t: string) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return projects.filter(p => names(p).map(norm).includes(n) || slugPart(p.id) === n || slugPart(p.id) === slug || names(p).some(t => slugOf(t) === slug));
}

// The director (product card `director: person:<p>.<slug>`): the names they go by here and in every other product.
export function directorNames(model: Pick<EaModel, 'people'>, directorId: string): string[] {
  const p = model.people.find(x => x.id === directorId); return p ? personNames(p) : [];
}
// Does a value (`alex`, `Alex M`, `person:wye.alex`, `[alex, bo]`) name someone the names cover?
export function namesMatch(value: string, names: string[]): boolean {
  if (!value || !names.length) return false;
  const want = new Set(names);
  const parts = [value, ...listValue(value)].map(v => v.trim()).filter(Boolean);
  return parts.some(v => want.has(norm(v)) || (/^[a-z-]+:/.test(v) && want.has(norm(slugPart(v)))));
}

// A commitment counts once the director approved it (constraint:ea.pushed-is-proposed): proposed waits in the inbox;
// one with no status at all was written by the director's own hand and counts.
export const counts = (c: Pick<EaCommitment, 'status'>) => !['proposed', 'rejected', 'superseded', 'retired', 'dismissed'].includes(c.status);
export const isOpenCommitment = (c: Pick<EaCommitment, 'state' | 'status'>) => counts(c) && (c.state === 'open' || c.state === 'moved' || !c.state);
