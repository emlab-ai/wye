// Hooks, the pure part (decision:wf2.hooks-and-skills): a hook card — `on: <kind>.<event>`, `where:` filters,
// `do:` actions, `once`, status — read from its node; the events a graph diff means (created, status:<x>,
// linked:<verb>); which active hooks match an event on a node; a template filled for a node. The IO — firings, the
// sessions a `run` starts, the blocks an `add` writes — is lib/hooks-run.
import type { GraphData, GraphNode } from './graph';
import type { BlockChange } from './session-types';

export type HookEvent = { kind: string; id: string; event: string; verb?: string; session?: string; role?: string };
export type HookAction = { kind: 'run'; skill: string } | { kind: 'workflow'; workflow: string } | { kind: 'add'; template: string; to?: string } | { kind: 'task'; text: string; worker?: string; skill?: string } | { kind: 'assign'; task: string; worker?: string; skill?: string } | { kind: 'notify'; text: string } | { kind: 'dispatch'; doc: string; workers?: number };
export type HookDef = { id: string; title: string; on: { kind: string; event: string }; where: Record<string, string>; actions: HookAction[]; once: boolean; status: string; skills: string[] };

export const HOOK_EVENTS = ['created', 'status:<x>', 'linked:<verb>', 'pr.approved', 'pr.built', 'session.done'];
export const MAX_DEPTH = 3;

// A key's value from a card body: one line, a `|` / `>` block scalar (lines kept), or a `- item` list (items joined by
// newlines) — parseBody folds block scalars, which a `do:` list or a template body must not be.
export function cardValue(body: string, key: string): string {
  const lines = body.split('\n');
  const i = lines.findIndex(l => new RegExp(`^${key}:(\\s|$)`).test(l));
  if (i < 0) return '';
  const raw = lines[i].slice(key.length + 1).trim();
  // a quoted value loses its quotes only when both ends match: `do: task "x"` must keep the closing one, or the action
  // parses as nothing at all
  if (raw && !/^[>|]-?$/.test(raw)) return raw.replace(/^(["'])([\s\S]*)\1$/, '$2');
  const rest: string[] = [];
  for (const l of lines.slice(i + 1)) { if (!/^\s+\S/.test(l) && l.trim()) break; if (l.trim()) rest.push(l); }
  const indent = rest.length ? Math.min(...rest.map(l => l.match(/^\s*/)![0].length)) : 0;
  const out = rest.map(l => l.slice(indent));
  if (!raw && out.every(l => /^-\s/.test(l))) return out.map(l => l.replace(/^-\s+/, '').replace(/^(["'])([\s\S]*)\1$/, '$2')).join('\n');
  return out.join('\n');
}

// `--worker w --skill s` after an action
const flags = (rest: string): Record<string, string> => { const o: Record<string, string> = {}; for (const m of rest.matchAll(/--([a-z]+)\s+(\S+)/g)) o[m[1]] = m[2]; return o; };
// One `do:` line → an action; null when it says nothing the engine knows.
export function parseAction(line: string): HookAction | null {
  const l = line.trim().replace(/^-\s+/, '');
  let m: RegExpMatchArray | null;
  // a workflow is a skill with stages (decision:wf2.workflow-is-a-skill): `run workflow:<id>` starts a run, not a session
  if ((m = l.match(/^run\s+workflow:([A-Za-z0-9_.\-]+)$/))) return { kind: 'workflow', workflow: `workflow:${m[1]}` };
  if ((m = l.match(/^run\s+(skill:[A-Za-z0-9_.\-]+)$/))) return { kind: 'run', skill: m[1] };
  if ((m = l.match(/^run\s+([A-Za-z0-9_.\-]+)$/))) return { kind: 'run', skill: `skill:${m[1]}` };
  if ((m = l.match(/^add\s+(?:template:)?([A-Za-z0-9_.\-]+)(?:\s+to\s+(\S+))?$/))) return { kind: 'add', template: m[1], ...(m[2] ? { to: m[2] } : {}) };
  // task "<text>" [--worker w] [--skill skill:x]: a task line under the node (Work lists it), assigned when a worker is named
  if ((m = l.match(/^task\s+"([^"]+)"(.*)$/))) { const o = flags(m[2]); return { kind: 'task', text: m[1], ...(o.worker ? { worker: o.worker } : {}), ...(o.skill ? { skill: o.skill.startsWith('skill:') ? o.skill : `skill:${o.skill}` } : {}) }; }
  if ((m = l.match(/^assign\s+(task:[A-Za-z0-9_.\-]+)(.*)$/))) { const o = flags(m[2]); return { kind: 'assign', task: m[1], ...(o.worker ? { worker: o.worker } : {}), ...(o.skill ? { skill: o.skill.startsWith('skill:') ? o.skill : `skill:${o.skill}` } : {}) }; }
  // dispatch <doc> [--workers N]: the ready tasks of a document handed to workers within the slots of Settings › Agents
  if ((m = l.match(/^dispatch\s+([a-z][a-z0-9-]*)(.*)$/))) { const o = flags(m[2]); return { kind: 'dispatch', doc: m[1], ...(o.workers ? { workers: Number(o.workers) } : {}) }; }
  if ((m = l.match(/^notify\s+"?(.+?)"?$/))) return { kind: 'notify', text: m[1] };
  return null;
}

// The hook a node defines; null when it is not a hook or its `on:` is not `<kind>.<event>`.
export function parseHook(n: Pick<GraphNode, 'id' | 'kind' | 'title' | 'body' | 'status'>): HookDef | null {
  if (n.kind !== 'hook') return null;
  const on = cardValue(n.body, 'on');
  const m = on.match(/^([a-z*][a-z0-9-]*)\.(.+)$/); if (!m) return null;
  const where: Record<string, string> = {};
  for (const part of cardValue(n.body, 'where').split(/[\s,]+/).filter(Boolean)) { const eq = part.indexOf('='); if (eq > 0) where[part.slice(0, eq)] = part.slice(eq + 1); }
  const lines = [cardValue(n.body, 'do'), ...n.body.split('\n').filter(l => /^do-\d+:/.test(l)).map(l => l.replace(/^do-\d+:\s*/, ''))].join('\n').split('\n').filter(l => l.trim());
  const actions = lines.map(parseAction).filter((a): a is HookAction => !!a);
  const once = cardValue(n.body, 'once');
  const skills = (cardValue(n.body, 'skills').match(/skill:[A-Za-z0-9_.\-]+/g) ?? []);
  return { id: n.id, title: n.title, on: { kind: m[1], event: m[2] }, where, actions, once: once !== 'false' && once !== 'no', status: n.status || 'active', skills };
}

// Every hook of a graph: the hook nodes that parse.
export function hooksOf(g: Pick<GraphData, 'nodes'>): HookDef[] {
  return g.nodes.filter(n => n.kind === 'hook' && n.defined).map(parseHook).filter((h): h is HookDef => !!h);
}

const EVENT_KINDS = new Set(['field', 'prop', 'block', 'verdict', 'contradiction', 'drift', 'module', 'product', 'hook', 'template']);
const docSlug = (n: GraphNode) => n.file.replace(/^.*\//, '').replace(/\.md$/, '');

// The events a rebuild's diff means (spec §3): `created` for a typed node newly defined, `status:<x>` for one whose
// status moved to x, `linked:<verb>` for a node an edge with that verb now points at (from the edge diff, the target's
// side) — the node they name is the one the hook fires on. Blocks, generated nodes and hooks themselves emit nothing.
export function eventsFromDiff(before: GraphData, after: GraphData, changes: BlockChange[]): HookEvent[] {
  const old = new Map(before.nodes.map(n => [n.id, n])), now = new Map(after.nodes.map(n => [n.id, n]));
  const out: HookEvent[] = [];
  const ok = (n: GraphNode | undefined): n is GraphNode => !!n && n.defined && !EVENT_KINDS.has(n.kind) && n.form !== 'block';
  for (const c of changes) {
    const n = now.get(c.id); if (!ok(n)) continue;
    if (c.change === 'added') { out.push({ kind: n.kind, id: n.id, event: 'created' }); if (n.status) out.push({ kind: n.kind, id: n.id, event: `status:${n.status}` }); }
    else if (c.change === 'changed') { const o = old.get(c.id); if (o && o.status !== n.status && n.status) out.push({ kind: n.kind, id: n.id, event: `status:${n.status}` }); }
  }
  const had = new Set(before.edges.map(e => `${e.from}|${e.verb}|${e.to}`));
  for (const e of after.edges) {
    if (had.has(`${e.from}|${e.verb}|${e.to}`) || e.generated) continue;
    const t = now.get(e.to); if (!ok(t) || e.from.startsWith('block:')) continue;
    out.push({ kind: t.kind, id: t.id, event: `linked:${e.verb}`, verb: e.verb });
  }
  return out;
}

// Does a `where` filter hold for the node? document=<slug glob> (the document it lives in), type=<slug> (its kind),
// status=<x>, prop=<key>:<value> (a key on its card), role=<r> (a session event's role). Unknown keys never match.
export function whereMatches(where: Record<string, string>, node: GraphNode | undefined, ev: HookEvent): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'document') { if (!node) return false; const re = new RegExp('^' + v.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); if (!re.test(docSlug(node))) return false; }
    else if (k === 'type') { if ((node?.kind ?? ev.kind) !== v) return false; }
    else if (k === 'status') { if ((node?.status ?? '') !== v) return false; }
    else if (k === 'prop') { const c = v.indexOf(':'); const key = c > 0 ? v.slice(0, c) : v, want = c > 0 ? v.slice(c + 1) : ''; const got = node ? cardValue(node.body, key) : ''; if (!got || (want && got !== want)) return false; }
    else if (k === 'role') { if ((ev.role ?? '') !== v) return false; }
    else return false;
  }
  return true;
}

// The active hooks that fire for the event on the node: `on` kind (or *) and event equal, `where` holds, and — for a
// `once` hook — it has not fired on this node before (`fired` holds `hook|node` keys).
export function matchHooks(hooks: HookDef[], ev: HookEvent, node: GraphNode | undefined, fired: Set<string>): HookDef[] {
  return hooks.filter(h => {
    if (h.status === 'paused' || h.status === 'off' || h.status === 'deprecated') return false;
    if (h.on.kind !== '*' && h.on.kind !== ev.kind) return false;
    if (h.on.event !== ev.event) return false;
    if (!whereMatches(h.where, node, ev)) return false;
    if (h.once && fired.has(`${h.id}|${ev.id}`)) return false;
    return h.actions.length > 0;
  });
}

// A template with {{node}} (the id), {{slug}}, {{title}}, {{kind}} — and any extra var, a stage's produced
// documents among them ({{dev-design}}) — filled; unknown names stay.
export function fillTemplate(md: string, vars: Record<string, string>): string {
  return md.replace(/\{\{([\w-]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}
export function templateVars(node: Pick<GraphNode, 'id' | 'kind' | 'title'>): Record<string, string> {
  return { node: node.id, slug: node.id.slice(node.id.indexOf(':') + 1), title: node.title, kind: node.kind };
}

// The firing depth a change made by a hook's session carries: the firing's depth + 1; a person's or a plain session's
// change is depth 0. Refused above MAX_DEPTH.
export function nextDepth(parentDepth: number | undefined): number | null {
  const d = (parentDepth ?? -1) + 1;
  return d > MAX_DEPTH ? null : d;
}
