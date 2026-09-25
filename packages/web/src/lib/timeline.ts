// A timeline (decision:wf2.timeline-is-a-query): what a Gantt page draws, worked out from the graph and one query
// line — which nodes are on it, when each one happens, and what the rows are. Pure: the graph in, rows of bars out.
// The query is the view block's language (lib/instance-table) with three keys of its own: `rows` says what the Y axis
// groups by, `from` and `to` the window.
import { parseBody, type GraphData, type GraphEdge, type GraphIndex, type GraphNode } from './graph';

export type TimelineQuery = { kinds: string[]; rows: string[]; from: string; to: string; q: string; status: string[]; props: Record<string, string> };
export type Span = { from: string; to: string; point: boolean };
export type Item = Span & { id: string; kind: string; title: string; status: string; lane: number };
// A row of the chart: one per combination of the `rows` levels — `labels` is what each level answered, so the view
// can draw a header when a level changes and the row itself for the deepest one.
export type Row = { key: string; labels: string[]; ids: string[]; items: Item[]; lanes: number };
export type Timeline = { rows: Row[]; from: string; to: string; total: number; undated: number };

const DAY = 86400000;
export const day = (s: string): string => (s || '').trim().slice(0, 10);
const time = (s: string): number => Date.parse(day(s) + 'T00:00:00Z');
export const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day(s)) && !Number.isNaN(time(s));
export const shift = (s: string, days: number): string => new Date(time(s) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string): number => Math.round((time(b) - time(a)) / DAY);

// `3d`, `2w`, `1m`, or a bare number of days. Anything else is no duration at all.
export function days(duration: string): number | null {
  const m = (duration || '').trim().match(/^(\d+(?:\.\d+)?)\s*([dwmy])?$/i);
  if (!m) return null;
  const n = Number(m[1]); const unit = (m[2] || 'd').toLowerCase();
  return Math.round(n * (unit === 'w' ? 7 : unit === 'm' ? 30 : unit === 'y' ? 365 : 1));
}

// When a node happens. `starts` / `ends` are the plan; `duration` stands in for whichever end is missing; a run or a
// session says `started` / `finished`; a task's `due` is a point. A node that says none of it is not on the timeline —
// `since` / `until` say when a node held true, which is a different question and stays off this axis.
export function spanOf(n: Pick<GraphNode, 'body'>): Span | null {
  const rows = new Map(parseBody(n.body ?? '').map(r => [r.key, (r.value ?? '').trim()]));
  const pick = (...keys: string[]) => { for (const k of keys) { const v = rows.get(k); if (v && isDay(v)) return day(v); } return ''; };
  const starts = pick('starts', 'started', 'start');
  const ends = pick('ends', 'finished', 'end');
  const len = days(rows.get('duration') ?? '');
  if (starts && ends) return { from: starts, to: ends, point: starts === ends };
  if (starts && len) return { from: starts, to: shift(starts, len), point: false };
  if (ends && len) return { from: shift(ends, -len), to: ends, point: false };
  if (starts) return { from: starts, to: starts, point: true };
  if (ends) return { from: ends, to: ends, point: true };
  const due = pick('due', 'date');
  return due ? { from: due, to: due, point: true } : null;
}

// `kind=task,goal rows=worker.part-of,worker from=2026-09-01 to=2026-12-31 status=open q=login owner=ana`
export function parseTimelineQuery(query: string): TimelineQuery {
  const m: Record<string, string> = {};
  for (const [, k, quoted, bare] of (query || '').matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|(\S+))/g)) m[k] = quoted ?? bare ?? '';
  const list = (s: string) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const { kind, rows, from, to, q, status, ...props } = m;
  return { kinds: list(kind), rows: list(rows), from: day(from ?? ''), to: day(to ?? ''), q: (q ?? '').trim(), status: list(status), props };
}
export function timelineQueryString(t: TimelineQuery): string {
  const parts: [string, string][] = [['kind', t.kinds.join(',')], ['rows', t.rows.join(',')], ['status', t.status.join(',')], ['from', t.from], ['to', t.to], ['q', t.q], ...Object.entries(t.props)];
  return parts.filter(([, v]) => v).map(([k, v]) => `${k}=${/\s/.test(v) ? `"${v}"` : v}`).join(' ');
}

// One step of a row path: the node a property points at, or the plain value it holds. `worker.part-of` is "the node my
// worker is part of" — how a person's tasks end up under their team.
type Step = { id: string; label: string };
function follow(n: GraphNode, key: string, idx: Pick<GraphIndex, 'byId'>, out: Map<string, GraphEdge[]>): Step | null {
  if (key === 'kind') return { id: '', label: n.kind };
  if (key === 'status') return { id: '', label: n.status || 'none' };
  const edge = (out.get(n.id) ?? []).find(e => e.verb === key && !e.generated);
  if (edge) return { id: edge.to, label: idx.byId.get(edge.to)?.title || edge.to };
  const row = parseBody(n.body ?? '').find(r => r.key === key);
  const v = (row?.value ?? '').trim();
  if (!v) return null;
  const hit = idx.byId.get(v);
  return hit ? { id: v, label: hit.title || v } : { id: '', label: v };
}
function walk(n: GraphNode, path: string, idx: Pick<GraphIndex, 'byId'>, out: Map<string, GraphEdge[]>): Step | null {
  let at: GraphNode | null = n; let step: Step | null = null;
  for (const key of path.split('.')) {
    if (!at) return null;
    step = follow(at, key, idx, out);
    if (!step) return null;
    at = step.id ? idx.byId.get(step.id) ?? null : null;
  }
  return step;
}

// The rows a page draws: every node the query admits that says when it happens, grouped by each level of `rows` in
// turn. A node that a level cannot answer for goes under "—" rather than disappearing.
export function buildTimeline(g: Pick<GraphData, 'nodes'>, idx: Pick<GraphIndex, 'byId'> & { out: Map<string, GraphEdge[]> }, query: TimelineQuery): Timeline {
  const kinds = new Set(query.kinds);
  const statuses = new Set(query.status);
  const q = query.q.toLowerCase();
  const wanted = g.nodes.filter(n => {
    if (!n.defined || n.kind === 'type' || n.form === 'block') return false;
    if (kinds.size && !kinds.has(n.kind)) return false;
    if (statuses.size && !statuses.has(n.status || '')) return false;
    if (q && !`${n.id} ${n.title}`.toLowerCase().includes(q)) return false;
    for (const [k, v] of Object.entries(query.props)) {
      const step = walk(n, k, idx, idx.out);
      const have = step ? `${step.id} ${step.label}` : '';
      if (!have.toLowerCase().includes(v.toLowerCase())) return false;
    }
    return true;
  });
  const dated = wanted.map(n => ({ n, span: spanOf(n) })).filter((x): x is { n: GraphNode; span: Span } => !!x.span);
  const levels = query.rows.filter(Boolean);
  const rows = new Map<string, Row>();
  for (const { n, span } of dated) {
    const steps = levels.map(path => walk(n, path, idx, idx.out));
    const labels = levels.length ? steps.map(s2 => (s2 ? s2.label : '—')) : ['everything'];
    const ids = levels.length ? steps.map(s2 => s2?.id ?? '') : [''];
    const key = labels.join(' ▸ ');
    if (!rows.has(key)) rows.set(key, { key, labels, ids, items: [], lanes: 1 });
    rows.get(key)!.items.push({ id: n.id, kind: n.kind, title: n.title || n.id, status: n.status || '', lane: 0, ...span });
  }
  // two things that overlap in one row go on lanes under each other, the way a Gantt stacks them — a row is as tall
  // as it needs to be and nothing is drawn over anything
  for (const r of rows.values()) {
    r.items.sort((a, b) => a.from.localeCompare(b.from) || a.title.localeCompare(b.title));
    const ends: string[] = [];
    for (const i of r.items) {
      let lane = ends.findIndex(end => end < i.from);
      if (lane < 0) { lane = ends.length; ends.push(''); }
      ends[lane] = i.to;
      i.lane = lane;
    }
    r.lanes = Math.max(1, ends.length);
  }
  // a row with no name last, so "—" does not lead the chart
  const list = [...rows.values()].sort((a, b) => Number(a.labels[0] === '—') - Number(b.labels[0] === '—') || a.key.localeCompare(b.key));
  const all = list.flatMap(r => r.items);
  const from = query.from || (all.length ? all.reduce((m, i) => (i.from < m ? i.from : m), all[0].from) : '');
  const to = query.to || (all.length ? all.reduce((m, i) => (i.to > m ? i.to : m), all[0].to) : '');
  return { rows: list, from, to, total: all.length, undated: wanted.length - dated.length };
}

// The ticks a chart draws across a window: days while it is short, weeks, then months.
export function ticksFor(from: string, to: string): { at: string; label: string; major: boolean }[] {
  if (!isDay(from) || !isDay(to)) return [];
  const span = Math.max(1, daysBetween(from, to));
  const out: { at: string; label: string; major: boolean }[] = [];
  if (span <= 31) {
    for (let d = 0; d <= span; d++) { const at = shift(from, d); const wd = new Date(time(at)).getUTCDay(); out.push({ at, label: at.slice(8), major: wd === 1 }); }
  } else if (span <= 240) {
    for (let d = 0; d <= span; d++) { const at = shift(from, d); if (new Date(time(at)).getUTCDay() !== 1) continue; out.push({ at, label: at.slice(5), major: at.slice(8) <= '07' }); }
  } else {
    let at = from.slice(0, 8) + '01';
    while (at <= to) { if (at >= from) out.push({ at, label: at.slice(0, 7), major: at.slice(5, 7) === '01' }); const d = new Date(time(at)); at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); }
  }
  return out;
}
