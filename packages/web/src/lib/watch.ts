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
import { scheduleVerdicts } from './verdicts';
import { recordChanges, takeClaim } from './changes';
import { scheduleImpact } from './impact-run';
import { trackDefinitions, refreshStaleScopes } from './pr-docs';
import { loadScope } from './scope';
import { listSessions } from './sessions';

type Listener = (e: { kind: 'doc' | 'inbox' | 'session' | 'graph' | 'change' | 'other'; file: string }) => void;
// bump when the watcher callback changes: dev reloads keep globalThis, so an old watcher would keep running old code
const VERSION = 10;
// lastGraph: the graph as this watcher last saw it, so a rebuild can be diffed even when the API already rebuilt
// (editNode writes the file and rebuilds before the watcher's timer fires)
type State = { version?: number; watchers: Map<string, FSWatcher>; subs: Map<string, Set<Listener>>; rebuildTimer: Map<string, ReturnType<typeof setTimeout>>; rebuilding: Set<string>; changedDocs: Map<string, Set<string>>; lastGraph: Map<string, GraphData> };
const g = globalThis as unknown as { __wfWatch?: State };
const st = (): State => (g.__wfWatch ??= { watchers: new Map(), subs: new Map(), rebuildTimer: new Map(), rebuilding: new Set(), changedDocs: new Map(), lastGraph: new Map() });

function classify(rel: string): 'doc' | 'inbox' | 'session' | 'graph' | 'change' | 'other' {
  if (rel.startsWith('_build/')) return 'graph';
  if (rel.startsWith('inbox/')) return 'inbox';
  if (rel.startsWith('_sessions/')) return 'session';
  if (rel.startsWith('_changes/')) return 'change';
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
            if (after) {
              s.lastGraph.set(productDir, after);
              if (before) {
                const changes = diffGraphs(before, after, new Date().toISOString());
                await creditBlockChanges(productDir, changes).catch(() => {});
                // change records (decision:exec.changes-from-the-rebuild-diff): the old and new value of every edited
                // typed node, credited to the writer that claimed it, else to the one running session, else "person"
                const running = (await listSessions(productDir).catch(() => [])).filter(x => x.status === 'running');
                // who wrote each changed node: the writer's claim (the API routes claim by node or file), else the one
                // running session, else "person" — resolved once, for the change records and the Definition alike
                const fileOf = new Map(after.nodes.map(n => [n.id, n.file]));
                const attribution = new Map(changes.map(c => { const c0 = takeClaim(c.id, fileOf.get(c.id) ?? ''); return [c.id, c0 ? { by: c0.by, session: c0.session, silent: c0.silent } : running.length === 1 ? { by: `agent:${running[0].id}`, session: running[0].id } : { by: 'person' }]; }));
                const who = (id: string) => attribution.get(id) ?? { by: 'person' };
                const records = await recordChanges(productDir, path.basename(productDir), before, after, changes, who).catch(e => { console.log(`[wf] changes: ${e instanceof Error ? e.message : e}`); return []; });
                if (records.length) scheduleImpact(productDir, path.basename(productDir), records, m => console.log(`[wf] ${m}`));
                // a librarian's blocks land in its request's Definition (req:exec.definition-tracked) — the writes here come back through this watcher
                try { const scope = await loadScope(path.basename(productDir)); if (scope) { await trackDefinitions(scope, running, changes.map(c => ({ ...c, session: attribution.get(c.id)?.session }))); const rescoped = await refreshStaleScopes(scope); if (rescoped.length) console.log(`[wf] scope: ${rescoped.join(', ')}`); } } catch (e) { console.log(`[wf] definition: ${e instanceof Error ? e.message : e}`); }
                // the write-time verdict pass (decision:memory.write-time-verdict): new or changed knowledge is classified
                // against its neighbours; runs detached, writes its lines under the nodes, which the watcher then picks up
                scheduleVerdicts(productDir, path.basename(productDir), changes, m => console.log(`[wf] ${m}`));
              }
            }
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
