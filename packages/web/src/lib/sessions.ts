// Agent sessions: work sent from a block, node or page to an agent. Stored as JSON files under the product's
// _sessions/ folder (the parser skips _-prefixed folders). Execution is not wired yet: a session is queued and an
// external runner will pick it up later and stream its log here.
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { AGENTS, type Runner, type Session, type SessionSource, type SessionStatus } from './session-types';
export { AGENTS } from './session-types';
export type { Runner, Session, SessionSource, SessionStatus } from './session-types';

const dir = (productDir: string) => path.join(productDir, '_sessions');
const file = (productDir: string, id: string) => path.join(dir(productDir), `${id}.json`);
const ID = /^[a-z0-9]{6,32}$/;

export async function listSessions(productDir: string): Promise<Session[]> {
  let names: string[] = [];
  try { names = (await readdir(dir(productDir))).filter(n => n.endsWith('.json') && !n.startsWith('_')); } catch { return []; }
  const out: Session[] = [];
  for (const n of names) { try { out.push(JSON.parse(await readFile(path.join(dir(productDir), n), 'utf8'))); } catch { /* skip broken */ } }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getSession(productDir: string, id: string): Promise<Session | null> {
  if (!ID.test(id)) return null;
  try { return JSON.parse(await readFile(file(productDir, id), 'utf8')); } catch { return null; }
}
export async function createSession(productDir: string, product: string, input: { agent: string; instruction: string; refs?: string[]; source?: SessionSource }): Promise<Session> {
  const now = new Date().toISOString();
  const s: Session = { id: randomBytes(5).toString('hex'), product, agent: input.agent, status: 'queued', createdAt: now, updatedAt: now, instruction: input.instruction, refs: [...new Set(input.refs ?? [])], source: input.source ?? {}, log: [{ t: now, line: `queued for ${input.agent}` }] };
  await saveSession(productDir, s);
  return s;
}
export async function saveSession(productDir: string, s: Session): Promise<void> {
  await mkdir(dir(productDir), { recursive: true });
  const f = file(productDir, s.id); const tmp = `${f}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(s, null, 2)); await rename(tmp, f);
}
export async function updateSession(productDir: string, id: string, patch: { status?: SessionStatus; line?: string; lines?: string[]; result?: string; runner?: string }): Promise<Session | null> {
  const s = await getSession(productDir, id); if (!s) return null;
  const now = new Date().toISOString();
  if (patch.runner) s.runner = patch.runner;
  if (patch.status && patch.status !== s.status) {
    s.status = patch.status; s.log.push({ t: now, line: `status → ${patch.status}${patch.runner ? ` (${patch.runner})` : ''}` });
    if (patch.status === 'running') s.startedAt = now;
    if (['done', 'failed', 'cancelled'].includes(patch.status)) s.finishedAt = now;
  }
  for (const l of [...(patch.line ? [patch.line] : []), ...(patch.lines ?? [])]) s.log.push({ t: now, line: l });
  if (patch.result !== undefined) s.result = patch.result;
  s.updatedAt = now; s.log = s.log.slice(-2000);
  await saveSession(productDir, s);
  return s;
}

// Claim the oldest queued session for an agent: first come, first served, one at a time per file lock.
export async function claimSession(productDir: string, agent: string, runner: string): Promise<Session | null> {
  const queued = (await listSessions(productDir)).filter(s => s.status === 'queued' && s.agent === agent).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const s of queued) {
    const fresh = await getSession(productDir, s.id); if (!fresh || fresh.status !== 'queued') continue;
    return updateSession(productDir, s.id, { status: 'running', runner });
  }
  return null;
}

// Hand a session over: a new queued session for `agent` that continues this one, carrying its instruction, refs,
// log tail and result as context; the parent is linked both ways.
export async function handoffSession(productDir: string, product: string, id: string, agent: string, note: string): Promise<Session | null> {
  const s = await getSession(productDir, id); if (!s) return null;
  const tail = s.log.slice(-40).map(l => `${l.t.slice(11, 19)} ${l.line}`).join('\n');
  const instruction = [`Continue session ${s.id} (${s.agent}${s.runner ? ' on ' + s.runner : ''}, ${s.status}).`, note.trim() ? `\nHandoff note: ${note.trim()}` : '', `\nOriginal instruction:\n${s.instruction}`, s.result ? `\nResult so far:\n${s.result}` : '', tail ? `\nLog tail:\n${tail}` : ''].filter(Boolean).join('\n');
  const child = await createSession(productDir, product, { agent, instruction, refs: s.refs, source: s.source });
  child.parent = s.id; await saveSession(productDir, child);
  s.children = [...(s.children ?? []), child.id]; s.log.push({ t: new Date().toISOString(), line: `handed off to ${agent} as session ${child.id}` });
  if (s.status === 'queued' || s.status === 'running') s.status = 'cancelled';
  await saveSession(productDir, s);
  return child;
}

// Runners: one JSON file, entries expire when not seen for 30 s.
const runnersFile = (productDir: string) => path.join(dir(productDir), '_runners.json');
export async function listRunners(productDir: string): Promise<Runner[]> {
  try { const all = JSON.parse(await readFile(runnersFile(productDir), 'utf8')) as Runner[]; const cutoff = Date.now() - 30_000; return all.filter(r => Date.parse(r.seenAt) > cutoff); } catch { return []; }
}
export async function heartbeatRunner(productDir: string, r: Omit<Runner, 'seenAt'> & { seenAt?: string }, gone = false): Promise<Runner[]> {
  await mkdir(dir(productDir), { recursive: true });
  const all = (await listRunners(productDir)).filter(x => x.name !== r.name);
  if (!gone) all.push({ ...r, seenAt: new Date().toISOString() });
  const f = runnersFile(productDir); const tmp = `${f}.tmp-${process.pid}`; await writeFile(tmp, JSON.stringify(all, null, 2)); await rename(tmp, f);
  return all;
}
