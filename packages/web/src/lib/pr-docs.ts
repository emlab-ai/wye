// Server-only IO for Prompt Requests (rule:pr-doc): the project's PRs page (decision:wf2.plans-folder), a PR page
// document for every request that starts work (decision:wf2.plan-per-request), the result written when the build
// ends (decision:wf2.plan-result-owned-by-app). The shapes come from lib/pr-doc (pure).
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, type Project } from './products';
import { loadScope } from './scope';
import { docRoute, projectTree } from './doc';
import { rebuild, writeAtomic, withFileLock } from './write';
import { onSessionEnd, setPrDoc, addRefs } from './sessions';
import { fromLine, getFrontmatter, prDocBody, nextPrNumber, prsPageId, prStatusOnEnd, prTitle, requestTaskId, requestTaskStatusOnEnd, resultSection, setFrontmatter, withResult, withDefinition, definitionIds, definitionState, readiness, taskLines, type PrEndStatus, type DefinitionState, type Readiness } from './pr-doc';
import type { Scope } from './scope';
import { createRequire } from 'node:module';
import { listChanges } from './changes';
import { patchProseNode } from './node-edit';
import { parseNodeLine } from './node-line';
export { prsPageId };
import type { Session } from './session-types';

const TEMPLATE = path.join(REPO_ROOT, 'templates/docs/pr.md');

// The PRs page of a project: `prs.md`, node module:<project>-prs (prsPageId, lib/pr-doc), under the project's main
// document when it has one. Every PR is a sub-page of it. Written when missing; returns its node id.
export async function ensurePrsPage(project: Project, root: string | null): Promise<string> {
  const id = prsPageId(project.slug);
  const file = path.join(project.docsDir, 'prs.md');
  try { await stat(file); return id; } catch { /* write it */ }
  const md = `---
node: ${id}
type: module
title: PRs
status: active
owner: unassigned
last-verified: ${new Date().toISOString().slice(0, 10)}
${root ? `part-of: ${root}\n` : ''}---

# PRs

Every request to the product is a Prompt Request under this page (type:pr): what was asked, what it touches, the
blocks it proposes, its impact, the tasks and — when built — the result. ⌘P creates one; it is refined until clear,
approved here, then built by an agent (rule:pr-doc).

<!-- view:pr -->
`;
  await writeAtomic(file, md);
  return id;
}

// The system view pages (decision:wf2.views-are-pages): Goals and Work are documents that hold one instances view
// each — every goal, every task of the product, as blocks — written once into the project that holds the PRs page.
// The rail links to them; they leave the Documents tree like PRs does. Nothing else is special about them.
export const SYSTEM_VIEWS = [
  { slug: 'goals', title: 'Goals', icon: '◎', view: 'goal', query: '', intro: 'Every goal of the product, wherever it is defined — as blocks. Filter, group and sort here; a goal is written on its own page (a goal: line or card) or added under a Goals data list.' },
  { slug: 'work', title: 'Work', icon: '☑', view: 'task', query: 'group=status', intro: 'Every task of the product, wherever it is written — PRs, definition pages, the Backlog — as blocks, grouped by status. A task\'s panel assigns it, builds a PR or ticks it done.' },
] as const;
export const viewPageId = (projectSlug: string, slug: string) => `module:${projectSlug}-${slug}`;
export async function ensureViewPages(project: Project): Promise<void> {
  for (const v of SYSTEM_VIEWS) {
    const file = path.join(project.docsDir, `${v.slug}.md`);
    try { await stat(file); continue; } catch { /* write it */ }
    const md = `---
node: ${viewPageId(project.slug, v.slug)}
type: module
title: ${v.title}
status: active
owner: unassigned
last-verified: ${new Date().toISOString().slice(0, 10)}
---

# ${v.title}

${v.intro}

<!-- view:${v.view}${v.query ? ' ' + v.query : ''} -->
`;
    await writeAtomic(file, md);
  }
}

// Where the request was made: the project and document slug from the source (the palette's Context) or from the
// source link's path; the product's first project when neither says.
function placeOf(s: Session): { project?: string; doc?: string } {
  if (s.source?.project) return { project: s.source.project, doc: s.source.doc };
  const m = s.source?.link?.match(/\/[^/]+\/([^/]+)\/d\/([^/#?]+)/);
  return m ? { project: m[1], doc: m[2] } : {};
}

// Create `pr-<n>` for the request: a sub-page of the project's PRs page, the type:pr card in the
// frontmatter (`session`, `agent`, `started`), the request under "Request" with where it came from as tags.
// Returns the document ref (product/project/slug) and stores it on the session as `prDoc`.
export async function createPrDoc(productDir: string, product: string, s: Session): Promise<string | null> {
  if (s.prDoc) return s.prDoc;
  const scope = await loadScope(product); if (!scope || !scope.projects.length) return null;
  const at = placeOf(s);
  // without a place: the project that already holds PRs (most of them), else the first
  const home = () => { const counts = new Map<string, number>(); for (const n of scope.graph.nodes) if (n.kind === 'pr' && n.defined) { const r = docRoute(n.file); if (r) counts.set(r.project, (counts.get(r.project) ?? 0) + 1); } const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]; return scope.projects.find(p => p.slug === best); };
  const project: Project = scope.projects.find(p => p.slug === at.project) ?? home() ?? scope.projects[0];
  const tree = projectTree(scope.graph, project.slug);
  const prsPage = await ensurePrsPage(project, tree.main && tree.main.slug !== 'prs' ? tree.main.module.id : null);
  const sourceDoc = scope.graph.modules.find(m => { const r = docRoute(m.file); return r?.project === project.slug && r.doc === at.doc; });
  // the number (decision:wf2.pr-numbers): one more than any PR of the product, in the graph or on disk
  const taken: string[] = scope.graph.nodes.filter(n => n.kind === 'pr').map(n => n.id);
  for (const p of scope.projects) { try { taken.push(...(await readdir(p.docsDir)).filter(n => n.endsWith('.md')).map(n => n.slice(0, -3))); } catch { /* new project */ } }
  const num = nextPrNumber(taken); const slug = `pr-${num}`;
  const tpl = await readFile(TEMPLATE, 'utf8');
  const now = new Date().toISOString();
  // the request task is part of the goal or node the request was sent from (req:exec.request-is-a-task): the first
  // ref that is not the document itself, a session or a PR
  const partOf = s.refs.find(r => /^[a-z-]+:/.test(r) && r !== sourceDoc?.id && !/^(session|pr|module|block):/.test(r));
  const md = prDocBody(tpl, { num, slug, title: prTitle(s.instruction), date: now.slice(0, 10), session: s.id, agent: s.agent, started: now, parent: prsPage, request: s.instruction, from: fromLine(s, sourceDoc?.id), partOf, task: s.task, role: s.role });
  await writeAtomic(path.join(project.docsDir, `${slug}.md`), md);
  await rebuild(productDir);
  const ref = `${product}/${project.slug}/${slug}`;
  await setPrDoc(productDir, s.id, ref, `PR page ${ref}`);
  if (!s.task) await addRefs(productDir, s.id, [requestTaskId(slug)]); // the session's refs carry the request task
  return ref;
}

// Set the request task's status on the PR page's text (pure over the markdown): the line is found by id.
export function withRequestTaskStatus(md: string, slug: string, status: string): string {
  const id = requestTaskId(slug);
  const i = md.split('\n').findIndex(l => parseNodeLine(l)?.id === id); if (i < 0) return md;
  return patchProseNode(md, id, i + 1, { status }).md;
}
export function requestTaskStatus(md: string, slug: string): string | undefined {
  const id = requestTaskId(slug);
  for (const l of md.split('\n')) { const n = parseNodeLine(l); if (n?.id === id) return n.status; }
  return undefined;
}

async function prDocFile(product: string, ref: string): Promise<{ file: string; project: string; slug: string } | null> {
  const [prod, projectSlug, slug] = ref.split('/'); if (prod !== product || !projectSlug || !slug) return null;
  const scope = await loadScope(product, projectSlug); if (!scope?.project) return null;
  return { file: path.join(scope.project.docsDir, `${slug}.md`), project: projectSlug, slug };
}

// The build ended: the summary and the blocks credited to the session inside the PR's window go under "Result"
// (rewritten each time); the card's `status` and `finished` are set. `status` and `summary` override what the
// session says (a PR a fresh request replaces is cancelled with a note).
export async function finishPrDoc(productDir: string, s: Session, opts: { status?: PrEndStatus; summary?: string; finished?: string } = {}): Promise<boolean> {
  if (!s.prDoc) return false;
  const at = await prDocFile(s.product, s.prDoc); if (!at) return false;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return false; }
  const finished = opts.finished ?? s.finishedAt ?? new Date().toISOString();
  const status = opts.status ?? prStatusOnEnd(s.status);
  let body = resultSection({ ...s, status: status as Session['status'], result: opts.summary ?? s.result }, { started: getFrontmatter(md, 'started'), finished, exclude: [`pr:${at.slug}`, prsPageId(at.project)] });
  // what was built against each block of the Definition (req:exec.build-from-definition): its status now, and whether this session changed it
  const defIds = definitionIds(md);
  if (defIds.length && s.role !== 'librarian') {
    const scope = await loadScope(s.product);
    const touched = new Set((s.artifacts?.blocks ?? []).map(b => b.id));
    body += `\n\nAgainst the Definition:\n\n${defIds.map(id => { const n = scope?.idx.byId.get(id); const st = n?.status ?? 'missing'; const how = !n ? 'missing' : touched.has(id) ? 'changed' : ['shipped', 'done', 'approved', 'resolved'].includes(st) ? 'implemented' : 'left'; return `- ${how} ${id}${st ? ` #${st}` : ''}`; }).join('\n')}`;
  }
  md = setFrontmatter(setFrontmatter(withResult(md, body), 'status', status), 'finished', finished);
  // the request task follows (req:exec.request-is-a-task): review for a person to check, done stays done
  const cur = requestTaskStatus(md, at.slug); if (cur !== undefined) md = withRequestTaskStatus(md, at.slug, requestTaskStatusOnEnd(cur, status));
  await writeAtomic(at.file, md);
  await rebuild(productDir);
  return true;
}

// A handed-off session continues its parent's PR: the PR's `session` names both, so it shows under each worker.
export async function adoptPrDoc(productDir: string, s: Session): Promise<void> {
  if (!s.prDoc) return;
  const at = await prDocFile(s.product, s.prDoc); if (!at) return;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
  const ids = (getFrontmatter(md, 'session') ?? '').split(/\s+/).filter(Boolean);
  if (ids.includes(s.id)) return;
  await writeAtomic(at.file, setFrontmatter(md, 'session', [...ids, s.id].join(' ')));
  await rebuild(productDir);
}

// A fresh request replaces the current PR (decision:wf2.plan-per-request): a PR its session never finished is
// closed as cancelled; one already finished (the session was done) is left as it is.
export async function closePrDoc(productDir: string, s: Session): Promise<void> {
  if (!s.prDoc) return;
  const at = await prDocFile(s.product, s.prDoc); if (!at) return;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
  if (getFrontmatter(md, 'finished')) return;
  await finishPrDoc(productDir, s, { status: 'cancelled', summary: `_Left unfinished — a new request replaced it on ${new Date().toISOString().slice(0, 10)}._` });
}

// registered once the module is loaded (lib/agent-host imports it): every ended session finishes its PR page —
// except a librarian's (decision:exec.plan-lifecycle): the PR it refined outlives the conversation, stays refining
// or defined, and is finished by the session that builds it; its request task goes to review for the person
onSessionEnd(async (productDir, s) => {
  if (!s.prDoc) return;
  if (s.role === 'librarian') { await librarianLeft(productDir, s).catch(() => undefined); return; }
  await finishPrDoc(productDir, s);
}, 'pr-docs');
async function librarianLeft(productDir: string, s: Session): Promise<void> {
  const at = await prDocFile(s.product, s.prDoc!); if (!at) return;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
  let next = md;
  if (getFrontmatter(md, 'status') === 'refining') next = setFrontmatter(next, 'status', 'draft'); // nobody on it now (approved / cancelled stay)
  const cur = requestTaskStatus(next, at.slug); if (cur !== undefined && cur !== 'done') next = withRequestTaskStatus(next, at.slug, 'review');
  if (next === md) return;
  await writeAtomic(at.file, next);
  await rebuild(productDir);
}

// ---- the Definition (req:exec.definition-tracked, req:exec.plan-defined)

export async function readPrDoc(product: string, ref: string): Promise<{ file: string; md: string; slug: string; project: string } | null> {
  const at = await prDocFile(product, ref); if (!at) return null;
  try { return { ...at, md: await readFile(at.file, 'utf8') }; } catch { return null; }
}
// Embed ids under the PR's Definition (idempotent); rebuilds when something was added.
export async function embedInDefinition(productDir: string, product: string, ref: string, ids: string[]): Promise<number> {
  const at = await prDocFile(product, ref); if (!at || !ids.length) return 0;
  let added = 0;
  await withFileLock(at.file, async () => {
    let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
    const before = definitionIds(md).length; const next = withDefinition(md, ids); added = definitionIds(next).length - before;
    if (next !== md) await writeAtomic(at.file, next);
  });
  if (added) await rebuild(productDir);
  return added;
}
// The state of a PR's Definition from the graph: each embedded block's status and the open contradictions on it.
export function prDefinition(scope: Scope, md: string): DefinitionState {
  const ids = definitionIds(md);
  return definitionState(ids, id => {
    const n = scope.idx.byId.get(id); if (!n?.defined) return null;
    const open = (scope.idx.out.get(id) ?? []).filter(e => e.verb === 'has').map(e => scope.idx.byId.get(e.to)).filter(c => c?.kind === 'contradiction' && !['resolved', 'dismissed', 'rejected', 'done'].includes(c.status)).map(c => c!.id);
    return { status: n.status, openContradictions: open };
  });
}
// A librarian is on it again (the message row on the PR head): draft → refining; other statuses stay.
export async function setRefining(productDir: string, product: string, ref: string): Promise<void> {
  const at = await prDocFile(product, ref); if (!at) return;
  let changed = false;
  await withFileLock(at.file, async () => { const md = await readFile(at.file, 'utf8'); if (getFrontmatter(md, 'status') !== 'draft') return; await writeAtomic(at.file, setFrontmatter(md, 'status', 'refining')); changed = true; });
  if (changed) await rebuild(productDir);
}

// Readiness (decision:wf2.pr-lifecycle): the Definition's state plus the task count, as the PR head shows it.
export function prReadiness(scope: Scope, md: string): Readiness { return readiness(prDefinition(scope, md), taskLines(md).length); }

// Approval (decision:wf2.pr-approval-is-the-persons-click): the person's click. Sets the status and who / when; the
// route then tells and stops a live refining session (lib/pr-sessions) — the build is the dispatcher's or Build's,
// never the librarian's.
export async function approvePr(productDir: string, product: string, ref: string, by: string): Promise<void> {
  const at = await prDocFile(product, ref); if (!at) throw new Error(`${ref}: not found`);
  await withFileLock(at.file, async () => { const md = await readFile(at.file, 'utf8'); await writeAtomic(at.file, setFrontmatter(setFrontmatter(setFrontmatter(md, 'status', 'approved'), 'approved-by', by), 'approved-at', new Date().toISOString())); });
  await rebuild(productDir);
}
export async function cancelPr(productDir: string, product: string, ref: string): Promise<void> {
  const at = await prDocFile(product, ref); if (!at) throw new Error(`${ref}: not found`);
  await withFileLock(at.file, async () => { let md = await readFile(at.file, 'utf8'); md = setFrontmatter(setFrontmatter(md, 'status', 'cancelled'), 'finished', new Date().toISOString()); const cur = requestTaskStatus(md, at.slug); if (cur !== undefined) md = withRequestTaskStatus(md, at.slug, requestTaskStatusOnEnd(cur, 'cancelled')); await writeAtomic(at.file, md); });
  await rebuild(productDir);
}
// back to draft: approved-* and finished cleared, the request task open again
export async function reopenPr(productDir: string, product: string, ref: string): Promise<void> {
  const at = await prDocFile(product, ref); if (!at) throw new Error(`${ref}: not found`);
  await withFileLock(at.file, async () => { let md = setFrontmatter(await readFile(at.file, 'utf8'), 'status', 'draft').replace(/^approved-(by|at):.*\n/gm, '').replace(/^finished:.*\n/m, ''); const cur = requestTaskStatus(md, at.slug); if (cur !== undefined && cur !== 'done') md = withRequestTaskStatus(md, at.slug, 'todo'); await writeAtomic(at.file, md); });
  await rebuild(productDir);
}

// Every typed block a librarian session added or changed goes into its PR's Definition (req:exec.definition-tracked).
const KNOWLEDGE = /^(req|decision|constraint|question|rule|lesson|task|goal|entity):/;
// Only blocks the session itself wrote (its claim on the write — wf propose, wf node set, wf doc write with the
// session header) — never what another session or the person wrote meanwhile (question:wf2.attribution-several-sessions).
export async function trackDefinitions(scope: Scope, sessions: Session[], changes: { id: string; change: string; session?: string }[]): Promise<void> {
  for (const s of sessions) {
    if (s.role !== 'librarian' || !s.prDoc || s.status !== 'running') continue;
    const slug = s.prDoc.split('/')[2];
    const ids = changes.filter(c => c.change !== 'removed' && KNOWLEDGE.test(c.id) && c.session === s.id && c.id !== `task:${slug}` && !scope.graph.nodes.some(n => n.id === c.id && n.file.endsWith(`/${slug}.md`))).map(c => c.id);
    if (ids.length) await embedInDefinition(scope.product.dir, scope.product.slug, s.prDoc, ids).catch(() => 0);
  }
}

// The Definition as a worker's context (req:exec.build-from-definition): every block's id, status and text, the
// change records of the plan's sessions with before and after; the constraint packet rides in the first message.
export async function definitionContext(scope: Scope, ref: string): Promise<{ text: string; state: DefinitionState; unagreed: string[] } | null> {
  const plan = await readPrDoc(scope.product.slug, ref); if (!plan) return null;
  const d = prDefinition(scope, plan.md);
  const { nodeText } = createRequire(path.join(REPO_ROOT, 'package.json'))('./lib/judge.js') as { nodeText: (n: unknown) => string };
  const lines = d.items.map(it => { const n = scope.idx.byId.get(it.id); return `- ${it.id}${it.status ? ` #${it.status}` : ''}${it.agreed ? '' : ' (not agreed)'}: ${n ? nodeText(n) : '(missing)'}`; });
  const sessions = (getFrontmatter(plan.md, 'session') ?? '').split(/\s+/).filter(Boolean);
  const changes = (await listChanges(scope.product.dir, { listed: true })).filter(c => c.session && sessions.includes(c.session));
  const edits = changes.map(c => `- ${c.node} (${c.state}): ${c.changed.join(', ')} — before: ${valueLine(c.before)} → after: ${valueLine(c.after)}`);
  const text = [`## Definition of ${ref} (${d.total} block${d.total === 1 ? '' : 's'}, ${d.agreed} agreed, ${d.open} open)`, ...lines, ...(edits.length ? ['', 'Edits of existing nodes made while defining:', ...edits] : []), '', 'Build what the agreed blocks say; where a block is not agreed, say so and ask before building on it. When done, mark the requirements you shipped (`wf node set req:… --status shipped`) and the tasks done, and list what was built against each block.'].join('\n');
  return { text, state: d, unagreed: d.items.filter(i => !i.agreed).map(i => i.id) };
}
const valueLine = (v: { text: string; status: string; props: Record<string, string> }) => [v.text, ...Object.entries(v.props).filter(([k]) => ['when', 'then', 'unless', 'statement', 'choice'].includes(k)).map(([k, x]) => `${k}: ${x}`)].filter(Boolean).join(' · ').slice(0, 400);
