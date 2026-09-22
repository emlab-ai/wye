// Watches the product data on disk so the app follows what agents and editors write: any change under
// data/products/<product> (documents, inbox, sessions) is pushed to subscribers, and a changed document rebuilds
// the graph (agents may edit files without running wye build). Lives on globalThis across dev reloads.
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { slugOfDir } from './products';
import { buildProduct, builtAt, onBuilt } from './build';
import { creditDocumentChange, creditBlockChanges } from './artifacts';
import { diffGraphs } from './graph-diff';
import { scheduleVerdicts } from './verdicts';
import { recordChanges, takeClaim } from './changes';
import { scheduleImpact } from './impact-run';
import { trackDefinitions, refreshStaleScopes } from './pr-docs';
import { loadScope } from './scope';
import { listSessions } from './sessions';
import { eventsFromDiff } from './hooks';
import { fire, depthOfSession, hooksEnabled } from './hooks-run';
import { sweepRuns } from './runs-run';

type Listener = (e: { kind: 'doc' | 'inbox' | 'session' | 'graph' | 'change' | 'other'; file: string }) => void;
// bump when the watcher callback changes: dev reloads keep globalThis, so an old watcher would keep running old code
const VERSION = 14;
type State = { version?: number; watchers: Map<string, FSWatcher>; subs: Map<string, Set<Listener>>; rebuildTimer: Map<string, ReturnType<typeof setTimeout>>; rebuilding: Set<string>; changedDocs: Map<string, Set<string>> };
const g = globalThis as unknown as { __wfWatch?: State };
const st = (): State => (g.__wfWatch ??= { watchers: new Map(), subs: new Map(), rebuildTimer: new Map(), rebuilding: new Set(), changedDocs: new Map() });

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
    g.__wfWatch = { version: VERSION, watchers: new Map(), subs: s.subs ?? new Map(), rebuildTimer: new Map(), rebuilding: new Set(), changedDocs: new Map() };
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
        // one build per burst of writes, unless the app built since the write (a save through the API builds in-process —
        // lib/build — and its listeners already ran); running sessions get the document credit either way
        if (!s.changedDocs.has(productDir)) s.changedDocs.set(productDir, new Set()); s.changedDocs.get(productDir)!.add(rel);
        const at = Date.now();
        const t = s.rebuildTimer.get(productDir); if (t) clearTimeout(t);
        s.rebuildTimer.set(productDir, setTimeout(async () => {
          s.rebuildTimer.delete(productDir); if (s.rebuilding.has(productDir)) return; s.rebuilding.add(productDir);
          const docs = [...(s.changedDocs.get(productDir) ?? [])]; s.changedDocs.get(productDir)?.clear();
          try {
            if (builtAt(productDir) < at) await buildProduct(productDir);
            for (const d of docs) await creditDocumentChange(productDir, slugOfDir(productDir), d).catch(() => {});
          } finally { s.rebuilding.delete(productDir); }
        }, 400));
      }
      for (const fn of s.subs.get(productDir) ?? []) { try { fn({ kind, file: rel }); } catch { /* gone */ } }
    });
    w.on('error', () => { s.watchers.delete(productDir); });
    s.watchers.set(productDir, w);
  } catch { /* platform without recursive watch */ }
}

// After every build (lib/build#onBuilt): the diff of the graph before and after is what the app knows about the change
// — block-level attribution, change records, impact, the request Definitions, the hooks, the verdict pass.
onBuilt(async (productDir, before, after) => {
  if (!before || !st().watchers.has(productDir)) return; // a product nobody follows (a test's scratch, a CLI-only use) keeps no records
  const changes = diffGraphs(before, after, new Date().toISOString());
  // the live runs are swept on every build, even one that changed no node: a stage's criterion can turn on something
  // outside the graph (a session ending), and a run written before run pages is moved to one here
  if (!changes.length) { await sweepRuns(slugOfDir(productDir), m => console.log(`[wf] ${m}`)).catch(e => console.log(`[wf] runs: ${e instanceof Error ? e.message : e}`)); return; }
  // change records (decision:exec.changes-from-the-rebuild-diff): the old and new value of every edited typed node,
  // credited to the writer that claimed it, else to the one running session, else "person"
  const running = (await listSessions(productDir).catch(() => [])).filter(x => x.status === 'running');
  const fileOf = new Map(after.nodes.map(n => [n.id, n.file]));
  const attribution = new Map(changes.map(c => { const c0 = takeClaim(c.id, fileOf.get(c.id) ?? ''); return [c.id, c0 ? { by: c0.by, session: c0.session, silent: c0.silent } : running.length === 1 ? { by: `agent:${running[0].id}`, session: running[0].id } : { by: 'person' }]; }));
  const who = (id: string) => attribution.get(id) ?? { by: 'person' };
  // a session's artifacts are the blocks attributed to it, never the whole diff (lib/artifacts#creditBlockChanges)
  await creditBlockChanges(productDir, changes, id => attribution.get(id)?.session).catch(() => {});
  const records = await recordChanges(productDir, slugOfDir(productDir), before, after, changes, who).catch(e => { console.log(`[wf] changes: ${e instanceof Error ? e.message : e}`); return []; });
  if (records.length) scheduleImpact(productDir, slugOfDir(productDir), records, m => console.log(`[wf] ${m}`));
  // hooks (decision:wf2.hooks-and-skills): what the diff means — created, status:<x>, linked:<verb> — fires the
  // product's hooks; a change a hook's session made carries its firing depth, so chains stop at the cap
  // then the live workflow runs (decision:wf2.run-holds-the-state): the sweep runs after the hooks, so a run a hook
  // just started is seen in the same pass, and with automation off it still moves the stages a person can advance
  void (async () => {
    if (await hooksEnabled()) {
      const events = eventsFromDiff(before, after, changes);
      if (events.length) {
        const depths = new Map<string, number | null>();
        const withDepth = [];
        for (const ev of events) { const sid = attribution.get(ev.id)?.session; if (!depths.has(sid ?? '')) depths.set(sid ?? '', await depthOfSession(productDir, sid)); withDepth.push({ ...ev, depth: depths.get(sid ?? '') }); }
        await fire(slugOfDir(productDir), withDepth);
      }
    }
    await sweepRuns(slugOfDir(productDir), m => console.log(`[wf] ${m}`));
  })().catch(e => console.log(`[wf] hooks: ${e instanceof Error ? e.message : e}`));
  // a librarian's blocks land in its request's Definition (req:exec.definition-tracked) — the writes here come back through this listener
  try { const scope = await loadScope(slugOfDir(productDir)); if (scope) { await trackDefinitions(scope, running, changes.map(c => ({ ...c, session: attribution.get(c.id)?.session }))); const rescoped = await refreshStaleScopes(scope); if (rescoped.length) console.log(`[wf] scope: ${rescoped.join(', ')}`); } } catch (e) { console.log(`[wf] definition: ${e instanceof Error ? e.message : e}`); }
  // the write-time verdict pass (decision:memory.write-time-verdict): new or changed knowledge is classified
  // against its neighbours; runs detached, writes its lines under the nodes, which come back through the watcher
  scheduleVerdicts(productDir, slugOfDir(productDir), changes, m => console.log(`[wf] ${m}`));
}, 'watch');

export function subscribeChanges(productDir: string, fn: Listener): () => void {
  ensureWatch(productDir);
  const s = st();
  if (!s.subs.has(productDir)) s.subs.set(productDir, new Set());
  s.subs.get(productDir)!.add(fn);
  return () => { s.subs.get(productDir)?.delete(fn); };
}
export const relName = (productDir: string, abs: string) => path.relative(productDir, abs);
