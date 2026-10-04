// Every Data table is a query (decision:wf2.table-is-sql): a new table on a page runs
//   SELECT id FROM nodes WHERE kind = 'task' AND page = 'folder/this-page' AND open ORDER BY coalesce(due, target), title
// and each filter of its bar adds a line to that SQL — search, status, open only, a due window, mine, a column's
// value, the sort. "⊕ whole product" drops the page line. The SQL is shown under the bar; edited by hand it becomes
// the table's own (`sql=` on the marker) and the bar's switches step aside. Pure: lib/query runs it.
import type { Filters } from './instance-table';

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
// keywords a column cannot be named bare (a thread's `from`, a message's `to` …)
const RESERVED = new Set(['all', 'and', 'any', 'array', 'as', 'asc', 'both', 'case', 'cast', 'check', 'collate', 'column', 'constraint', 'create', 'default', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'from', 'grant', 'group', 'having', 'in', 'into', 'intersect', 'is', 'lateral', 'leading', 'limit', 'not', 'null', 'offset', 'on', 'only', 'or', 'order', 'placing', 'primary', 'references', 'returning', 'select', 'some', 'symmetric', 'table', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'variadic', 'when', 'where', 'window', 'with']);
// a property as its column of `nodes`: `-` as `_`, quoted when it is a keyword
export const colOf = (k: string) => { const c = k.replace(/-/g, '_'); return /^[a-z_][a-z0-9_]*$/.test(c) && !RESERVED.has(c) ? c : `"${c.replace(/"/g, '""')}"`; };

// `page`: the table's own page, `folder/slug`; none for a table of the whole product
// `me`: who `mine` (a column = me) means
export function tableSql(o: { kind: string; page?: string; f: Filters; me?: string[] }): string {
  const { f } = o;
  const where = [`kind = ${lit(o.kind)}`];
  if (o.page) where.push(`page = ${lit(o.page)}`);
  if (f.status) where.push(`status = ${lit(f.status)}`);
  // like any table, what is done is hidden unless asked for: a status, or show done
  if (f.open === '1' || (!f.status && f.done !== 'show')) where.push('open');
  const q = f.q.trim();
  if (q) { const like = lit(`%${q}%`); where.push(`(title ILIKE ${like} OR text ILIKE ${like})`); }
  if (f.due === 'late') where.push('try_cast(due AS DATE) < current_date');
  else if (f.due === 'today') where.push('try_cast(due AS DATE) <= current_date');
  else if (f.due && /^\d+d$/.test(f.due)) where.push(`try_cast(due AS DATE) <= current_date + ${parseInt(f.due, 10)}`);
  for (const [k, v] of Object.entries(f.props)) {
    if (!v) continue;
    const who = v === 'me' ? (o.me ?? []) : [v];
    where.push(who.length ? (who.length === 1 ? `has(${colOf(k)}, ${lit(who[0])})` : `(${who.map(w => `has(${colOf(k)}, ${lit(w)})`).join(' OR ')})`) : '/* no person card is you yet */ false');
  }
  const desc = f.sort.startsWith('-'), by = desc ? f.sort.slice(1) : f.sort;
  const order = by ? `${by === 'title' || by === 'status' ? by : colOf(by)}${desc ? ' DESC' : ''}, title` : 'coalesce(due, target), title';
  return `SELECT id FROM nodes\nWHERE ${where.join('\n  AND ')}\nORDER BY ${order}`;
}

// the one line a marker holds
export const oneLine = (sql: string) => sql.replace(/\s+/g, ' ').trim();
