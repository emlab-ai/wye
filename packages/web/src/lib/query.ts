// Queries over the product's graph (decision:wf2.graph-query): SQL — and SQL/PGQ graph patterns (MATCH) through the
// DuckPGQ extension — run by an in-memory DuckDB that holds the graph Wye already built (graph.json), nothing else.
// Nothing is stored: the markdown stays the only source; the engine is rebuilt in memory when the graph changes. File
// and network access are switched off and the settings locked before any query runs, so a query can only read the
// graph; one read statement at a time (SELECT / WITH / FROM).
//
//   nodes(id, kind, title, status, open, folder, page (folder/slug: the page it is on), file, text, props JSON, <a column per property in use>) — state, due,
//         owner, project (the item it links), date … each `-` as `_` (part_of); props->>'key' for any other
//   edges(src, dst, verb)                                                    — every link: part-of, project, to, mentions …
//   has(cell, v)  — the cell is v or a list [a, b] that holds v (owner, to, tags …)
//   graph `wye` (when DuckPGQ loads): FROM GRAPH_TABLE (wye MATCH (a:nodes)-[e:edges]->(b:nodes) WHERE … COLUMNS (…))
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { loadScope } from './scope';
import { docRoute } from './doc';
import { CLOSED } from './instance-table';   // what no longer asks anything of anyone: `open` is false for it

type Engine = { at: string; conn: DuckDBConnection; graph: boolean };
// the tables' shape: a change here rebuilds every cached engine (they live on globalThis across dev reloads)
const SHAPE = 5;
// the columns a table's generated SQL names (lib/table-sql), there even in a product where no card has one yet
const ALWAYS = ['due', 'owner', 'state', 'target', 'project', 'part-of'];

const g = globalThis as unknown as { __wfQuery?: Map<string, Promise<Engine>> };
const engines = () => (g.__wfQuery ??= new Map());

export type QueryResult = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; graph: boolean; ms: number };
export const MAX_ROWS = 1000;

// a card's own keys (`key: value` lines of its body), what props->>'key' reads
export function propsOf(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^([a-z][\w-]*):\s*(.*)$/); if (!m || m[1] === 'id') continue;
    out[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}

// One read statement: SELECT, WITH or FROM, no second statement after a `;`. (The engine refuses writes to files and
// settings anyway; this keeps the in-memory tables as they were loaded.)
export function readOnly(sql: string): string | null {
  const s = sql.trim().replace(/;\s*$/, '');
  if (!s) return 'the query is empty';
  if (/;/.test(s.replace(/'(?:[^']|'')*'/g, "''"))) return 'one statement at a time';
  if (!/^(select|with|from|\(|values|summarize|describe)\b/i.test(s)) return 'only a read query: SELECT, WITH or FROM';
  return null;
}

async function build(product: string): Promise<Engine | null> {
  const scope = await loadScope(product); if (!scope) return null;
  const inst = await DuckDBInstance.create(':memory:');
  const conn = await inst.connect();
  let graph = false;
  try { await conn.run('INSTALL duckpgq FROM community'); await conn.run('LOAD duckpgq'); graph = true; } catch { /* offline the first time, or no build for this DuckDB: SQL still works */ }
  const nodes = scope.graph.nodes.filter(n => n.defined && !['block', 'prop', 'field'].includes(n.kind));
  const parsed = nodes.map(n => ({ n, props: propsOf(n.body ?? '') }));
  // a column for every property in use (and every one a type declares), so `c.state = 'open'` reads as it says
  const FIXED = new Set(['id', 'kind', 'title', 'status', 'open', 'folder', 'page', 'file', 'text', 'props']);
  const seen = new Map<string, number>();
  for (const p of parsed) for (const k of Object.keys(p.props)) seen.set(k, (seen.get(k) ?? 0) + 1);
  for (const t of scope.graph.types ?? []) for (const pr of t.props ?? []) if (!seen.has(pr.name)) seen.set(pr.name, 0);
  for (const k of ALWAYS) if (!seen.has(k)) seen.set(k, 0);
  // the declared ones and the most used first (a few hundred one-off keys from imports stay in props)
  const declared = new Set([...ALWAYS, ...(scope.graph.types ?? []).flatMap(t => (t.props ?? []).map(p => p.name))]);
  const propCols = [...seen].filter(([k]) => !FIXED.has(k.replace(/-/g, '_')) && /^[a-z][\w-]*$/.test(k))
    .sort((a, b) => (declared.has(b[0]) ? 1e9 : b[1]) - (declared.has(a[0]) ? 1e9 : a[1])).slice(0, 200).map(([k]) => k).sort();
  const colName = (k: string) => k.replace(/-/g, '_');
  await conn.run(`CREATE TABLE nodes (id VARCHAR, kind VARCHAR, title VARCHAR, status VARCHAR, open BOOLEAN, folder VARCHAR, page VARCHAR, file VARCHAR, text VARCHAR, props JSON${propCols.map(k => `, "${colName(k)}" VARCHAR`).join('')})`);
  await conn.run('CREATE TABLE edges (src VARCHAR, dst VARCHAR, verb VARCHAR)');
  const ids = new Set(nodes.map(n => n.id));
  const a = await conn.createAppender('nodes');
  for (const { n, props } of parsed) {
    a.appendVarchar(n.id); a.appendVarchar(n.kind); a.appendVarchar(n.title ?? ''); a.appendVarchar(n.status ?? ''); a.appendBoolean(!CLOSED.has(n.status ?? '') && !CLOSED.has(props.state ?? ''));
    const r = n.file ? docRoute(n.file) : null; a.appendVarchar(r?.project ?? ''); a.appendVarchar(r ? `${r.project}/${r.doc}` : ''); a.appendVarchar(n.file ?? '');
    a.appendVarchar((props.text ?? n.title ?? '').slice(0, 2000)); a.appendVarchar(JSON.stringify(props));
    for (const k of propCols) { const v = props[k]; if (v === undefined || v === '') a.appendNull(); else a.appendVarchar(v); }
    a.endRow();
  }
  a.closeSync();
  const e = await conn.createAppender('edges');
  for (const x of scope.graph.edges) { if (!ids.has(x.from) || !ids.has(x.to)) continue; e.appendVarchar(x.from); e.appendVarchar(x.to); e.appendVarchar(x.verb); e.endRow(); }
  e.closeSync();
  // has(cell, v): a cell holds one value or a list [a, b] — true when it is v or lists v
  await conn.run("CREATE MACRO has(cell, v) AS cell = v OR list_contains(list_transform(string_split(trim(cell, '[]'), ','), x -> trim(x)), v)");
  if (graph) {
    try { await conn.run('CREATE PROPERTY GRAPH wye VERTEX TABLES (nodes) EDGE TABLES (edges SOURCE KEY (src) REFERENCES nodes (id) DESTINATION KEY (dst) REFERENCES nodes (id))'); }
    catch { graph = false; }
  }
  await conn.run('SET enable_external_access = false');
  await conn.run('SET lock_configuration = true');
  return { at: `${SHAPE}|${scope.graph.generatedAt ?? ''}`, conn, graph };
}

async function engine(product: string): Promise<Engine | null> {
  const scope = await loadScope(product); if (!scope) return null;
  const cur = engines().get(product);
  if (cur) { const e = await cur.catch(() => null); if (e && e.at === `${SHAPE}|${scope.graph.generatedAt ?? ''}`) return e; }
  const next = build(product).then(e => { if (!e) throw new Error('no product'); return e; });
  engines().set(product, next);
  return next.catch(() => null);
}

const plain = (v: unknown): unknown => typeof v === 'bigint' ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v))
  : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' && !(v instanceof Date) ? (typeof (v as { toString?: () => string }).toString === 'function' && v.constructor?.name !== 'Object' ? String(v) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))) : v;

export async function runQuery(product: string, sql: string): Promise<{ ok: true; result: QueryResult } | { ok: false; status: number; message: string }> {
  const bad = readOnly(sql); if (bad) return { ok: false, status: 422, message: bad };
  const e = await engine(product); if (!e) return { ok: false, status: 404, message: `no product ${product}` };
  const t = Date.now();
  try {
    const reader = await e.conn.runAndReadUntil(sql.trim().replace(/;\s*$/, ''), MAX_ROWS + 1);
    const cols = reader.columnNames();
    const rows = reader.getRowObjectsJS().map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])));
    return { ok: true, result: { columns: cols, rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS, graph: e.graph, ms: Date.now() - t } };
  } catch (err) { return { ok: false, status: 422, message: (err instanceof Error ? err.message : String(err)).split('\n').slice(0, 4).join('\n') }; }
}
