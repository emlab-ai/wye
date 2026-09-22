// Workflows, the pure part (decision:wf2.workflow-is-a-skill): a workflow is a skill that declares stages — a
// document whose `stage:` cards are its steps, in document order, each with the same `do:` actions a hook runs, the
// documents it produces and its exit criterion. This file parses a workflow, its stages and the closed `until:`
// predicate set (decision:wf2.until-is-closed), and evaluates that criterion against a graph as readiness rows. The
// IO — starting a run, entering a stage, writing the run card — is lib/runs-run.
import { cardValue, parseAction, type HookAction } from './hooks';
import type { GraphData, GraphIndex, GraphNode } from './graph';
import { AGREED } from './pr-doc';

export type Gate = 'person' | 'auto';
export type StageDef = { id: string; title: string; actions: HookAction[]; produces: string[]; until: Predicate[]; badUntil: string[]; gate: Gate; worker?: string; skills: string[] };
export type WorkflowDef = { id: string; title: string; takes: string[]; status: string; stages: StageDef[] };

// The eleven forms an exit criterion may take. A closed set is the point: a criterion only a person can read cannot
// gate anything, and what does not parse must be visible rather than silently true.
export type Predicate =
  | { kind: 'session-done' } | { kind: 'exists'; doc: string } | { kind: 'reqs-agreed'; doc: string }
  | { kind: 'reqs-have'; doc: string; verb: string } | { kind: 'reqs-have-task'; doc: string }
  | { kind: 'no-open-question'; doc: string } | { kind: 'no-open-contradiction' }
  | { kind: 'tasks-done'; doc: string } | { kind: 'tasks-ready'; doc: string }
  | { kind: 'check-passes' } | { kind: 'manual' };

const DOC = '([a-z][a-z0-9-]*)';
// Order matters: `has a task` is read before `has <verb>`.
const FORMS: [RegExp, (m: RegExpMatchArray) => Predicate][] = [
  [/^session done$/, () => ({ kind: 'session-done' })],
  [/^manual$/, () => ({ kind: 'manual' })],
  [/^check passes$/, () => ({ kind: 'check-passes' })],
  [/^no open contradiction$/, () => ({ kind: 'no-open-contradiction' })],
  [new RegExp(`^${DOC} exists$`), m => ({ kind: 'exists', doc: m[1] })],
  [new RegExp(`^no open question in ${DOC}$`), m => ({ kind: 'no-open-question', doc: m[1] })],
  [new RegExp(`^every req in ${DOC} is agreed$`), m => ({ kind: 'reqs-agreed', doc: m[1] })],
  [new RegExp(`^every req in ${DOC} has a task$`), m => ({ kind: 'reqs-have-task', doc: m[1] })],
  [new RegExp(`^every req in ${DOC} has ([a-z][a-z-]*)$`), m => ({ kind: 'reqs-have', doc: m[1], verb: m[2] })],
  [new RegExp(`^every task in ${DOC} is done$`), m => ({ kind: 'tasks-done', doc: m[1] })],
  [new RegExp(`^every task in ${DOC} is ready$`), m => ({ kind: 'tasks-ready', doc: m[1] })],
];

// `a, b, c` → predicates; what does not parse comes back as `bad`, never dropped and never treated as satisfied.
export function parseUntil(text: string): { until: Predicate[]; bad: string[] } {
  const until: Predicate[] = []; const bad: string[] = [];
  for (const part of text.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
    let hit: Predicate | null = null;
    for (const [re, make] of FORMS) { const m = part.match(re); if (m) { hit = make(m); break; } }
    if (hit) until.push(hit); else bad.push(part);
  }
  return { until, bad };
}

// `do:` lines, `produces:` names, `until:` predicates, `gate:`. The defaults are the safe ones — the person advances,
// and a stage that starts sessions is not done before they are.
export function parseStage(n: Pick<GraphNode, 'id' | 'kind' | 'title' | 'body'>): StageDef | null {
  if (n.kind !== 'stage') return null;
  const lines = [cardValue(n.body, 'do'), ...n.body.split('\n').filter(l => /^do-\d+:/.test(l)).map(l => l.replace(/^do-\d+:\s*/, ''))].join('\n').split('\n').filter(l => l.trim());
  const actions = lines.map(parseAction).filter((a): a is HookAction => !!a);
  const produces = cardValue(n.body, 'produces').split(/[\s,]+/).filter(Boolean);
  const raw = cardValue(n.body, 'until').trim();
  const starts = actions.some(a => a.kind === 'task' || a.kind === 'run' || a.kind === 'assign');
  const { until, bad } = parseUntil(raw || (starts ? 'session done' : 'manual'));
  const gate: Gate = cardValue(n.body, 'gate') === 'auto' || /^(true|yes)$/.test(cardValue(n.body, 'auto')) ? 'auto' : 'person';
  const worker = cardValue(n.body, 'worker') || undefined;
  return { id: n.id, title: n.title || cardValue(n.body, 'title'), actions, produces, until, badUntil: bad, gate, ...(worker ? { worker } : {}), skills: cardValue(n.body, 'skills').match(/skill:[A-Za-z0-9_.\-]+/g) ?? [] };
}

// The stages of a workflow: the `stage:` cards that are part-of it, else the ones in its own document; document order.
export function workflowOf(g: Pick<GraphData, 'nodes'>, idx: Pick<GraphIndex, 'inc'>, id: string): WorkflowDef | null {
  const w = g.nodes.find(n => n.id === id && n.kind === 'workflow' && n.defined); if (!w) return null;
  const partOf = new Set((idx.inc.get(id) ?? []).filter(e => e.verb === 'part-of').map(e => e.from));
  const cards = g.nodes.filter(n => n.kind === 'stage' && n.defined && (partOf.has(n.id) || (!partOf.size && n.file === w.file)));
  const stages = [...cards].sort((a, b) => a.line - b.line).map(parseStage).filter((s): s is StageDef => !!s);
  return { id: w.id, title: w.title, takes: cardValue(w.body, 'takes').split(/[\s,]+/).filter(Boolean), status: w.status || 'active', stages };
}
export function workflowsOf(g: Pick<GraphData, 'nodes'>, idx: Pick<GraphIndex, 'inc'>): WorkflowDef[] {
  return g.nodes.filter(n => n.kind === 'workflow' && n.defined).map(n => workflowOf(g, idx, n.id)).filter((w): w is WorkflowDef => !!w);
}
export const admits = (w: WorkflowDef, kind: string) => !w.takes.length || w.takes.includes('*') || w.takes.includes(kind);
export function nextStage(w: WorkflowDef, stageId: string): StageDef | null {
  const i = w.stages.findIndex(s => s.id === stageId);
  return i < 0 || i + 1 >= w.stages.length ? null : w.stages[i + 1];
}
export const stageIndex = (w: WorkflowDef, stageId: string) => w.stages.findIndex(s => s.id === stageId);

export type Row = { label: string; ok: boolean; blocking: string[] };
export type Readiness = { rows: Row[]; ok: boolean };
// What a predicate is evaluated against: the graph, the run's `produces` bindings (a name → the document's node id),
// the sessions this stage entry started, and the project's check errors (counted only when a predicate asks).
export type RunCtx = { graph: Pick<GraphData, 'nodes'>; idx: Pick<GraphIndex, 'byId' | 'out'>; docs: Record<string, string>; sessions: { id: string; status: string }[]; checkErrors: number };

const fileOf = (ctx: RunCtx, doc: string): string | null => {
  const id = ctx.docs[doc];
  const n = id ? ctx.idx.byId.get(id) : ctx.graph.nodes.find(x => x.file.endsWith(`/${doc}.md`));
  return n?.file || null;
};
const inDoc = (ctx: RunCtx, file: string, kind: string) => ctx.graph.nodes.filter(n => n.kind === kind && n.defined && n.file === file);
const hasVerb = (ctx: RunCtx, id: string, verb: string) => (ctx.idx.out.get(id) ?? []).some(e => e.verb === verb && !!ctx.idx.byId.get(e.to)?.defined);
const row = (label: string, blocking: string[]): Row => ({ label, ok: !blocking.length, blocking });

// One predicate → one readiness row. A criterion that cannot be evaluated — an unbound document, a document with no
// requirements in it at all — is a red row, never a green one: an exit criterion nobody can compute must not let a
// stage through.
function evaluate(p: Predicate, ctx: RunCtx): Row {
  if (p.kind === 'manual') return row('advanced by hand', []);
  if (p.kind === 'session-done') return row('every session done', ctx.sessions.filter(s => s.status !== 'done').map(s => `session:${s.id}`));
  if (p.kind === 'check-passes') return row('wye check passes', ctx.checkErrors ? [`${ctx.checkErrors} check errors`] : []);
  if (p.kind === 'no-open-contradiction') {
    const open = ctx.graph.nodes.filter(n => n.kind === 'contradiction' && n.defined && !['resolved', 'dismissed', 'superseded'].includes(n.status));
    return row('no open contradiction', open.map(n => n.id));
  }
  const file = fileOf(ctx, p.doc);
  if (!file) return row(`${p.doc}: no such document yet`, [p.doc]);
  if (p.kind === 'exists') return row(`${p.doc} exists`, []);
  if (p.kind === 'reqs-agreed') {
    const reqs = inDoc(ctx, file, 'req');
    return row(`every req in ${p.doc} is agreed`, reqs.length ? reqs.filter(n => !AGREED.has(n.status)).map(n => n.id) : [`${p.doc} has no requirements`]);
  }
  if (p.kind === 'reqs-have') {
    const reqs = inDoc(ctx, file, 'req');
    return row(`every req in ${p.doc} has ${p.verb}`, reqs.length ? reqs.filter(n => !hasVerb(ctx, n.id, p.verb)).map(n => n.id) : [`${p.doc} has no requirements`]);
  }
  if (p.kind === 'reqs-have-task') {
    const tasked = new Set(ctx.graph.nodes.filter(n => n.kind === 'task' && n.defined).flatMap(n => (ctx.idx.out.get(n.id) ?? []).filter(e => e.verb === 'part-of').map(e => e.to)));
    const reqs = inDoc(ctx, file, 'req');
    return row(`every req in ${p.doc} has a task`, reqs.length ? reqs.filter(n => !tasked.has(n.id)).map(n => n.id) : [`${p.doc} has no requirements`]);
  }
  if (p.kind === 'no-open-question') return row(`no open question in ${p.doc}`, inDoc(ctx, file, 'question').filter(n => !['answered', 'resolved', 'dismissed'].includes(n.status)).map(n => n.id));
  if (p.kind === 'tasks-done') return row(`every task in ${p.doc} is done`, inDoc(ctx, file, 'task').filter(n => n.status !== 'done').map(n => n.id));
  return row(`every task in ${p.doc} is ready`, inDoc(ctx, file, 'task').filter(n => cardValue(n.body, 'ready') !== 'true' && !cardValue(n.body, 'worker')).map(n => n.id));
}

// The readiness of a stage: one row per predicate, plus a red row for every `until` clause that did not parse.
export function readinessOf(stage: StageDef, ctx: RunCtx): Readiness {
  const rows = [...stage.badUntil.map(b => row(`until: "${b}" is not a criterion this engine knows`, [b])), ...stage.until.map(p => evaluate(p, ctx))];
  return { rows, ok: rows.every(r => r.ok) };
}
