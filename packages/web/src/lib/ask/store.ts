// The Ask index on disk (decision:wf2.ask-sources): one embedded LanceDB database per product, <product>/_build/
// search.lance — one row per passage with its vector, a full-text index over title + text, and hybrid search (BM25 and
// vectors fused by reciprocal rank). Writes are batched (state → apply) so a refresh is one delete and one add, not one
// per file. Which file each passage came from, and that file's mtime, is kept beside it in scopes.json.
import * as lancedb from '@lancedb/lancedb';
import { Schema, Field, Utf8, Float32, FixedSizeList } from 'apache-arrow';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ChunkRow, Source } from './types';
import { keywords } from '../semantic';

export type StoredRow = ChunkRow & { scope: string; hash: string; model: string; vector: number[] };
export type Store = { dir: string; dim: number; db: lancedb.Connection; table: lancedb.Table; hasFts: boolean; scopes: Record<string, { source: Source; mtime: number }> };
export type Scored = ChunkRow & { score: number };

const TABLE = 'chunks';
const ALL = 10_000_000;
const schema = (dim: number) => new Schema([
  ...['id', 'source', 'scope', 'ref', 'title', 'text', 'body', 'nodes', 'hash', 'model'].map(n => new Field(n, new Utf8(), false)),
  new Field('vector', new FixedSizeList(dim, new Field('item', new Float32(), true)), false),
]);
export const hashOf = (c: ChunkRow) => createHash('sha1').update(c.title + '\n' + c.text + '\n' + c.nodes.join(',')).digest('hex').slice(0, 16);
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function openStore(dir: string, dim: number): Promise<Store> {
  await mkdir(dir, { recursive: true });
  const db = await lancedb.connect(dir);
  const table = (await db.tableNames()).includes(TABLE) ? await db.openTable(TABLE) : await db.createEmptyTable(TABLE, schema(dim));
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

export async function apply(s: Store, remove: string[], add: StoredRow[]): Promise<void> {
  const gone = [...new Set([...remove, ...add.map(r => r.id)])];
  for (let i = 0; i < gone.length; i += 500) await s.table.delete(`id IN (${gone.slice(i, i + 500).map(lit).join(',')})`);
  if (add.length) await s.table.add(add.map(r => ({ id: r.id, source: r.source, scope: r.scope, ref: r.ref, title: r.title, text: r.text, body: `${r.title}\n${r.text}`, nodes: JSON.stringify(r.nodes), hash: r.hash, model: r.model, vector: r.vector })));
  if (!add.length && !gone.length) return;
  if (!s.hasFts && add.length) { await s.table.createIndex('body', { config: lancedb.Index.fts({ withPosition: false }) }); s.hasFts = true; }
  else await s.table.optimize({ cleanupOlderThan: new Date() });    // folds new rows into the indexes, drops old versions
}

const toChunk = (r: Record<string, unknown>): ChunkRow => ({ id: String(r.id), source: r.source as Source, ref: String(r.ref), title: String(r.title), text: String(r.text), nodes: JSON.parse(String(r.nodes || '[]')) });
const COLS = ['id', 'source', 'ref', 'title', 'text', 'nodes'];
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
export async function search(s: Store, q: string, qvec: number[] | null, opts: { limit: number; sources?: Source[] }): Promise<Scored[]> {
  const text = ftsText(q);
  if ((!text && !qvec) || !(await s.table.countRows())) return [];
  const where = opts.sources?.length ? `source IN (${opts.sources.map(lit).join(',')})` : null;
  let qy;
  if (text && qvec && s.hasFts) qy = s.table.query().fullTextSearch(text, { columns: 'body' }).nearestTo(qvec).distanceType('cosine').rerank(await (rrf ??= lancedb.rerankers.RRFReranker.create(60)));
  else if (text && s.hasFts) qy = s.table.query().fullTextSearch(text, { columns: 'body' });
  else if (qvec) qy = s.table.query().nearestTo(qvec).distanceType('cosine');
  else return [];
  if (where) qy = qy.where(where);
  const rows = await qy.select(COLS).limit(opts.limit).toArray();
  return rows.map(r => ({ ...toChunk(r), score: Number(r._relevance_score ?? r._score ?? (r._distance !== undefined ? 1 - Number(r._distance) : 0)) }));
}
