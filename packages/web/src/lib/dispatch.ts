// The dispatcher (decision:wf2.pr-scheduler): approved PRs are built by the app itself. Whenever a PR is approved, a
// session ends, or the tick fires, each product is looked at: the PRs building (status building with a live or
// queued session on them — a stale one goes back to approved), the free slots (Settings › Agents, parallel runners
// minus the building), and the approved PRs in approval order; every one whose scope does not overlap a building
// PR's gets a worker session through assignTask(... build) — the Definition as its context — until the slots are
// spent. A PR that has to wait knows why (the head and the PRs folder show it). pickNext is pure.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, slugOfDir } from './products';
import { loadScope, type Scope } from './scope';
import { getFrontmatter, prNumberOf, requestTaskId } from './pr-doc';
import { readPrDoc } from './pr-docs';
import { parseScope, overlap } from './pr-scope';
import { readSettings, agentSettings } from './settings';
import { listSessions, updateSession, onSessionEnd } from './sessions';
import { liveState } from './agent-host';
import { assignTask } from './work-io';
import { writeAtomic, rebuild } from './write';
import { setFrontmatter } from './pr-doc';

export type Approved = { ref: string; num: number | null; approvedAt: string; scope: string[] };
export type Building = { ref: string; num: number | null; scope: string[] };

// Which approved PRs start now, and why the others wait. No head-of-line blocking: a PR that overlaps does not hold
// the ones behind it back.
export function pickNext(approved: Approved[], building: Building[], slots: number): { start: string[]; waiting: Record<string, string> } {
  const start: string[] = []; const waiting: Record<string, string> = {};
  const running: Building[] = [...building];
  for (const pr of [...approved].sort((a, b) => a.approvedAt.localeCompare(b.approvedAt) || a.ref.localeCompare(b.ref))) {
    const clash = running.map(b => ({ b, shared: overlap(pr.scope, b.scope) })).find(x => x.shared.length);
    if (clash) { waiting[pr.ref] = `overlaps ${clash.b.num ? `#${clash.b.num}` : clash.b.ref} (${clash.shared.slice(0, 3).join(', ')}${clash.shared.length > 3 ? ` +${clash.shared.length - 3}` : ''})`; continue; }
    if (start.length >= slots) { waiting[pr.ref] = `no free slot (${running.length} building)`; continue; }
    start.push(pr.ref); running.push({ ref: pr.ref, num: pr.num, scope: pr.scope });
  }
  return { start, waiting };
}

// ---- the host side

type State = { waiting: Map<string, Record<string, string>>; timers: Map<string, ReturnType<typeof setTimeout>>; tick?: ReturnType<typeof setInterval>; wfUrl: string; running: Set<string> };
const g = globalThis as unknown as { __wfDispatch?: State };
const state = (): State => (g.__wfDispatch ??= { waiting: new Map(), timers: new Map(), wfUrl: process.env.WYE_URL || process.env.WF_URL || 'http://localhost:3456', running: new Set() });

export const waitingReasons = (product: string): Record<string, string> => state().waiting.get(product) ?? {};
export function rememberUrl(wfUrl: string) { if (wfUrl) state().wfUrl = wfUrl; }

async function prRows(scope: Scope): Promise<{ approved: Approved[]; building: Building[]; stale: string[] }> {
  const sessions = await listSessions(scope.product.dir);
  const approved: Approved[] = []; const building: Building[] = []; const stale: string[] = [];
  for (const n of scope.graph.nodes) {
    if (n.kind !== 'pr' || !n.defined || !['approved', 'building'].includes(n.status)) continue;
    const r = n.file.match(/products\/[^/]+\/projects\/([^/]+)\/docs\/([^/]+)\.md$/); if (!r) continue;
    const ref = `${scope.product.slug}/${r[1]}/${r[2]}`;
    let md: string; try { md = await readFile(path.join(REPO_ROOT, n.file), 'utf8'); } catch { continue; }
    const row = { ref, num: prNumberOf(r[2]), scope: parseScope(md).scope };
    if (n.status === 'approved') { approved.push({ ...row, approvedAt: getFrontmatter(md, 'approved-at') ?? '' }); continue; }
    // building: a session named on it that is queued, or running and alive
    const ids = (getFrontmatter(md, 'session') ?? '').split(/\s+/).filter(Boolean);
    const alive = sessions.some(s => ids.includes(s.id) && s.role !== 'librarian' && (s.status === 'queued' || (s.status === 'running' && liveState(s.id).live)));
    if (alive) building.push(row); else stale.push(ref);
  }
  return { approved, building, stale };
}

// One look at a product: repair stale builds, start what fits, remember why the rest waits.
export async function dispatch(product: string, wfUrl?: string): Promise<{ started: string[]; waiting: Record<string, string> }> {
  if (wfUrl) rememberUrl(wfUrl);
  const st = state(); if (st.running.has(product)) return { started: [], waiting: waitingReasons(product) };
  st.running.add(product);
  try {
    let scope = await loadScope(product); if (!scope) return { started: [], waiting: {} };
    const { parallel, agent } = agentSettings(await readSettings());
    let rows = await prRows(scope);
    if (rows.stale.length) {
      // a build whose session is gone without ending the PR: back to approved, so it is picked up again
      for (const ref of rows.stale) { const at = await readPrDoc(product, ref); if (!at) continue; const file = at.file; try { await writeAtomic(file, setFrontmatter(await readFile(file, 'utf8'), 'status', 'approved')); } catch { /* gone */ } }
      await rebuild(scope.product.dir); scope = (await loadScope(product)) ?? scope; rows = await prRows(scope);
    }
    const { start, waiting } = pickNext(rows.approved, rows.building, Math.max(0, parallel - rows.building.length));
    const started: string[] = [];
    for (const ref of start) {
      const slug = ref.split('/')[2];
      const at = await readPrDoc(product, ref); if (!at) continue; const md = at.md;
      const task = getFrontmatter(md, 'task') ?? (md.includes(`${requestTaskId(slug)} `) ? requestTaskId(slug) : null);
      if (!task) { waiting[ref] = 'no request task to build'; continue; }
      const r = await assignTask(scope, task, { worker: agent, build: ref, wfUrl: st.wfUrl, by: 'dispatcher', force: true });
      if (!r.ok) { waiting[ref] = `could not start: ${r.message}`; continue; }
      started.push(ref);
      if (r.session) await updateSession(scope.product.dir, r.session, { line: `started by the dispatcher — slot ${rows.building.length + started.length} of ${parallel}` }).catch(() => {});
      scope = (await loadScope(product)) ?? scope; // the next start sees this one building
    }
    st.waiting.set(product, waiting);
    return { started, waiting };
  } finally { st.running.delete(product); }
}

// Debounced: approve, session end and the watcher call this; the tick calls dispatch for every product with PRs.
export function notifyDispatch(product: string, wfUrl?: string): void {
  const st = state(); if (wfUrl) rememberUrl(wfUrl);
  const t = st.timers.get(product); if (t) clearTimeout(t);
  st.timers.set(product, setTimeout(() => { st.timers.delete(product); dispatch(product).catch(e => console.warn('[wf] dispatch:', e instanceof Error ? e.message : e)); }, 2000));
}

// registered once (agent-host imports this module): a build's session ending frees a slot; every 30 s each product
// with an approved PR is looked at again (a dev reload replaces the tick)
onSessionEnd(async (productDir) => { notifyDispatch(slugOfDir(productDir)); }, 'dispatch');
if (state().tick) clearInterval(state().tick);
state().tick = setInterval(async () => {
  try {
    const { listProducts } = await import('./products');
    for (const p of await listProducts()) { const scope = await loadScope(p.slug); if (scope?.graph.nodes.some(n => n.kind === 'pr' && n.defined && n.status === 'approved')) dispatch(p.slug).catch(() => {}); }
  } catch { /* next tick */ }
}, 30000);
