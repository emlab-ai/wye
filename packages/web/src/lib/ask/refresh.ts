// Keeps a product's Ask index current (decision:wf2.ask-sources): each source file whose mtime moved is re-chunked and
// only passages whose text changed are rewritten; files that vanished lose their passages; passages written without a
// vector (no model yet) get one once the model loads. The product's code is its `repo:` (else this repo): the files
// git tracks, ≤200 KB, text only. One diff, one write (store.apply).
import { readFile, stat, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Product } from '../products';
import { REPO_ROOT, DATA_ROOT, productRepo, cacheDirOf } from '../products';
import type { GraphData } from '../graph';
import type { ChunkRow, Source } from './types';
import { openStore, stateOf, idsByScope, idsNotOfModel, apply, getChunks, saveScopes, tidy, hashOf, type Store, type StoredRow } from './store';
import { nodeChunks, docChunks, codeChunks, sessionChunks } from './chunk';
import { getEmbedder, toVector, EMBED_MODEL, EMBED_DIM, type Embed } from './embed';

export type RefreshStats = { changed: Record<Source, number>; embedded: number; read?: number; degraded?: 'no-vectors'; indexing?: boolean };
const MAX_CODE = 200 * 1024;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|sh|sql|css|scss|html|md|yml|yaml|toml|c|h|cpp|hpp|cs|graphql)$/i;

// Ask indexes code only where the product names it (spec §6)
export const codeRoot = (p: Product): string | null => productRepo(p);
const stores = ((globalThis as { __askStores?: Map<string, Promise<Store>> }).__askStores ??= new Map());
export function getStore(p: Product): Promise<Store> {
  // keyed by where the store is, so a store opened at the vault's old _build/ is never used after the move (lib/cache-home)
  const where = path.join(cacheDirOf(p.dir), 'search.lance');
  let s = stores.get(where);
  if (!s) {
    s = openStore(where, EMBED_DIM); s.catch(() => stores.delete(where)); stores.set(where, s);
    // the versions an earlier run left behind go when the store is first opened (decision:waterfall.index-compacts-once-per-refresh)
    void s.then((st: Store) => withLock(p.dir, () => tidy(st))).catch((e: unknown) => console.warn(`[ask] ${p.slug}: tidying the index failed — ${e instanceof Error ? e.message : e}`));
  }
  return s;
}
const gitFiles = async (root: string) => (await promisify(execFile)('git', ['ls-files'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })).stdout.split('\n').filter(Boolean);
const fileHash = (b: Buffer) => createHash('sha1').update(b).digest('hex').slice(0, 16);
const mtimeOf = async (f: string) => { try { return (await stat(f)).mtimeMs; } catch { return null; } };
const inside = (f: string, dir: string) => f === dir || f.startsWith(path.resolve(dir) + path.sep);
const abs = (f: string) => path.isAbsolute(f) ? f : path.resolve(REPO_ROOT, f);

// every file of every source with its mtime (a scope is `<source>:<path>` — one file can feed two sources), and a reader for the ones that changed
async function walk(p: Product, graph: GraphData, listCode: (root: string) => Promise<string[]>, sources: Set<Source>) {
  const files: { scope: string; source: Source; mtime: number; file?: string; read: () => Promise<ChunkRow[]> }[] = [];
  const gm = (await mtimeOf(path.join(cacheDirOf(p.dir), 'graph.json'))) ?? graph.nodes.length;
  if (sources.has('node')) files.push({ scope: 'graph', source: 'node', mtime: gm, read: async () => nodeChunks(graph) });
  for (const f of sources.has('doc') ? graph.files : []) {
    const a = abs(f); const m = await mtimeOf(a); if (m === null) continue;
    files.push({ scope: 'doc:' + a, source: 'doc', mtime: m, file: a, read: async () => docChunks(path.relative(REPO_ROOT, a), await readFile(a, 'utf8')) });
  }
  const root = codeRoot(p);
  if (sources.has('code') && root && existsSync(root)) {
    let list: string[] = []; try { list = await listCode(root); } catch { /* not a git folder */ }
    for (const rel of list.filter(f => CODE_EXT.test(f))) {
      const a = path.join(root, rel); if (inside(a, path.join(p.dir, 'projects')) || inside(a, path.join(p.dir, '_sessions')) || inside(a, DATA_ROOT)) continue;   // knowledge, not code
      let st; try { st = await stat(a); } catch { continue; }
      if (!st.isFile() || st.size > MAX_CODE) continue;
      files.push({ scope: 'code:' + a, source: 'code', mtime: st.mtimeMs, file: a, read: async () => { const t = await readFile(a, 'utf8'); return t.includes('\0') ? [] : codeChunks(rel, t); } });
    }
  }
  const sdir = path.join(p.dir, '_sessions');
  let names: string[] = []; if (sources.has('session')) try { names = (await readdir(sdir)).filter(n => n.endsWith('.json') && !n.startsWith('_')); } catch { /* none */ }
  for (const n of names) {
    const a = path.join(sdir, n); const m = await mtimeOf(a); if (m === null) continue;
    files.push({ scope: 'session:' + a, source: 'session', mtime: m, file: a, read: async () => { try { return sessionChunks(JSON.parse(await readFile(a, 'utf8'))); } catch { return []; } } });
  }
  return files;
}

type RefreshOpts = { embed?: Embed | null; listCode?: (root: string) => Promise<string[]>; sources?: Source[]; reembed?: boolean; batch?: number };
const G = globalThis as { __askLocks?: Map<string, Promise<unknown>>; __askRuns?: Map<string, { at: number; p: Promise<RefreshStats>; settled?: boolean }>; __askBg?: Map<string, Promise<void>>; __askIndexed?: Set<string> };
// one writer per product at a time; on globalThis so a dev reload does not start a second one
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks = (G.__askLocks ??= new Map());
  const next = (locks.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  locks.set(key, next.catch(() => undefined)); return next;
}
const sourceOfScope = (sc: string): Source => (sc === 'graph' ? 'node' : sc.split(':')[0]) as Source;

// Brings the given sources (all by default) up to date. Changed files are written `batch` at a time, each batch under
// the product's lock, so a query's own refresh can slip in between batches of a long first build.
export async function refresh(p: Product, graph: GraphData, opts: RefreshOpts = {}): Promise<RefreshStats> {
  const sources = new Set<Source>(opts.sources ?? ['node', 'doc', 'code', 'session']);
  const s = await getStore(p);
  let embed: Embed | null = opts.embed === undefined ? null : opts.embed;
  if (opts.embed === undefined) { try { embed = await getEmbedder(); } catch { embed = null; } }
  const model = embed ? EMBED_MODEL : '';
  const changed: Record<Source, number> = { node: 0, doc: 0, code: 0, session: 0 }; let embedded = 0; let wrote = false;
  const files = await walk(p, graph, opts.listCode ?? gitFiles, sources); const present = new Set(files.map(f => f.scope));
  // a file whose mtime moved but whose content did not (a branch switched away and back, a checkout that rewrote it the
  // same) is not read again: its content hash, kept beside the mtime, says so and only the mtime is updated
  // (req:waterfall.cache-home.branch-switch)
  const moved = files.filter(f => s.scopes[f.scope]?.mtime !== f.mtime);
  const contentOf = new Map<string, string>(); const touched: typeof files = [];
  for (const f of moved) {
    if (!f.file) continue;
    try { contentOf.set(f.scope, fileHash(await readFile(f.file))); } catch { continue; }
    if (s.scopes[f.scope]?.file === contentOf.get(f.scope)) touched.push(f);
  }
  if (touched.length) await withLock(p.dir, async () => { const scopes = { ...s.scopes }; for (const f of touched) scopes[f.scope] = { ...scopes[f.scope], mtime: f.mtime }; s.scopes = scopes; await saveScopes(s); });
  const todo = moved.filter(f => !touched.includes(f)); let read = 0;
  const size = opts.batch ?? Number.MAX_SAFE_INTEGER;
  for (let i = 0; i === 0 || i < todo.length; i += size) {
    const slice = todo.slice(i, i + size); const last = i + size >= todo.length;
    await withLock(p.dir, async () => {
      // only the rows of this batch's files are read (a first index of 12,000 files read the whole table for each batch of 50)
      const have = await stateOf(s, slice.filter(f => s.scopes[f.scope]?.mtime !== f.mtime).map(f => f.scope));
      const byScope = new Map<string, string[]>(); for (const [id, x] of have) byScope.set(x.scope, [...(byScope.get(x.scope) ?? []), id]);
      const remove: string[] = []; const add: (ChunkRow & { scope: string; hash: string })[] = []; const scopes = { ...s.scopes };
      for (const f of slice) {
        if (s.scopes[f.scope]?.mtime === f.mtime) continue;          // another refresh did it while this one waited
        scopes[f.scope] = { source: f.source, mtime: f.mtime, ...(contentOf.has(f.scope) ? { file: contentOf.get(f.scope) } : {}) };
        const rows = await f.read(); read++; const ids = new Set<string>();
        for (const c of rows) { if (ids.has(c.id)) continue; ids.add(c.id); const h = hashOf(c); const was = have.get(c.id); if (was?.hash === h && was.scope === f.scope) continue; add.push({ ...c, scope: f.scope, hash: h }); changed[f.source]++; }
        for (const id of byScope.get(f.scope) ?? []) if (!ids.has(id)) remove.push(id);
      }
      if (last) {
        // files of these sources that are gone
        for (const [sc, ids] of await idsByScope(s)) if (sources.has(sourceOfScope(sc)) && !present.has(sc)) remove.push(...ids);
        for (const sc of Object.keys(scopes)) if (sources.has(scopes[sc].source) && !present.has(sc)) delete scopes[sc];
        // rows written earlier without the current model
        if (embed && opts.reembed !== false) {
          const adding = new Set(add.map(a => a.id)); const gone = new Set(remove);
          const old = new Map((await idsNotOfModel(s, EMBED_MODEL)).map(x => [x.id, x]));
          const stale = [...old.keys()].filter(id => !adding.has(id) && !gone.has(id));
          for (let k = 0; k < stale.length; k += 500) for (const c of await getChunks(s, stale.slice(k, k + 500))) add.push({ ...c, scope: old.get(c.id)!.scope, hash: old.get(c.id)!.hash });
        }
      }
      const rows: StoredRow[] = [];
      for (let k = 0; k < add.length; k += 64) {
        const batch = add.slice(k, k + 64);
        const vecs = embed ? await embed(batch.map(b => `${b.title}. ${b.text}`.slice(0, 1500))) : null;
        batch.forEach((b, j) => rows.push({ ...b, model, vector: toVector(vecs?.[j] ?? [], s.dim) }));
        if (vecs) embedded += batch.length;
      }
      await apply(s, remove, rows);
      if (JSON.stringify(scopes) !== JSON.stringify(s.scopes)) { s.scopes = scopes; await saveScopes(s); }
      if (rows.length || remove.length) wrote = true;
    });
  }
  if (wrote) await withLock(p.dir, () => tidy(s));                    // one compaction for the whole refresh
  return { changed, embedded, read, ...(embed ? {} : { degraded: 'no-vectors' as const }) };
}

// Before a query (spec §6): blocks and documents are brought up to date and waited for — at most every 5 s; code,
// sessions and any re-embedding run in the background, and `indexing` says so while they do.
export function ensureFresh(p: Product, graph: GraphData, opts: Pick<RefreshOpts, 'embed' | 'listCode'> = {}): Promise<RefreshStats> {
  const runs = (G.__askRuns ??= new Map<string, { at: number; p: Promise<RefreshStats>; settled?: boolean }>()); const bg = (G.__askBg ??= new Map<string, Promise<void>>());
  // "indexing" until the first background pass completes; later passes only catch up with edits
  const indexed = (G.__askIndexed ??= new Set<string>()); const indexing = () => bg.has(p.dir) && !indexed.has(p.dir);
  const cur = runs.get(p.dir);
  if (cur && Date.now() - cur.at < 5000) return cur.p.then(st => ({ ...st, indexing: indexing() }));
  const job: { at: number; p: Promise<RefreshStats>; settled?: boolean } = { at: Date.now(), settled: false, p: refresh(p, graph, { ...opts, sources: ['node', 'doc'], reembed: false }).then(st => {
    if (!bg.has(p.dir)) {
      const b = refresh(p, graph, { ...opts, sources: ['code', 'session'], reembed: true, batch: 50 }).then(() => { indexed.add(p.dir); }, e => { console.warn(`[ask] ${p.slug}: background indexing failed — ${e instanceof Error ? e.message : e}`); }).finally(() => bg.delete(p.dir));
      bg.set(p.dir, b);
    }
    return { ...st, indexing: indexing() };
  }) };
  job.p.then(() => { job.settled = true; }, () => { job.settled = true; runs.delete(p.dir); });                              // a failed refresh is not reused for 5 s
  runs.set(p.dir, job); return job.p;
}
export const backgroundDone = (p: Product): Promise<void> => G.__askBg?.get(p.dir) ?? Promise.resolve();
// whether a product's index was ever built on this machine (the store is on disk): what a search over the workspace
// asks before touching another vault — building an index embeds every page in this process and would stall the
// typing search for everyone; a vault without one is sent to build in the background and answers next time
export async function indexBuilt(p: Product): Promise<boolean> { try { return (await import('node:fs/promises')).stat(path.join(cacheDirOf(p.dir), 'search.lance')).then(s => s.isDirectory()); } catch { return false; } }
// whether the index is being written now — a query's refresh or the background pass (the status bar's "rebuilding")
export const indexingNow = (p: Product): boolean => !!G.__askBg?.has(p.dir) || G.__askRuns?.get(p.dir)?.settled === false;
// Forget the index (Clear and rebuild): waits for the writer, then drops the open store and every run, under the
// product's lock, and calls `remove` to delete the files while nothing can write them.
export async function dropIndex(p: Product, remove: () => Promise<void>): Promise<void> {
  await backgroundDone(p).catch(() => undefined);
  await withLock(p.dir, async () => {
    stores.delete(path.join(cacheDirOf(p.dir), 'search.lance')); G.__askRuns?.delete(p.dir); G.__askIndexed?.delete(p.dir);
    await remove();
  });
}
