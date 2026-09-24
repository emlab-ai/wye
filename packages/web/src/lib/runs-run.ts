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
import { parseLayout, writeLayout } from './map';
import { createDocFromTemplate } from './doc-create';
import { appendCard } from './instances';
import { claimWrite } from './changes';
import { rebuild, writeAtomic, withFileLock, lint, patchFrontmatter } from './write';
import { fillTemplate, templateVars, MAX_DEPTH, type HookAction } from './hooks';
import { runAction, newFiring, saveFiring, hooksEnabled, listFirings, type Actor, type Firing } from './hooks-run';
import { listSessions, onSessionEnd } from './sessions';
import { readSettings, agentSettings } from './settings';
import { assignTask } from './work-io';
import { nodeText } from './node-edit';
import { sectionBody } from './pr-doc';
import { LIVE, admits, autoRun, blockingSection, logLine, nextStage, parseRun, readinessOf, removeCard, replaceCard, runCard, runLayout, runSlug, someOf, stageKey, stepId, stageIndex, stagesSection, withSection, workflowOf, type Readiness, type RunCtx, type RunState, type StageDef, type WorkflowDef } from './runs';

export const runsPageId = (projectSlug: string) => `module:${projectSlug}-workflow-runs`;
const RUNS_SLUG = 'workflow-runs';
const today = () => new Date().toISOString().slice(0, 10);
// A run's title: the workflow and what it runs on, with a long target cut at a word so the page has a name, not a paragraph
const runTitle = (workflow: string, target: string) => {
  const t = target.length <= 60 ? target : `${target.slice(0, 60).replace(/[\s,;:.]+\S*$/, '')}…`;
  return `${workflow} — ${t}`;
};
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

// The run written, then the graph rebuilt. Called only when something actually changed — see sweepRuns.
// A run is a page (decision:wf2.run-is-a-page): its frontmatter is the state, and the engine owns three of its
// sections — Stages (where it has got to), Blocking (what stops the next stage) and Log (what happened). A run
// written before there were run pages is still a card in the Workflow runs document, and keeps being one.
async function writeRun(scope: Scope, project: Project, r: RunState, o: { by: string; line?: string }): Promise<RunState> {
  const next: RunState = { ...r, log: o.line ? [...r.log, o.line] : r.log };
  if (!isPage(scope, r)) return writeRunCard(scope, project, next, o);
  const file = path.join(REPO_ROOT, r.file);
  claimWrite(r.id, { by: o.by }); claimWrite(r.file, { by: o.by });
  const w = workflowOf(scope.graph, scope.idx, r.workflow);
  const stage = w?.stages.find(x => x.id === r.stage);
  const ses = await sessionsOfRun(scope.product.dir, r.id);
  if (ses.all.length) { next.sessions = [...new Set([...next.sessions, ...ses.all])]; next.stageSessions = { ...next.stageSessions, ...ses.byStage }; }
  // is the stage's own work still out? A step says `running` only while something of its is live; once its sessions
  // have ended and its criterion is still unmet, what is left is the person's, and it says `review`.
  const working = (next.stageSessions[stageKey(next.stage)] ?? []).some(id => ses.live.has(id));
  const ready = w && stage ? readinessOf(stage, await ctxFor(scope, r, stage, w)) : null;
  let wrote = false;
  await withFileLock(file, async () => {
    const was = await readFile(file, 'utf8');
    let md = was;
    // what a run accumulates — the documents it produced, their names, its sessions — is merged with what the file
    // already says, never replaced: a sweep holding a state read a moment ago must not drop what a stage wrote since.
    const onDisk = parseRun({ id: next.id, kind: 'run', status: next.status, body: (was.match(/^---\n([\s\S]*?)\n---/) ?? ['', ''])[1], file: next.file });
    if (onDisk) {
      // a bound document is one this run made: `produced` is the union, so the graph's edges name every one of them
      next.produced = [...new Set([...onDisk.produced, ...next.produced, ...Object.values(onDisk.docs), ...Object.values(next.docs)])];
      next.sessions = [...new Set([...onDisk.sessions, ...next.sessions])];
      next.docs = { ...onDisk.docs, ...next.docs };
      for (const [k, v] of Object.entries(onDisk.stageSessions)) next.stageSessions[k] = [...new Set([...v, ...(next.stageSessions[k] ?? [])])];
    }
    const patch: Record<string, string> = { status: next.status, stage: next.stage, 'runs-on': next.on, produced: `[${next.produced.join(', ')}]`, sessions: `[${next.sessions.join(', ')}]`, auto: String(next.auto) };
    for (const [name, id] of Object.entries(next.docs)) patch[`doc-${name}`] = id;
    if (next.finished) patch.finished = next.finished;
    const fm = patchFrontmatter(md, patch); if (!fm.error) md = fm.md;
    if (w) {
      const bound = bindings(scope, next, w);
      md = withSection(md, 'Stages', stagesSection(w, next, bound, ready?.rows ?? [], working));
      // the run's page opens as a map (decision:run.the-page-is-its-map): its stages are the nodes, so the page carries
      // their positions like any map — written once, kept as the person leaves them
      md = writeLayout(md, runLayout(w, next, bound, parseLayout(md)));
    }
    const after = w ? nextStage(w, next.stage) : null;
    md = withSection(md, 'Blocking', ready && stage ? blockingSection(ready.rows, stage.gate, { ...(after ? { next: after.title } : {}), over: !LIVE.has(next.status), run: next.id }) : '_The stage this run points at is gone from its workflow._');
    if (o.line) {
      const kept = (sectionBody(md, 'Log') ?? '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('_'));
      md = withSection(md, 'Log', [...kept, `- ${o.line}`].join('\n'));
    }
    // the run is over: what came of it, in the section the template keeps for it
    if (!LIVE.has(next.status)) {
      const made = next.produced.length ? `Produced ${next.produced.join(', ')}.` : 'Produced nothing.';
      const ran = next.sessions.length ? ` ${next.sessions.length} session(s): ${next.sessions.join(', ')}.` : '';
      md = withSection(md, 'Result', next.status === 'done'
        ? `Finished ${next.finished ?? today()} — every stage of ${w?.title ?? next.workflow} done. ${made}${ran}`
        : `${next.status[0].toUpperCase()}${next.status.slice(1)} at ${next.stage} on ${next.finished ?? today()}. ${made}${ran}`);
    }
    if (md !== was) { await writeAtomic(file, md); wrote = true; }
  });
  if (wrote) await rebuild(scope.product.dir);
  return next;
}
// A run node that is a document of its own — everything started since run pages landed.
const isPage = (scope: Scope, r: RunState) => !!r.file && scope.graph.modules.some(m => m.id === r.id);
// The old shape: one card among many in the project's Workflow runs document.
async function writeRunCard(scope: Scope, project: Project, next: RunState, o: { by: string }): Promise<RunState> {
  await ensureRunsPage(scope, project);
  const file = path.join(project.docsDir, `${RUNS_SLUG}.md`);
  claimWrite(next.id, { by: o.by });
  await withFileLock(file, async () => {
    const cur = await readFile(file, 'utf8');
    const card = runCard(next);
    const out = replaceCard(cur, next.id, card) ?? appendCard(cur, card.replace(/\n$/, ''));
    if (out !== cur) await writeAtomic(file, out);
  });
  await rebuild(scope.product.dir);
  return next;
}

// The run's own page, from templates/docs/run.md, under the project's Workflow runs page so the tree nests it there.
async function createRunDoc(scope: Scope, project: Project, r: RunState, o: { title: string; asked: string; parent: string; rebuild?: boolean; log?: string[] }): Promise<string> {
  const slug = `run-${r.id.replace(/^run:/, '')}`;
  const abs = path.join(project.docsDir, `${slug}.md`);
  const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs/run.md'), 'utf8');
  const vars: Record<string, string> = { node: r.id, title: o.title, status: r.status, workflow: r.workflow, on: r.on, stage: r.stage, date: r.started, parent: o.parent, asked: o.asked };
  let md = tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  if (o.log?.length) md = withSection(md, 'Log', o.log.map(l => `- ${l}`).join('\n'));
  await writeAtomic(abs, md);
  if (o.rebuild !== false) await rebuild(scope.product.dir);
  return path.relative(REPO_ROOT, abs);
}

// --- reading runs out of the graph ---

export const runsIn = (scope: Scope): RunState[] => scope.graph.nodes.filter(n => n.kind === 'run' && n.defined).map(parseRun).filter((r): r is RunState => !!r);
const runIn = (scope: Scope, id: string): RunState | null => runsIn(scope).find(r => r.id === id) ?? null;

// The documents a run produced, bound to the names the stages give them: `{{prd}}` in a task's text and `prd` in an
// `until:` clause are the same binding.
function bindings(scope: Scope, r: RunState, w: WorkflowDef): Record<string, string> {
  const out: Record<string, string> = {};
  const names = [...new Set(w.stages.flatMap(s => s.produces))];
  // a run made before the names were recorded: guess from the slug, which only works while slugify did not truncate it
  for (const id of r.produced) {
    const n = scope.idx.byId.get(id); if (!n) continue;
    const slug = docSlug(n.file);
    for (const name of names) if (slug.endsWith(`-${name}`) || slug === name) out[name] = id;
  }
  // a binding whose document is gone is dropped, so re-entering the stage makes it again instead of writing into a
  // node nobody defines any more
  for (const [name, id] of Object.entries(r.docs)) if (scope.idx.byId.get(id)?.defined) out[name] = id;
  return out;
}

// Which sessions belong to this run, and to each of its stages: every firing the engine wrote carries `by.run` and
// `by.stage`, and a session started from one carries that firing — so this is exact, and it holds for sessions
// started before the run began recording anything itself.
export async function sessionsOfRun(productDir: string, runId: string): Promise<{ all: string[]; byStage: Record<string, string[]>; live: Set<string> }> {
  const stageOf = new Map<string, string>();
  for (const f of await listFirings(productDir).catch(() => [])) if (f.by?.run === runId && f.by.stage) stageOf.set(f.id, f.by.stage);
  const byStage: Record<string, string[]> = {}; const all: string[] = []; const live = new Set<string>();
  if (!stageOf.size) return { all, byStage, live };
  for (const s of await listSessions(productDir).catch(() => [])) {
    const stage = s.hook?.firing ? stageOf.get(s.hook.firing) : undefined;
    if (!stage) continue;
    all.push(s.id);
    if (s.status === 'running' || s.status === 'queued') live.add(s.id);
    const k = stageKey(stage);
    byStage[k] = [...(byStage[k] ?? []), s.id];
  }
  return { all, byStage, live };
}

export async function ctxFor(scope: Scope, r: RunState, stage: StageDef, w: WorkflowDef): Promise<RunCtx> {
  // `session done` is about the sessions **this stage** started, not every session the run ever started: a later
  // stage's agent must not hold an earlier stage's criterion open, nor an earlier one's satisfy a later one
  const mine = r.stageSessions[stageKey(stage.id)] ?? r.sessions;
  const sessions = (await listSessions(scope.product.dir).catch(() => [])).filter(s => mine.includes(s.id)).map(s => ({ id: s.id, status: s.status }));
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
// The runs to show on a node's page: the ones started from it, and — when the node is a run page — that run itself,
// so the page a person reads carries the Advance that moves it.
export async function runsOnNode(scope: Scope, id: string): Promise<RunView[]> {
  return Promise.all(runsIn(scope).filter(r => r.on === id || r.id === id).map(r => viewOf(scope, r)));
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
  const parent = await ensureRunsPage(scope, project);
  const title = runTitle(w.title, node.title || on);
  const text = nodeText(node.body).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4).join(' ').slice(0, 400);
  const asked = [`Started by ${o.by} on ${on} — the ${w.title} workflow.`, ...(text ? ['', `> ${text}`] : [])].join('\n');
  const r: RunState = { id, workflow, on, stage: w.stages[0].id, status: 'running', produced: [], sessions: [], started: today(), auto: 0, file: '', log: [], docs: {}, stageSessions: {} };
  r.file = await createRunDoc(scope, project, r, { title, asked, parent });
  const fresh = await loadScope(product) ?? scope;
  await writeRun(fresh, project, r, { by: o.by, line: logLine({ what: 'started', by: o.by, detail: `${w.title} on ${on}` }) });
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
      // the name of what the stage produces must survive: slugify cuts at 60, so a long target title would give the
      // research and the PRD of one run the same slug — and the second stage would write into the first one's document
      const slug = `${slugify(node.title || docSlug(node.file)).slice(0, 48).replace(/-+$/, '')}-${name}`;
      const already = [...documentTree(scope.graph).byFile.values()].find(d => d.slug === slug);
      if (already) { binds[name] = already.module.id; made.push(already.module.id); continue; }
      // every document a run produces hangs off the run's own page, so the arc is one branch of the tree instead of
      // siblings scattered at the top (a run started from a node — a goal, a requirement — has no document to nest under)
      const parent = r.file ? docSlug(r.file) : scope.graph.modules.some(m => m.id === node.id) ? docSlug(node.file) : undefined;
      // a page, not a module: what a run produces is a document of the run, never a bounded area of the product
      const res = await createDocFromTemplate(scope, project, { title, template: name, parent, slug, kind: 'doc' });
      if (!res.ok) throw new Error(`${name}: ${res.message}`);
      binds[name] = res.node; made.push(res.node);
    }
    if (made.length) { await rebuild(scope.product.dir); r = { ...r, produced: [...new Set([...r.produced, ...made])], docs: { ...r.docs, ...binds } }; }

    // 2. the actions, with the produced documents among the template vars
    const vars = { ...templateVars(node), ...binds };
    const actor: Actor = { id: stage.id, title: stage.title, skills: stage.skills };
    const automation = await hooksEnabled();
    const firing: Firing = newFiring({ by: { run: runId, stage: stageId }, title: stage.title, node: node.id, event: `stage:${stageId}`, depth: autoRun(r) });
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
    const key = stageKey(stageId);
    const mine = [...new Set([...(now.stageSessions[key] ?? []), ...(r.stageSessions[key] ?? []), ...sessions])];
    await writeRun(after, project, { ...now, produced: [...new Set([...now.produced, ...r.produced])], docs: { ...now.docs, ...r.docs, ...binds }, sessions: [...new Set([...now.sessions, ...sessions])], stageSessions: { ...now.stageSessions, ...r.stageSessions, ...(mine.length ? { [key]: mine } : {}) }, stage: stageId, status: 'running' }, { by: o.by, line: logLine({ what: 'entered', stage: stageId, by: o.by, detail }) });
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
  if (!ready.ok && !o.skip) throw new Error(`${r.stage} is not ready: ${ready.rows.filter(x => !x.ok).map(x => `${x.label}${x.blocking.length ? ` (${someOf(x.blocking, 4)})` : ''}`).join('; ')}`);
  const node = scope.idx.byId.get(r.on);
  const project = projectOf(scope, node?.file ?? ''); if (!project) throw new Error('no project for the run');
  const next = nextStage(w, r.stage);
  const detail = o.skip && !ready.ok ? 'skipped, not ready' : ready.rows.map(x => x.label).join('; ');
  if (!next) {
    await writeRun(scope, project, { ...r, status: 'done', finished: today(), auto: 0 }, { by: o.by, line: logLine({ what: o.skip ? 'skipped' : 'advanced', stage: r.stage, by: o.by, detail: `${detail} — the last stage` }) });
    return { stage: null, status: 'done' };
  }
  await writeRun(scope, project, { ...r, stage: next.id, status: 'running', auto: o.by === 'the engine' ? r.auto + 1 : 0 }, { by: o.by, line: logLine({ what: o.skip ? 'skipped' : 'advanced', stage: r.stage, by: o.by, detail }) });
  await enterStage(product, runId, next.id, { by: o.by });
  return { stage: next.id, status: 'running' };
}

async function moveTo(product: string, runId: string, o: { by: string; stage?: string; status: string; what: string; detail?: string; enter: boolean; finished?: boolean }): Promise<void> {
  const scope = await loadScope(product); if (!scope) throw new Error(`no such product ${product}`);
  const r = runIn(scope, runId); if (!r) throw new Error(`${runId} is not in the graph`);
  const w = workflowOf(scope.graph, scope.idx, r.workflow);
  const stage = o.stage ?? r.stage;
  if (o.stage && !w?.stages.some(s => s.id === o.stage)) throw new Error(`${o.stage} is not a stage of ${r.workflow}`);
  const project = projectOf(scope, scope.idx.byId.get(r.on)?.file ?? ''); if (!project) throw new Error('no project for the run');
  await writeRun(scope, project, { ...r, stage, status: o.status, auto: 0, ...(o.finished ? { finished: today() } : {}) }, { by: o.by, line: logLine({ what: o.what, stage, by: o.by, ...(o.detail ? { detail: o.detail } : {}) }) });
  if (o.enter) await enterStage(product, runId, stage, { by: o.by });
}
export const reopenRun = (product: string, runId: string, stage: string, o: { by: string }) => moveTo(product, runId, { ...o, stage, status: 'running', what: 'reopened', enter: true });
export const retryRun = (product: string, runId: string, o: { by: string }) => moveTo(product, runId, { ...o, status: 'running', what: 'retried', enter: true });
export const cancelRun = (product: string, runId: string, o: { by: string }) => moveTo(product, runId, { ...o, status: 'cancelled', what: 'cancelled', enter: false, finished: true });

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

// A run written before run pages (decision:wf2.run-is-a-page) is a card in the Workflow runs document — where the
// view that lists it renders it a second time, and whose `on:` reads as a comment on the target, since type:comment
// owns that verb. The next sweep moves it: the page is written from the card's own state, the card is taken out of
// the document, and one rebuild sees both at once, so the id is never defined twice.
async function migrateRunCard(scope: Scope, project: Project, r: RunState, log: (m: string) => void): Promise<void> {
  const w = workflowOf(scope.graph, scope.idx, r.workflow);
  const node = scope.idx.byId.get(r.on);
  const parent = await ensureRunsPage(scope, project);
  const title = runTitle(w?.title ?? r.workflow.replace(/^workflow:/, ''), node?.title || r.on);
  const asked = `Started on ${r.on} — the ${w?.title ?? r.workflow} workflow.`;
  const file = await createRunDoc(scope, project, r, { title, asked, parent, rebuild: false, log: r.log });
  const runs = path.join(project.docsDir, `${RUNS_SLUG}.md`);
  claimWrite(r.id, { by: 'wye', silent: true }); claimWrite(path.relative(REPO_ROOT, runs), { by: 'wye', silent: true });
  await withFileLock(runs, async () => {
    const cur = await readFile(runs, 'utf8');
    const out = removeCard(cur, r.id);
    if (out !== null && out !== cur) await writeAtomic(runs, out);
  });
  await rebuild(scope.product.dir);
  const fresh = await loadScope(scope.product.slug) ?? scope;
  // the state is the card's — the page was just born, so only its path comes from the fresh parse
  const moved = runsIn(fresh).find(x => x.id === r.id);
  await writeRun(fresh, project, { ...r, file: moved?.file || file }, { by: 'wye', line: logLine({ what: 'moved to its own page', by: 'wye', detail: 'from a card in the Workflow runs document' }) });
  log(`${r.id}: moved to ${file}`);
}

// A document the run produced before run pages nested them — or one made when the run had no page — sits at the top
// of the tree with no parent. The run adopts it: `part-of` is written only when the document has none, so a document
// a person moved somewhere on purpose is never dragged back.
async function adoptProduced(scope: Scope, r: RunState, log: (m: string) => void): Promise<boolean> {
  let any = false;
  for (const id of [...new Set([...r.produced, ...Object.values(r.docs)])]) {
    const n = scope.idx.byId.get(id); if (!n?.file || !scope.graph.modules.some(m => m.id === id)) continue;
    const abs = path.join(REPO_ROOT, n.file);
    const done = await withFileLock(abs, async () => {
      const md = await readFile(abs, 'utf8');
      if (/^part-of:\s*\S/m.test(md.split('\n---')[0] ?? '')) return false;
      const out = patchFrontmatter(md, { 'part-of': r.id });
      if (out.error || out.md === md) return false;
      claimWrite(n.file, { by: 'wye', silent: true });
      await writeAtomic(abs, out.md);
      return true;
    });
    if (done) { any = true; log(`${r.id}: ${id} is now part of the run`); }
  }
  if (any) await rebuild(scope.product.dir);
  return any;
}

// --- the sweep: what the watcher calls after every build ---

// Only a transition is written. Anything else would rewrite a card, which rebuilds, which sweeps again.
export async function sweepRuns(product: string, log: (m: string) => void = m => console.log(`[wf] ${m}`)): Promise<void> {
  const scope = await loadScope(product); if (!scope) return;
  for (const r of runsIn(scope)) {
    if (!LIVE.has(r.status)) continue;
    // one sweep per run at a time: two rebuilds landing together would both read the old status and both write the
    // same transition, which put the same line in the log twice and rebuilt for nothing
    const key = `sweep|${r.id}`;
    if (state().busy.has(key)) continue;
    state().busy.add(key);
    try { await sweepRun(scope, r); } finally { state().busy.delete(key); }
  }
}

async function sweepRun(scope: Scope, r: RunState, log: (m: string) => void = m => console.log(`[wf] ${m}`)): Promise<void> {
  const product = scope.product.slug;
  const w = workflowOf(scope.graph, scope.idx, r.workflow);
  const stage = w?.stages.find(s => s.id === r.stage);
  const node = scope.idx.byId.get(r.on);
  const project = projectOf(scope, node?.file ?? ''); if (!project) return;
  if (!isPage(scope, r)) { await migrateRunCard(scope, project, r, log); return; }
  if (await adoptProduced(scope, r, log)) return;             // the tree changed; the next sweep reads it
  const block = (detail: string) => r.status === 'blocked' ? undefined : writeRun(scope, project, { ...r, status: 'blocked' }, { by: 'the engine', line: logLine({ what: 'blocked', stage: r.stage, by: 'the engine', detail }) });
  if (!node) { await block(`${r.on} is gone`); return; }
  if (!w || !stage) { await block(`${r.stage} is gone from ${r.workflow}`); return; }
  if (r.status === 'blocked') return;                        // a person retries, skips or cancels
  // A person can move the run from the chain itself: the step card of the stage it is on carries a status, and
  // setting it to done (or skipped) is the same gesture as pressing Advance — the engine owns those statuses
  // otherwise, so without this the change would simply be written back.
  const step = scope.idx.byId.get(stepId(r.id, r.stage));
  if (step?.status === 'done' || step?.status === 'skipped') {
    log(`${r.id}: ${step.id} was marked ${step.status} — advancing`);
    await advanceRun(product, r.id, { by: 'person', skip: step.status === 'skipped' }).catch(e => log(`${r.id}: ${e instanceof Error ? e.message : e}`));
    return;
  }
  const ready = readinessOf(stage, await ctxFor(scope, r, stage, w));
  if (ready.ok && stage.gate === 'auto') {
    if (autoRun(r) >= MAX_DEPTH) {
      if (r.status !== 'waiting') await writeRun(scope, project, { ...r, status: 'waiting' }, { by: 'the engine', line: logLine({ what: 'held', stage: r.stage, by: 'the engine', detail: `${MAX_DEPTH} automatic stages in a row — waiting for a person` }) });
      return;
    }
    log(`${r.id}: ${r.stage} is ready and automatic — advancing`);
    await advanceRun(product, r.id, { by: 'the engine' });
    return;
  }
  // A status transition is logged; anything else just refreshes the page's Stages and Blocking, which writeRun skips
  // when they already say what they should — so this converges instead of rebuilding for ever.
  if (ready.ok && r.status !== 'waiting') await writeRun(scope, project, { ...r, status: 'waiting' }, { by: 'the engine', line: logLine({ what: 'ready', stage: r.stage, by: 'the engine', detail: ready.rows.map(x => x.label).join('; ') }) });
  else if (!ready.ok && r.status === 'waiting') await writeRun(scope, project, { ...r, status: 'running' }, { by: 'the engine', line: logLine({ what: 'not ready', stage: r.stage, by: 'the engine', detail: ready.rows.filter(x => !x.ok).map(x => x.label).join('; ') }) });
  else await writeRun(scope, project, r, { by: 'the engine' });
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
