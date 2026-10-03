// Keeps a product's Ask index current (decision:wf2.ask-sources): each source file whose mtime moved is re-chunked and
// only passages whose text changed are rewritten; files that vanished lose their passages; passages written without a
// vector (no model yet) get one once the model loads. The product's code is its `repo:` (else this repo): the files
// git tracks, ≤200 KB, text only. One diff, one write (store.apply).
import { readFile, stat, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Product } from '../products';
import { REPO_ROOT, DATA_ROOT, productRepo } from '../products';
import type { GraphData } from '../graph';
import type { ChunkRow, Source } from './types';
import { openStore, state, apply, getChunks, saveScopes, hashOf, type Store, type StoredRow } from './store';
import { nodeChunks, docChunks, codeChunks, sessionChunks } from './chunk';
import { getEmbedder, toVector, EMBED_MODEL, EMBED_DIM, type Embed } from './embed';

export type RefreshStats = { changed: Record<Source, number>; embedded: number; degraded?: 'no-vectors'; indexing?: boolean };
const MAX_CODE = 200 * 1024;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|sh|sql|css|scss|html|md|yml|yaml|toml|c|h|cpp|hpp|cs|graphql)$/i;

// Ask indexes code only where the product names it (spec §6)
export const codeRoot = (p: Product): string | null => productRepo(p);
const stores = ((globalThis as { __askStores?: Map<string, Promise<Store>> }).__askStores ??= new Map());
export function getStore(p: Product): Promise<Store> {
  let s = stores.get(p.dir);
  if (!s) { s = openStore(path.join(p.dir, '_build/search.lance'), EMBED_DIM); s.catch(() => stores.delete(p.dir)); stores.set(p.dir, s); }
  return s;
}
const gitFiles = async (root: string) => (await promisify(execFile)('git', ['ls-files'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })).stdout.split('\n').filter(Boolean);
const mtimeOf = async (f: string) => { try { return (await stat(f)).mtimeMs; } catch { return null; } };
const inside = (f: string, dir: string) => f === dir || f.startsWith(path.resolve(dir) + path.sep);
const abs = (f: string) => path.isAbsolute(f) ? f : path.resolve(REPO_ROOT, f);

// every file of every source with its mtime (a scope is `<source>:<path>` — one file can feed two sources), and a reader for the ones that changed
async function walk(p: Product, graph: GraphData, listCode: (root: string) => Promise<string[]>, sources: Set<Source>) {
  const files: { scope: string; source: Source; mtime: number; read: () => Promise<ChunkRow[]> }[] = [];
  const gm = (await mtimeOf(path.join(p.dir, '_build/graph.json'))) ?? graph.nodes.length;
  if (sources.has('node')) files.push({ scope: 'graph', source: 'node', mtime: gm, read: async () => nodeChunks(graph) });
  for (const f of sources.has('doc') ? graph.files : []) {
    const a = abs(f); const m = await mtimeOf(a); if (m === null) continue;
    files.push({ scope: 'doc:' + a, source: 'doc', mtime: m, read: async () => docChunks(path.relative(REPO_ROOT, a), await readFile(a, 'utf8')) });
  }
  const root = codeRoot(p);
  if (sources.has('code') && root && existsSync(root)) {
    let list: string[] = []; try { list = await listCode(root); } catch { /* not a git folder */ }
    for (const rel of list.filter(f => CODE_EXT.test(f))) {
      const a = path.join(root, rel); if (inside(a, path.join(p.dir, 'projects')) || inside(a, path.join(p.dir, '_sessions')) || inside(a, DATA_ROOT)) continue;   // knowledge, not code
      let st; try { st = await stat(a); } catch { continue; }
      if (!st.isFile() || st.size > MAX_CODE) continue;
      files.push({ scope: 'code:' + a, source: 'code', mtime: st.mtimeMs, read: async () => { const t = await readFile(a, 'utf8'); return t.includes('\0') ? [] : codeChunks(rel, t); } });
    }
  }
  const sdir = path.join(p.dir, '_sessions');
  let names: string[] = []; if (sources.has('session')) try { names = (await readdir(sdir)).filter(n => n.endsWith('.json') && !n.startsWith('_')); } catch { /* none */ }
  for (const n of names) {
    const a = path.join(sdir, n); const m = await mtimeOf(a); if (m === null) continue;
    files.push({ scope: 'session:' + a, source: 'session', mtime: m, read: async () => { try { return sessionChunks(JSON.parse(await readFile(a, 'utf8'))); } catch { return []; } } });
  }
  return files;
}

type RefreshOpts = { embed?: Embed | null; listCode?: (root: string) => Promise<string[]>; sources?: Source[]; reembed?: boolean; batch?: number };
const G = globalThis as { __askLocks?: Map<string, Promise<unknown>>; __askRuns?: Map<string, { at: number; p: Promise<RefreshStats> }>; __askBg?: Map<string, Promise<void>> };
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
  const changed: Record<Source, number> = { node: 0, doc: 0, code: 0, session: 0 }; let embedded = 0;
  const files = await walk(p, graph, opts.listCode ?? gitFiles, sources); const present = new Set(files.map(f => f.scope));
  const todo = files.filter(f => s.scopes[f.scope]?.mtime !== f.mtime);
  const size = opts.batch ?? Number.MAX_SAFE_INTEGER;
  for (let i = 0; i === 0 || i < todo.length; i += size) {
    const slice = todo.slice(i, i + size); const last = i + size >= todo.length;
    await withLock(p.dir, async () => {
      const have = await state(s);
      const byScope = new Map<string, string[]>(); for (const [id, x] of have) byScope.set(x.scope, [...(byScope.get(x.scope) ?? []), id]);
      const remove: string[] = []; const add: (ChunkRow & { scope: string; hash: string })[] = []; const scopes = { ...s.scopes };
      for (const f of slice) {
        if (s.scopes[f.scope]?.mtime === f.mtime) continue;          // another refresh did it while this one waited
        scopes[f.scope] = { source: f.source, mtime: f.mtime };
        const rows = await f.read(); const ids = new Set<string>();
        for (const c of rows) { if (ids.has(c.id)) continue; ids.add(c.id); const h = hashOf(c); const was = have.get(c.id); if (was?.hash === h && was.scope === f.scope) continue; add.push({ ...c, scope: f.scope, hash: h }); changed[f.source]++; }
        for (const id of byScope.get(f.scope) ?? []) if (!ids.has(id)) remove.push(id);
      }
      if (last) {
        // files of these sources that are gone
        for (const [sc, ids] of byScope) if (sources.has(sourceOfScope(sc)) && !present.has(sc)) remove.push(...ids);
        for (const sc of Object.keys(scopes)) if (sources.has(scopes[sc].source) && !present.has(sc)) delete scopes[sc];
        // rows written earlier without the current model
        if (embed && opts.reembed !== false) {
          const adding = new Set(add.map(a => a.id)); const gone = new Set(remove);
          const stale = [...have].filter(([id, x]) => x.model !== EMBED_MODEL && !adding.has(id) && !gone.has(id)).map(([id]) => id);
          for (const c of await getChunks(s, stale)) add.push({ ...c, scope: have.get(c.id)!.scope, hash: have.get(c.id)!.hash });
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
    });
  }
  return { changed, embedded, ...(embed ? {} : { degraded: 'no-vectors' as const }) };
}

// Before a query (spec §6): blocks and documents are brought up to date and waited for — at most every 5 s; code,
// sessions and any re-embedding run in the background, and `indexing` says so while they do.
export function ensureFresh(p: Product, graph: GraphData, opts: Pick<RefreshOpts, 'embed' | 'listCode'> = {}): Promise<RefreshStats> {
  const runs = (G.__askRuns ??= new Map<string, { at: number; p: Promise<RefreshStats> }>()); const bg = (G.__askBg ??= new Map<string, Promise<void>>());
  const cur = runs.get(p.dir);
  if (cur && Date.now() - cur.at < 5000) return cur.p.then(st => ({ ...st, indexing: bg.has(p.dir) }));
  const job = { at: Date.now(), p: refresh(p, graph, { ...opts, sources: ['node', 'doc'], reembed: false }).then(st => {
    if (!bg.has(p.dir)) {
      const b = refresh(p, graph, { ...opts, sources: ['code', 'session'], reembed: true, batch: 50 }).then(() => undefined, e => { console.warn(`[ask] ${p.slug}: background indexing failed — ${e instanceof Error ? e.message : e}`); }).finally(() => bg.delete(p.dir));
      bg.set(p.dir, b);
    }
    return { ...st, indexing: bg.has(p.dir) };
  }) };
  job.p.catch(() => runs.delete(p.dir));                              // a failed refresh is not reused for 5 s
  runs.set(p.dir, job); return job.p;
}
export const backgroundDone = (p: Product): Promise<void> => G.__askBg?.get(p.dir) ?? Promise.resolve();
