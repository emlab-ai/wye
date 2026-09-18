// Server-only IO for plan documents (rule:plan-doc): the project's Plans page (decision:wf2.plans-folder), a plan
// document for every request that starts work (decision:wf2.plan-per-request), the result written when the plan
// ends (decision:wf2.plan-result-owned-by-app). The shapes come from lib/plan-doc (pure).
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, type Project } from './products';
import { loadScope } from './scope';
import { docRoute, projectTree } from './doc';
import { rebuild, writeAtomic } from './write';
import { onSessionEnd, setPlanDoc } from './sessions';
import { fromLine, getFrontmatter, planDocBody, planSlug, plansPageId, planStatusOnEnd, planTitle, resultSection, setFrontmatter, withResult, type PlanEndStatus } from './plan-doc';
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
  const md = planDocBody(tpl, { slug, title: planTitle(s.instruction), date: now.slice(0, 10), session: s.id, agent: s.agent, started: now, parent: plansPage, request: s.instruction, from: fromLine(s, sourceDoc?.id) });
  await writeAtomic(path.join(project.docsDir, `${slug}.md`), md);
  await rebuild(productDir);
  const ref = `${product}/${project.slug}/${slug}`;
  await setPlanDoc(productDir, s.id, ref, `plan document ${ref}`);
  return ref;
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
  const body = resultSection({ ...s, status: status as Session['status'], result: opts.summary ?? s.result }, { started: getFrontmatter(md, 'started'), finished, exclude: [`plan:${at.slug}`, plansPageId(at.project)] });
  md = setFrontmatter(setFrontmatter(withResult(md, body), 'status', status), 'finished', finished);
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

// registered once the module is loaded (lib/agent-host imports it): every ended session finishes its plan document
onSessionEnd(async (productDir, s) => { if (s.planDoc) await finishPlanDoc(productDir, s); });
