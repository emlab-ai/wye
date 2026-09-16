// Agent sessions: work sent from a block, node or page to an agent. Stored as JSON files under the product's
// _sessions/ folder (the parser skips _-prefixed folders). Execution is not wired yet: a session is queued and an
// external runner will pick it up later and stream its log here.
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { AGENTS, type Session, type SessionSource, type SessionStatus } from './session-types';
export { AGENTS } from './session-types';
export type { Session, SessionSource, SessionStatus } from './session-types';

const dir = (productDir: string) => path.join(productDir, '_sessions');
const file = (productDir: string, id: string) => path.join(dir(productDir), `${id}.json`);
const ID = /^[a-z0-9]{6,32}$/;

export async function listSessions(productDir: string): Promise<Session[]> {
  let names: string[] = [];
  try { names = (await readdir(dir(productDir))).filter(n => n.endsWith('.json')); } catch { return []; }
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
export async function updateSession(productDir: string, id: string, patch: { status?: SessionStatus; line?: string; result?: string }): Promise<Session | null> {
  const s = await getSession(productDir, id); if (!s) return null;
  const now = new Date().toISOString();
  if (patch.status) { s.status = patch.status; s.log.push({ t: now, line: `status → ${patch.status}` }); }
  if (patch.line) s.log.push({ t: now, line: patch.line });
  if (patch.result !== undefined) s.result = patch.result;
  s.updatedAt = now; s.log = s.log.slice(-500);
  await saveSession(productDir, s);
  return s;
}
