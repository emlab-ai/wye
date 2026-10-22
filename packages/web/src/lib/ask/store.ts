// The Ask index on disk (decision:wf2.ask-sources): one embedded LanceDB database per product, <cache folder>/
// search.lance — one row per passage with its vector, a full-text index over title + text, and hybrid search (BM25 and
// vectors fused by reciprocal rank). Writes are batched (state → apply) so a refresh is one delete and one add, not one
// per file. Which file each passage came from, and that file's mtime and content hash, is kept beside it in scopes.json.
import * as lancedb from '@lancedb/lancedb';
import { Schema, Field, Utf8, Float32, FixedSizeList } from 'apache-arrow';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ChunkRow, Source } from './types';
import { keywords } from '../semantic';

export type StoredRow = ChunkRow & { scope: string; hash: string; model: string; vector: number[] };
export type Store = { dir: string; dim: number; db: lancedb.Connection; table: lancedb.Table; hasFts: boolean; scopes: Record<string, { source: Source; mtime: number; file?: string }> };
export type Scored = ChunkRow & { score: number };

const TABLE = 'chunks';
// The index is read from disk: LanceDB's own cache is kept small (WYE_INDEX_CACHE_MB, default 128 MB of index cache and a
// quarter of that for file metadata) instead of its 6 GB + 1 GB defaults, which a first index of a big folder filled.
const gs = globalThis as unknown as { __wyeLanceSession?: lancedb.Session };
function cacheSession(): lancedb.Session {
  if (!gs.__wyeLanceSession) { const mb = Math.max(16, Number(process.env.WYE_INDEX_CACHE_MB) || 128); gs.__wyeLanceSession = new lancedb.Session(BigInt(mb) * 1048576n, BigInt(Math.ceil(mb / 4)) * 1048576n); }
  return gs.__wyeLanceSession;
}
const ALL = 10_000_000;
const schema = (dim: number) => new Schema([
  ...['id', 'source', 'scope', 'ref', 'title', 'body', 'nodes', 'hash', 'model'].map(n => new Field(n, new Utf8(), false)),
  new Field('vector', new FixedSizeList(dim, new Field('item', new Float32(), true)), false),
]);
export const hashOf = (c: ChunkRow) => createHash('sha1').update(c.title + '\n' + c.text + '\n' + c.nodes.join(',')).digest('hex').slice(0, 16);
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function openStore(dir: string, dim: number): Promise<Store> {
  await mkdir(dir, { recursive: true });
  const db = await lancedb.connect(dir, {}, cacheSession());
  let table = (await db.tableNames()).includes(TABLE) ? await db.openTable(TABLE) : await db.createEmptyTable(TABLE, schema(dim));
  // an index written before the text was stored once is rewritten without its copy, once, keeping its vectors (dropping
  // the column alone leaves its bytes in the data files)
  if ((await table.schema()).fields.some(f => f.name === 'text')) {
    const rows = (await table.query().limit(ALL).toArray()).map(({ text: _text, ...r }) => ({ ...r, vector: Array.from(r.vector as ArrayLike<number>) }));
    table = rows.length ? await db.createTable(TABLE, rows, { mode: 'overwrite', schema: schema(dim) }) : await db.createEmptyTable(TABLE, schema(dim), { mode: 'overwrite' });
    if (rows.length) await table.createIndex('body', { config: lancedb.Index.fts({ withPosition: false }) });
  }
  const hasFts = (await table.listIndices()).some(i => i.columns.includes('body'));
  let scopes: Store['scopes'] = {};
  try { scopes = JSON.parse(await readFile(path.join(dir, 'scopes.json'), 'utf8')); } catch { /* fresh */ }
  return { dir, dim, db, table, hasFts, scopes };
}
export const saveScopes = (s: Store) => writeFile(path.join(s.dir, 'scopes.json'), JSON.stringify(s.scopes));

// every passage's id → where it came from, its text hash and the model its vector was made with
export async function state(s: Store): Promise<Map<string, { scope: string; hash: string; model: string }>> {
  const rows = await s.table.query().select(['id', 'scope', 'hash', 'model']).limit(ALL).toArray();
  return new Map(rows.map(r => [String(r.id), { scope: String(r.scope), hash: String(r.hash), model: String(r.model) }]));
}

// The rows of some scopes only (a batch of files): what a refresh has to compare, without reading the whole index.
export async function stateOf(s: Store, scopes: string[]): Promise<Map<string, { scope: string; hash: string; model: string }>> {
  const out = new Map<string, { scope: string; hash: string; model: string }>();
  for (let i = 0; i < scopes.length; i += 200) {
    const rows = await s.table.query().where(`scope IN (${scopes.slice(i, i + 200).map(lit).join(',')})`).select(['id', 'scope', 'hash', 'model']).limit(ALL).toArray();
    for (const r of rows) out.set(String(r.id), { scope: String(r.scope), hash: String(r.hash), model: String(r.model) });
  }
  return out;
}
// Every scope with the ids of its rows (two short columns: no text, no vectors), for finding files that are gone.
export async function idsByScope(s: Store): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const r of await s.table.query().select(['id', 'scope']).limit(ALL).toArray()) { const k = String(r.scope); const l = out.get(k); if (l) l.push(String(r.id)); else out.set(k, [String(r.id)]); }
  return out;
}
// Ids of rows written with another model than this one (to be embedded again).
export async function idsNotOfModel(s: Store, model: string): Promise<{ id: string; scope: string; hash: string }[]> {
  return (await s.table.query().where(`model != ${lit(model)}`).select(['id', 'scope', 'hash']).limit(ALL).toArray()).map(r => ({ id: String(r.id), scope: String(r.scope), hash: String(r.hash) }));
}

export async function apply(s: Store, remove: string[], add: StoredRow[]): Promise<void> {
  const gone = [...new Set([...remove, ...add.map(r => r.id)])];
  for (let i = 0; i < gone.length; i += 500) await s.table.delete(`id IN (${gone.slice(i, i + 500).map(lit).join(',')})`);
  if (add.length) await s.table.add(add.map(r => ({ id: r.id, source: r.source, scope: r.scope, ref: r.ref, title: r.title, body: `${r.title}\n${r.text}`, nodes: JSON.stringify(r.nodes), hash: r.hash, model: r.model, vector: r.vector })));
  if (!add.length && !gone.length) return;
  if (!s.hasFts && add.length) { await s.table.createIndex('body', { config: lancedb.Index.fts({ withPosition: false }) }); s.hasFts = true; }
}

// Compacts the table into one file, folds new rows into the indexes and removes old versions — once per refresh and
// when a store is opened, never per batch (decision:waterfall.index-compacts-once-per-refresh): each compaction
// rewrites the whole table, and a version kept by the prune window keeps that copy on disk. A minute is enough for a
// search still reading the version it opened; the copy a compaction replaces goes on the next tidy, so the index holds
// at most twice its live rows. Rows added since the last tidy are still found, unindexed.
export const KEEP_MS = 60_000;
export async function tidy(s: Store, keepMs = KEEP_MS): Promise<void> {
  if (!(await s.table.countRows())) return;
  await s.table.optimize({ cleanupOlderThan: new Date(Date.now() - keepMs) });
}

// the text is stored once, in body after the title and a newline — the column full-text search reads
const toChunk = (r: Record<string, unknown>): ChunkRow => { const title = String(r.title); return { id: String(r.id), source: r.source as Source, ref: String(r.ref), title, text: String(r.body).slice(title.length + 1), nodes: JSON.parse(String(r.nodes || '[]')) }; };
const COLS = ['id', 'source', 'ref', 'title', 'body', 'nodes'];
export async function getChunks(s: Store, ids: string[]): Promise<ChunkRow[]> {
  const out = new Map<string, ChunkRow>();
  for (let i = 0; i < ids.length; i += 500) for (const r of await s.table.query().where(`id IN (${ids.slice(i, i + 500).map(lit).join(',')})`).select(COLS).limit(ALL).toArray()) out.set(String(r.id), toChunk(r));
  return ids.map(id => out.get(id)).filter((c): c is ChunkRow => !!c);
}
export async function chunksMentioning(s: Store, nodeId: string, limit: number): Promise<ChunkRow[]> {
  const like = JSON.stringify(nodeId).replace(/[%_\\]/g, m => '\\' + m);
  return (await s.table.query().where(`nodes LIKE ${lit('%' + like + '%')} ESCAPE '\\'`).select(COLS).limit(limit).toArray()).map(toChunk);
}

// user text → the words the full-text index can match; operators, quotes and brackets are dropped
export function ftsText(q: string): string | null {
  const words = keywords(q).map(w => w.replace(/[^a-z0-9_]+/g, ' ').trim()).filter(Boolean);
  return words.length ? words.join(' ') : null;
}

// Hybrid when both a query text and a vector are given (RRF, k = 60); full-text or vector alone otherwise.
let rrf: Promise<lancedb.rerankers.RRFReranker> | null = null;
export async function search(s: Store, q: string, qvec: number[] | null, opts: { limit: number; sources?: Source[]; kind?: string }): Promise<Scored[]> {
  const text = ftsText(q);
  if ((!text && !qvec) || !(await s.table.countRows())) return [];
  const conds = [...(opts.sources?.length ? [`source IN (${opts.sources.map(lit).join(',')})`] : []), ...(opts.kind ? [`source = 'node' AND ref LIKE ${lit(opts.kind.replace(/[%_\\]/g, '') + ':%')}`] : [])];
  const where = conds.length ? conds.join(' AND ') : null;
  let qy;
  if (text && qvec && s.hasFts) qy = s.table.query().fullTextSearch(text, { columns: 'body' }).nearestTo(qvec).distanceType('cosine').rerank(await (rrf ??= lancedb.rerankers.RRFReranker.create(60)));
  else if (text && s.hasFts) qy = s.table.query().fullTextSearch(text, { columns: 'body' });
  else if (qvec) qy = s.table.query().nearestTo(qvec).distanceType('cosine');
  else return [];
  if (where) qy = qy.where(where);
  const rows = await qy.select(COLS).limit(opts.limit).toArray();
  return rows.map(r => ({ ...toChunk(r), score: Number(r._relevance_score ?? r._score ?? (r._distance !== undefined ? 1 - Number(r._distance) : 0)) }));
}
