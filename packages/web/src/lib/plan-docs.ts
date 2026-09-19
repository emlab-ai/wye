// Server-only IO for plan documents (rule:plan-doc): the project's Plans page (decision:wf2.plans-folder), a plan
// document for every request that starts work (decision:wf2.plan-per-request), the result written when the plan
// ends (decision:wf2.plan-result-owned-by-app). The shapes come from lib/plan-doc (pure).
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, type Project } from './products';
import { loadScope } from './scope';
import { docRoute, projectTree } from './doc';
import { rebuild, writeAtomic, withFileLock } from './write';
import { onSessionEnd, setPlanDoc, addRefs } from './sessions';
import { fromLine, getFrontmatter, planDocBody, planSlug, plansPageId, planStatusOnEnd, planTitle, requestTaskId, requestTaskStatusOnEnd, resultSection, setFrontmatter, withResult, withDefinition, definitionIds, definitionState, planStatusFromDefinition, type PlanEndStatus, type DefinitionState } from './plan-doc';
import type { Scope } from './scope';
import { createRequire } from 'node:module';
import { listChanges } from './changes';
import { patchProseNode } from './node-edit';
import { parseNodeLine } from './node-line';
export { plansPageId };
import type { Session } from './session-types';

const TEMPLATE = path.join(REPO_ROOT, 'templates/docs/plan-request.md');

// The Plans page of a project: `plans.md`, node module:<project>-plans (plansPageId, lib/plan-doc), under the
// project's main document when it has one. Every plan document is a sub-page of it. Written when missing; returns its node id.
export async function ensurePlansPage(project: Project, root: string | null): Promise<string> {
  const id = plansPageId(project.slug);
  const file = path.join(project.docsDir, 'plans.md');
  try { await stat(file); return id; } catch { /* write it */ }
  const md = `---
node: ${id}
type: module
title: Plans
status: active
owner: unassigned
last-verified: ${new Date().toISOString().slice(0, 10)}
${root ? `part-of: ${root}\n` : ''}---

# Plans

Every piece of work an agent takes on is a plan document under this page (type:plan): the request, what the agent
found, the plan, the tasks and — when the session ends — the result with the blocks it produced. The app creates
one for each request that starts work (rule:plan-doc); the agent and the person fill it while they plan; the Agents
page lists them per worker.

<!-- view:plan -->
`;
  await writeAtomic(file, md);
  return id;
}

// Where the request was made: the project and document slug from the source (the palette's Context) or from the
// source link's path; the product's first project when neither says.
function placeOf(s: Session): { project?: string; doc?: string } {
  if (s.source?.project) return { project: s.source.project, doc: s.source.doc };
  const m = s.source?.link?.match(/\/[^/]+\/([^/]+)\/d\/([^/#?]+)/);
  return m ? { project: m[1], doc: m[2] } : {};
}

// Create `plan-<slug>` for the request: a sub-page of the project's Plans page, the type:plan card in the
// frontmatter (`session`, `agent`, `started`), the request under "Request" with where it came from as tags.
// Returns the document ref (product/project/slug) and stores it on the session as `planDoc`.
export async function createPlanDoc(productDir: string, product: string, s: Session): Promise<string | null> {
  if (s.planDoc) return s.planDoc;
  const scope = await loadScope(product); if (!scope || !scope.projects.length) return null;
  const at = placeOf(s);
  const project: Project = scope.projects.find(p => p.slug === at.project) ?? scope.projects[0];
  const tree = projectTree(scope.graph, project.slug);
  const plansPage = await ensurePlansPage(project, tree.main && tree.main.slug !== 'plans' ? tree.main.module.id : null);
  const sourceDoc = scope.graph.modules.find(m => { const r = docRoute(m.file); return r?.project === project.slug && r.doc === at.doc; });
  let taken: string[] = []; try { taken = (await readdir(project.docsDir)).filter(n => n.endsWith('.md')).map(n => n.slice(0, -3)); } catch { /* new project */ }
  const slug = planSlug(s.instruction, taken);
  const tpl = await readFile(TEMPLATE, 'utf8');
  const now = new Date().toISOString();
  // the request task is part of the goal or node the request was sent from (req:exec.request-is-a-task): the first
  // ref that is not the document itself, a session or a plan
  const partOf = s.refs.find(r => /^[a-z-]+:/.test(r) && r !== sourceDoc?.id && !/^(session|plan|module|block):/.test(r));
  const md = planDocBody(tpl, { slug, title: planTitle(s.instruction), date: now.slice(0, 10), session: s.id, agent: s.agent, started: now, parent: plansPage, request: s.instruction, from: fromLine(s, sourceDoc?.id), partOf, task: s.task, role: s.role });
  await writeAtomic(path.join(project.docsDir, `${slug}.md`), md);
  await rebuild(productDir);
  const ref = `${product}/${project.slug}/${slug}`;
  await setPlanDoc(productDir, s.id, ref, `plan document ${ref}`);
  if (!s.task) await addRefs(productDir, s.id, [requestTaskId(slug)]); // the session's refs carry the request task
  return ref;
}

// Set the request task's status on the plan document's text (pure over the markdown): the line is found by id.
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

async function planDocFile(product: string, ref: string): Promise<{ file: string; project: string; slug: string } | null> {
  const [prod, projectSlug, slug] = ref.split('/'); if (prod !== product || !projectSlug || !slug) return null;
  const scope = await loadScope(product, projectSlug); if (!scope?.project) return null;
  return { file: path.join(scope.project.docsDir, `${slug}.md`), project: projectSlug, slug };
}

// The plan ended: the summary and the blocks credited to the session inside the plan's window go under "Result"
// (rewritten each time); the card's `status` and `finished` are set. `status` and `summary` override what the
// session says (a plan a fresh request replaces is cancelled with a note).
export async function finishPlanDoc(productDir: string, s: Session, opts: { status?: PlanEndStatus; summary?: string; finished?: string } = {}): Promise<boolean> {
  if (!s.planDoc) return false;
  const at = await planDocFile(s.product, s.planDoc); if (!at) return false;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return false; }
  const finished = opts.finished ?? s.finishedAt ?? new Date().toISOString();
  const status = opts.status ?? planStatusOnEnd(s.status);
  let body = resultSection({ ...s, status: status as Session['status'], result: opts.summary ?? s.result }, { started: getFrontmatter(md, 'started'), finished, exclude: [`plan:${at.slug}`, plansPageId(at.project)] });
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

// A handed-off session continues its parent's plan: the plan's `session` names both, so it shows under each worker.
export async function adoptPlanDoc(productDir: string, s: Session): Promise<void> {
  if (!s.planDoc) return;
  const at = await planDocFile(s.product, s.planDoc); if (!at) return;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
  const ids = (getFrontmatter(md, 'session') ?? '').split(/\s+/).filter(Boolean);
  if (ids.includes(s.id)) return;
  await writeAtomic(at.file, setFrontmatter(md, 'session', [...ids, s.id].join(' ')));
  await rebuild(productDir);
}

// A fresh request replaces the current plan (decision:wf2.plan-per-request): a plan its session never finished is
// closed as cancelled; one already finished (the session was done) is left as it is.
export async function closePlanDoc(productDir: string, s: Session): Promise<void> {
  if (!s.planDoc) return;
  const at = await planDocFile(s.product, s.planDoc); if (!at) return;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
  if (getFrontmatter(md, 'finished')) return;
  await finishPlanDoc(productDir, s, { status: 'cancelled', summary: `_Left unfinished — a new request replaced it on ${new Date().toISOString().slice(0, 10)}._` });
}

// registered once the module is loaded (lib/agent-host imports it): every ended session finishes its plan document —
// except a librarian's (decision:exec.plan-lifecycle): the plan it defined outlives the conversation, stays defining
// or defined, and is finished by the session that builds it; its request task goes to review for the person
onSessionEnd(async (productDir, s) => {
  if (!s.planDoc) return;
  if (s.role === 'librarian') { await librarianLeft(productDir, s).catch(() => undefined); return; }
  await finishPlanDoc(productDir, s);
}, 'plan-docs');
async function librarianLeft(productDir: string, s: Session): Promise<void> {
  const at = await planDocFile(s.product, s.planDoc!); if (!at) return;
  let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
  const cur = requestTaskStatus(md, at.slug); if (cur === undefined || cur === 'done') return;
  await writeAtomic(at.file, withRequestTaskStatus(md, at.slug, 'review'));
  await rebuild(productDir);
}

// ---- the Definition (req:exec.definition-tracked, req:exec.plan-defined)

export async function readPlanDoc(product: string, ref: string): Promise<{ file: string; md: string; slug: string; project: string } | null> {
  const at = await planDocFile(product, ref); if (!at) return null;
  try { return { ...at, md: await readFile(at.file, 'utf8') }; } catch { return null; }
}
// Embed ids under the plan's Definition (idempotent); rebuilds when something was added.
export async function embedInDefinition(productDir: string, product: string, ref: string, ids: string[]): Promise<number> {
  const at = await planDocFile(product, ref); if (!at || !ids.length) return 0;
  let added = 0;
  await withFileLock(at.file, async () => {
    let md: string; try { md = await readFile(at.file, 'utf8'); } catch { return; }
    const before = definitionIds(md).length; const next = withDefinition(md, ids); added = definitionIds(next).length - before;
    if (next !== md) await writeAtomic(at.file, next);
  });
  if (added) await rebuild(productDir);
  return added;
}
// The state of a plan's Definition from the graph: each embedded block's status and the open contradictions on it.
export function planDefinition(scope: Scope, md: string): DefinitionState {
  const ids = definitionIds(md);
  return definitionState(ids, id => {
    const n = scope.idx.byId.get(id); if (!n?.defined) return null;
    const open = (scope.idx.out.get(id) ?? []).filter(e => e.verb === 'has').map(e => scope.idx.byId.get(e.to)).filter(c => c?.kind === 'contradiction' && !['resolved', 'dismissed', 'rejected', 'done'].includes(c.status)).map(c => c!.id);
    return { status: n.status, openContradictions: open };
  });
}
// defining ↔ defined as the Definition's blocks are agreed or change (decision:exec.plan-lifecycle). Called after a
// rebuild for every plan in one of those states; writes the frontmatter only when the status moves.
export async function refreshPlanStatuses(scope: Scope): Promise<string[]> {
  const moved: string[] = [];
  for (const n of scope.graph.nodes) {
    if (n.kind !== 'plan' || !n.defined || !['defining', 'defined'].includes(n.status)) continue;
    const file = path.join(REPO_ROOT, n.file);
    let md: string; try { md = await readFile(file, 'utf8'); } catch { continue; }
    const next = planStatusFromDefinition(n.status, planDefinition(scope, md));
    if (next === n.status) continue;
    await writeAtomic(file, setFrontmatter(md, 'status', next)); moved.push(`${n.id} → ${next}`);
  }
  if (moved.length) await rebuild(scope.product.dir);
  return moved;
}
// Every typed block a librarian session added or changed goes into its plan's Definition (req:exec.definition-tracked).
const KNOWLEDGE = /^(req|decision|constraint|question|rule|lesson|task|goal|entity):/;
// Only blocks the session itself wrote (its claim on the write — wf propose, wf node set, wf doc write with the
// session header) — never what another session or the person wrote meanwhile (question:wf2.attribution-several-sessions).
export async function trackDefinitions(scope: Scope, sessions: Session[], changes: { id: string; change: string; session?: string }[]): Promise<void> {
  for (const s of sessions) {
    if (s.role !== 'librarian' || !s.planDoc || s.status !== 'running') continue;
    const slug = s.planDoc.split('/')[2];
    const ids = changes.filter(c => c.change !== 'removed' && KNOWLEDGE.test(c.id) && c.session === s.id && c.id !== `task:${slug}` && !scope.graph.nodes.some(n => n.id === c.id && n.file.endsWith(`/${slug}.md`))).map(c => c.id);
    if (ids.length) await embedInDefinition(scope.product.dir, scope.product.slug, s.planDoc, ids).catch(() => 0);
  }
}

// The Definition as a worker's context (req:exec.build-from-definition): every block's id, status and text, the
// change records of the plan's sessions with before and after; the constraint packet rides in the first message.
export async function definitionContext(scope: Scope, ref: string): Promise<{ text: string; state: DefinitionState; unagreed: string[] } | null> {
  const plan = await readPlanDoc(scope.product.slug, ref); if (!plan) return null;
  const d = planDefinition(scope, plan.md);
  const { nodeText } = createRequire(path.join(REPO_ROOT, 'package.json'))('./lib/judge.js') as { nodeText: (n: unknown) => string };
  const lines = d.items.map(it => { const n = scope.idx.byId.get(it.id); return `- ${it.id}${it.status ? ` #${it.status}` : ''}${it.agreed ? '' : ' (not agreed)'}: ${n ? nodeText(n) : '(missing)'}`; });
  const sessions = (getFrontmatter(plan.md, 'session') ?? '').split(/\s+/).filter(Boolean);
  const changes = (await listChanges(scope.product.dir, { listed: true })).filter(c => c.session && sessions.includes(c.session));
  const edits = changes.map(c => `- ${c.node} (${c.state}): ${c.changed.join(', ')} — before: ${valueLine(c.before)} → after: ${valueLine(c.after)}`);
  const text = [`## Definition of ${ref} (${d.total} block${d.total === 1 ? '' : 's'}, ${d.agreed} agreed, ${d.open} open)`, ...lines, ...(edits.length ? ['', 'Edits of existing nodes made while defining:', ...edits] : []), '', 'Build what the agreed blocks say; where a block is not agreed, say so and ask before building on it. When done, mark the requirements you shipped (`wf node set req:… --status shipped`) and the tasks done, and list what was built against each block.'].join('\n');
  return { text, state: d, unagreed: d.items.filter(i => !i.agreed).map(i => i.id) };
}
const valueLine = (v: { text: string; status: string; props: Record<string, string> }) => [v.text, ...Object.entries(v.props).filter(([k]) => ['when', 'then', 'unless', 'statement', 'choice'].includes(k)).map(([k, x]) => `${k}: ${x}`)].filter(Boolean).join(' · ').slice(0, 400);
