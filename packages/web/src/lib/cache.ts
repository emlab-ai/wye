// A product's cache on disk (req:waterfall.cache-size.status-bar): each part with its size, for the status bar and
// its popover, and Clear and rebuild. Only what rebuilds here without a model call is cleared — the Ask index, the
// graph, the context search's vectors, the viewer's data (decision:waterfall.history-is-not-cache); the model
// judgements in the cache folder (verdicts, impact, cleanup, jev) cost agent calls to remake and are kept, as are the
// eval results, the history (_sessions, _changes, _hooks) and the shared models.
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { REPO_ROOT, type Product, cacheDirOf } from './products';
import { dropIndex, indexingNow } from './ask/refresh';
import { loadScope } from './scope';

export type Part = { key: string; label: string; bytes: number; clears: boolean; shared?: boolean };
// folder: where the product's cache is (lib/cache-home), with the home folder as ~
export type CacheInfo = { product: string; folder: string; parts: Part[]; total: number; clearable: number; rebuilding: boolean };

const CLEARS: [string, string][] = [['search.lance', 'Search index'], ['graph.json', 'Graph'], ['manifest.json', 'Files the graph was built from'], ['embeddings.json', 'Context search vectors'], ['data.js', 'Graph viewer data']];
const JUDGED = ['verdicts.json', 'impact.json', 'cleanup.json', 'jev.json'];
const HISTORY: [string, string][] = [['_sessions', 'Agent sessions'], ['_changes', 'Change log'], ['_hooks', 'Hook runs'], ['_impact', 'Impact runs']];

export async function sizeOf(p: string): Promise<number> {
  let s; try { s = await stat(p); } catch { return 0; }
  if (!s.isDirectory()) return s.size;
  let n = 0; for (const e of await readdir(p).catch(() => [] as string[])) n += await sizeOf(path.join(p, e));
  return n;
}

const G = globalThis as { __cacheClearing?: Set<string> };
const clearing = () => (G.__cacheClearing ??= new Set());

export async function cacheInfo(p: Product): Promise<CacheInfo> {
  const b = (f: string) => path.join(cacheDirOf(p.dir), f);
  const parts: Part[] = [];
  for (const [f, label] of CLEARS) parts.push({ key: f, label, bytes: await sizeOf(b(f)), clears: true });
  let judged = 0; for (const f of JUDGED) judged += await sizeOf(b(f));
  parts.push({ key: 'judged', label: 'Model judgements', bytes: judged, clears: false });
  const known = new Set([...CLEARS.map(c => c[0]), ...JUDGED, 'vault.json', 'eval']);
  let other = 0; for (const f of await readdir(cacheDirOf(p.dir)).catch(() => [] as string[])) if (!known.has(f)) other += await sizeOf(b(f));
  if (other) parts.push({ key: 'other', label: 'Other build files', bytes: other, clears: false });
  for (const [d, label] of HISTORY) parts.push({ key: d, label, bytes: await sizeOf(path.join(p.dir, d)), clears: false });
  parts.push({ key: 'models', label: 'Embedding models', bytes: await sizeOf(path.join(REPO_ROOT, '.cache/models')), clears: false, shared: true });
  const own = parts.filter(x => !x.shared);
  return { product: p.slug, folder: cacheDirOf(p.dir).replace(os.homedir(), '~'), parts, total: own.reduce((s, x) => s + x.bytes, 0), clearable: parts.filter(x => x.clears).reduce((s, x) => s + x.bytes, 0), rebuilding: clearing().has(p.dir) || indexingNow(p) };
}

// Deletes the clearable parts and builds them again: the graph on the next load (lib/scope), which also starts the
// Ask index in the background. Resolves once the files are gone; the rebuild runs on.
export async function clearAndRebuild(p: Product): Promise<void> {
  if (clearing().has(p.dir)) return;
  clearing().add(p.dir);
  try {
    await dropIndex(p, async () => { for (const [f] of CLEARS) await rm(path.join(cacheDirOf(p.dir), f), { recursive: true, force: true }); });
  } catch (e) { clearing().delete(p.dir); throw e; }
  void loadScope(p.slug).catch(e => console.warn(`[wf] ${p.slug}: rebuilding after a clear failed — ${e instanceof Error ? e.message : e}`)).finally(() => clearing().delete(p.dir));
}
