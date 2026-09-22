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
// What a predicate asks for, in words — the row's label, and what the Stages chain shows for a stage not reached yet.
export function untilLabel(p: Predicate): string {
  switch (p.kind) {
    case 'manual': return 'advanced by hand';
    case 'session-done': return 'every session done';
    case 'check-passes': return 'wye check passes';
    case 'no-open-contradiction': return 'no open contradiction';
    case 'exists': return `${p.doc} exists`;
    case 'reqs-agreed': return `every req in ${p.doc} is agreed`;
    case 'reqs-have': return `every req in ${p.doc} has ${p.verb}`;
    case 'reqs-have-task': return `every req in ${p.doc} has a task`;
    case 'no-open-question': return `no open question in ${p.doc}`;
    case 'tasks-done': return `every task in ${p.doc} is done`;
    default: return `every task in ${p.doc} is ready`;
  }
}
export const untilLabels = (s: StageDef): string[] => [...s.until.map(untilLabel), ...s.badUntil.map(b => `"${b}" (not a criterion this engine knows)`)];

function evaluate(p: Predicate, ctx: RunCtx): Row {
  if (p.kind === 'manual') return row(untilLabel(p), []);
  if (p.kind === 'session-done') return row(untilLabel(p), ctx.sessions.filter(s => s.status !== 'done').map(s => `session:${s.id}`));
  if (p.kind === 'check-passes') return row(untilLabel(p), ctx.checkErrors ? [`${ctx.checkErrors} check errors`] : []);
  if (p.kind === 'no-open-contradiction') {
    const open = ctx.graph.nodes.filter(n => n.kind === 'contradiction' && n.defined && !['resolved', 'dismissed', 'superseded'].includes(n.status));
    return row(untilLabel(p), open.map(n => n.id));
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

// One run of a workflow (decision:wf2.run-holds-the-state). The log is a `log:` block scalar on the card rather than
// content blocks under it: one write per move, and a person reads the history in the card itself.
export type RunState = { id: string; workflow: string; on: string; stage: string; status: string; produced: string[]; sessions: string[]; started: string; finished?: string; log: string[]; auto: number; file: string; docs: Record<string, string>; stageSessions: Record<string, string[]> };
export const LIVE = new Set(['running', 'waiting', 'blocked']);
const listOf = (v: string) => v.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean);

// A run from its node: the frontmatter of its document (decision:wf2.run-is-a-page) or, for a run written before
// there were run pages, its card. `auto` is the consecutive auto-advance count — state, not a derived value, so the
// cap survives a restart; the log lives in the document's `## Log` and is read by lib/runs-run, not from here.
export function parseRun(n: Pick<GraphNode, 'id' | 'kind' | 'status' | 'body' | 'file'>): RunState | null {
  if (n.kind !== 'run') return null;
  const v = (k: string) => cardValue(n.body, k);
  if (!v('workflow')) return null;
  const finished = v('finished');
  const log = v('log').split('\n').map(l => l.replace(/^-\s+/, '').trim()).filter(Boolean);
  // `doc-<name>: <id>` per produced document: what the stage called it, written when it was made — a name can never be
  // recovered from the slug, which slugify may have truncated
  const docs: Record<string, string> = {};
  for (const m of n.body.matchAll(/^doc-([a-z][a-z0-9-]*):\s*(\S+)\s*$/gm)) docs[m[1]] = m[2];
  // `session-<stage>: [id, …]` — which sessions each stage started, so its step card can name the one at work
  const stageSessions: Record<string, string[]> = {};
  for (const m of n.body.matchAll(/^session-([a-z0-9][a-z0-9-]*):\s*(.+)$/gm)) stageSessions[m[1]] = listOf(m[2]);
  return { id: n.id, workflow: v('workflow'), on: v('runs-on') || v('on'), stage: v('stage'), status: n.status || 'running', produced: listOf(v('produced')), sessions: listOf(v('sessions')), started: v('started'), ...(finished ? { finished } : {}), log, auto: Number(v('auto')) || 0, file: n.file ?? '', docs, stageSessions };
}
// A run written before run pages: its card, kept so those runs still move.
export function runCard(r: RunState): string {
  const rows = [`workflow: ${r.workflow}`, `runs-on: ${r.on}`, `stage: ${r.stage}`, `status: ${r.status}`, `produced: [${r.produced.join(', ')}]`, `sessions: [${r.sessions.join(', ')}]`, `started: ${r.started}`, ...(r.finished ? [`finished: ${r.finished}`] : [])];
  const log = r.log.length ? `\n  log: |\n${r.log.map(l => `    - ${l}`).join('\n')}` : '';
  void r.auto;
  return `- id: ${r.id}\n${rows.map(l => `  ${l}`).join('\n')}${log}\n`;
}
// The card of an id replaced in place — its `- id:` line and every line indented under it. null when it is not there.
export function replaceCard(md: string, id: string, card: string): string | null {
  const lines = md.split('\n');
  const start = lines.findIndex(l => new RegExp(`^-\\s+id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(l));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (/^\s+\S/.test(lines[end]) || (!lines[end].trim() && /^\s+\S/.test(lines[end + 1] ?? '')))) end++;
  return [...lines.slice(0, start), ...card.replace(/\n$/, '').split('\n'), ...lines.slice(end)].join('\n');
}
// The card of an id taken out of the document, with the blank line it leaves. null when it is not there.
export function removeCard(md: string, id: string): string | null {
  const lines = md.split('\n');
  const start = lines.findIndex(l => new RegExp(`^-\\s+id:\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(l));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (/^\s+\S/.test(lines[end]) || (!lines[end].trim() && /^\s+\S/.test(lines[end + 1] ?? '')))) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}
export function runSlug(workflow: string, taken: Iterable<string>): string {
  const base = workflow.replace(/^workflow:/, '');
  const used = new Set([...taken]);
  for (let n = 1; ; n++) { const id = `run:${base}-${n}`; if (!used.has(id)) return id; }
}
export function logLine(o: { what: string; stage?: string; by: string; detail?: string }): string {
  return `${o.what}${o.stage ? ` ${o.stage}` : ''} — by ${o.by}${o.detail ? `, ${o.detail}` : ''}`;
}
// How many `auto` advances happened in a row: an all-auto workflow stops at MAX_DEPTH rather than running away (the
// cap hooks already use for their chains). A person's move — advance, reopen, skip, retry — puts it back to nought.
export const autoRun = (r: Pick<RunState, 'auto'>) => r.auto;

// --- the run page's sections (decision:wf2.run-is-a-page) ---

// Every stage of the workflow in order and where the run is: what is done, what is running now, what is still ahead,
// with the documents each one produced. This is the answer to "where has this got to".
// The run's stages as nodes, written when the run starts so the whole chain is in the graph from the first moment
// (decision:wf2.run-is-a-page): one `step:` card per stage of the workflow, in order. Their statuses are a projection
// of the run's own state — the engine rewrites them on every move, so the page, the graph and the run agree.
export const stageKey = (stageId: string) => stageId.split('.').pop() ?? stageId.replace(/^stage:/, '');
export const stepId = (runId: string, stageId: string) => `step:${runId.replace(/^run:/, '')}.${stageKey(stageId)}`;
// A long list of ids is unreadable on a card and in the strip: show the first few and say how many more there are.
export function someOf(ids: string[], keep = 6): string {
  return ids.length <= keep ? ids.join(', ') : `${ids.slice(0, keep).join(', ')} and ${ids.length - keep} more`;
}

// `running` only while the stage's own work is out. Once its sessions have ended and its criterion is still unmet,
// what is left is the person's — agreeing what was written, answering what it asked — and that is `review`, not a
// stage that looks busy with nothing running.
export function stepStatus(r: RunState, at: number, i: number, ready: boolean, working = false): string {
  if (r.status === 'done') return 'done';
  if (r.status === 'cancelled') return i < at ? 'done' : 'skipped';
  if (i < at) return 'done';
  if (i > at) return 'todo';
  if (r.status === 'blocked') return 'blocked';
  if (ready) return 'ready';
  return working ? 'running' : 'review';
}

export function stagesSection(w: WorkflowDef, r: RunState, bindings: Record<string, string> = {}, rows: Row[] = [], working = false): string {
  const at = stageIndex(w, r.stage);
  const ready = rows.length > 0 && rows.every(x => x.ok);
  const head = `The stages of this run, in order — each one starts only when the one before it has met its \`needs\`. **To move the run on: press Advance on the strip at the top of this page, or set the stage's status below to \`done\`** (or \`wye run advance ${r.id}\`). A stage whose gate is automatic moves on by itself.`;
  const cards = w.stages.map((s, i) => {
    const status = stepStatus(r, at, i, ready, working);
    const made = s.produces.map(n => bindings[n]).filter(Boolean);
    const needs = i === at && rows.length
      ? rows.map(x => `${x.ok ? '✓' : '○'} ${x.label}${x.blocking.length ? ` (${someOf(x.blocking)})` : ''}`).join(' · ')
      : untilLabels(s).join(' · ');
    const starts = i === w.stages.length - 1 ? 'the run ends' : w.stages[i + 1].title;
    return [
      `- id: ${stepId(r.id, s.id)}`,
      `  title: ${i + 1}. ${s.title}`,
      `  status: ${status}`,
      `  stage: ${s.id}`,
      `  part-of: ${r.id}`,
      `  needs: ${needs || 'nothing'}`,
      `  then: ${starts}${s.gate === 'auto' ? ' — automatic' : ''}`,
      ...(made.length ? [`  produced: [${made.join(', ')}]`] : s.produces.length ? [`  produces: ${s.produces.join(', ')}`] : []),
      ...((r.stageSessions[stageKey(s.id)] ?? []).length ? [`  session: ${(r.stageSessions[stageKey(s.id)] ?? []).map(x => `session:${x}`).join(', ')}`] : []),
    ].join('\n');
  });
  return [head, '', '```yaml', ...cards, '```'].join('\n');
}
export function blockingSection(rows: Row[], gate: Gate, o: { next?: string; over?: boolean; run?: string } = {}): string {
  if (o.over) return '_The run is over._';
  if (!rows.length) return '_Nothing is checked for this stage._';
  const lines = rows.map(x => `- ${x.ok ? '✓' : '○'} ${x.label}${x.blocking.length ? ` — ${x.blocking.join(', ')}` : ''}`);
  const open = rows.filter(x => !x.ok).length;
  const what = o.next ? `start **${o.next}**` : 'finish the run';
  const how = o.run ? ` — the Advance button at the top of this page, or \`wye run advance ${o.run}\`` : '';
  const lead = open === 0
    ? gate === 'person' ? `**Ready — nothing is missing.** Advance to ${what}${how}.` : `**Ready — nothing is missing.** This stage moves on by itself and will ${what}.`
    : o.next ? `**Waiting on ${open} of ${rows.length}** — **${o.next}** cannot start until these hold:` : `**Waiting on ${open} of ${rows.length}** before the run can finish:`;
  return [lead, '', ...lines].join('\n');
}

// A section the engine owns: what is under the heading, up to the next `## `, is replaced (the twin of pr-doc#withResult).
export function withSection(md: string, heading: string, body: string): string {
  const m = md.match(new RegExp(`^## ${heading}[^\\n]*\\n`, 'm'));
  if (!m || m.index === undefined) return `${md.replace(/\s+$/, '')}\n\n## ${heading}\n\n${body}\n`;
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const next = rest.search(/^## /m);
  const end = next === -1 ? md.length : start + next;
  return `${md.slice(0, start)}\n${body}\n${next === -1 ? '' : '\n'}${md.slice(end)}`;
}
