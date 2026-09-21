// The build coordinator (decision:wf2.parse-cache): a product's graph is built in this process — lib/build.js with a
// parse cache kept across builds, so a save re-parses the one document that changed and replays the rest — and the
// built graph stays in memory with its indexes, served to every request until graph.json changes underneath (a CLI
// build). One build per product at a time; a request that arrives while one runs gets the next. Listeners registered
// with onBuilt run after every build with the graph before and after — the watcher's change pipeline lives there.
import { createRequire } from 'node:module';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { REPO_ROOT } from './products';
import { indexGraph, type GraphData, type GraphIndex } from './graph';
import { nodeIndex, type IndexEntry } from './doc';
import { loadGraph } from './load';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
type Lib = { newParseCache(): unknown; buildGraph(root: string, o: { cache?: unknown; cwd?: string }): { graph: GraphData; files: string[] }; checkLines(graph: GraphData, o: { repo: string; strict?: boolean }): { errors: string[]; warnings: string[]; output: string } };
const lib = (): Lib => ({ ...req('./lib/parse.js'), ...req('./lib/build.js') });

export type Cached = { graph: GraphData; idx: GraphIndex; index: Record<string, IndexEntry>; stamp: string; builtAt: number };
export type BuiltListener = ((productDir: string, before: GraphData | null, after: GraphData) => Promise<void> | void) & { key?: string };
type State = { caches: Map<string, unknown>; graphs: Map<string, Cached>; running: Map<string, Promise<BuildResult>>; queued: Map<string, Promise<BuildResult>>; listeners: BuiltListener[]; lastBuilt: Map<string, number>; after: Map<string, Promise<void>> };
const g = globalThis as unknown as { __wfBuild?: State };
// on globalThis across dev reloads; a reload that adds a field finds the old state and fills it in
const st = (): State => { const s = (g.__wfBuild ??= { caches: new Map(), graphs: new Map(), running: new Map(), queued: new Map(), listeners: [], lastBuilt: new Map(), after: new Map() }); s.after ??= new Map(); return s; };

export type BuildResult = { code: number; output: string; graph: GraphData | null; before: GraphData | null };

const graphPathOf = (productDir: string) => path.join(productDir, '_build/graph.json');
const stampOf = async (graphPath: string) => { try { const s = await stat(graphPath); return `${s.mtimeMs}:${s.size}`; } catch { return ''; } };
const index = (graph: GraphData, stamp: string): Cached => ({ graph, idx: indexGraph(graph), index: nodeIndex(graph), stamp, builtAt: Date.now() });

// After a build: listeners keyed for dev reloads (the same key replaces the earlier registration).
export function onBuilt(fn: BuiltListener, key?: string): void {
  const s = st();
  if (key) { fn.key = key; const i = s.listeners.findIndex(l => l.key === key); if (i >= 0) { s.listeners[i] = fn; return; } }
  if (!s.listeners.includes(fn)) s.listeners.push(fn);
}

// When the product was last built here — the watcher skips its own rebuild for a change the app already built.
export function builtAt(productDir: string): number { return st().lastBuilt.get(productDir) ?? 0; }

// The product's graph with its indexes: from memory while graph.json is the file this process built or last read,
// re-read when it changed underneath. Null when there is no graph.
export async function graphFor(productDir: string): Promise<Cached | null> {
  const s = st(); const gp = graphPathOf(productDir);
  const stamp = await stampOf(gp);
  if (!stamp) { s.graphs.delete(productDir); return null; }
  const hit = s.graphs.get(productDir);
  if (hit && hit.stamp === stamp) return hit;
  try { const c = index(await loadGraph(gp), stamp); s.graphs.set(productDir, c); return c; }
  catch { return null; }
}
export function graphInMemory(productDir: string): GraphData | null { return st().graphs.get(productDir)?.graph ?? null; }

// Build the product now: parse (cached), write graph.json, keep the graph, run the listeners. Serialised per product.
export function buildProduct(productDir: string): Promise<BuildResult> {
  const s = st();
  const running = s.running.get(productDir);
  if (running) {
    // one more build after this one is enough for everyone who asks meanwhile
    const queued = s.queued.get(productDir); if (queued) return queued;
    const next = running.then(() => { s.queued.delete(productDir); return buildProduct(productDir); }, () => { s.queued.delete(productDir); return buildProduct(productDir); });
    s.queued.set(productDir, next); return next;
  }
  const p = (async (): Promise<BuildResult> => {
    await import('./watch'); // the change pipeline registers itself as a listener (a dynamic import: watch imports this module)
    const before = (await graphFor(productDir))?.graph ?? null;
    const t0 = performance.now();
    let graph: GraphData, files: string[];
    try {
      if (!s.caches.has(productDir)) s.caches.set(productDir, lib().newParseCache());
      ({ graph, files } = lib().buildGraph(productDir, { cache: s.caches.get(productDir), cwd: REPO_ROOT }));
    } catch (e) { return { code: 1, output: `build failed: ${e instanceof Error ? e.message : e}`, graph: null, before }; }
    const t1 = performance.now();
    s.lastBuilt.set(productDir, Date.now());
    s.graphs.set(productDir, index(graph, await stampOf(graphPathOf(productDir))));
    const output = `built ${path.relative(REPO_ROOT, graphPathOf(productDir))} from ${files.length} file(s): ${graph.nodes.length} nodes, ${graph.edges.length} edges in ${(t1 - t0).toFixed(0)} ms (+${(performance.now() - t1).toFixed(0)} ms indexes)`;
    // the listeners run after the reply, in build order per product: the save returns as soon as the graph is written
    s.after.set(productDir, (s.after.get(productDir) ?? Promise.resolve()).then(async () => { for (const fn of s.listeners) { try { await fn(productDir, before, graph); } catch (e) { console.log(`[wf] after build: ${e instanceof Error ? e.message : e}`); } } }));
    return { code: 0, output, graph, before };
  })();
  s.running.set(productDir, p);
  return p.finally(() => { if (s.running.get(productDir) === p) s.running.delete(productDir); });
}

// The check (`ctx check`) over the graph in memory: its lines as the CLI prints them, for the routes that show them.
export async function checkProduct(productDir: string, strict = false): Promise<{ code: number; output: string; errors: string[]; warnings: string[] }> {
  const c = await graphFor(productDir);
  if (!c) return { code: 2, output: 'no graph', errors: ['no graph'], warnings: [] };
  const r = lib().checkLines(c.graph, { repo: REPO_ROOT, strict });
  return { code: r.errors.length ? 1 : 0, ...r };
}
