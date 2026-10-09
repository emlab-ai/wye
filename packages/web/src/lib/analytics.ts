// An analytics page (decision:waterfall.analytics-view-replaces-timeline, decision:wf2.timeline-is-a-query): what a
// cross-tab of cards draws, worked out from the graph and one query line — which nodes are on it, and what the rows
// and the columns group by. Pure: the graph in, a grid of cards out. The query is the view block's language
// (lib/instance-table) with keys of its own: `y` and `x`, each a list of dimensions outer first, and `from` / `to`,
// the window of a span column. A dimension is a property, `kind`, `status`, a path of links (`worker.part-of` is the
// team of the worker), or a date field with a bucket — `due:month`, `when:week`; `when:span` is the continuous track
// the old timeline drew, and may only be the last column level. A cell shows the cards at its intersection, never a
// count: the page is for seeing the work, not counting it.
import { parseBody, type GraphData, type GraphEdge, type GraphIndex, type GraphNode } from './graph';

export type Bucket = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'span';
export const BUCKETS: Bucket[] = ['day', 'week', 'month', 'quarter', 'year', 'span'];
// the date fields a time dimension reads: `when` is the page's own answer to when a node happens (spanOf)
export const TIME_FIELDS: Record<string, string> = { when: 'when it happens — starts, else due', starts: 'starts', ends: 'ends', due: 'due', date: 'date' };
export type Dim = { key: string; bucket?: Bucket };
export const isTimeDim = (d: Dim): boolean => d.key in TIME_FIELDS;
export const isSpan = (d: Dim | undefined): boolean => !!d && d.bucket === 'span';

export type AnalyticsQuery = { kinds: string[]; x: Dim[]; y: Dim[]; from: string; to: string; q: string; status: string[]; props: Record<string, string>; /** the page's own SQL (decision:wf2.table-is-sql): its `id` column picks the cards, and the strip's switches step aside */ sql?: string };
export type Span = { from: string; to: string; point: boolean };
// a card on the grid: the node, and when it happens if it says so (what a span column draws as a bar)
export type Item = { id: string; kind: string; title: string; status: string; span: Span | null; lane: number; /** a line under the title: who holds it, when it is due */ meta: string };
// one step a dimension answered: the label, and the node it names when it names one (a person, a team)
export type Step = { key: string; label: string; id: string };
// one row or column of the grid: what each level answered, outer first
export type Leaf = { key: string; steps: Step[] };
export type Cell = { items: Item[]; lanes: number };
export type Analytics = { rows: Leaf[]; cols: Leaf[]; cells: Record<string, Cell>; /** the last column level is a continuous track */ span: boolean; from: string; to: string; total: number; undated: number };

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
// session says `started` / `finished`; a task's `due` is a point. A node that says none of it is not on the track —
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

// ---- the query line ----
// `kind=task,goal y=worker.part-of,worker x=when:month status=open q=login owner=ana`
// A timeline page's `rows=` still reads as `y=` (decision:waterfall.analytics-view-replaces-timeline): the old pages
// keep working, with the track they always had when nothing says otherwise (`legacyTrack`).
export function parseDim(s: string): Dim {
  const [key, bucket] = s.split(':');
  if (key in TIME_FIELDS) return { key, bucket: (BUCKETS as string[]).includes(bucket ?? '') ? bucket as Bucket : 'month' };
  return { key };
}
export const dimString = (d: Dim): string => isTimeDim(d) ? `${d.key}:${d.bucket ?? 'month'}` : d.key;
export function parseAnalyticsQuery(query: string, opts: { legacyTrack?: boolean } = {}): AnalyticsQuery {
  const m: Record<string, string> = {};
  // a key may be a path — `worker.part-of=Till` filters by the team of the worker
  for (const [, k, quoted, bare] of (query || '').matchAll(/([A-Za-z][\w.-]*)=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g)) m[k] = quoted !== undefined ? quoted.replace(/\\([\\"])/g, '$1') : bare ?? '';
  const list = (s: string) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const { kind, rows, x, y, from, to, q, status, sql, ...props } = m;
  const dims = (s: string) => list(s).map(parseDim);
  let xs = dims(x ?? '');
  // a span is a track, and a track is the last column level; one at most
  const spans = xs.filter(isSpan); if (spans.length) xs = [...xs.filter(d => !isSpan(d)), spans[0]];
  if (!xs.length && opts.legacyTrack && !('x' in m)) xs = [{ key: 'when', bucket: 'span' }];
  return { kinds: list(kind), x: xs, y: dims(y ?? rows ?? '').filter(d => !isSpan(d)), from: day(from ?? ''), to: day(to ?? ''), q: (q ?? '').trim(), status: list(status), props, ...(sql?.trim() ? { sql: sql.trim() } : {}) };
}
export function analyticsQueryString(t: AnalyticsQuery): string {
  const parts: [string, string][] = [['kind', t.kinds.join(',')], ['y', t.y.map(dimString).join(',')], ['x', t.x.map(dimString).join(',')], ['status', t.status.join(',')], ['from', t.from], ['to', t.to], ['q', t.q], ...Object.entries(t.props), ['sql', t.sql ?? '']];
  return parts.filter(([, v]) => v).map(([k, v]) => `${k}=${/[\s"\\]/.test(v) ? `"${v.replace(/[\\"]/g, '\\$&')}"` : v}`).join(' ');
}

// ---- the SQL the strip writes ----
// The page's data is a query over the graph, as a table's is (decision:wf2.table-is-sql): the strip's switches — the
// kinds, the statuses, the words, each filter — write this SQL, and its `id` column picks the cards. Edited by hand it
// becomes the page's own (`sql=` on the query line) and the switches step aside. Nothing is hidden for being done:
// a board's done column is the point of it.
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
export function analyticsSql(q: AnalyticsQuery): string {
  const where: string[] = [];
  if (q.kinds.length) where.push(q.kinds.length === 1 ? `kind = ${lit(q.kinds[0])}` : `kind IN (${q.kinds.map(lit).join(', ')})`);
  if (q.status.length) where.push(q.status.length === 1 ? `status = ${lit(q.status[0])}` : `status IN (${q.status.map(lit).join(', ')})`);
  if (q.q) { const like = lit(`%${q.q}%`); where.push(`(title ILIKE ${like} OR id ILIKE ${like})`); }
  for (const [k, v] of Object.entries(q.props)) {
    const wants = v.split(',').map(x => x.trim()).filter(Boolean); if (!wants.length) continue;
    const path = k.split('.');
    if (path.length === 1) {
      // a property: the words it holds, or the id it points at; `none` is a node that says nothing for it
      const cell = `coalesce(props->>${lit(k)}, '')`;
      where.push(`(${wants.map(w => (w === 'none' ? `${cell} = ''` : `${cell} ILIKE ${lit(`%${w}%`)}`)).join(' OR ')})`);
    } else {
      // a path of links: edges joined step by step, the last one's target matched by id or title
      const joins = path.map((verb, i) => `JOIN edges e${i} ON ${i ? `e${i}.src = e${i - 1}.dst` : 'e0.src = n.id'} AND e${i}.verb = ${lit(verb)}`).join(' ');
      const last = `e${path.length - 1}.dst`;
      const found = `SELECT n.id FROM nodes n ${joins} JOIN nodes t ON t.id = ${last} WHERE ${wants.filter(w => w !== 'none').map(w => `(t.id ILIKE ${lit(`%${w}%`)} OR t.title ILIKE ${lit(`%${w}%`)})`).join(' OR ') || 'true'}`;
      where.push(wants.includes('none') ? `id NOT IN (SELECT n.id FROM nodes n ${joins})` : `id IN (${found})`);
    }
  }
  return `SELECT id FROM nodes${where.length ? `\nWHERE ${where.join('\n  AND ')}` : ''}`;
}

// ---- time buckets ----
const monday = (s: string): string => shift(s, -((new Date(time(s)).getUTCDay() + 6) % 7));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// the bucket a date falls in: its key sorts chronologically, its label is what the header says
export function bucketOf(date: string, bucket: Bucket): Step | null {
  if (!isDay(date)) return null;
  const d = day(date); const y = d.slice(0, 4), m = Number(d.slice(5, 7));
  switch (bucket) {
    case 'day': return { key: d, label: d.slice(5), id: '' };
    case 'week': { const w = monday(d); return { key: w, label: `w/ ${w.slice(5)}`, id: '' }; }
    case 'month': return { key: d.slice(0, 7), label: `${MONTHS[m - 1]} ${y.slice(2)}`, id: '' };
    case 'quarter': return { key: `${y}-Q${Math.ceil(m / 3)}`, label: `${y} Q${Math.ceil(m / 3)}`, id: '' };
    case 'year': return { key: y, label: y, id: '' };
    default: return { key: d, label: d, id: '' };
  }
}
// the bucket after this one — how an axis fills the months nothing happened in
export function nextBucket(key: string, bucket: Bucket): string {
  if (bucket === 'day') return shift(key, 1);
  if (bucket === 'week') return shift(key, 7);
  if (bucket === 'month') { const [y, m] = key.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; }
  if (bucket === 'quarter') { const [y, q] = key.split('-Q').map(Number); return q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`; }
  if (bucket === 'year') return String(Number(key) + 1);
  return key;
}
const bucketLabel = (key: string, bucket: Bucket): string => bucketOf(bucket === 'month' ? `${key}-01` : bucket === 'quarter' ? `${key.slice(0, 4)}-${String((Number(key.slice(6)) - 1) * 3 + 1).padStart(2, '0')}-01` : bucket === 'year' ? `${key}-01-01` : key, bucket)?.label ?? key;

// ---- what a node answers for a dimension ----
const NONE: Step = { key: '￿', label: '—', id: '' };   // sorts last
const STATUS_ORDER = ['todo', 'proposed', 'open', 'in-progress', 'blocked', 'review', 'approved', 'done', 'met', 'dropped', 'rejected'];
type Follow = { id: string; label: string };
// One step of a path: the node a property points at, or the plain value it holds. `worker.part-of` is "the node my
// worker is part of" — how a person's tasks end up under their team.
function follow(n: GraphNode, key: string, idx: Pick<GraphIndex, 'byId'>, out: Map<string, GraphEdge[]>): Follow | null {
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
function walk(n: GraphNode, path: string, idx: Pick<GraphIndex, 'byId'>, out: Map<string, GraphEdge[]>): Follow | null {
  let at: GraphNode | null = n; let step: Follow | null = null;
  for (const key of path.split('.')) {
    if (!at) return null;
    step = follow(at, key, idx, out);
    if (!step) return null;
    at = step.id ? idx.byId.get(step.id) ?? null : null;
  }
  return step;
}
function timeOf(n: GraphNode, field: string): string {
  if (field === 'when') return spanOf(n)?.from ?? '';
  const v = parseBody(n.body ?? '').find(r => r.key === field)?.value ?? '';
  return isDay(v) ? day(v) : '';
}
function answer(n: GraphNode, d: Dim, idx: Pick<GraphIndex, 'byId'>, out: Map<string, GraphEdge[]>): Step {
  if (isTimeDim(d)) return bucketOf(timeOf(n, d.key), d.bucket ?? 'month') ?? NONE;
  const s = walk(n, d.key, idx, out);
  return s ? { key: s.id || s.label, label: s.label, id: s.id } : NONE;
}
function compare(d: Dim | undefined, a: Step, b: Step): number {
  if (a.key === NONE.key || b.key === NONE.key) return Number(a.key === NONE.key) - Number(b.key === NONE.key);
  if (d?.key === 'status') { const i = STATUS_ORDER.indexOf(a.label), j = STATUS_ORDER.indexOf(b.label); if (i >= 0 || j >= 0) return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.label.localeCompare(b.label); }
  return isTimeDim(d ?? { key: '' }) ? a.key.localeCompare(b.key) : a.label.localeCompare(b.label) || a.key.localeCompare(b.key);
}

// The leaves of one axis: every tuple that occurs, sorted level by level; a last time level has the buckets nothing
// fell in filled, so a run of months reads as an axis rather than a list of the busy ones.
function leavesOf(answers: Step[][], dims: Dim[]): Leaf[] {
  const seen = new Map<string, Step[]>();
  for (const t of answers) { const k = t.map(s => s.key).join('\u0001'); if (!seen.has(k)) seen.set(k, t); }
  const last = dims[dims.length - 1];
  if (last && isTimeDim(last) && !isSpan(last)) {
    const bucket = last.bucket ?? 'month';
    const have = [...seen.values()].map(t => t[t.length - 1].key).filter(k => k !== NONE.key).sort();
    if (have.length) {
      const range: string[] = []; for (let k = have[0]; k <= have[have.length - 1] && range.length < 400; k = nextBucket(k, bucket)) range.push(k);
      const prefixes = new Map<string, Step[]>(); for (const t of seen.values()) { const p = t.slice(0, -1); prefixes.set(p.map(s => s.key).join('\u0001'), p); }
      for (const p of prefixes.values()) for (const k of range) { const t = [...p, { key: k, label: bucketLabel(k, bucket), id: '' }]; const kk = t.map(s => s.key).join('\u0001'); if (!seen.has(kk)) seen.set(kk, t); }
    }
  }
  return [...seen.values()]
    .sort((a, b) => { for (let i = 0; i < a.length; i++) { const c = compare(dims[i], a[i], b[i]); if (c) return c; } return 0; })
    .map(steps => ({ key: steps.map(s => s.key).join('\u0001'), steps }));
}

// The grid a page draws: every node the query admits, placed by what each level of `y` and `x` answers for it. A
// node that a level cannot answer for goes under "—" rather than disappearing. When the last column level is a span,
// the nodes with no dates are counted, not drawn.
// `ids`: what the page's SQL returned — then the SQL has done the choosing and the strip's switches are not applied
// again (they wrote that SQL, or stepped aside for the page's own)
export function buildAnalytics(g: Pick<GraphData, 'nodes'>, idx: Pick<GraphIndex, 'byId'> & { out: Map<string, GraphEdge[]> }, query: AnalyticsQuery, ids?: Set<string>): Analytics {
  const kinds = new Set(query.kinds);
  const statuses = new Set(query.status);
  const q = query.q.toLowerCase();
  const wanted = g.nodes.filter(n => {
    if (!n.defined || n.kind === 'type' || n.form === 'block') return false;
    if (ids) return ids.has(n.id);
    if (kinds.size && !kinds.has(n.kind)) return false;
    if (statuses.size && !statuses.has(n.status || '')) return false;
    if (q && !`${n.id} ${n.title}`.toLowerCase().includes(q)) return false;
    // a filter is `<property or path>=<value>`, and a comma is "or": `quarter=q3,q4`. The value matches the node the
    // property points at (by id or by title) or the plain words it holds, so `worker=ana` and `worker=person:ana`
    // both find her work. `none` matches a node that says nothing for it.
    for (const [k, v] of Object.entries(query.props)) {
      const step = walk(n, k, idx, idx.out);
      const have = step ? `${step.id} ${step.label}`.toLowerCase() : '';
      const any = v.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
        .some(want => (want === 'none' ? !step : have.includes(want)));
      if (!any) return false;
    }
    return true;
  });
  const span = isSpan(query.x[query.x.length - 1]);
  const xdims = span ? query.x.slice(0, -1) : query.x;
  const drawn = span ? wanted.filter(n => spanOf(n)) : wanted;
  const one = (label: string): Step[] => [{ key: 'all', label, id: '' }];
  const ty = (n: GraphNode) => query.y.length ? query.y.map(d => answer(n, d, idx, idx.out)) : one('everything');
  const tx = (n: GraphNode) => xdims.length ? xdims.map(d => answer(n, d, idx, idx.out)) : one(span ? 'when' : 'all');
  const placed = drawn.map(n => ({ n, y: ty(n), x: tx(n) }));
  const rows = leavesOf(placed.map(p => p.y), query.y);
  const cols = leavesOf(placed.map(p => p.x), xdims);
  const cells: Record<string, Cell> = {};
  const card = (n: GraphNode): Item => {
    const who = walk(n, 'worker', idx, idx.out) ?? walk(n, 'owner', idx, idx.out);
    const due = timeOf(n, 'due');
    return { id: n.id, kind: n.kind, title: n.title || n.id, status: n.status || '', span: spanOf(n), lane: 0, meta: [who?.label, due ? `due ${due.slice(5)}` : ''].filter(Boolean).join(' · ') };
  };
  for (const p of placed) {
    const k = `${p.y.map(s => s.key).join('\u0001')}|${p.x.map(s => s.key).join('\u0001')}`;
    (cells[k] ??= { items: [], lanes: 1 }).items.push(card(p.n));
  }
  for (const c of Object.values(cells)) {
    // on a track, two things that overlap go on lanes under each other, the way a Gantt stacks them — a row is as
    // tall as it needs to be and nothing is drawn over anything; off a track the cards simply stack
    c.items.sort((a, b) => (a.span?.from ?? '\uffff').localeCompare(b.span?.from ?? '\uffff') || a.title.localeCompare(b.title));   // dated first, in the order they start
    if (!span) continue;
    const ends: string[] = [];
    for (const i of c.items) {
      if (!i.span) continue;
      let lane = ends.findIndex(end => end < i.span!.from);
      if (lane < 0) { lane = ends.length; ends.push(''); }
      ends[lane] = i.span.to;
      i.lane = lane;
    }
    c.lanes = Math.max(1, ends.length);
  }
  const all = Object.values(cells).flatMap(c => c.items);
  const spans = all.map(i => i.span).filter((s): s is Span => !!s);
  const from = query.from || (spans.length ? spans.reduce((m, s) => (s.from < m ? s.from : m), spans[0].from) : '');
  const to = query.to || (spans.length ? spans.reduce((m, s) => (s.to > m ? s.to : m), spans[0].to) : '');
  return { rows, cols, cells, span, from, to, total: all.length, undated: wanted.length - drawn.length };
}
export const cellKey = (row: Leaf, col: Leaf): string => `${row.key}|${col.key}`;

// What a page can filter and group by: the property names the drawn nodes carry, with the values they hold, so the
// strip can offer both instead of asking a person to remember them. Links are named by the node they point at.
export function facetsOf(nodes: Pick<GraphNode, 'body' | 'kind' | 'status'>[], skip: string[] = []): { name: string; values: string[] }[] {
  const drop = new Set(['id', 'title', 'text', 'status', 'starts', 'ends', 'duration', 'due', 'started', 'finished', 'since', 'until', 'evidence', 'session', 'content', ...skip]);
  const seen = new Map<string, Map<string, number>>();
  for (const n of nodes) {
    for (const r of parseBody(n.body ?? '')) {
      const key = r.key; const value = (r.value ?? '').trim();
      if (drop.has(key) || !value || value.length > 60 || r.prose) continue;
      if (!seen.has(key)) seen.set(key, new Map());
      const vals = seen.get(key)!;
      for (const one of value.split(/[,\s]+/).filter(Boolean).slice(0, 4)) vals.set(one, (vals.get(one) ?? 0) + 1);
    }
  }
  return [...seen.entries()]
    .map(([name, vals]) => ({ name, values: [...vals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([v]) => v) }))
    .filter(f => f.values.length)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The ticks a track draws across a window: days while it is short, weeks, then months.
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
