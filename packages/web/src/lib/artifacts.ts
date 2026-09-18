// What a session produced: documents written while it ran (from the disk watcher), nodes it changed (from the
// node API), and inbox items it filed (they carry the session id themselves). Running sessions of a product are
// credited with document changes; the tasks a session works on get `session:` and `produced:` links so the task's
// panel can show everything that came out of it.
import { getSession, listSessions, saveSession } from './sessions';
import type { BlockChange } from './session-types';
import { withFileLock } from './write';
import { loadScope } from './scope';
import { editNode } from './node-edit';
import path from 'node:path';

const docModule = (rel: string) => { const m = rel.match(/^projects\/[^/]+\/docs\/([^/]+)\.md$/); return m ? `module:${m[1]}` : null; };

type Artifacts = { docs: string[]; nodes: string[]; blocks?: BlockChange[] };
// one entry per block: a later change of the same block replaces the earlier one (added then changed stays added;
// added then removed disappears; the timestamp is the latest)
export function mergeBlocks(cur: BlockChange[], more: BlockChange[]): BlockChange[] {
  const m = new Map(cur.map(b => [b.id, b]));
  for (const b of more) {
    const o = m.get(b.id);
    if (!o) { m.set(b.id, b); continue; }
    if (o.change === 'added' && b.change === 'removed') { m.delete(b.id); continue; }
    m.set(b.id, { ...b, change: o.change === 'added' && b.change === 'changed' ? 'added' : b.change });
  }
  return [...m.values()].slice(-2000);
}
async function mutateArtifacts(productDir: string, id: string, fn: (a: Artifacts) => void): Promise<void> {
  const f = path.join(productDir, '_sessions', `${id}.json`);
  await withFileLock(f, async () => { const s = await getSession(productDir, id); if (!s) return; const a: Artifacts = s.artifacts ?? { docs: [], nodes: [] }; fn(a); s.artifacts = { docs: [...new Set(a.docs)].slice(-200), nodes: [...new Set(a.nodes)].slice(-500), ...(a.blocks?.length ? { blocks: a.blocks } : {}) }; await saveSession(productDir, s); });
}

export async function recordArtifact(productDir: string, sessionId: string, what: { doc?: string; node?: string; blocks?: BlockChange[] }): Promise<void> {
  await mutateArtifacts(productDir, sessionId, a => { if (what.doc) a.docs.push(what.doc); if (what.node) a.nodes.push(what.node); if (what.blocks?.length) a.blocks = mergeBlocks(a.blocks ?? [], what.blocks); });
}

// The graph rebuilt after documents changed on disk: every running session is credited with the blocks that are
// new, changed or gone (the app's own task-link writes are already invisible to the diff).
export async function creditBlockChanges(productDir: string, changes: BlockChange[]): Promise<void> {
  if (!changes.length) return;
  const running = (await listSessions(productDir)).filter(s => s.status === 'running');
  for (const s of running) await recordArtifact(productDir, s.id, { blocks: changes });
}

// A document changed on disk: credit every running session of the product and link their tasks. Called by the
// watcher after the graph rebuilt (so the task's line can be found and the module id resolved).
const linking = new Set<string>();
// documents the app itself just wrote (task links) are not credited to sessions
const selfWrites = new Map<string, number>();
const wroteMyself = (mod: string) => { const t = selfWrites.get(mod); return !!t && Date.now() - t < 5000; };
export async function creditDocumentChange(productDir: string, product: string, rel: string): Promise<void> {
  const mod = docModule(rel); if (!mod || wroteMyself(mod)) return;
  const running = (await listSessions(productDir)).filter(s => s.status === 'running');
  for (const s of running) {
    await recordArtifact(productDir, s.id, { doc: mod });
    await linkTasks(productDir, product, s.id).catch(() => {});
  }
}

// Every task among the session's refs gets `session: <ids>` and `produced: <modules>` in its property group.
export async function linkTasks(productDir: string, product: string, sessionId: string): Promise<void> {
  if (linking.has(sessionId)) return; linking.add(sessionId);
  try {
    const s = await getSession(productDir, sessionId); if (!s) return;
    const tasks = s.refs.filter(r => r.startsWith('task:'));
    if (!tasks.length) return;
    const scope = await loadScope(product); if (!scope) return;
    const produced = (s.artifacts?.docs ?? []).filter(m => scope.idx.byId.has(m));
    let changed = false;
    for (const t of tasks) {
      const n = scope.idx.byId.get(t); if (!n?.defined) continue;
      const cur = (n.body.match(/^session:\s*(.+)$/m)?.[1] ?? '').split(/\s+/).filter(Boolean);
      const curProduced = (n.body.match(/^produced:\s*(.+)$/m)?.[1] ?? '').split(/[\s,]+/).filter(Boolean);
      const sessions = [...new Set([...cur, sessionId])]; const prods = [...new Set([...curProduced, ...produced])].filter(m => m !== `module:${n.file.split('/').pop()?.replace(/\.md$/, '')}`);
      if (sessions.join(' ') === cur.join(' ') && prods.join(' ') === curProduced.join(' ')) continue;
      const r = await editNode(scope, t, { props: { session: sessions.join(' '), ...(prods.length ? { produced: prods.join(' ') } : {}) } }, { rebuild: false });
      if (r.ok) { changed = true; selfWrites.set(`module:${n.file.split('/').pop()?.replace(/\.md$/, '')}`, Date.now()); }
    }
    if (changed) { const { rebuild } = await import('./write'); await rebuild(productDir); }
  } finally { linking.delete(sessionId); }
}
