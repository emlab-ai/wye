// Hooks, the pure part (decision:wf2.hooks-and-skills): a hook card — `on: <kind>.<event>`, `where:` filters,
// `do:` actions, `once`, status — read from its node; the events a graph diff means (created, status:<x>,
// linked:<verb>); which active hooks match an event on a node; a template filled for a node. The IO — firings, the
// sessions a `run` starts, the blocks an `add` writes — is lib/hooks-run.
import type { GraphData, GraphNode } from './graph';
import type { BlockChange } from './session-types';

export type HookEvent = { kind: string; id: string; event: string; verb?: string; session?: string; role?: string };
export type HookAction = { kind: 'run'; skill: string } | { kind: 'workflow'; workflow: string } | { kind: 'add'; template: string; to?: string } | { kind: 'task'; text: string; worker?: string; skill?: string } | { kind: 'assign'; task: string; worker?: string; skill?: string } | { kind: 'notify'; text: string } | { kind: 'dispatch'; doc: string; workers?: number };
// for: the node a `time.<schedule>` hook fires on (decision:ea.time-based-hooks) — its own node when absent
export type HookDef = { id: string; title: string; on: { kind: string; event: string }; where: Record<string, string>; actions: HookAction[]; once: boolean; status: string; skills: string[]; for?: string };

export const HOOK_EVENTS = ['created', 'status:<x>', 'linked:<verb>', 'pr.approved', 'pr.built', 'session.done', 'time.<schedule>'];
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
  // a time hook's event is its schedule, spacing normalised (`time.weekdays 08:00`); an unreadable one still lists, never fires
  if (m[1] === 'time') m[2] = parseSchedule(m[2])?.text ?? m[2].trim();
  const forNode = cardValue(n.body, 'for').match(/^[a-z][a-z0-9-]*:[A-Za-z0-9_.\-~/]+$/)?.[0];
  const where: Record<string, string> = {};
  for (const part of cardValue(n.body, 'where').split(/[\s,]+/).filter(Boolean)) { const eq = part.indexOf('='); if (eq > 0) where[part.slice(0, eq)] = part.slice(eq + 1); }
  const lines = [cardValue(n.body, 'do'), ...n.body.split('\n').filter(l => /^do-\d+:/.test(l)).map(l => l.replace(/^do-\d+:\s*/, ''))].join('\n').split('\n').filter(l => l.trim());
  const actions = lines.map(parseAction).filter((a): a is HookAction => !!a);
  const once = cardValue(n.body, 'once');
  const skills = (cardValue(n.body, 'skills').match(/skill:[A-Za-z0-9_.\-]+/g) ?? []);
  return { id: n.id, title: n.title, on: { kind: m[1], event: m[2] }, where, actions, once: once !== 'false' && once !== 'no', status: n.status || 'active', skills, ...(forNode ? { for: forNode } : {}) };
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
// status=<x>, prop=<key>:<value> (a key on its card), role=<r> (a session event's role), upcoming=<key> (the card's
// date under that key is today or later — a meeting from an import of old notes is not prepared). Unknown keys never match.
export function whereMatches(where: Record<string, string>, node: GraphNode | undefined, ev: HookEvent, today = new Date().toISOString().slice(0, 10)): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'document') { if (!node) return false; const re = new RegExp('^' + v.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); if (!re.test(docSlug(node))) return false; }
    else if (k === 'type') { if ((node?.kind ?? ev.kind) !== v) return false; }
    else if (k === 'status') { if ((node?.status ?? '') !== v) return false; }
    else if (k === 'prop') { const c = v.indexOf(':'); const key = c > 0 ? v.slice(0, c) : v, want = c > 0 ? v.slice(c + 1) : ''; const got = node ? cardValue(node.body, key) : ''; if (!got || (want && got !== want)) return false; }
    else if (k === 'role') { if ((ev.role ?? '') !== v) return false; }
    else if (k === 'upcoming') { const d = node ? cardValue(node.body, v).slice(0, 10) : ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today) return false; }
    else return false;
  }
  return true;
}

// The active hooks that fire for the event on the node: `on` kind (or *) and event equal, `where` holds, and — for a
// `once` hook — it has not fired on this node before (`fired` holds `hook|node` keys).
export function matchHooks(hooks: HookDef[], ev: HookEvent, node: GraphNode | undefined, fired: Set<string>): HookDef[] {
  return hooks.filter(h => {
    if (h.status === 'paused' || h.status === 'off' || h.status === 'deprecated') return false;
    // a time hook answers only the clock's event for its schedule, on any node's kind; once is per slot there (lib/hooks-clock)
    if (h.on.kind === 'time') { if (ev.event !== `time.${h.on.event}`) return false; }
    else if ((h.on.kind !== '*' && h.on.kind !== ev.kind) || h.on.event !== ev.event) return false;
    if (!whereMatches(h.where, node, ev)) return false;
    if (h.once && h.on.kind !== 'time' && fired.has(`${h.id}|${ev.id}`)) return false;
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

// ---- time hooks (decision:ea.time-based-hooks, task:ea.cadence): `on: time.<schedule>` — `daily HH:MM`, `weekdays
// HH:MM`, `<day>[,<day>…] HH:MM`, `cron <m> <h> <dom> <mon> <dow>` — in the person's zone (lib/settings#timeZoneOf).
// Every form is a cron underneath; the clock (lib/hooks-clock) fires a hook once when its last slot moves past the one it saw.
export type Schedule = { text: string; kind: 'daily' | 'weekdays' | 'days' | 'cron'; minute: number[]; hour: number[]; dom: number[]; mon: number[]; dow: number[]; domAny: boolean; dowAny: boolean };
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// one cron field → its sorted values; null when out of range or unreadable
function cronField(f: string, lo: number, hi: number): number[] | null {
  const out = new Set<number>();
  for (const part of f.split(',')) {
    const m = part.match(/^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/); if (!m) return null;
    const a = m[1] === '*' ? lo : Number(m[2]), b = m[1] === '*' ? hi : m[3] !== undefined ? Number(m[3]) : m[4] ? hi : a, step = m[4] ? Number(m[4]) : 1;
    if (a < lo || b > hi || a > b || step < 1) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}
export function parseSchedule(s: string): Schedule | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, ' ');
  const hm = (x: string) => { const m = x.match(/^([01]?\d|2[0-3]):([0-5]\d)$/); return m ? { hour: [Number(m[1])], minute: [Number(m[2])] } : null; };
  const all = { dom: span(1, 31), mon: span(1, 12), domAny: true };
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^cron (\S+) (\S+) (\S+) (\S+) (\S+)$/))) {
    const minute = cronField(m[1], 0, 59), hour = cronField(m[2], 0, 23), dom = cronField(m[3], 1, 31), mon = cronField(m[4], 1, 12), dow7 = cronField(m[5], 0, 7);
    if (!minute || !hour || !dom || !mon || !dow7) return null;
    const dow = [...new Set(dow7.map(d => d % 7))].sort((x, y) => x - y);
    return { text: t, kind: 'cron', minute, hour, dom, mon, dow, domAny: m[3].startsWith('*'), dowAny: m[5].startsWith('*') };
  }
  if (!(m = t.match(/^(\S+) (\S+)$/))) return null;
  const at = hm(m[2]); if (!at) return null;
  const text = `${m[1]} ${String(at.hour[0]).padStart(2, '0')}:${String(at.minute[0]).padStart(2, '0')}`;
  if (m[1] === 'daily') return { text, kind: 'daily', ...at, ...all, dow: span(0, 6), dowAny: true };
  if (m[1] === 'weekdays') return { text, kind: 'weekdays', ...at, ...all, dow: span(1, 5), dowAny: false };
  const days = m[1].split(','), dow = days.map(d => DAYS.indexOf(d));
  if (!days.length || dow.some(d => d < 0)) return null;
  return { text, kind: 'days', ...at, ...all, dow: [...new Set(dow)].sort((x, y) => x - y), dowAny: false };
}

// A zone's offset from UTC at an instant, in ms, from Intl alone (no tz library): the wall clock there minus the instant.
const fmts = new Map<string, Intl.DateTimeFormat>();
function wall(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number } {
  let f = fmts.get(tz); if (!f) fmts.set(tz, f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
  const p: Record<string, number> = {}; for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute };
}
const offsetAt = (ms: number, tz: string) => { const w = wall(ms, tz); return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(ms / 60000) * 60000; };
// The instant a wall-clock time names in a zone: the offsets 14 h either side are the only ones it can have; a time
// both fit (the doubled fall-back hour) is the first, as cron runs it; one neither fits (the spring-forward gap) is
// read with the offset before the jump (01:30 in London's gap → 02:30 BST).
export function zonedTime(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const local = Date.UTC(y, mo - 1, d, h, mi), before = offsetAt(local - 50400000, tz), after = offsetAt(local + 50400000, tz);
  const fits = [...new Set([before, after])].map(o => local - o).filter(t => local - offsetAt(t, tz) === t);
  return fits.length ? Math.min(...fits) : local - before;
}

// The most recent instant the schedule names at or before now, in zone tz; null when none in the last 8 days (a
// cron for a day of the month far off). Days back from today, each day's times latest first; within a day the scan
// stops 3 hours below the best found (DST can reorder the wall clock only within that).
export function lastSlot(s: Schedule, now: Date, tz: string): Date | null {
  const t = now.getTime(), today = wall(t, tz);
  const times: [number, number][] = []; for (const h of [...s.hour].reverse()) for (const mi of [...s.minute].reverse()) times.push([h, mi]);
  for (let back = 0; back <= 8; back++) {
    const day = new Date(Date.UTC(today.y, today.mo - 1, today.d - back));
    const y = day.getUTCFullYear(), mo = day.getUTCMonth() + 1, d = day.getUTCDate(), wd = day.getUTCDay();
    if (!s.mon.includes(mo)) continue;
    const domOk = s.dom.includes(d), dowOk = s.dow.includes(wd);
    if (!(s.domAny || s.dowAny ? domOk && dowOk : domOk || dowOk)) continue;
    let best: number | null = null, bestWall = 0;
    for (const [h, mi] of times) {
      if (back === 0 && h * 60 + mi > today.h * 60 + today.mi + 180) continue; // later today, past any DST shift
      if (best !== null && bestWall - (h * 60 + mi) > 180) break;
      const at = zonedTime(y, mo, d, h, mi, tz);
      if (at <= t && (best === null || at > best)) { if (best === null) bestWall = h * 60 + mi; best = at; }
    }
    if (best !== null) return new Date(best);
  }
  return null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// What a hook's `on:` says in words — "weekdays at 08:00 (Europe/London)" for a time hook (an install preview, a
// column), `<kind>.<event>` for any other.
export function describeHookOn(h: Pick<HookDef, 'on'>, tz?: string): string {
  if (h.on.kind !== 'time') return `${h.on.kind}.${h.on.event}`;
  const s = parseSchedule(h.on.event); if (!s) return `time.${h.on.event} (unreadable schedule)`;
  const at = s.text.slice(s.text.lastIndexOf(' ') + 1);
  const words = s.kind === 'daily' ? `daily at ${at}` : s.kind === 'weekdays' ? `weekdays at ${at}` : s.kind === 'days' ? `${s.dow.map(d => DAY_NAMES[d]).join(', ')} at ${at}` : s.text;
  return tz ? `${words} (${tz})` : words;
}
