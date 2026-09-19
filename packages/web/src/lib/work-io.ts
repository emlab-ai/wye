// Server-side work operations (op:api.work): the rows with the live session state, Assign (req:exec.dispatch),
// capture (req:exec.capture) and the next ready task for a runner (req:exec.ready-for-runners). The shapes are in
// lib/work (pure); this file touches sessions, documents and the graph.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadScope, type Scope } from './scope';
import { listSessions, createSession, updateSession, onSessionEnd, AGENTS, getSession } from './sessions';
import { liveState, startChat } from './agent-host';
import { createPlanDoc } from './plan-docs';
import { editNode } from './node-edit';
import { docIdOf, docRoute } from './doc';
import { REPO_ROOT } from './products';
import { writeAtomic, withFileLock, rebuild } from './write';
import { readContent, writeContent } from './node-content';
import { workItems, assignRefusal, nextReady, type WorkItem, type WorkSession } from './work';
import { slugify } from './templates';

export const RUNNER_POOL = 'runner';
const AGENT_IDS = new Set(AGENTS.map(a => a.id));

// Every task with its derived state: the sessions come from disk, the live/busy bits from this process.
export async function loadWork(scope: Scope): Promise<{ items: WorkItem[]; people: string[]; agents: { id: string; label: string }[] }> {
  const sessions: WorkSession[] = (await listSessions(scope.product.dir)).map(s => ({ id: s.id, status: s.status, agent: s.agent, refs: s.refs, createdAt: s.createdAt, updatedAt: s.updatedAt, finishedAt: s.finishedAt, result: s.result, planDoc: s.planDoc, artifacts: s.artifacts, ...(s.mode === 'chat' ? liveState(s.id) : {}) }));
  const items = workItems(scope.graph, scope.idx, sessions);
  // people: the product file's list, plus every name that holds or owns a task
  const seen = new Set(scope.product.meta.people ?? []);
  const walk = (r: WorkItem) => { if (r.worker && !AGENT_IDS.has(r.worker) && r.worker !== RUNNER_POOL) seen.add(r.worker); r.children.forEach(walk); }; items.forEach(walk);
  return { items, people: [...seen], agents: AGENTS };
}
export function findItem(items: WorkItem[], id: string): WorkItem | null {
  for (const r of items) { if (r.id === id) return r; const c = findItem(r.children, id); if (c) return c; }
  return null;
}

// The instruction a worker gets for a task: its text, the note, and where it is.
function taskInstruction(scope: Scope, item: WorkItem, note?: string): string {
  const n = scope.idx.byId.get(item.id);
  const text = n?.body.match(/^text:[ \t]*(.*)$/m)?.[1].trim() || item.title;
  const parts = [`Work on ${item.id}: ${text}`];
  if (note?.trim()) parts.push(note.trim());
  if (item.partOf.length) parts.push(`It serves ${item.partOf.join(', ')}.`);
  if (item.plan) parts.push(`It is on the plan ${item.plan.id}${item.plan.title ? ` ("${item.plan.title}")` : ''}.`);
  parts.push(`When it is done: \`wf node set ${item.id} --status done\`; what you leave open stays as task lines under it.`);
  return parts.join('\n\n');
}

export type AssignInput = { worker: string; note?: string; plan?: boolean; cwd?: string; force?: boolean; by?: string; wfUrl: string; agent?: string };
export type AssignResult = { ok: true; worker: string; session?: string; mode?: 'chat' | 'run' } | { ok: false; error: 'not_found' | 'refused' | 'held' | 'invalid'; message: string };

// Assign (req:exec.dispatch): a person gets `worker:`; an agent gets a session with the task, its document and what
// it serves as refs (the constraint packet rides in the first message, agent-host#buildPrompt); the runner pool gets a
// queued run session. A held task (a session queued or working on it) asks before it re-queues (`force`).
export async function assignTask(scope: Scope, id: string, input: AssignInput): Promise<AssignResult> {
  const { items } = await loadWork(scope);
  const item = findItem(items, id); if (!item) return { ok: false, error: 'not_found', message: `${id} is not a task` };
  const refusal = assignRefusal(item); if (refusal) return { ok: false, error: 'refused', message: refusal };
  const worker = input.worker.trim(); if (!worker) return { ok: false, error: 'invalid', message: 'a worker is required' };
  const isAgent = AGENT_IDS.has(worker) || worker === RUNNER_POOL;
  if (!isAgent) {
    const r = await editNode(scope, id, { props: { worker } });
    return r.ok ? { ok: true, worker } : { ok: false, error: 'invalid', message: r.message };
  }
  if ((item.state === 'queued' || item.state === 'working') && !input.force) return { ok: false, error: 'held', message: `${item.worker ?? 'a worker'} holds it (${item.state}) — assign again to re-queue` };
  const node = scope.idx.byId.get(id)!;
  const r = docRoute(node.file);
  const docNode = docIdOf(scope.graph, node.file);
  const refs = [id, ...(docNode ? [docNode] : []), ...item.partOf].slice(0, 20);
  const source = r ? { project: r.project, doc: r.doc, link: `${input.wfUrl}/${scope.product.slug}/${r.project}/d/${r.doc}#n-${encodeURIComponent(id)}` } : {};
  const mode: 'chat' | 'run' = worker === RUNNER_POOL ? 'run' : 'chat';
  const agent = worker === RUNNER_POOL ? (input.agent && AGENT_IDS.has(input.agent) ? input.agent : 'claude-code') : worker;
  let cwd = input.cwd?.trim() || scope.product.meta.repo || REPO_ROOT;
  if (mode === 'chat') { try { if (!(await stat(cwd)).isDirectory()) throw new Error(); } catch { cwd = REPO_ROOT; } }
  const s = await createSession(scope.product.dir, scope.product.slug, { agent, instruction: taskInstruction(scope, item, input.note), refs, source, mode, cwd, plan: !!input.plan, task: id });
  s.planDoc = (await createPlanDoc(scope.product.dir, scope.product.slug, s)) ?? undefined;
  // taken: in progress, the worker and the session on the line, the ready mark spent
  await editNode(scope, id, { status: 'in-progress', props: { worker: agent, session: [...new Set([...item.sessions.map(x => x.id), s.id])].join(' '), ready: null } });
  if (mode === 'chat') await startChat(scope.product.dir, scope.product.slug, s.id, { wfUrl: input.wfUrl });
  return { ok: true, worker: agent, session: s.id, mode };
}

// A session that was assigned a task ends: the task goes to review unless the agent marked it done (req:exec.work-states).
onSessionEnd(async (productDir, s) => {
  if (!s.task) return;
  const scope = await loadScope(s.product); if (!scope) return;
  const n = scope.idx.byId.get(s.task); if (!n?.defined || n.status === 'done') return;
  await editNode(scope, s.task, { status: s.status === 'done' ? 'review' : 'todo' }).catch(() => undefined);
  void productDir;
});

// Where a captured task goes (req:exec.capture): under the node it was captured from when there is one, else the
// project's plan document (`plan.md`, the follow-ups home) under "## Backlog", appended.
export type CaptureInput = { text: string; partOf?: string; project?: string; by?: string; ready?: boolean };
export async function captureTask(scope: Scope, input: CaptureInput): Promise<{ ok: true; id: string; file: string } | { ok: false; message: string }> {
  const text = input.text.replace(/\s+/g, ' ').trim(); if (!text) return { ok: false, message: 'text required' };
  const base = `task:${scope.product.slug}.${slugify(text).split('-').slice(0, 6).join('-') || 'item'}`;
  let id = base; for (let n = 2; scope.idx.byId.get(id)?.defined; n++) id = `${base}-${n}`;
  const today = new Date().toISOString().slice(0, 10);
  const props = [`by: ${input.by || 'person'}`, `since: ${today}`, ...(input.partOf ? [`part-of: ${input.partOf}`] : [])];
  const line = `- [ ] ${id} ${text.replace(/[()#]/g, ' ').replace(/\s+/g, ' ').trim()}${input.ready ? ' #ready' : ''} (${props.join(', ')})`;
  // under the node it came from, when that node has a document and a form that takes content
  const from = input.partOf ? scope.idx.byId.get(input.partOf) : undefined;
  if (from?.defined && from.file && from.form !== 'block' && from.kind !== 'module' && from.kind !== 'plan') {
    const abs = path.join(REPO_ROOT, from.file);
    const ok = await withFileLock(abs, async () => {
      const md = await readFile(abs, 'utf8');
      const content = readContent(md, from.id, from.line, from.form ?? 'yaml'); if (content === null) return false;
      const next = writeContent(md, from.id, from.line, from.form ?? 'yaml', [content.trim(), line].filter(Boolean).join('\n'));
      if (!next || next === md) return false;
      await writeAtomic(abs, next); return true;
    });
    if (ok) { await rebuild(scope.product.dir); return { ok: true, id, file: from.file }; }
  }
  const project = scope.projects.find(p => p.slug === input.project) ?? scope.projects.find(p => p.slug === (from && docRoute(from.file)?.project)) ?? scope.projects[0];
  if (!project) return { ok: false, message: 'the product has no project to keep a backlog in' };
  const file = path.join(project.docsDir, 'plan.md');
  await withFileLock(file, async () => {
    let md: string; try { md = await readFile(file, 'utf8'); } catch { md = `---\nnode: module:${project.slug}-plan\ntype: module\ntitle: Plan\nstatus: active\nowner: unassigned\nlast-verified: ${today}\n---\n\n# Plan\n`; }
    if (!/^## Backlog\s*$/m.test(md)) md = `${md.replace(/\s+$/, '')}\n\n## Backlog\n\n_Captured work, unassigned (req:exec.capture); the Work view's Unassigned group._\n`;
    // append at the end of the Backlog section (before the next "## " heading, or the end)
    const m = md.match(/^## Backlog[^\n]*\n/m)!; const start = m.index! + m[0].length; const rest = md.slice(start); const next = rest.search(/^## /m);
    const end = next === -1 ? md.length : start + next;
    const section = md.slice(start, end).replace(/\s+$/, '');
    const gap = /^\s*- \[[ x]\] /m.test(section.split('\n').pop() ?? '') ? '\n' : '\n\n'; // the list starts after a blank line
    md = `${md.slice(0, start)}${section}${gap}${line}\n${next === -1 ? '' : '\n'}${md.slice(end)}`;
    await writeAtomic(file, md);
  });
  await rebuild(scope.product.dir);
  return { ok: true, id, file: path.relative(REPO_ROOT, file) };
}

// The next ready task for a runner (req:exec.ready-for-runners): a peek, or a take — a queued run session for the
// agent with the task assigned, exactly as Assign to the runner pool does; off when the product says `auto-take: off`.
export async function nextForRunner(scope: Scope, opts: { goal?: string; take?: { agent: string; runner: string }; wfUrl: string }): Promise<{ task: WorkItem | null; session?: string; off?: boolean }> {
  if (/^(off|no|false)$/i.test(scope.product.meta.settings['auto-take'] ?? '')) return { task: null, off: true };
  const { items } = await loadWork(scope);
  const task = nextReady(items, opts.goal); if (!task) return { task: null };
  if (!opts.take) return { task };
  const r = await assignTask(scope, task.id, { worker: RUNNER_POOL, agent: opts.take.agent, wfUrl: opts.wfUrl, by: opts.take.runner });
  if (!r.ok || !r.session) return { task: null };
  await updateSession(scope.product.dir, r.session, { line: `taken from the backlog by ${opts.take.runner} (#ready)` });
  return { task, session: r.session };
}

// One task with what came back (req:exec.done-comes-back): its row, the sessions on it (result, status, agent) and
// the blocks they produced with their current status — the questions left open and the decisions proposed among
// them are what the person reviews.
export type ProducedBlock = { id: string; kind: string; change: string; title: string; status: string; exists: boolean; doc: string; session: string };
export async function taskDetail(scope: Scope, id: string): Promise<{ item: WorkItem; sessions: { id: string; status: string; agent: string; result?: string; createdAt: string; finishedAt?: string; planDoc?: string }[]; blocks: ProducedBlock[] } | null> {
  const { items } = await loadWork(scope);
  const item = findItem(items, id); if (!item) return null;
  const sessions = []; const blocks: ProducedBlock[] = []; const seen = new Set<string>();
  for (const ref of item.sessions) {
    const s = await getSession(scope.product.dir, ref.id); if (!s) continue;
    sessions.push({ id: s.id, status: s.status, agent: s.agent, result: s.result, createdAt: s.createdAt, finishedAt: s.finishedAt, planDoc: s.planDoc });
    for (const b of s.artifacts?.blocks ?? []) {
      if (b.id.startsWith('block:') || seen.has(b.id) || b.id === id) continue; seen.add(b.id);
      const n = scope.idx.byId.get(b.id);
      blocks.push({ id: b.id, kind: b.id.split(':')[0], change: b.change, title: n?.title ?? b.title, status: n?.status ?? '', exists: !!n?.defined, doc: b.doc, session: s.id });
    }
  }
  return { item, sessions: sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), blocks };
}
