// Watches the product data on disk so the app follows what agents and editors write: any change under
// data/products/<product> (documents, inbox, sessions) is pushed to subscribers, and a changed document rebuilds
// the graph (agents may edit files without running ctx build). Lives on globalThis across dev reloads.
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { rebuild } from './write';
import { creditDocumentChange, creditBlockChanges } from './artifacts';
import { loadGraph } from './load';
import { diffGraphs } from './graph-diff';
import type { GraphData } from './graph';

type Listener = (e: { kind: 'doc' | 'inbox' | 'session' | 'graph' | 'other'; file: string }) => void;
// bump when the watcher callback changes: dev reloads keep globalThis, so an old watcher would keep running old code
const VERSION = 4;
// lastGraph: the graph as this watcher last saw it, so a rebuild can be diffed even when the API already rebuilt
// (editNode writes the file and rebuilds before the watcher's timer fires)
type State = { version?: number; watchers: Map<string, FSWatcher>; subs: Map<string, Set<Listener>>; rebuildTimer: Map<string, ReturnType<typeof setTimeout>>; rebuilding: Set<string>; changedDocs: Map<string, Set<string>>; lastGraph: Map<string, GraphData> };
const g = globalThis as unknown as { __wfWatch?: State };
const st = (): State => (g.__wfWatch ??= { watchers: new Map(), subs: new Map(), rebuildTimer: new Map(), rebuilding: new Set(), changedDocs: new Map(), lastGraph: new Map() });

function classify(rel: string): 'doc' | 'inbox' | 'session' | 'graph' | 'other' {
  if (rel.startsWith('_build/')) return 'graph';
  if (rel.startsWith('inbox/')) return 'inbox';
  if (rel.startsWith('_sessions/')) return 'session';
  if (/^projects\/[^/]+\/docs\/.+\.md$/.test(rel) || /^projects\/[^/]+\/_project\.md$/.test(rel) || rel === '_product.md') return 'doc';
  return 'other';
}

export function ensureWatch(productDir: string) {
  const s = st();
  if (s.version !== VERSION) { // fresh state for the new code, keeping the SSE subscribers
    for (const w of s.watchers.values()) { try { w.close(); } catch { /* closed */ } }
    g.__wfWatch = { version: VERSION, watchers: new Map(), subs: s.subs ?? new Map(), rebuildTimer: new Map(), rebuilding: new Set(), changedDocs: new Map(), lastGraph: new Map() };
    return ensureWatch(productDir);
  }
  if (s.watchers.has(productDir)) return;
  try {
    const w = watch(productDir, { recursive: true }, (_ev, file) => {
      if (!file) return;
      const rel = String(file).replace(/\\/g, '/');
      if (rel.includes('/.') || rel.endsWith('.tmp') || /\.tmp-\d+/.test(rel) || rel.includes('node_modules')) return;
      const kind = classify(rel);
      if (kind === 'other') return;
      if (kind === 'doc') {
        // one rebuild per burst of writes; the graph change then notifies everyone; running sessions get the credit
        if (!s.changedDocs.has(productDir)) s.changedDocs.set(productDir, new Set()); s.changedDocs.get(productDir)!.add(rel);
        const t = s.rebuildTimer.get(productDir); if (t) clearTimeout(t);
        s.rebuildTimer.set(productDir, setTimeout(async () => {
          s.rebuildTimer.delete(productDir); if (s.rebuilding.has(productDir)) return; s.rebuilding.add(productDir);
          const docs = [...(s.changedDocs.get(productDir) ?? [])]; s.changedDocs.get(productDir)?.clear();
          const graphPath = path.join(productDir, '_build/graph.json');
          const before = s.lastGraph.get(productDir) ?? await loadGraph(graphPath).catch(() => null);
          try {
            await rebuild(productDir);
            // block-level attribution: what changed since the graph this watcher last saw goes to every running session
            const after = await loadGraph(graphPath).catch(() => null);
            if (after) { s.lastGraph.set(productDir, after); if (before) await creditBlockChanges(productDir, diffGraphs(before, after, new Date().toISOString())).catch(() => {}); }
            for (const d of docs) await creditDocumentChange(productDir, path.basename(productDir), d).catch(() => {});
          } finally { s.rebuilding.delete(productDir); }
        }, 400));
      }
      for (const fn of s.subs.get(productDir) ?? []) { try { fn({ kind, file: rel }); } catch { /* gone */ } }
    });
    w.on('error', () => { s.watchers.delete(productDir); });
    s.watchers.set(productDir, w);
    loadGraph(path.join(productDir, '_build/graph.json')).then(gr => { if (!s.lastGraph.has(productDir)) s.lastGraph.set(productDir, gr); }).catch(() => {});
  } catch { /* platform without recursive watch */ }
}

export function subscribeChanges(productDir: string, fn: Listener): () => void {
  ensureWatch(productDir);
  const s = st();
  if (!s.subs.has(productDir)) s.subs.set(productDir, new Set());
  s.subs.get(productDir)!.add(fn);
  return () => { s.subs.get(productDir)?.delete(fn); };
}
export const relName = (productDir: string, abs: string) => path.relative(productDir, abs);
