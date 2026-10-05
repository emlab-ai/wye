// The build coordinator (decision:wf2.parse-cache): a product's graph is built in this process — lib/build.js with a
// parse cache kept across builds, so a save re-parses the one document that changed and replays the rest — and the
// built graph stays in memory with its indexes, served to every request until graph.json changes underneath (a CLI
// build). One build per product at a time; a request that arrives while one runs gets the next. Listeners registered
// with onBuilt run after every build with the graph before and after — the watcher's change pipeline lives there.
import { createRequire } from 'node:module';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { REPO_ROOT } from './products';
import { indexGraph, type GraphData, type GraphIndex } from './graph';
import { nodeIndex, type IndexEntry } from './doc';
import { loadGraph } from './load';
import { graphDelta, mergeDeltas, EVERYTHING, NOTHING, type GraphDelta } from './graph-delta';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
type Lib = { newParseCache(): unknown; findDocs(root: string): string[]; buildGraph(root: string, o: { cache?: unknown; cwd?: string; files?: string[] }): { graph: GraphData; files: string[] }; checkLines(graph: GraphData, o: { repo: string; strict?: boolean }): { errors: string[]; warnings: string[]; output: string } };
const LIB = ['./lib/parse.js', './lib/build.js'];
// The parser is CommonJS, required once and kept in Node's module cache, which Next's reload does not touch: editing
// lib/parse.js while the dev server runs used to leave it building yesterday's graph, silently. In development the
// files' mtimes are checked and the modules dropped when they change; the parse caches go with them, because they hold
// what the old parser made of each file.
function lib(): Lib {
  if (process.env.NODE_ENV !== 'production') {
    const s = st();
    const stamp = LIB.map(f => { try { return String(statSync(req.resolve(f)).mtimeMs); } catch { return ''; } }).join('|');
    if (stamp !== s.libStamp) {
      s.libStamp = stamp;
      for (const f of LIB) { try { delete req.cache[req.resolve(f)]; } catch { /* not cached */ } }
      s.caches.clear();   // a cache holds what the old parser made of each file
    }
  }
  return { ...req('./lib/parse.js'), ...req('./lib/build.js') };
}

// rev: counts the graphs this process has held for the product — what a change event is relative to (deltaSince)
export type Cached = { graph: GraphData; idx: GraphIndex; index: Record<string, IndexEntry>; stamp: string; builtAt: number; rev: number };
export type BuiltListener = ((productDir: string, before: GraphData | null, after: GraphData) => Promise<void> | void) & { key?: string };
type Step = { rev: number; delta: () => GraphDelta };
type State = { libStamp?: string; caches: Map<string, unknown>; graphs: Map<string, Cached>; running: Map<string, Promise<BuildResult>>; queued: Map<string, Promise<BuildResult>>; listeners: BuiltListener[]; lastBuilt: Map<string, number>; read: Map<string, Map<string, number>>; after: Map<string, Promise<void>>; revs: Map<string, number>; steps: Map<string, Step[]> };
const g = globalThis as unknown as { __wfBuild?: State };
// on globalThis across dev reloads; a reload that adds a field finds the old state and fills it in
const st = (): State => { const s = (g.__wfBuild ??= { caches: new Map(), graphs: new Map(), running: new Map(), queued: new Map(), listeners: [], lastBuilt: new Map(), read: new Map(), after: new Map(), revs: new Map(), steps: new Map() }); s.after ??= new Map(); s.revs ??= new Map(); s.steps ??= new Map(); s.read ??= new Map(); return s; };

export type BuildResult = { code: number; output: string; graph: GraphData | null; before: GraphData | null };

const graphPathOf = (productDir: string) => path.join(productDir, '_build/graph.json');
const stampOf = async (graphPath: string) => { try { const s = await stat(graphPath); return `${s.mtimeMs}:${s.size}`; } catch { return ''; } };
const stampNow = (graphPath: string) => { try { const s = statSync(graphPath); return `${s.mtimeMs}:${s.size}`; } catch { return ''; } };

// The graph a product now has, in memory with its indexes, and what it changed from the one before
// (decision:wf2.change-names-what-changed): each graph is a step with a rev, and the step knows its delta — worked out
// when someone asks (the change event, 300 ms later), not while the save waits. A step keeps the graph before it only
// until its delta is known, and the one before it is settled when the next arrives, so one old graph is held at most.
const STEPS = 40;
function keep(s: State, productDir: string, graph: GraphData, stamp: string): Cached {
  const before = s.graphs.get(productDir)?.graph ?? null;
  const rev = (s.revs.get(productDir) ?? 0) + 1; s.revs.set(productDir, rev);
  const c: Cached = { graph, idx: indexGraph(graph), index: nodeIndex(graph), stamp, builtAt: Date.now(), rev };
  s.graphs.set(productDir, c);
  const steps = s.steps.get(productDir) ?? []; s.steps.set(productDir, steps);
  steps[steps.length - 1]?.delta();
  let known: GraphDelta | null = before ? null : EVERYTHING; let from: GraphData | null = before;
  steps.push({ rev, delta: () => { if (!known) { known = graphDelta(from!, graph); from = null; } return known; } });
  if (steps.length > STEPS) steps.splice(0, steps.length - STEPS);
  return c;
}
// What changed between the graph a subscriber last heard of (its rev) and the one the product has now.
export function deltaSince(productDir: string, rev: number): GraphDelta {
  const s = st(); const cur = s.revs.get(productDir) ?? 0;
  if (rev >= cur) return NOTHING;
  const steps = (s.steps.get(productDir) ?? []).filter(x => x.rev > rev);
  if (steps.length !== cur - rev) return EVERYTHING; // further back than is kept
  return mergeDeltas(steps.map(x => x.delta()));
}
export function graphRev(productDir: string): number { return st().revs.get(productDir) ?? 0; }

// After a build: listeners keyed for dev reloads (the same key replaces the earlier registration).
export function onBuilt(fn: BuiltListener, key?: string): void {
  const s = st();
  if (key) { fn.key = key; const i = s.listeners.findIndex(l => l.key === key); if (i >= 0) { s.listeners[i] = fn; return; } }
  if (!s.listeners.includes(fn)) s.listeners.push(fn);
}

// When the product was last built here.
export function builtAt(productDir: string): number { return st().lastBuilt.get(productDir) ?? 0; }
// Each document's mtime as the last build here found it, taken before the build read it — the watcher skips its own
// rebuild for a change the app already built: a document whose mtime is still that one is in the graph (lib/watch#builtWith).
export function readStamps(productDir: string): Map<string, number> { return st().read.get(productDir) ?? new Map(); }

// The product's graph with its indexes: from memory while graph.json is the file this process built or last read,
// re-read when it changed underneath. Null when there is no graph.
export async function graphFor(productDir: string): Promise<Cached | null> {
  const s = st(); const gp = graphPathOf(productDir);
  const stamp = await stampOf(gp);
  if (!stamp) { s.graphs.delete(productDir); return null; }
  const hit = s.graphs.get(productDir);
  if (hit && hit.stamp === stamp) return hit;
  try { return keep(s, productDir, await loadGraph(gp), stamp); }
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
      // the documents and their mtimes, then the read — all in one turn, so a stamp is never newer than what was read
      const docs = lib().findDocs(productDir); const read = new Map<string, number>();
      for (const f of docs) { try { read.set(f, statSync(f).mtimeMs); } catch { /* gone between the walk and here: the parse says so */ } }
      ({ graph, files } = lib().buildGraph(productDir, { cache: s.caches.get(productDir), cwd: REPO_ROOT, ...(docs.length ? { files: docs } : {}) }));
      s.read.set(productDir, read);
    } catch (e) { return { code: 1, output: `build failed: ${e instanceof Error ? e.message : e}`, graph: null, before }; }
    const t1 = performance.now();
    s.lastBuilt.set(productDir, Date.now());
    // kept before anything is awaited: a request that arrives now finds this graph under graph.json's new stamp,
    // instead of reading the 9 MB file back because the stamp moved and the memory had not
    keep(s, productDir, graph, stampNow(graphPathOf(productDir)));
    const output = `built ${path.relative(REPO_ROOT, graphPathOf(productDir))} from ${files.length} file(s): ${graph.nodes.length} nodes, ${graph.edges.length} edges in ${(t1 - t0).toFixed(0)} ms (+${(performance.now() - t1).toFixed(0)} ms indexes)`;
    // the listeners run after the reply, in build order per product: the save returns as soon as the graph is written
    s.after.set(productDir, (s.after.get(productDir) ?? Promise.resolve()).then(async () => { for (const fn of s.listeners) { try { await fn(productDir, before, graph); } catch (e) { console.log(`[wf] after build: ${e instanceof Error ? e.message : e}`); } } }));
    return { code: 0, output, graph, before };
  })();
  s.running.set(productDir, p);
  return p.finally(() => { if (s.running.get(productDir) === p) s.running.delete(productDir); });
}

// The check (`wye check`) over the graph in memory: its lines as the CLI prints them, for the routes that show them.
export async function checkProduct(productDir: string, strict = false): Promise<{ code: number; output: string; errors: string[]; warnings: string[] }> {
  const c = await graphFor(productDir);
  if (!c) return { code: 2, output: 'no graph', errors: ['no graph'], warnings: [] };
  const r = lib().checkLines(c.graph, { repo: REPO_ROOT, strict });
  return { code: r.errors.length ? 1 : 0, ...r };
}
