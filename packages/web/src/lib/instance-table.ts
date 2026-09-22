// Every instance of one type (or every node of one kind) as table rows, and the pure filter / group / sort a person
// applies to them (component:instance-table). Nothing here is stored: rows come from graph.json, the filter state
// from the URL (or a view block's key=value line).
import type { GraphData, GraphNode, PropDef } from './graph';
import { HIDDEN_KINDS } from './graph';
import { typeBySlug, instancesOf, nodeProps } from './types';
import { docRoute } from './doc';

export type ColumnKind = 'enum' | 'bool' | 'ref' | 'string';
export interface Column { name: string; kind: ColumnKind; options?: string[]; ref?: string; many?: boolean }
export interface InstanceRow { id: string; kind: string; title: string; status: string; file: string; doc: string; props: Record<string, string>; rels?: { verb: string; to: string }[]; text?: string }
export interface InstanceTable { slug: string; typed: boolean; columns: Column[]; rows: InstanceRow[]; statuses: [string, number][] }
export interface Filters { q: string; status: string; group: string; sort: string; props: Record<string, string> }

export const EMPTY_FILTERS: Filters = { q: '', status: '', group: '', sort: '', props: {} };
const NONE = '—';
// what every node has is not a column; long text reads better on the node than in a cell
const NOT_COLUMNS = new Set(['title', 'status', 'text', 'owner']);

function column(p: PropDef): Column {
  if (p.enum) return { name: p.name, kind: 'enum', options: p.enum };
  if (p.ref) return { name: p.name, kind: 'ref', ref: p.ref, many: p.many };
  if (p.type === 'bool') return { name: p.name, kind: 'bool' };
  return { name: p.name, kind: 'string' };
}

// Rows of one type (declared, base or own) or one bare kind. A bare kind has no columns; its rows carry their
// non-structural relations instead, as the kind page always showed them.
// `node` is every block of every kind (the search page, req:wf2.ui.search): no columns, the first lines of the text
// on each row so a search can read it (the verdict, contradiction and generated kinds are left out)
const SEARCH_HIDDEN = new Set([...HIDDEN_KINDS, 'verdict', 'contradiction', 'drift']);
export function instanceTable(g: GraphData, slug: string): InstanceTable {
  const t = slug === 'node' ? undefined : typeBySlug(g, slug);
  const nodes = t ? instancesOf(g, slug) : g.nodes.filter(n => n.defined && (slug === 'node' ? !SEARCH_HIDDEN.has(n.kind) : n.kind === slug)).sort((a, b) => a.id.localeCompare(b.id));
  const cols = t ? t.props.filter(p => (!NOT_COLUMNS.has(p.name) || p.from === t.id) && p.type !== 'text' && p.from !== 'type:node').map(column) : [];
  const rows = nodes.map((n): InstanceRow => {
    const r = docRoute(n.file);
    const row: InstanceRow = { id: n.id, kind: n.kind, title: n.title, status: n.status, file: n.file, doc: r ? `${r.project} / ${r.doc}` : n.file, props: {} };
    if (t) { for (const p of nodeProps(g, n)) if (cols.some(c => c.name === p.name) && p.value) row.props[p.name] = p.value; }
    // `part-of` rides on every row (a root property, never a column) so a view can say `part-of=goal:x` — the block a
    // goal's Requirements / Tasks are (decision:wf2.column-is-content)
    const partOf = g.edges.filter(e => e.from === n.id && e.verb === 'part-of').map(e => e.to);
    if (partOf.length) row.props['part-of'] = partOf.length === 1 ? partOf[0] : `[${partOf.join(', ')}]`;
    // the tasks on a requirement (the inverse of a task's part-of): what a coverage view reads beside satisfied-by and
    // verified-by (decision:wf2.traceability-is-the-verb)
    if (n.kind === 'req') { const tasks = g.edges.filter(e => e.to === n.id && e.verb === 'part-of' && e.from.startsWith('task:')).map(e => e.from); if (tasks.length) row.props.tasks = `[${tasks.join(', ')}]`; }
    else row.rels = g.edges.filter(e => e.from === n.id && e.verb !== 'mentions' && e.verb !== 'has').map(e => ({ verb: e.verb, to: e.to }));
    if (slug === 'node') row.text = plain(nodeText(n)).slice(0, 400);
    return row;
  });
  const count = new Map<string, number>();
  for (const r of rows) if (r.status) count.set(r.status, (count.get(r.status) ?? 0) + 1);
  return { slug, typed: !!t, columns: cols, rows, statuses: [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
}

const items = (v: string) => v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);

// The coverage of a requirement (decision:wf2.traceability-is-the-verb): what satisfies it, what verifies it, the
// tasks on it. A gap is a requirement missing either side — what the Design stage's criterion refuses to advance past,
// and what `coverage=1` on a req view marks so a person can see it before they advance.
export function coverageOf(r: Pick<InstanceRow, 'props'>): { satisfiedBy: string[]; verifiedBy: string[]; tasks: string[]; gap: string[] } {
  const of = (k: string) => items(r.props[k] ?? '');
  const satisfiedBy = of('satisfied-by'), verifiedBy = of('verified-by'), tasks = of('tasks');
  return { satisfiedBy, verifiedBy, tasks, gap: [...(satisfiedBy.length ? [] : ['no decision satisfies it']), ...(verifiedBy.length ? [] : ['no test verifies it'])] };
}

// The toolbar state from a query string: q, status, group, sort and one value per known column.
export function parseFilters(params: URLSearchParams | Record<string, string | undefined>, columns: string[]): Filters {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? '';
  const props: Record<string, string> = {};
  for (const c of [...columns, 'part-of']) if (get(c)) props[c] = get(c);
  return { q: get('q'), status: get('status'), group: get('group'), sort: get('sort'), props };
}
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ q: f.q, status: f.status, group: f.group, sort: f.sort, ...f.props })) if (v) p.set(k, v);
  return p.toString().replace(/%3A/g, ':').replace(/%2F/g, '/');
}

// the readable text of a node: its text / statement / q / choice / description, else the body's values
function nodeText(n: { body?: string }): string {
  const b = n.body ?? '';
  const m = b.match(/^(?:text|statement|q|choice|description|purpose|when|then):\s*>?\s*([\s\S]*?)(?=\n[a-z-]+:|$)/m);
  return (m ? m[1] : b).replace(/\s+/g, ' ').trim();
}
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
// a cell holds one value or a list `[a, b]`; a filter value matches the whole value or one item of the list
const hasValue = (cell: string | undefined, want: string) => !!cell && (cell === want || items(cell).includes(want));

export function filterRows(rows: InstanceRow[], f: Filters): InstanceRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(r => {
    if (q && !(r.id.toLowerCase().includes(q) || plain(r.title).toLowerCase().includes(q) || (r.text ?? '').toLowerCase().includes(q) || Object.values(r.props).some(v => v.toLowerCase().includes(q)))) return false;
    if (f.status && r.status !== f.status) return false;
    for (const [k, v] of Object.entries(f.props)) if (v && !hasValue(r.props[k], v)) return false;
    return true;
  });
}

// Buckets by a column, 'status' or 'doc'; a list value puts the row in every bucket it names; the empty bucket last.
export function groupRows(rows: InstanceRow[], by: string): [string, InstanceRow[]][] | null {
  if (!by) return null;
  const m = new Map<string, InstanceRow[]>();
  for (const r of rows) {
    const raw = by === 'status' ? r.status : by === 'doc' ? r.doc : r.props[by] ?? '';
    const keys = raw ? (by === 'status' || by === 'doc' ? [raw] : items(raw)) : [NONE];
    for (const k of keys) { if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  }
  return [...m].sort((a, b) => a[0] === NONE ? 1 : b[0] === NONE ? -1 : a[0].localeCompare(b[0]));
}

// `col` ascending, `-col` descending; empty cells last either way; ties by id.
export function sortRows(rows: InstanceRow[], sort: string): InstanceRow[] {
  if (!sort) return rows;
  const desc = sort.startsWith('-'), col = desc ? sort.slice(1) : sort;
  const val = (r: InstanceRow) => col === 'status' ? r.status : col === 'doc' ? r.doc : col === 'title' ? plain(r.title) : r.props[col] ?? '';
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (!x !== !y) return x ? -1 : 1;
    const c = x.localeCompare(y, undefined, { numeric: true });
    return (desc ? -c : c) || a.id.localeCompare(b.id);
  });
}

// A view block keeps its filters on its line — `<!-- view:bug status=open group=owner q="login page" -->` — as
// key=value pairs; a value with spaces is quoted. Same keys as the URL form.
export function parseViewQuery(query: string, columns: string[]): Filters {
  const m: Record<string, string> = {};
  for (const [, k, quoted, bare] of query.matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|(\S+))/g)) m[k] = quoted ?? bare ?? '';
  return parseFilters(m, columns);
}
export function viewQuery(f: Filters): string {
  return Object.entries({ q: f.q, status: f.status, group: f.group, sort: f.sort, ...f.props }).filter(([, v]) => v).map(([k, v]) => `${k}=${/\s/.test(v) ? `"${v}"` : v}`).join(' ');
}
