// Workflows, the IO part (decision:wf2.workflow-is-a-skill, decision:wf2.run-holds-the-state): starting a run on a
// node or document, entering a stage — the documents it produces created from templates/docs when they are absent, its
// `do:` actions run through the hook runner with the stage as the actor — and the person's moves: advance, reopen,
// skip, retry, cancel. Readiness is computed on demand (lib/runs#readinessOf) and never written to the card: a derived
// value in markdown would be rewritten by every rebuild, and every rewrite is another rebuild. The state is the `run:`
// card in the project's Workflow runs document; `sweepRuns` is what the watcher calls after each build.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadScope, treeFor, type Scope } from './scope';
import { REPO_ROOT, type Project } from './products';
import { docRoute, docSlug, documentTree } from './doc';
import { slugify } from './templates';
import { createDocFromTemplate } from './doc-create';
import { appendCard } from './instances';
import { claimWrite } from './changes';
import { rebuild, writeAtomic, withFileLock, lint } from './write';
import { fillTemplate, templateVars, MAX_DEPTH, type HookAction } from './hooks';
import { runAction, newFiring, saveFiring, hooksEnabled, type Actor, type Firing } from './hooks-run';
import { listSessions, onSessionEnd } from './sessions';
import { readSettings, agentSettings } from './settings';
import { assignTask } from './work-io';
import { LIVE, admits, autoRun, logLine, nextStage, parseRun, readinessOf, replaceCard, runCard, runSlug, stageIndex, workflowOf, type Readiness, type RunCtx, type RunState, type StageDef, type WorkflowDef } from './runs';

export const runsPageId = (projectSlug: string) => `module:${projectSlug}-workflow-runs`;
const RUNS_SLUG = 'workflow-runs';
const today = () => new Date().toISOString().slice(0, 10);
const g = globalThis as unknown as { __wfRuns?: { busy: Set<string>; wfUrl: string } };
const state = () => (g.__wfRuns ??= { busy: new Set(), wfUrl: process.env.WYE_URL || process.env.WF_URL || 'http://localhost:3456' });

// --- where a run lives ---

const projectOf = (scope: Scope, file: string): Project | undefined => {
  const r = docRoute(file);
  return (r && scope.projects.find(p => p.slug === r.project)) ?? scope.projects[0];
};

async function ensureRunsPage(scope: Scope, project: Project): Promise<string> {
  const id = runsPageId(project.slug);
  const file = path.join(project.docsDir, `${RUNS_SLUG}.md`);
  try { await stat(file); return id; } catch { /* write it */ }
  const tpl = await readFile(path.join(REPO_ROOT, `templates/docs/${RUNS_SLUG}.md`), 'utf8');
  const tree = treeFor(scope, project.slug);
  const main = tree.main && !['prs', 'skills', 'hooks', RUNS_SLUG].includes(tree.main.slug) ? tree.main.module.id : null;
  await writeAtomic(file, tpl.replace(/\{\{id\}\}/g, id).replace(/\{\{date\}\}/g, today()).replace(/\{\{root\}\}/g, main ? `part-of: ${main}\n` : ''));
  return id;
}

// The run card written or replaced in place, one log line appended, then the graph rebuilt. Called only when something
// actually changed — see sweepRuns.
async function writeRun(scope: Scope, project: Project, r: RunState, o: { by: string; line?: string }): Promise<RunState> {
  const next: RunState = { ...r, log: o.line ? [...r.log, o.line] : r.log };
  await ensureRunsPage(scope, project);
  const file = path.join(project.docsDir, `${RUNS_SLUG}.md`);
  claimWrite(r.id, { by: o.by });
  await withFileLock(file, async () => {
    const cur = await readFile(file, 'utf8');
    const card = runCard(next);
    const out = replaceCard(cur, r.id, card) ?? appendCard(cur, card.replace(/\n$/, ''));
    if (out !== cur) await writeAtomic(file, out);
  });
  await rebuild(scope.product.dir);
  return next;
}

// --- reading runs out of the graph ---

export const runsIn = (scope: Scope): RunState[] => scope.graph.nodes.filter(n => n.kind === 'run' && n.defined).map(parseRun).filter((r): r is RunState => !!r);
const runIn = (scope: Scope, id: string): RunState | null => runsIn(scope).find(r => r.id === id) ?? null;

// The documents a run produced, bound to the names the stages give them: `{{prd}}` in a task's text and `prd` in an
// `until:` clause are the same binding.
function bindings(scope: Scope, r: RunState, w: WorkflowDef): Record<string, string> {
  const out: Record<string, string> = {};
  const names = [...new Set(w.stages.flatMap(s => s.produces))];
  for (const id of r.produced) {
    const n = scope.idx.byId.get(id); if (!n) continue;
    const slug = docSlug(n.file);
    for (const name of names) if (slug.endsWith(`-${name}`) || slug === name) out[name] = id;
  }
  return out;
}

export async function ctxFor(scope: Scope, r: RunState, stage: StageDef, w: WorkflowDef): Promise<RunCtx> {
  const sessions = (await listSessions(scope.product.dir).catch(() => [])).filter(s => r.sessions.includes(s.id)).map(s => ({ id: s.id, status: s.status }));
  // the lint is only run when a predicate asks for it, so the sweep after every build stays cheap
  let checkErrors = 0;
  if (stage.until.some(p => p.kind === 'check-passes')) {
    const out = await lint(scope.product.dir).catch(() => ({ code: 0, output: '' }));
    checkErrors = (out.output.match(/^error/gim) ?? []).length || (out.code === 0 ? 0 : 1);
  }
  return { graph: scope.graph, idx: scope.idx, docs: bindings(scope, r, w), sessions, checkErrors };
}

export type RunView = RunState & { workflowTitle: string; stageTitle: string; onTitle: string; step: number; of: number; readiness: Readiness; stages: { id: string; title: string }[] };

async function viewOf(scope: Scope, r: RunState): Promise<RunView> {
  const w = workflowOf(scope.graph, scope.idx, r.workflow);
  const stage = w?.stages.find(s => s.id === r.stage);
  const readiness = w && stage ? readinessOf(stage, await ctxFor(scope, r, stage, w)) : { rows: [{ label: `${r.stage || r.workflow} is gone from the workflow`, ok: false, blocking: [r.stage || r.workflow] }], ok: false };
  return {
    ...r, workflowTitle: w?.title || r.workflow, stageTitle: stage?.title || r.stage, onTitle: scope.idx.byId.get(r.on)?.title || r.on,
    step: w ? stageIndex(w, r.stage) + 1 : 0, of: w?.stages.length ?? 0, readiness, stages: (w?.stages ?? []).map(s => ({ id: s.id, title: s.title })),
  };
}
export async function listRuns(scope: Scope): Promise<RunView[]> {
  return Promise.all(runsIn(scope).map(r => viewOf(scope, r)));
}
export async function runsOnNode(scope: Scope, id: string): Promise<RunView[]> {
  return Promise.all(runsIn(scope).filter(r => r.on === id).map(r => viewOf(scope, r)));
}

// --- the moves ---

export async function startRun(product: string, workflow: string, on: string, o: { by: string; again?: boolean }): Promise<{ run: string }> {
  const scope = await loadScope(product); if (!scope) throw new Error(`no such product ${product}`);
  const w = workflowOf(scope.graph, scope.idx, workflow); if (!w) throw new Error(`${workflow} is not a workflow`);
  if (w.status === 'paused') throw new Error(`${workflow} is paused`);
  if (!w.stages.length) throw new Error(`${workflow} has no stages`);
  const node = scope.idx.byId.get(on); if (!node) throw new Error(`${on} is not in the graph`);
  if (!admits(w, node.kind)) throw new Error(`${workflow} does not run on a ${node.kind} (takes: ${w.takes.join(', ') || '*'})`);
  const live = runsIn(scope).find(r => r.workflow === workflow && r.on === on && LIVE.has(r.status));
  if (live && !o.again) throw new Error(`${live.id} is already live on ${on} — pass again to start another`);
  const project = projectOf(scope, node.file); if (!project) throw new Error('no project to put the run in');
  const id = runSlug(workflow, runsIn(scope).map(r => r.id));
  const r: RunState = { id, workflow, on, stage: w.stages[0].id, status: 'running', produced: [], sessions: [], started: today(), log: [logLine({ what: 'started', by: o.by, detail: `${w.title} on ${on}` })] };
  await writeRun(scope, project, r, { by: o.by });
  await enterStage(product, id, w.stages[0].id, { by: o.by });
  return { run: id };
}

// Entering a stage: the documents it produces, then its actions, once per entry.
export async function enterStage(product: string, runId: string, stageId: string, o: { by: string }): Promise<void> {
  const key = `${runId}|${stageId}`;
  if (state().busy.has(key)) return;
  state().busy.add(key);
  try {
    const scope = await loadScope(product); if (!scope) return;
    let r = runIn(scope, runId); if (!r) throw new Error(`${runId} is not in the graph`);
    const w = workflowOf(scope.graph, scope.idx, r.workflow); if (!w) throw new Error(`${r.workflow} is not a workflow`);
    const stage = w.stages.find(s => s.id === stageId); if (!stage) throw new Error(`${stageId} is not a stage of ${r.workflow}`);
    const node = scope.idx.byId.get(r.on);
    if (!node) { const p = projectOf(scope, ''); if (p) await writeRun(scope, p, { ...r, status: 'blocked' }, { by: o.by, line: logLine({ what: 'blocked', stage: stageId, by: 'the engine', detail: `${r.on} is gone` }) }); return; }
    const project = projectOf(scope, node.file); if (!project) throw new Error('no project for the run');

    // 1. the documents this stage produces, created only when absent (re-entering a stage never clobbers one)
    const made: string[] = [];
    const binds: Record<string, string> = { ...bindings(scope, r, w) };
    for (const name of stage.produces) {
      if (binds[name]) continue;
      const title = `${node.title || docSlug(node.file)} — ${name}`;
      const slug = slugify(title);
      const already = [...documentTree(scope.graph).byFile.values()].find(d => d.slug === slug);
      if (already) { binds[name] = already.module.id; made.push(already.module.id); continue; }
      const parent = scope.graph.modules.some(m => m.id === node.id) ? docSlug(node.file) : undefined;
      const res = await createDocFromTemplate(scope, project, { title, template: name, parent });
      if (!res.ok) throw new Error(`${name}: ${res.message}`);
      binds[name] = res.node; made.push(res.node);
    }
    if (made.length) { await rebuild(scope.product.dir); r = { ...r, produced: [...new Set([...r.produced, ...made])] }; }

    // 2. the actions, with the produced documents among the template vars
    const vars = { ...templateVars(node), ...binds };
    const actor: Actor = { id: stage.id, title: stage.title, skills: stage.skills };
    const automation = await hooksEnabled();
    const firing: Firing = newFiring({ by: { run: runId, stage: stageId }, title: stage.title, node: node.id, event: `stage:${stageId}`, depth: autoRun(r.log) });
    const sessions: string[] = [];
    if (stage.actions.length) {
      const fresh = await loadScope(product) ?? scope;
      await saveFiring(scope.product.dir, firing);
      for (const raw of stage.actions) {
        const a = prepare(raw, vars, stage, automation, binds);
        try {
          const res = await runAction(fresh, actor, a, { kind: node.kind, id: node.id, event: `stage:${stageId}` }, fresh.idx.byId.get(node.id) ?? node, firing, m => console.log(`[wf] ${m}`));
          firing.actions.push(res);
          if (res.session) sessions.push(res.session);
        } catch (e) { firing.actions.push({ kind: a.kind, error: e instanceof Error ? e.message : String(e) }); }
      }
      await saveFiring(scope.product.dir, firing);
    }

    const detail = [firing.actions.length ? `${firing.actions.length} action(s)` : 'no actions', ...(made.length ? [`produced ${made.join(', ')}`] : []), ...(automation ? [] : ['automation off — nothing assigned'])].join(', ');
    const after = await loadScope(product) ?? scope;
    const now = runIn(after, runId) ?? r;
    await writeRun(after, project, { ...now, produced: [...new Set([...now.produced, ...r.produced])], sessions: [...new Set([...now.sessions, ...sessions])], stage: stageId, status: 'running' }, { by: o.by, line: logLine({ what: 'entered', stage: stageId, by: o.by, detail }) });
  } finally { state().busy.delete(key); }
}

// A stage's action, ready to run: its text filled with the node and the produced documents, a `dispatch` pointed at the
// bound document, and — when automation is off — no worker, so the tasks are written and nothing starts an agent.
function prepare(a: HookAction, vars: Record<string, string>, stage: StageDef, automation: boolean, binds: Record<string, string>): HookAction {
  if (a.kind === 'task') {
    const worker = automation ? (a.worker ?? stage.worker) : undefined;
    return { ...a, text: fillTemplate(a.text, vars), ...(worker ? { worker } : { worker: undefined }) };
  }
  if (a.kind === 'notify') return { ...a, text: fillTemplate(a.text, vars) };
  if (a.kind === 'dispatch') return { ...a, doc: binds[a.doc] ?? a.doc };   // the bound document's node id; dispatchDoc takes either
  return a;
}

export async function advanceRun(product: string, runId: string, o: { by: string; skip?: boolean }): Promise<{ stage: string | null; status: string }> {
  const scope = await loadScope(product); if (!scope) throw new Error(`no such product ${product}`);
  const r = runIn(scope, runId); if (!r) throw new Error(`${runId} is not in the graph`);
  const w = workflowOf(scope.graph, scope.idx, r.workflow); if (!w) throw new Error(`${r.workflow} is not a workflow`);
  const stage = w.stages.find(s => s.id === r.stage); if (!stage) throw new Error(`${r.stage} is not a stage of ${r.workflow}`);
  const ready = readinessOf(stage, await ctxFor(scope, r, stage, w));
  if (!ready.ok && !o.skip) throw new Error(`${r.stage} is not ready: ${ready.rows.filter(x => !x.ok).map(x => `${x.label}${x.blocking.length ? ` (${x.blocking.join(', ')})` : ''}`).join('; ')}`);
  const node = scope.idx.byId.get(r.on);
  const project = projectOf(scope, node?.file ?? ''); if (!project) throw new Error('no project for the run');
  const next = nextStage(w, r.stage);
  const detail = o.skip && !ready.ok ? 'skipped, not ready' : ready.rows.map(x => x.label).join('; ');
  if (!next) {
    await writeRun(scope, project, { ...r, status: 'done', finished: today() }, { by: o.by, line: logLine({ what: o.skip ? 'skipped' : 'advanced', stage: r.stage, by: o.by, detail: `${detail} — the last stage` }) });
    return { stage: null, status: 'done' };
  }
  await writeRun(scope, project, { ...r, stage: next.id, status: 'running' }, { by: o.by, line: logLine({ what: o.skip ? 'skipped' : 'advanced', stage: r.stage, by: o.by, detail }) });
  await enterStage(product, runId, next.id, { by: o.by });
  return { stage: next.id, status: 'running' };
}

async function moveTo(product: string, runId: string, o: { by: string; stage?: string; status: string; what: string; detail?: string; enter: boolean }): Promise<void> {
  const scope = await loadScope(product); if (!scope) throw new Error(`no such product ${product}`);
  const r = runIn(scope, runId); if (!r) throw new Error(`${runId} is not in the graph`);
  const w = workflowOf(scope.graph, scope.idx, r.workflow);
  const stage = o.stage ?? r.stage;
  if (o.stage && !w?.stages.some(s => s.id === o.stage)) throw new Error(`${o.stage} is not a stage of ${r.workflow}`);
  const project = projectOf(scope, scope.idx.byId.get(r.on)?.file ?? ''); if (!project) throw new Error('no project for the run');
  await writeRun(scope, project, { ...r, stage, status: o.status }, { by: o.by, line: logLine({ what: o.what, stage, by: o.by, ...(o.detail ? { detail: o.detail } : {}) }) });
  if (o.enter) await enterStage(product, runId, stage, { by: o.by });
}
export const reopenRun = (product: string, runId: string, stage: string, o: { by: string }) => moveTo(product, runId, { ...o, stage, status: 'running', what: 'reopened', enter: true });
export const retryRun = (product: string, runId: string, o: { by: string }) => moveTo(product, runId, { ...o, status: 'running', what: 'retried', enter: true });
export const cancelRun = (product: string, runId: string, o: { by: string }) => moveTo(product, runId, { ...o, status: 'cancelled', what: 'cancelled', enter: false });

// `dispatch <doc>`: the ready, unheld tasks of a document handed to workers within the slots of Settings › Agents.
export async function dispatchDoc(scope: Scope, doc: string, o: { workers?: number; by: string }): Promise<string[]> {
  const target = [...documentTree(scope.graph).byFile.values()].find(d => d.slug === doc || d.module.id === doc);
  if (!target) throw new Error(`document ${doc} not found`);
  const settings = agentSettings(await readSettings());
  const slots = Math.max(1, o.workers ?? settings.parallel);
  const tasks = scope.graph.nodes
    .filter(n => n.kind === 'task' && n.defined && n.file === target.file && !['done', 'in-progress', 'review'].includes(n.status))
    .filter(n => /(^|\n)\s*ready:\s*true/.test(n.body) && !/(^|\n)\s*worker:\s*\S/.test(n.body))
    .sort((a, b) => a.line - b.line).slice(0, slots);
  const out: string[] = [];
  for (const t of tasks) {
    const r = await assignTask(scope, t.id, { worker: settings.agent, wfUrl: state().wfUrl, by: o.by, force: true });
    if (r.ok) out.push(t.id);
  }
  return out;
}

// --- the sweep: what the watcher calls after every build ---

// Only a transition is written. Anything else would rewrite a card, which rebuilds, which sweeps again.
export async function sweepRuns(product: string, log: (m: string) => void = m => console.log(`[wf] ${m}`)): Promise<void> {
  const scope = await loadScope(product); if (!scope) return;
  for (const r of runsIn(scope)) {
    if (!LIVE.has(r.status)) continue;
    const w = workflowOf(scope.graph, scope.idx, r.workflow);
    const stage = w?.stages.find(s => s.id === r.stage);
    const node = scope.idx.byId.get(r.on);
    const project = projectOf(scope, node?.file ?? ''); if (!project) continue;
    if (!node) { if (r.status !== 'blocked') await writeRun(scope, project, { ...r, status: 'blocked' }, { by: 'the engine', line: logLine({ what: 'blocked', stage: r.stage, by: 'the engine', detail: `${r.on} is gone` }) }); continue; }
    if (!w || !stage) { if (r.status !== 'blocked') await writeRun(scope, project, { ...r, status: 'blocked' }, { by: 'the engine', line: logLine({ what: 'blocked', stage: r.stage, by: 'the engine', detail: `${r.stage} is gone from ${r.workflow}` }) }); continue; }
    if (r.status === 'blocked') continue;                     // a person retries, skips or cancels
    const ready = readinessOf(stage, await ctxFor(scope, r, stage, w));
    if (ready.ok && stage.gate === 'auto') {
      if (autoRun(r.log) >= MAX_DEPTH) { if (r.status !== 'waiting') await writeRun(scope, project, { ...r, status: 'waiting' }, { by: 'the engine', line: logLine({ what: 'held', stage: r.stage, by: 'the engine', detail: `${MAX_DEPTH} auto stages in a row — waiting for a person` }) }); continue; }
      log(`${r.id}: ${r.stage} is ready and automatic — advancing`);
      await advanceRun(product, r.id, { by: 'the engine' });
      continue;
    }
    if (ready.ok && r.status !== 'waiting') await writeRun(scope, project, { ...r, status: 'waiting' }, { by: 'the engine', line: logLine({ what: 'ready', stage: r.stage, by: 'the engine', detail: ready.rows.map(x => x.label).join('; ') }) });
    else if (!ready.ok && r.status === 'waiting') await writeRun(scope, project, { ...r, status: 'running' }, { by: 'the engine', line: logLine({ what: 'not ready', stage: r.stage, by: 'the engine', detail: ready.rows.filter(x => !x.ok).map(x => x.label).join('; ') }) });
  }
}

// A session a stage started that ended anything but done blocks its run: the person retries, skips or cancels.
onSessionEnd(async (productDir, s) => {
  const scope = await loadScope(s.product); if (!scope) return;
  for (const r of runsIn(scope)) {
    if (!LIVE.has(r.status) || r.status === 'blocked' || !r.sessions.includes(s.id) || s.status === 'done') continue;
    const project = projectOf(scope, scope.idx.byId.get(r.on)?.file ?? ''); if (!project) continue;
    await writeRun(scope, project, { ...r, status: 'blocked' }, { by: 'the engine', line: logLine({ what: 'blocked', stage: r.stage, by: 'the engine', detail: `session ${s.id} ended ${s.status}` }) });
  }
  await sweepRuns(s.product).catch(e => console.log(`[wf] runs: ${e instanceof Error ? e.message : e}`));
}, 'runs');
