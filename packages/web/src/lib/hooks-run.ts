// Hooks, the IO part (decision:wf2.hooks-and-skills): `fire` takes the events the watcher, approve and session end
// emit, matches them against the product's hooks (lib/hooks) and runs the actions — `run skill:<id>` starts a session
// on the node with the skill's body in its first message, `add <template>` appends a template's blocks under the node
// as proposed content. Every firing is a record in <product>/_hooks/<id>.json: `once` holds through it, a node's
// column can show what ran, and a session started by a firing carries it (Session.hook) so the changes it makes fire
// hooks one level deeper — never past MAX_DEPTH, never the same hook on the same node twice. WF_HOOKS=0 turns it off.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadScope, type Scope } from './scope';
import { hooksOf, matchHooks, fillTemplate, templateVars, cardValue, nextDepth, type HookDef, type HookEvent, type HookAction } from './hooks';
import { createSession, getSession, onSessionEnd, updateSession } from './sessions';
import { startChat, buildPrompt } from './agent-host';
import { skillsSection, listSkills } from './skills';
import { readSettings, agentSettings } from './settings';
import { REPO_ROOT } from './products';
import { docRoute, documentTree } from './doc';
import { readContent, writeContent } from './node-content';
import { rebuild, withFileLock, writeAtomic } from './write';
import { claimWrite } from './changes';
import { assignTask, captureTask } from './work-io';
import { addInboxItem } from './inbox';
import type { GraphNode } from './graph';

export type FiringAction = { kind: HookAction['kind']; session?: string; added?: string[]; error?: string };
export type Firing = { id: string; hook: string; title: string; node: string; event: string; at: string; depth: number; actions: FiringAction[] };

const g = globalThis as unknown as { __wfHooks?: { wfUrl: string; busy: Set<string> } };
const state = () => (g.__wfHooks ??= { wfUrl: process.env.WF_URL || 'http://localhost:3456', busy: new Set() });
export function rememberHooksUrl(wfUrl: string) { if (wfUrl) state().wfUrl = wfUrl; }
// on unless WF_HOOKS=0 or Settings › Agents switched hooks off
export const hooksOn = () => process.env.WF_HOOKS !== '0';
export async function hooksEnabled(): Promise<boolean> { return hooksOn() && agentSettings(await readSettings()).hooks; }

const dirOf = (productDir: string) => path.join(productDir, '_hooks');

export async function listFirings(productDir: string): Promise<Firing[]> {
  let files: string[] = []; try { files = (await readdir(dirOf(productDir))).filter(f => f.endsWith('.json')); } catch { return []; }
  const out: Firing[] = [];
  for (const f of files) { try { out.push(JSON.parse(await readFile(path.join(dirOf(productDir), f), 'utf8'))); } catch { /* half-written */ } }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
export async function getFiring(productDir: string, id: string): Promise<Firing | null> {
  try { return JSON.parse(await readFile(path.join(dirOf(productDir), `${id}.json`), 'utf8')); } catch { return null; }
}
async function saveFiring(productDir: string, f: Firing): Promise<void> {
  await mkdir(dirOf(productDir), { recursive: true });
  await writeFile(path.join(dirOf(productDir), `${f.id}.json`), JSON.stringify(f, null, 2));
}
// `hook|node` for every firing so far — what `once` checks
export async function firedSet(productDir: string): Promise<Set<string>> {
  return new Set((await listFirings(productDir)).map(f => `${f.hook}|${f.node}`));
}

// The firing depth a session's changes carry: the depth of the firing that started it, +1; 0 for anyone else.
export async function depthOfSession(productDir: string, sessionId?: string): Promise<number | null> {
  if (!sessionId) return 0;
  const s = await getSession(productDir, sessionId).catch(() => null);
  if (!s?.hook) return 0;
  const f = await getFiring(productDir, s.hook.firing);
  return nextDepth(f?.depth ?? 0);
}

// Fire the events: every matching active hook runs its actions once per (hook, node). Events may carry a `depth`
// (the firing chain that produced the change); null depth — over the cap — is dropped with a log line.
export async function fire(product: string, events: (HookEvent & { depth?: number | null })[], log: (m: string) => void = m => console.log(`[wf] ${m}`), opts: { only?: string; force?: boolean } = {}): Promise<Firing[]> {
  if (!events.length || !(await hooksEnabled())) return [];
  const scope = await loadScope(product); if (!scope) return [];
  const hooks = hooksOf(scope.graph).filter(h => !opts.only || h.id === opts.only); if (!hooks.length) return [];
  const productDir = scope.product.dir;
  const fired = opts.force ? new Set<string>() : await firedSet(productDir);
  const out: Firing[] = [];
  for (const ev of events) {
    if (ev.depth === null) { log(`hooks: ${ev.id} ${ev.event} — chain deeper than allowed, not fired`); continue; }
    const node = scope.idx.byId.get(ev.id);
    // a request's attached hooks (`hooks:` on its page) fire on its events even when paused; the once rule still holds
    const attached: string[] = ev.kind === 'pr' && node ? (cardValue(node.body, 'hooks').match(/hook:[A-Za-z0-9_.\-]+/g) ?? []) : [];
    const forced = hooksOf(scope.graph).filter(h => attached.includes(h.id) && h.on.event === ev.event && (h.on.kind === 'pr' || h.on.kind === '*') && !(h.once && fired.has(`${h.id}|${ev.id}`)) && h.actions.length);
    const matched = matchHooks(hooks, ev, node, fired);
    for (const h of [...matched, ...forced.filter(h => !matched.includes(h))]) {
      const key = `${h.id}|${ev.id}`;
      if (state().busy.has(key)) continue; state().busy.add(key);
      const f: Firing = { id: randomBytes(5).toString('hex'), hook: h.id, title: h.title, node: ev.id, event: ev.event, at: new Date().toISOString(), depth: ev.depth ?? 0, actions: [] };
      fired.add(key);
      try {
        await saveFiring(productDir, f); // recorded before the actions: a crash mid-way still counts as fired
        for (const a of h.actions) {
          try { f.actions.push(await runAction(scope, h, a, ev, node, f, log)); }
          catch (e) { f.actions.push({ kind: a.kind, error: e instanceof Error ? e.message : String(e) }); }
        }
        await saveFiring(productDir, f);
        log(`${h.id} fired on ${ev.id} (${ev.event}): ${f.actions.map(a => a.error ? `${a.kind} failed — ${a.error}` : a.session ? `${a.kind} → session ${a.session}` : a.added ? `${a.kind} → ${a.added.join(', ') || 'nothing'}` : a.kind).join('; ')}`);
      } finally { state().busy.delete(key); }
      out.push(f);
    }
  }
  return out;
}

async function runAction(scope: Scope, h: HookDef, a: HookAction, ev: HookEvent, node: GraphNode | undefined, f: Firing, log: (m: string) => void): Promise<FiringAction> {
  if (a.kind === 'run') return { kind: 'run', session: await startSkillSession(scope, h, a.skill, ev, node, f) };
  if (a.kind === 'add') { if (!node) throw new Error(`${ev.id} is not in the graph`); return { kind: 'add', added: await addFromTemplate(scope, h, a.template, a.to, node, log) }; }
  if (a.kind === 'task') { if (!node) throw new Error(`${ev.id} is not in the graph`); return await taskUnder(scope, h, a, node, f); }
  if (a.kind === 'assign') return await assignExisting(scope, h, a, f);
  if (a.kind === 'notify') { if (!node) throw new Error(`${ev.id} is not in the graph`); return { kind: 'notify', added: [await notify(scope, h, a.text, node, ev)] }; }
  throw new Error(`unknown action ${JSON.stringify(a)}`);
}

// `task "<text>" [--worker w] [--skill s]`: a task line under the node — part of it, ready, by the hook — so Work
// lists it; with a worker it is assigned at once (lib/work-io#assignTask: an agent starts a session with the skill
// in its first message and the task in progress; a person's name is just set). Returns the task id (and the session).
async function taskUnder(scope: Scope, h: HookDef, a: { text: string; worker?: string; skill?: string }, node: GraphNode, f: Firing): Promise<FiringAction> {
  const by = `hook:${h.id.replace(/^hook:/, '')}`;
  const text = fillTemplate(a.text, templateVars(node));
  claimWrite(node.id, { by });
  const made = await captureTask(scope, { text, partOf: node.id, by, ready: !a.worker });
  if (!made.ok) throw new Error(made.message);
  await rebuild(scope.product.dir);
  if (!a.worker) return { kind: 'task', added: [made.id] };
  const fresh = await loadScope(scope.product.slug); if (!fresh) throw new Error('the product could not be reloaded');
  const settings = agentSettings(await readSettings());
  const worker = a.worker === 'agent' ? settings.agent : a.worker;
  const skills = [...new Set([...(a.skill ? [a.skill] : []), ...h.skills])];
  const r = await assignTask(fresh, made.id, { worker, wfUrl: state().wfUrl, by, force: true, skills, hook: { id: h.id, firing: f.id, ...(a.skill ? { skill: a.skill } : {}) } });
  if (!r.ok) return { kind: 'task', added: [made.id], error: `assigned to nobody — ${r.message}` };
  return { kind: 'task', added: [made.id], ...(r.session ? { session: r.session } : {}) };
}

// `assign task:<id> [--worker w] [--skill s]`: an existing task to a worker (the default agent when none is named).
async function assignExisting(scope: Scope, h: HookDef, a: { task: string; worker?: string; skill?: string }, f: Firing): Promise<FiringAction> {
  const settings = agentSettings(await readSettings());
  const worker = !a.worker || a.worker === 'agent' ? settings.agent : a.worker;
  const skills = [...new Set([...(a.skill ? [a.skill] : []), ...h.skills])];
  const r = await assignTask(scope, a.task, { worker, wfUrl: state().wfUrl, by: `hook:${h.id.replace(/^hook:/, '')}`, force: true, skills, hook: { id: h.id, firing: f.id, ...(a.skill ? { skill: a.skill } : {}) } });
  if (!r.ok) throw new Error(r.message);
  return { kind: 'assign', added: [a.task], ...(r.session ? { session: r.session } : {}) };
}

// `notify "<text>"`: a note in the product's inbox from the hook, naming the node; the watcher's inbox event shows it
// as a toast on every open page (component:live-refresh).
async function notify(scope: Scope, h: HookDef, text: string, node: GraphNode, ev: HookEvent): Promise<string> {
  const filled = fillTemplate(text, templateVars(node));
  return addInboxItem(scope.product.dir, { type: 'note', title: `hook: ${filled}`, text: `${h.id} on ${node.id} (${ev.event}).`, from: `hook:${h.id.replace(/^hook:/, '')}`, refs: [node.id, h.id] });
}

// "Run now" on a node's Hooks section: the hook fires on that node as if its event had just happened — the once
// rule does not hold back a run by hand.
export async function runHook(product: string, hookId: string, nodeId: string): Promise<Firing[]> {
  const scope = await loadScope(product); if (!scope) return [];
  const h = hooksOf(scope.graph).find(x => x.id === hookId); if (!h) throw new Error(`${hookId} is not a hook`);
  const node = scope.idx.byId.get(nodeId); if (!node) throw new Error(`${nodeId} is not in the graph`);
  return fire(product, [{ kind: node.kind, id: node.id, event: h.on.event, depth: 0 }], undefined, { only: hookId, force: true });
}

// `run skill:<id>`: a chat session on the node — the skill's role (librarian by default: reads and proposes, in the
// Wye repo; a worker skill runs in the product's repo), refs = the node and what it is part of, the first message as
// any session's (instruction, resolved refs, constraints in force) plus the skill's body and the hook's attached
// skills. The session carries the firing (Session.hook) so what it writes fires hooks one level deeper.
async function startSkillSession(scope: Scope, h: HookDef, skill: string, ev: HookEvent, node: GraphNode | undefined, f: Firing): Promise<string> {
  const product = scope.product.slug, productDir = scope.product.dir;
  const skills = await listSkills(scope);
  const meta = skills.find(s => s.id === skill);
  const skillNode = scope.idx.byId.get(skill);
  const role = (meta?.role ?? (skillNode ? cardValue(skillNode.body, 'role') : '')) === 'worker' ? 'worker' : 'librarian';
  const settings = agentSettings(await readSettings());
  const cwd = role === 'librarian' ? REPO_ROOT : scope.product.meta.repo || REPO_ROOT;
  const partOf = node ? (scope.idx.out.get(node.id) ?? []).filter(e => e.verb === 'part-of').map(e => e.to) : [];
  const route = node ? docRoute(node.file) : null;
  const title = node?.title || ev.id;
  const s = await createSession(productDir, product, {
    agent: role === 'librarian' ? 'claude-code' : settings.agent, mode: 'chat', cwd, role,
    instruction: `Run ${skill} on ${ev.id}: ${title}`,
    refs: [ev.id, ...partOf, ...(ev.session ? [`session:${ev.session}`] : [])],
    source: route ? { project: route.project, doc: route.doc, link: `${product}/${route.project}/${route.doc}` } : {},
    hook: { id: h.id, firing: f.id, skill },
  });
  await updateSession(productDir, s.id, { line: `started by ${h.id} on ${ev.id} (${ev.event})` });
  // the hook's own attached skills; the PR's and the type cards' come with buildPrompt
  const first = (await buildPrompt(product, s, state().wfUrl, productDir)) + await skillsSection(scope, [skill], 'Skill') + await skillsSection(scope, h.skills.filter(x => x !== skill), 'Skills of the hook');
  await startChat(productDir, product, s.id, { wfUrl: state().wfUrl, firstMessage: first, shown: s.instruction });
  return s.id;
}

// `add <template>`: the template's markdown — a `template:<name>` card's body in the product, else
// templates/hooks/<name>.md — filled for the node and appended under it as content (proposed child blocks, `by:
// hook:<slug>`), or with `to: <doc slug>` at that document's end. Deterministic, no model. Returns the ids added.
async function addFromTemplate(scope: Scope, h: HookDef, template: string, to: string | undefined, node: GraphNode, log: (m: string) => void): Promise<string[]> {
  const card = scope.idx.byId.get(`template:${template}`);
  let md = card ? cardValue(card.body, 'body') : '';
  if (!md) { try { md = await readFile(path.join(REPO_ROOT, 'templates/hooks', `${template}.md`), 'utf8'); } catch { /* none */ } }
  if (!md.trim()) throw new Error(`template ${template} not found (no template:${template} card, no templates/hooks/${template}.md)`);
  const filled = fillTemplate(md, templateVars(node)).replace(/\s+$/, '');
  const ids = filled.split('\n').map(l => l.match(/^\s*-\s+(?:id:\s*)?([a-z-]+:[A-Za-z0-9_.\-]+)(?:\s|$)/)?.[1] ?? '').filter(Boolean);
  // the writer's mark on every block the template adds: proposed, by the hook — a card gets `by:`, a prose line the group
  const by = `hook:${h.id.replace(/^hook:/, '')}`;
  const marked = filled.split('\n').map((l, i, arr) => {
    const item = l.match(/^(\s*)-\s+(?:id:\s*)?[a-z-]+:[A-Za-z0-9_.\-]+(\s.*)?$/);
    if (!item) return l;
    const next = arr[i + 1] ?? '';
    const isCard = /^\s+[a-z-]+:\s/.test(next) || /^\s*-\s+id:/.test(l);
    return isCard ? `${l}\n${item[1]}  by: ${by}` : /\(.*\)\s*$/.test(l) ? l.replace(/\)\s*$/, `, by: ${by})`) : `${l} (by: ${by})`;
  }).join('\n');
  if (to) {
    const tree = documentTree(scope.graph);
    const target = [...tree.byFile.values()].find(d => d.slug === to) ?? [...tree.byFile.values()].find(d => d.module.id === to);
    if (!target) throw new Error(`document ${to} not found`);
    const file = path.join(REPO_ROOT, target.file);
    claimWrite(target.file, { by });
    await withFileLock(file, async () => { const cur = await readFile(file, 'utf8'); await writeAtomic(file, `${cur.replace(/\s+$/, '')}\n\n${marked}\n`); });
  } else {
    if (!node.file) throw new Error(`${node.id} has no document`);
    const file = path.join(REPO_ROOT, node.file);
    claimWrite(node.id, { by });
    const ok = await withFileLock(file, async () => {
      const cur = await readFile(file, 'utf8');
      const existing = readContent(cur, node.id, node.line, node.form ?? 'yaml');
      if (existing === null) return false;
      const next = writeContent(cur, node.id, node.line, node.form ?? 'yaml', existing ? `${existing.replace(/\s+$/, '')}\n${marked}` : marked);
      if (next === null) return false;
      if (next !== cur) await writeAtomic(file, next);
      return true;
    });
    if (!ok) throw new Error(`${node.id} has no content in its document (${node.form ?? 'yaml'} form)`);
  }
  await rebuild(scope.product.dir);
  log(`${h.id}: ${template} added under ${to ?? node.id}`);
  return ids;
}

// `pr.approved`, `pr.built`, `session.done` — the events that do not come from a diff.
export async function firePrApproved(product: string, ref: string): Promise<void> {
  const slug = ref.split('/')[2]; if (!slug) return;
  await fire(product, [{ kind: 'pr', id: `pr:${slug}`, event: 'approved', depth: 0 }]).catch(e => console.log(`[wf] hooks: ${e instanceof Error ? e.message : e}`));
}
export async function fireSessionEnd(productDir: string, product: string, sessionId: string): Promise<void> {
  const s = await getSession(productDir, sessionId).catch(() => null); if (!s) return;
  const depth = await depthOfSession(productDir, sessionId);
  const events: (HookEvent & { depth?: number | null })[] = [{ kind: 'session', id: `session:${s.id}`, event: 'done', session: s.id, role: s.role ?? 'worker', depth }];
  if (s.prDoc && s.status === 'done' && (s.role ?? 'worker') === 'worker') { const slug = s.prDoc.split('/')[2]; events.push({ kind: 'pr', id: `pr:${slug}`, event: 'built', session: s.id, depth }); }
  await fire(product, events).catch(e => console.log(`[wf] hooks: ${e instanceof Error ? e.message : e}`));
}
// a session's end is an event too (session.done; pr.built when a worker's build of a PR ended done)
onSessionEnd(async (productDir, s) => { await fireSessionEnd(productDir, s.product, s.id); }, 'hooks');
