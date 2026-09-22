# Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can run a named, ordered, gated pipeline on any node or document — idea → research → PRD → tech design + test design → plan → dispatched work — where each stage is a session following an editable skill and each stage ends at the person's Advance.

**Architecture:** A workflow is a skill that declares stages (`type:workflow extends type:skill`), so it lives in the existing skill system and is started by the existing `run` action. A `run:` card holds the state of one run; readiness is computed on demand from the graph and never written. The engine is a second caller of the machinery hooks already built: the same action vocabulary, the same `runAction` runner (generalised from a hook to an actor), the same firing store, the same depth cap.

**Tech Stack:** TypeScript, Next.js App Router (packages/web), vitest for the pure halves, node markdown parser in `lib/parse.js`, yaml cards in markdown as the only store.

**Spec:** `docs/superpowers/specs/2026-09-22-workflows-design.md` — read it before Task 1 and keep it open; every task below cites the section it implements.

## Global Constraints

- **Markdown is canonical.** Every piece of run state is a yaml card in a document under `data/products/<p>/projects/<proj>/docs/`. `_build/graph.json` is derived. No new store, no database, no JSON state file of its own.
- **Readiness is never written to a card.** It is computed on demand. A derived value written into markdown is rewritten on every rebuild, and every rewrite triggers another rebuild.
- **Everything a stage writes is `proposed`** and goes through the Inbox, exactly as a hook's work does.
- **No new action runner.** `hooks-run.ts#runAction` is generalised to take an actor; the workflow engine calls it.
- **House style, matching the files you are editing:** a comment header at the top of each new lib file saying what it is and citing the node ids / decisions it implements; dense single-purpose exported functions; pure logic in `lib/<x>.ts` and IO in `lib/<x>-run.ts`; tests as `lib/<x>.test.ts` beside the file.
- **The id prefixes are `workflow:`, `stage:`, `run:`.** The runs document is `workflow-runs.md` (`runs.md` is already eval runs in this repo's own evaluation project).
- **Predicate vocabulary is closed** — exactly the eleven forms in spec §2. An unparseable `until` is an error surfaced by `wye check`, never a silently-true criterion.
- Run `npx --workspace=packages/web vitest run src/lib/<file>.test.ts` for a single test file; `npm test` from the repo root runs everything (node tests + the kinds check + web vitest).

---

### Task 1: The three types in the base ontology

Spec §1. The parser needs `type:workflow`, `type:stage` and `type:run` before anything can parse; `schema/kinds.yaml` is generated from these cards and `npm test` fails if it drifts.

**Files:**
- Modify: `schema/base-ontology.md` (after the `type:hook` card, before `type:template`)
- Modify: `packages/web/src/lib/props.ts:19` (the `STATUSES` list)
- Regenerate: `schema/kinds.yaml` (via `npm run kinds`)

**Interfaces:**
- Consumes: nothing.
- Produces: the kinds `workflow`, `stage`, `run` exist for the parser; `STATUSES` includes `running` and `waiting` so the UI status picker can show a run's state.

- [ ] **Step 1: Add the three type cards**

In `schema/base-ontology.md`, immediately after the `type:hook` card:

```yaml
- id: type:workflow
  extends: type:skill
  purpose: >
    an ordered, gated pipeline a person runs on any node or document (decision:wf2.workflow-is-a-skill): a document
    `workflow-<slug>.md` under the project's Skills page whose `stage:` cards are its stages, in document order. A
    skill that declares stages is executed by the app, never pasted into a session's prompt — that is the whole
    difference between the two. `takes:` says which kinds it may be started on (`*`, or a comma-separated list).
  open: true
  statuses: [active, paused]
  props:
    takes: string?
- id: type:stage
  extends: type:node
  purpose: >
    one step of a workflow, a card in its document: `do:` the actions a hook also runs (task / run / add / assign /
    notify / dispatch), `produces:` the documents it creates from templates/docs when they are absent, `until:` its
    exit criterion in the closed predicate set (decision:wf2.until-is-closed), `gate:` person (the default — the
    person advances) or auto. A stage with no actions is a review stop.
  open: true
  props:
    do: text?
    produces: string?
    until: string?
    gate: enum [person, auto]?
    worker: string?
    skills: list of skill?
- id: type:run
  extends: type:node
  purpose: >
    one run of a workflow (decision:wf2.run-holds-the-state): a card in the project's Workflow runs document saying
    which workflow, what it runs on, the stage it is at, its status, the documents it produced and the sessions it
    started; its content blocks are the log. Readiness is computed from the graph on demand, never stored here.
  open: true
  statuses: [running, waiting, blocked, done, cancelled]
  props:
    workflow: list of workflow? -(inverse)-> runs
    on: list of node? -(inverse)-> run-by
    stage: list of stage? -(inverse)-> stage-of
    produced: list of node? -(inverse)-> produced-by
    sessions: list of string?
    started: string?
    finished: string?
```

- [ ] **Step 2: Add the two missing statuses**

In `packages/web/src/lib/props.ts`, the `STATUSES` array: add `'running'` and `'waiting'` after `'building'`.

- [ ] **Step 3: Regenerate kinds.yaml and run the checks**

```bash
npm run kinds
wye build --root data/products/wye && wye check --root data/products/wye
```
Expected: `kinds.yaml` gains the three kinds; the build succeeds; `wye check` reports no new errors (it may report pre-existing ones — compare against `git stash`-clean output if unsure).

- [ ] **Step 4: Commit**

```bash
git add schema/base-ontology.md schema/kinds.yaml packages/web/src/lib/props.ts
git commit -m "workflows: type:workflow, type:stage and type:run in the base ontology"
```

---

### Task 2: `lib/runs.ts` — parsing a workflow and its stages

Spec §1, §2 (the card forms). Pure; no IO.

**Files:**
- Create: `packages/web/src/lib/runs.ts`
- Create: `packages/web/src/lib/runs.test.ts`

**Interfaces:**
- Consumes: `hooks.ts#cardValue`, `hooks.ts#parseAction`, `hooks.ts#HookAction`; `graph.ts#GraphData`, `GraphNode`, `GraphIndex`.
- Produces:
  - `type Gate = 'person' | 'auto'`
  - `type StageDef = { id: string; title: string; actions: HookAction[]; produces: string[]; until: Predicate[]; badUntil: string[]; gate: Gate; worker?: string; skills: string[] }`
  - `type WorkflowDef = { id: string; title: string; takes: string[]; status: string; stages: StageDef[] }`
  - `parseStage(n: Pick<GraphNode,'id'|'kind'|'title'|'body'>): StageDef | null`
  - `workflowsOf(g: Pick<GraphData,'nodes'>, idx: Pick<GraphIndex,'inc'>): WorkflowDef[]`
  - `workflowOf(g, idx, id: string): WorkflowDef | null`
  - `admits(w: WorkflowDef, kind: string): boolean`
  - `nextStage(w: WorkflowDef, stageId: string): StageDef | null`

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/lib/runs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseStage, workflowOf, admits, nextStage } from './runs';
import type { GraphData, GraphNode } from './graph';

const node = (id: string, o: Partial<GraphNode> = {}): GraphNode => ({ id, kind: id.split(':')[0], title: o.title ?? id, status: o.status ?? '', section: '', subsection: '', file: o.file ?? 'data/products/p/projects/x/docs/workflow-feature.md', line: o.line ?? 1, body: o.body ?? '', defined: true, ...o });
const idx = (edges: GraphData['edges']) => ({ inc: edges.reduce((m, e) => { (m.get(e.to) ?? m.set(e.to, []).get(e.to)!).push(e); return m; }, new Map<string, GraphData['edges']>()) });

describe('stage cards', () => {
  it('parses actions, produces, until, gate and the defaults', () => {
    const s = parseStage(node('stage:f.prd', { body: 'id: stage:f.prd\ntitle: Write the PRD\ndo: task "Write the PRD for {{title}} in {{prd}}" --worker agent --skill skill:prd\nproduces: prd\nuntil: every req in prd is agreed, no open question in prd\ngate: person' }))!;
    expect(s.actions).toEqual([{ kind: 'task', text: 'Write the PRD for {{title}} in {{prd}}', worker: 'agent', skill: 'skill:prd' }]);
    expect(s.produces).toEqual(['prd']);
    expect(s.until).toEqual([{ kind: 'reqs-agreed', doc: 'prd' }, { kind: 'no-open-question', doc: 'prd' }]);
    expect(s.gate).toBe('person');
    expect(s.badUntil).toEqual([]);
  });
  it('defaults: gate person, until session-done when it starts sessions, manual when it does not', () => {
    expect(parseStage(node('stage:a', { body: 'do: task "x" --worker agent' }))!.until).toEqual([{ kind: 'session-done' }]);
    expect(parseStage(node('stage:a', { body: 'title: A review stop' }))!.until).toEqual([{ kind: 'manual' }]);
    expect(parseStage(node('stage:a', { body: 'do: task "x"\ngate: auto' }))!.gate).toBe('auto');
    expect(parseStage(node('stage:a', { body: 'do: task "x"\nauto: true' }))!.gate).toBe('auto');
    expect(parseStage(node('req:a'))).toBeNull();
  });
  it('keeps an unparseable until as badUntil, never as a true criterion', () => {
    const s = parseStage(node('stage:a', { body: 'do: task "x"\nuntil: when it feels right' }))!;
    expect(s.until).toEqual([]); expect(s.badUntil).toEqual(['when it feels right']);
  });
});

describe('a workflow', () => {
  const wf = node('workflow:feature', { title: 'Feature', status: 'active', body: 'id: workflow:feature\ntakes: module, goal' });
  const s1 = node('stage:f.research', { line: 20, body: 'do: task "r" --worker agent' });
  const s2 = node('stage:f.prd', { line: 30, body: 'do: task "p" --worker agent' });
  const g = { nodes: [wf, s2, s1] } as Pick<GraphData, 'nodes'>;
  const edges = [{ from: 'stage:f.research', verb: 'part-of', to: 'workflow:feature' }, { from: 'stage:f.prd', verb: 'part-of', to: 'workflow:feature' }] as GraphData['edges'];
  it('collects its stages in document order and reads takes', () => {
    const w = workflowOf(g, idx(edges), 'workflow:feature')!;
    expect(w.stages.map(s => s.id)).toEqual(['stage:f.research', 'stage:f.prd']);
    expect(w.takes).toEqual(['module', 'goal']);
    expect(admits(w, 'module')).toBe(true); expect(admits(w, 'req')).toBe(false);
    expect(nextStage(w, 'stage:f.research')!.id).toBe('stage:f.prd');
    expect(nextStage(w, 'stage:f.prd')).toBeNull();
  });
  it('admits every kind when takes is * or absent, and falls back to the document for stages', () => {
    const bare = node('workflow:w', { body: 'id: workflow:w' });
    const w = workflowOf({ nodes: [bare, node('stage:w.one', { line: 9 })] }, idx([]), 'workflow:w')!;
    expect(admits(w, 'anything')).toBe(true);
    expect(w.stages.map(s => s.id)).toEqual(['stage:w.one']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --workspace=packages/web vitest run src/lib/runs.test.ts`
Expected: FAIL — `Failed to resolve import "./runs"`.

- [ ] **Step 3: Write `lib/runs.ts` — the parsing half**

```ts
// Workflows, the pure part (decision:wf2.workflow-is-a-skill): a workflow is a skill that declares stages — a
// document whose `stage:` cards are its steps, in document order. This file parses a workflow and its stages, the
// closed `until:` predicate set (decision:wf2.until-is-closed) and evaluates it against a graph; the IO — starting a
// run, entering a stage, writing the run card — is lib/runs-run.
import { cardValue, parseAction, type HookAction } from './hooks';
import type { GraphData, GraphIndex, GraphNode } from './graph';

export type Gate = 'person' | 'auto';
export type StageDef = { id: string; title: string; actions: HookAction[]; produces: string[]; until: Predicate[]; badUntil: string[]; gate: Gate; worker?: string; skills: string[] };
export type WorkflowDef = { id: string; title: string; takes: string[]; status: string; stages: StageDef[] };

// `do:` lines, `produces:` names, `until:` predicates, `gate:`; the defaults are the safe ones — the person advances,
// and a stage that starts sessions is not done before they are.
export function parseStage(n: Pick<GraphNode, 'id' | 'kind' | 'title' | 'body'>): StageDef | null {
  if (n.kind !== 'stage') return null;
  const lines = [cardValue(n.body, 'do'), ...n.body.split('\n').filter(l => /^do-\d+:/.test(l)).map(l => l.replace(/^do-\d+:\s*/, ''))].join('\n').split('\n').filter(l => l.trim());
  const actions = lines.map(parseAction).filter((a): a is HookAction => !!a);
  const produces = cardValue(n.body, 'produces').split(/[\s,]+/).filter(Boolean);
  const raw = cardValue(n.body, 'until').trim();
  const { until, bad } = parseUntil(raw || (actions.some(a => a.kind === 'task' || a.kind === 'run' || a.kind === 'assign') ? 'session done' : 'manual'));
  const gate: Gate = cardValue(n.body, 'gate') === 'auto' || /^(true|yes)$/.test(cardValue(n.body, 'auto')) ? 'auto' : 'person';
  const worker = cardValue(n.body, 'worker') || undefined;
  return { id: n.id, title: n.title || cardValue(n.body, 'title'), actions, produces, until, badUntil: bad, gate, ...(worker ? { worker } : {}), skills: cardValue(n.body, 'skills').match(/skill:[A-Za-z0-9_.\-]+/g) ?? [] };
}

// The stages of a workflow: the `stage:` cards that are part-of it, else the ones in its own document; document order.
export function workflowOf(g: Pick<GraphData, 'nodes'>, idx: Pick<GraphIndex, 'inc'>, id: string): WorkflowDef | null {
  const w = g.nodes.find(n => n.id === id && n.kind === 'workflow' && n.defined); if (!w) return null;
  const partOf = new Set((idx.inc.get(id) ?? []).filter(e => e.verb === 'part-of').map(e => e.from));
  const cards = g.nodes.filter(n => n.kind === 'stage' && n.defined && (partOf.has(n.id) || (!partOf.size && n.file === w.file)));
  const stages = cards.sort((a, b) => a.line - b.line).map(parseStage).filter((s): s is StageDef => !!s);
  const takes = cardValue(w.body, 'takes').split(/[\s,]+/).filter(Boolean);
  return { id: w.id, title: w.title, takes, status: w.status || 'active', stages };
}
export function workflowsOf(g: Pick<GraphData, 'nodes'>, idx: Pick<GraphIndex, 'inc'>): WorkflowDef[] {
  return g.nodes.filter(n => n.kind === 'workflow' && n.defined).map(n => workflowOf(g, idx, n.id)).filter((w): w is WorkflowDef => !!w);
}
export const admits = (w: WorkflowDef, kind: string) => !w.takes.length || w.takes.includes('*') || w.takes.includes(kind);
export function nextStage(w: WorkflowDef, stageId: string): StageDef | null {
  const i = w.stages.findIndex(s => s.id === stageId);
  return i < 0 || i + 1 >= w.stages.length ? null : w.stages[i + 1];
}
```

Add `parseUntil` and the `Predicate` type in the same file (Task 3 tests them in detail; this task needs them to exist):

```ts
export type Predicate =
  | { kind: 'session-done' } | { kind: 'exists'; doc: string } | { kind: 'reqs-agreed'; doc: string }
  | { kind: 'reqs-have'; doc: string; verb: string } | { kind: 'reqs-have-task'; doc: string }
  | { kind: 'no-open-question'; doc: string } | { kind: 'no-open-contradiction' }
  | { kind: 'tasks-done'; doc: string } | { kind: 'tasks-ready'; doc: string }
  | { kind: 'check-passes' } | { kind: 'manual' };

const DOC = '([a-z][a-z0-9-]*)';
// The closed set (spec §2). Order matters: `has a task` is read before `has <verb>`.
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
// `a, b, c` → predicates; what does not parse is returned as bad, never dropped and never treated as satisfied.
export function parseUntil(text: string): { until: Predicate[]; bad: string[] } {
  const until: Predicate[] = []; const bad: string[] = [];
  for (const part of text.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
    const hit = FORMS.map(([re, make]) => { const m = part.match(re); return m ? make(m) : null; }).find(Boolean);
    if (hit) until.push(hit); else bad.push(part);
  }
  return { until, bad };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx --workspace=packages/web vitest run src/lib/runs.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/runs.ts packages/web/src/lib/runs.test.ts
git commit -m "workflows: parse a workflow's stages and its until predicates"
```

---

### Task 3: `lib/runs.ts` — evaluating readiness

Spec §2, §3 ("Compute readiness"). Still pure: a stage plus a context in, readiness rows out.

**Files:**
- Modify: `packages/web/src/lib/runs.ts`
- Modify: `packages/web/src/lib/runs.test.ts`

**Interfaces:**
- Consumes: `parseUntil`, `Predicate`, `StageDef` from Task 2; `pr-doc.ts#AGREED`; `hooks.ts#cardValue`.
- Produces:
  - `type Row = { label: string; ok: boolean; blocking: string[] }`
  - `type Readiness = { rows: Row[]; ok: boolean }`
  - `type RunCtx = { graph: Pick<GraphData,'nodes'>; idx: Pick<GraphIndex,'byId'|'out'>; docs: Record<string, string>; sessions: { id: string; status: string }[]; checkErrors: number }`
  - `readinessOf(stage: StageDef, ctx: RunCtx): Readiness`

- [ ] **Step 1: Write the failing test**

Append to `packages/web/src/lib/runs.test.ts`:

```ts
import { readinessOf, parseUntil, type RunCtx, type StageDef } from './runs';

const PRD = 'data/products/p/projects/x/docs/prd.md';
const ctxOf = (nodes: GraphNode[], edges: GraphData['edges'] = [], over: Partial<RunCtx> = {}): RunCtx => ({
  graph: { nodes: [node('module:prd', { file: PRD }), ...nodes] },
  idx: { byId: new Map([...nodes, node('module:prd', { file: PRD })].map(n => [n.id, n])), out: edges.reduce((m, e) => { const a = m.get(e.from) ?? []; a.push(e); m.set(e.from, a); return m; }, new Map<string, GraphData['edges']>()) },
  docs: { prd: 'module:prd' }, sessions: [], checkErrors: 0, ...over,
});
const stage = (until: string): StageDef => parseStage(node('stage:s', { body: `do: task "x" --worker agent\nuntil: ${until}` }))!;

describe('readiness', () => {
  it('every req in prd is agreed — names the ones that are not', () => {
    const r = readinessOf(stage('every req in prd is agreed'), ctxOf([node('req:a', { file: PRD, status: 'approved' }), node('req:b', { file: PRD, status: 'proposed' })]));
    expect(r.ok).toBe(false); expect(r.rows[0].blocking).toEqual(['req:b']);
  });
  it('every req in prd has satisfied-by — a dangling target does not count', () => {
    const nodes = [node('req:a', { file: PRD, status: 'approved' }), node('req:b', { file: PRD, status: 'approved' }), node('decision:d', { file: 'x.md' })];
    const edges = [{ from: 'req:a', verb: 'satisfied-by', to: 'decision:d' }, { from: 'req:b', verb: 'satisfied-by', to: 'decision:ghost' }] as GraphData['edges'];
    const r = readinessOf(stage('every req in prd has satisfied-by'), ctxOf(nodes, edges));
    expect(r.ok).toBe(false); expect(r.rows[0].blocking).toEqual(['req:b']);
  });
  it('session done, tasks ready and done, open questions, contradictions, check', () => {
    expect(readinessOf(stage('session done'), ctxOf([], [], { sessions: [{ id: 's1', status: 'done' }] })).ok).toBe(true);
    expect(readinessOf(stage('session done'), ctxOf([], [], { sessions: [{ id: 's1', status: 'running' }] })).rows[0].blocking).toEqual(['session:s1']);
    expect(readinessOf(stage('every task in prd is ready'), ctxOf([node('task:t', { file: PRD, body: 'id: task:t\nready: true' })])).ok).toBe(true);
    expect(readinessOf(stage('every task in prd is ready'), ctxOf([node('task:t', { file: PRD, body: 'id: task:t' })])).ok).toBe(false);
    expect(readinessOf(stage('every task in prd is done'), ctxOf([node('task:t', { file: PRD, status: 'done' })])).ok).toBe(true);
    expect(readinessOf(stage('no open question in prd'), ctxOf([node('question:q', { file: PRD, status: 'answered' })])).ok).toBe(true);
    expect(readinessOf(stage('no open question in prd'), ctxOf([node('question:q', { file: PRD, status: '' })])).rows[0].blocking).toEqual(['question:q']);
    expect(readinessOf(stage('check passes'), ctxOf([], [], { checkErrors: 2 })).ok).toBe(false);
    expect(readinessOf(stage('manual'), ctxOf([])).ok).toBe(true);
  });
  it('an unbound document or an unparseable until is never green', () => {
    expect(readinessOf(stage('every req in plan is agreed'), ctxOf([])).ok).toBe(false);
    const s = parseStage(node('stage:s', { body: 'do: task "x"\nuntil: when it feels right' }))!;
    const r = readinessOf(s, ctxOf([]));
    expect(r.ok).toBe(false); expect(r.rows[0].label).toContain('when it feels right');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --workspace=packages/web vitest run src/lib/runs.test.ts`
Expected: FAIL — `readinessOf is not a function`.

- [ ] **Step 3: Implement `readinessOf`**

Append to `packages/web/src/lib/runs.ts`:

```ts
import { AGREED } from './pr-doc';

export type Row = { label: string; ok: boolean; blocking: string[] };
export type Readiness = { rows: Row[]; ok: boolean };
// What a predicate is evaluated against: the graph, the run's `produces` bindings (name → the document's node id),
// the sessions this stage entry started, and the project's check errors.
export type RunCtx = { graph: Pick<GraphData, 'nodes'>; idx: Pick<GraphIndex, 'byId' | 'out'>; docs: Record<string, string>; sessions: { id: string; status: string }[]; checkErrors: number };

const fileOf = (ctx: RunCtx, doc: string): string | null => { const id = ctx.docs[doc]; const n = id ? ctx.idx.byId.get(id) : ctx.graph.nodes.find(x => x.file.endsWith(`/${doc}.md`)); return n?.file || null; };
const inDoc = (ctx: RunCtx, file: string, kind: string) => ctx.graph.nodes.filter(n => n.kind === kind && n.defined && n.file === file);
const hasVerb = (ctx: RunCtx, id: string, verb: string) => (ctx.idx.out.get(id) ?? []).some(e => e.verb === verb && !!ctx.idx.byId.get(e.to)?.defined);
const row = (label: string, blocking: string[]): Row => ({ label, ok: !blocking.length, blocking });

// One predicate → one readiness row. A criterion that cannot be evaluated — an unbound document, a name that did not
// parse — is a red row, never a green one: an exit criterion nobody can compute must not let a stage through.
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
  if (p.kind === 'reqs-agreed') { const reqs = inDoc(ctx, file, 'req'); return row(`every req in ${p.doc} is agreed`, reqs.length ? reqs.filter(n => !AGREED.has(n.status)).map(n => n.id) : [`${p.doc} has no requirements`]); }
  if (p.kind === 'reqs-have') { const reqs = inDoc(ctx, file, 'req'); return row(`every req in ${p.doc} has ${p.verb}`, reqs.length ? reqs.filter(n => !hasVerb(ctx, n.id, p.verb)).map(n => n.id) : [`${p.doc} has no requirements`]); }
  if (p.kind === 'reqs-have-task') { const reqs = inDoc(ctx, file, 'req'); const tasked = new Set(ctx.graph.nodes.filter(n => n.kind === 'task' && n.defined).flatMap(n => (ctx.idx.out.get(n.id) ?? []).filter(e => e.verb === 'part-of').map(e => e.to))); return row(`every req in ${p.doc} has a task`, reqs.filter(n => !tasked.has(n.id)).map(n => n.id)); }
  if (p.kind === 'no-open-question') return row(`no open question in ${p.doc}`, inDoc(ctx, file, 'question').filter(n => !['answered', 'resolved', 'dismissed'].includes(n.status)).map(n => n.id));
  if (p.kind === 'tasks-done') return row(`every task in ${p.doc} is done`, inDoc(ctx, file, 'task').filter(n => n.status !== 'done').map(n => n.id));
  return row(`every task in ${p.doc} is ready`, inDoc(ctx, file, 'task').filter(n => cardValue(n.body, 'ready') !== 'true' && !cardValue(n.body, 'worker')).map(n => n.id));
}

export function readinessOf(stage: StageDef, ctx: RunCtx): Readiness {
  const rows = [...stage.badUntil.map(b => row(`until: "${b}" is not a criterion this engine knows`, [b])), ...stage.until.map(p => evaluate(p, ctx))];
  return { rows, ok: rows.every(r => r.ok) };
}
```

Note: `exists` returns green once `fileOf` resolved — the document existing is what the predicate asks. `every req in <doc> is agreed` on a document with no requirements is **not** green: an empty PRD must not pass its own gate.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx --workspace=packages/web vitest run src/lib/runs.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/runs.ts packages/web/src/lib/runs.test.ts
git commit -m "workflows: readiness rows from the until predicates, computed never stored"
```

---

### Task 4: Two new actions, and the runner generalised from a hook to an actor

Spec §4. `run workflow:<id>` and `dispatch <doc> [--workers N]` join the shared vocabulary; `runAction` stops being hook-shaped so the run engine can call it.

**Files:**
- Modify: `packages/web/src/lib/hooks.ts:19` (`HookAction`), `:33-45` (`parseAction`)
- Modify: `packages/web/src/lib/hooks-run.ts` (`Firing`, `runAction`, `taskUnder`, `assignExisting`, `startSkillSession`, `addFromTemplate`, `fire`)
- Modify: `packages/web/src/lib/hooks.test.ts`
- Modify: `packages/web/src/components/HooksSection.tsx:9` (`actionText`)

**Interfaces:**
- Consumes: Task 2's parsing (unchanged).
- Produces:
  - `HookAction` gains `{ kind: 'workflow'; workflow: string }` and `{ kind: 'dispatch'; doc: string; workers?: number }`
  - `type Actor = { id: string; title: string; skills: string[] }`
  - `Firing.by?: { hook?: string; run?: string; stage?: string }` (the existing `hook` field stays)
  - `runAction(scope: Scope, actor: Actor, a: HookAction, ev: HookEvent, node: GraphNode | undefined, f: Firing, log: (m: string) => void): Promise<FiringAction>` — exported now
  - `saveFiring(productDir, f)` and `newFiring(...)` exported for the run engine

- [ ] **Step 1: Write the failing test**

In `packages/web/src/lib/hooks.test.ts`, inside the `describe('hook cards')` block's `it('parses actions')`, add:

```ts
    expect(parseAction('run workflow:feature')).toEqual({ kind: 'workflow', workflow: 'workflow:feature' });
    expect(parseAction('dispatch plan')).toEqual({ kind: 'dispatch', doc: 'plan' });
    expect(parseAction('dispatch plan --workers 3')).toEqual({ kind: 'dispatch', doc: 'plan', workers: 3 });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --workspace=packages/web vitest run src/lib/hooks.test.ts`
Expected: FAIL — `parseAction('run workflow:feature')` returns `{ kind: 'run', skill: 'skill:workflow:feature' }` or null.

- [ ] **Step 3: Extend the action type and parser**

In `hooks.ts`, extend `HookAction`:

```ts
export type HookAction = { kind: 'run'; skill: string } | { kind: 'workflow'; workflow: string } | { kind: 'add'; template: string; to?: string } | { kind: 'task'; text: string; worker?: string; skill?: string } | { kind: 'assign'; task: string; worker?: string; skill?: string } | { kind: 'notify'; text: string } | { kind: 'dispatch'; doc: string; workers?: number };
```

In `parseAction`, **before** the two `run` clauses (so `workflow:` is not read as a skill name):

```ts
  if ((m = l.match(/^run\s+workflow:([A-Za-z0-9_.\-]+)$/))) return { kind: 'workflow', workflow: `workflow:${m[1]}` };
```

and after the `assign` clause:

```ts
  if ((m = l.match(/^dispatch\s+([a-z][a-z0-9-]*)(.*)$/))) { const o = flags(m[2]); return { kind: 'dispatch', doc: m[1], ...(o.workers ? { workers: Number(o.workers) } : {}) }; }
```

- [ ] **Step 4: Generalise the runner**

In `hooks-run.ts`:

1. `export type Actor = { id: string; title: string; skills: string[] };` and `const actorOf = (h: HookDef): Actor => ({ id: h.id, title: h.title, skills: h.skills });`
2. `Firing` gains `by?: { hook?: string; run?: string; stage?: string }`; keep `hook: string` as it is so `firedSet` and the existing records are untouched.
3. Change `runAction(scope, h: HookDef, …)` to `export async function runAction(scope: Scope, actor: Actor, …)` and inside it replace every `h.id` with `actor.id` and `h.skills` with `actor.skills`. The same substitution in `taskUnder`, `assignExisting`, `notify`, `addFromTemplate` and `startSkillSession` (their `h: HookDef` parameters become `actor: Actor`); `by` becomes `actor.id` (it is already an id with its prefix, so drop the `hook:` re-prefixing: `const by = actor.id`).
4. In `fire`, the call site becomes `runAction(scope, actorOf(h), a, ev, node, f, log)`.
5. Add the two new action cases at the end of `runAction`:

```ts
  if (a.kind === 'workflow') { if (!node) throw new Error(`${ev.id} is not in the graph`); const { startRun } = await import('./runs-run'); const r = await startRun(scope.product.slug, a.workflow, node.id, { by: actor.id }); return { kind: 'workflow', added: [r.run] }; }
  if (a.kind === 'dispatch') { const { dispatchDoc } = await import('./runs-run'); return { kind: 'dispatch', added: await dispatchDoc(scope, a.doc, { workers: a.workers, by: actor.id }) }; }
```

(The dynamic imports keep `hooks-run` and `runs-run` free of an import cycle; both are server-only modules, so the cost is nil.)

6. `export { saveFiring };` and add `export function newFiring(o: { by: Firing['by']; node: string; event: string; depth: number }): Firing` returning `{ id: randomBytes(5).toString('hex'), hook: '', title: '', at: new Date().toISOString(), actions: [], ...o }` with `title` taken from the caller — the run engine passes the stage's title.

7. In `listFirings`' consumers, nothing changes: `f.hook` is `''` for a run's firing, and `HooksSection` already filters with `data.firings.filter(f => f.hook)`.

- [ ] **Step 5: Show the new actions in the column**

In `components/HooksSection.tsx`, extend `actionText`: `a.kind === 'workflow' ? \`run ${a.workflow}\` : a.kind === 'dispatch' ? \`dispatch ${a.doc}\` : …` and add `workflow?: string; doc?: string` to the local `Hook['actions']` type.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx --workspace=packages/web vitest run src/lib/hooks.test.ts && npx --workspace=packages/web tsc --noEmit`
Expected: PASS; tsc silent. `runs-run.ts` does not exist yet, so leave the two dynamic imports until Task 5 and run tsc again there — if tsc complains now, comment the two new cases with a `// Task 5` note and restore them in Task 5's Step 1.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/hooks.ts packages/web/src/lib/hooks-run.ts packages/web/src/lib/hooks.test.ts packages/web/src/components/HooksSection.tsx
git commit -m "workflows: run workflow: and dispatch actions; the runner takes an actor, not a hook"
```

---

### Task 5: `lib/runs-run.ts` — the engine

Spec §3. Starting a run, entering a stage, advancing, and the state transitions. The pure helpers that build and patch the run card are tested; the IO is verified live in Task 12.

**Files:**
- Create: `packages/web/src/lib/runs-run.ts`
- Create: `packages/web/src/lib/doc-create.ts`
- Modify: `packages/web/src/lib/runs.ts` (the card helpers below)
- Modify: `packages/web/src/lib/runs.test.ts`
- Modify: `packages/web/src/app/api/[product]/[project]/doc/route.ts:28-35` (use the extracted helper)
- Modify: `packages/web/src/lib/templates.ts:1` (`TEMPLATES` gains `'research'`)

**Interfaces:**
- Consumes: Tasks 2–4; `scope.ts#loadScope`, `mainProject`; `skills.ts#ensureSkillsPage` as the pattern for `ensureRunsPage`; `instances.ts#appendCard`; `node-edit.ts#patchYamlCard`; `write.ts#writeAtomic|withFileLock|rebuild|lint`; `hooks-run.ts#runAction|newFiring|saveFiring|Actor`; `work-io.ts#assignTask`; `settings.ts#readSettings|agentSettings`; `sessions.ts#listSessions`.
- Produces (pure, in `runs.ts`):
  - `type RunState = { id: string; workflow: string; on: string; stage: string; status: string; produced: string[]; sessions: string[]; started: string; finished?: string }`
  - `parseRun(n: Pick<GraphNode,'id'|'kind'|'status'|'body'>): RunState | null`
  - `runCard(r: RunState): string`
  - `runSlug(workflow: string, taken: Iterable<string>): string`
  - `logLine(o: { what: string; stage?: string; by: string; detail?: string }): string`
  - `LIVE = new Set(['running','waiting','blocked'])`
- Produces (IO, in `runs-run.ts`):
  - `startRun(product, workflow, on, { by, again? }): Promise<{ run: string }>`
  - `enterStage(product, runId, stageId, { by }): Promise<void>`
  - `advanceRun(product, runId, { by, skip? }): Promise<{ stage: string | null; status: string }>`
  - `reopenRun(product, runId, stageId, { by }): Promise<void>`
  - `retryRun(product, runId, { by }): Promise<void>`
  - `cancelRun(product, runId, { by }): Promise<void>`
  - `listRuns(scope): Promise<(RunState & { workflowTitle: string; onTitle: string; readiness: Readiness; stageTitle: string; step: number; of: number })[]>`
  - `runsOnNode(scope, id): Promise<…same…>`
  - `ctxFor(scope, run, stage): Promise<RunCtx>`
  - `dispatchDoc(scope, doc, { workers?, by }): Promise<string[]>`
  - `sweepRuns(product): Promise<void>` — the rebuild hook (Task 6 calls it)

- [ ] **Step 1: Write the failing test for the card helpers**

Append to `packages/web/src/lib/runs.test.ts`:

```ts
import { parseRun, runCard, runSlug, logLine, LIVE } from './runs';

describe('the run card', () => {
  const r = { id: 'run:feature-3', workflow: 'workflow:feature', on: 'module:idea', stage: 'stage:f.prd', status: 'waiting', produced: ['module:idea-prd'], sessions: ['abc123'], started: '2026-09-22' };
  it('round-trips through yaml', () => {
    const md = runCard(r);
    expect(md).toContain('- id: run:feature-3');
    expect(md).toContain('  workflow: workflow:feature');
    expect(md).toContain('  produced: [module:idea-prd]');
    const back = parseRun(node('run:feature-3', { status: 'waiting', body: md.replace(/^- /, '').replace(/^ {2}/gm, '') }))!;
    expect(back).toEqual(r);
  });
  it('numbers a run after the ones already taken, and knows which are live', () => {
    expect(runSlug('workflow:feature', ['run:feature-1', 'run:other-7'])).toBe('run:feature-2');
    expect(runSlug('workflow:feature', [])).toBe('run:feature-1');
    expect([...LIVE]).toEqual(['running', 'waiting', 'blocked']);
  });
  it('writes a log line naming who did what', () => {
    expect(logLine({ what: 'advanced', stage: 'stage:f.prd', by: 'alex', detail: 'every req in prd is agreed' }))
      .toBe('- advanced stage:f.prd — by alex, every req in prd is agreed');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --workspace=packages/web vitest run src/lib/runs.test.ts`
Expected: FAIL — `parseRun is not a function`.

- [ ] **Step 3: Implement the card helpers in `runs.ts`**

```ts
export type RunState = { id: string; workflow: string; on: string; stage: string; status: string; produced: string[]; sessions: string[]; started: string; finished?: string };
export const LIVE = new Set(['running', 'waiting', 'blocked']);
const list = (v: string) => v.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean);

export function parseRun(n: Pick<GraphNode, 'id' | 'kind' | 'status' | 'body'>): RunState | null {
  if (n.kind !== 'run') return null;
  const v = (k: string) => cardValue(n.body, k);
  if (!v('workflow')) return null;
  const finished = v('finished');
  return { id: n.id, workflow: v('workflow'), on: v('on'), stage: v('stage'), status: n.status || 'running', produced: list(v('produced')), sessions: list(v('sessions')), started: v('started'), ...(finished ? { finished } : {}) };
}
export function runCard(r: RunState): string {
  const rows = [`id: ${r.id}`, `workflow: ${r.workflow}`, `on: ${r.on}`, `stage: ${r.stage}`, `status: ${r.status}`, `produced: [${r.produced.join(', ')}]`, `sessions: [${r.sessions.join(', ')}]`, `started: ${r.started}`, ...(r.finished ? [`finished: ${r.finished}`] : [])];
  return `- ${rows[0]}\n${rows.slice(1).map(l => `  ${l}`).join('\n')}\n`;
}
export function runSlug(workflow: string, taken: Iterable<string>): string {
  const base = workflow.replace(/^workflow:/, '');
  const used = new Set([...taken]);
  for (let n = 1; ; n++) { const id = `run:${base}-${n}`; if (!used.has(id)) return id; }
}
export function logLine(o: { what: string; stage?: string; by: string; detail?: string }): string {
  return `- ${o.what}${o.stage ? ` ${o.stage}` : ''} — by ${o.by}${o.detail ? `, ${o.detail}` : ''}`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx --workspace=packages/web vitest run src/lib/runs.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Extract document creation into `lib/doc-create.ts`**

Move the body of the POST in `app/api/[product]/[project]/doc/route.ts` (lines 24–35: slug, conflict check, template read, `instantiate`, the `part-of` and typed-card fixups, `writeAtomic`) into:

```ts
// Creating a page in a project from a template — the one path the doc route, a hook and a workflow stage all use
// (rule:page-node-line: a typed page's card is its frontmatter, so the template's module card is dropped).
export async function createDocFromTemplate(scope: Scope, project: Project, o: { title: string; template: string; parent?: string; kind?: string }): Promise<{ ok: true; slug: string; node: string } | { ok: false; error: 'conflict' | 'invalid'; message: string }>
```

with the identical logic, and have the route call it. `TEMPLATES` in `lib/templates.ts` gains `'research'`.

- [ ] **Step 6: Implement `runs-run.ts`**

```ts
// Workflows, the IO part (decision:wf2.workflow-is-a-skill, decision:wf2.run-holds-the-state): starting a run on a
// node, entering a stage — the documents it produces created from templates/docs when absent, its `do:` actions run
// through the hook runner with the run as the actor — and the person's moves: advance, reopen, skip, retry, cancel.
// Readiness is computed on demand (lib/runs#readinessOf), never written to the card. The run's state is the card in
// the project's Workflow runs document; its content blocks are the log.
```

Key functions, in order:

- `ensureRunsPage(project, root)`: `workflow-runs.md` from a new `templates/docs/workflow-runs.md` (Task 11 ships the template; for now inline the four-line skeleton with `<!-- view:run -->`), node `module:<project>-workflow-runs`, exactly as `skills.ts#ensurePage` does.
- `writeRun(scope, r: RunState, log?: string)`: `withFileLock` on the runs file; `patchYamlCard(md, r.id, { status: r.status, props: {...} })` when the card is there, else `appendCard(md, runCard(r))`; append `log` under the card's content when given; `claimWrite(r.id, { by })`; `writeAtomic`; `await rebuild(scope.product.dir)`.
- `startRun(product, workflow, on, { by, again })`: load scope; `workflowOf` — throw `` `${workflow} is not a workflow` `` when missing, `'the workflow is paused'` when its status is paused, `` `${workflow} does not run on a ${kind}` `` when `!admits`; throw `'a run is already live on that node — pass again to start another'` when a live run exists for (workflow, on) and `!again`; throw `'the workflow has no stages'` when empty; write the card with the first stage, `status: 'running'`, `started: today`; log `logLine({ what: 'started', by })`; then `enterStage`.
- `enterStage(product, runId, stageId, { by })`:
  1. For each `produces` name: if a document of that slug already exists under the target (`<targetSlug>-<name>` or the name itself when the target is the project root), reuse it; else `createDocFromTemplate(scope, project, { title: \`${targetTitle} — ${name}\`, template: name, parent: targetDocSlug })`. Record the node ids in `produced`.
  2. `docs` bindings: `{ [name]: nodeId }`.
  3. `const actor: Actor = { id: stage.id, title: stage.title, skills: stage.skills }` and for each action `await runAction(scope, actor, filled(a), ev, targetNode, firing, log)` where `ev = { kind: targetNode.kind, id: targetNode.id, event: `stage:${stage.id}` }` and `filled` replaces `{{name}}` in a `task`/`notify` text with the bound document ids (`fillTemplate` with `{ ...templateVars(target), ...bindings }`). A `dispatch` action's `doc` resolves through the bindings too.
  4. `const firing = newFiring({ by: { run: runId, stage: stageId }, node: target.id, event: `stage:${stageId}`, depth })` — `depth` is the run's auto-advance depth (see `advanceRun`); `saveFiring` before and after the actions, as `fire` does.
  5. Collect the session ids the actions returned into the run's `sessions`; write the card and the log line `entered`.
- `ctxFor(scope, run, stage)`: `{ graph: scope.graph, idx: scope.idx, docs: bindingsOf(scope, run, stage), sessions: (await listSessions(dir)).filter(s => run.sessions.includes(s.id)).map(s => ({ id: s.id, status: s.status })), checkErrors: stage.until.some(p => p.kind === 'check-passes') ? errorsOf(await lint(dir)) : 0 }` — `lint` is only run when a predicate asks for it, so the common sweep stays cheap. `errorsOf` counts lines matching `/^\s*error/i` in the output.
- `advanceRun(product, runId, { by, skip })`: refuse unless `skip` or `readinessOf(...).ok` (throw with the blocking row labels); `nextStage`; when there is none → `status: 'done'`, `finished: today`, log `finished`; else log `advanced` (or `skipped`) and `enterStage` the next.
- `reopenRun(product, runId, stageId, { by })`: set `stage`, `status: 'running'`, log `reopened`, `enterStage`.
- `retryRun` = `enterStage` on the current stage with `status: 'running'` and a `retried` log line. `cancelRun` sets `status: 'cancelled'`, `finished`.
- `dispatchDoc(scope, doc, { workers, by })`: the tasks in that document (`kind === 'task'`, `defined`, file matches) that are ready (`cardValue(body,'ready') === 'true'`) and unheld (no `worker`), oldest first, capped by `workers ?? agentSettings(await readSettings()).parallel` minus the sessions already live; each through `assignTask(scope, id, { worker: settings.agent, wfUrl, by, force: true })`. Returns the task ids assigned.
- **The two guards that live in `enterStage`:** a module-level `busy` set keyed `` `${runId}|${stageId}` `` held for the duration of the entry, so a burst of rebuilds cannot run one stage's actions twice (the same pattern as `hooks-run`'s `state().busy`); and, when `await hooksEnabled()` is false, every `task` action's `worker` is dropped before it is run — the tasks are written `#ready` and nothing starts an agent (spec §3, "When automation is off").
- `sweepRuns(product)`: for every live run — `readinessOf`; `running` + ok + `gate: person` → write `waiting`; `running`/`waiting` + ok + `gate: auto` → `advanceRun` (only when the auto-advance depth is under `MAX_DEPTH`, counted as the number of consecutive `auto` stages advanced without a person's move — read it off the log lines, `nextDepth` refuses past the cap); `waiting` + !ok → back to `running`; a run whose `on` no longer resolves → `blocked` with `the node it runs on is gone`. **Write only on a transition** — never rewrite a card whose state is unchanged, or the rebuild it triggers sweeps again.

- [ ] **Step 7: Restore the two action cases and typecheck**

Uncomment the `workflow` / `dispatch` cases in `hooks-run.ts#runAction` if Task 4 Step 6 parked them.

Run: `npx --workspace=packages/web tsc --noEmit && npx --workspace=packages/web vitest run src/lib`
Expected: tsc silent; all vitest files pass.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/lib/runs.ts packages/web/src/lib/runs-run.ts packages/web/src/lib/runs.test.ts packages/web/src/lib/doc-create.ts packages/web/src/lib/templates.ts 'packages/web/src/app/api/[product]/[project]/doc/route.ts'
git commit -m "workflows: the engine — start a run, enter a stage, advance, reopen, skip, retry, cancel"
```

---

### Task 6: The engine on the rebuild and on a session's end

Spec §3 ("Compute readiness", the guards). Nothing advances unless the graph changed or a session ended.

**Files:**
- Modify: `packages/web/src/lib/watch.ts` (the `onBuilt` listener that already calls `fire`; bump its `VERSION`)
- Modify: `packages/web/src/lib/runs-run.ts` (the `onSessionEnd` listener)

**Interfaces:**
- Consumes: `sweepRuns` from Task 5; `sessions.ts#onSessionEnd`; `hooks-run.ts#hooksEnabled`.
- Produces: nothing new; the engine now runs by itself.

- [ ] **Step 1: Call `sweepRuns` where hooks are fired**

In `watch.ts`, in the same listener that calls `fire(...)` after a rebuild, add `await sweepRuns(product).catch(e => log(\`runs: ${e instanceof Error ? e.message : e}\`));` **after** the hooks fire (a hook may have started a run; sweeping after means the new run is seen in the same pass). Bump the file's `VERSION` constant so a dev server re-arms the watcher.

- [ ] **Step 2: Block a run whose session failed, at the end of the session**

In `runs-run.ts`, at the bottom, beside how `hooks-run.ts` registers its own listener:

```ts
// A session a stage started that ended anything but done blocks its run: the person retries, skips or cancels.
onSessionEnd(async (productDir, s) => {
  const product = s.product;
  const scope = await loadScope(product); if (!scope) return;
  for (const r of runsIn(scope)) {
    if (!LIVE.has(r.status) || !r.sessions.includes(s.id)) continue;
    if (s.status === 'done') continue;
    await writeRun(scope, { ...r, status: 'blocked' }, logLine({ what: 'blocked', stage: r.stage, by: 'the engine', detail: `session ${s.id} ended ${s.status}` }));
  }
  await sweepRuns(product).catch(() => { /* the sweep logs its own */ });
}, 'runs');
```

- [ ] **Step 3: Verify the wiring by hand**

```bash
npm run dev    # in another terminal
curl -s localhost:3456/api/wye/events >/dev/null &   # arm the watcher
```
Expected: the dev log prints the watcher's new VERSION. No run exists yet, so the sweep is a no-op — confirm it does not throw by touching a document (`touch data/products/wye/projects/v2/docs/todo.md`) and watching the log stay clean.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/watch.ts packages/web/src/lib/runs-run.ts
git commit -m "workflows: sweep the live runs on every rebuild; a failed session blocks its run"
```

---

### Task 7: The API

Spec §5. Two routes, shaped like `/api/[product]/hooks`.

**Files:**
- Create: `packages/web/src/app/api/[product]/workflows/route.ts`
- Create: `packages/web/src/app/api/[product]/runs/route.ts`

**Interfaces:**
- Consumes: `workflowsOf`, `admits`, `startRun`, `listRuns`, `runsOnNode`, `advanceRun`, `reopenRun`, `retryRun`, `cancelRun`.
- Produces:
  - `GET /api/<p>/workflows[?node=<id>]` → `{ workflows: [{ id, title, takes, status, stages: [{ id, title, actions, produces, until, badUntil, gate }], bad: string[] }] }`; with `?node=` only the workflows that `admits` the node's kind.
  - `POST /api/<p>/workflows` `{ workflow, on, again? }` → `{ ok: true, run }`; 422 with the thrown message.
  - `GET /api/<p>/runs[?node=<id>]` → `{ runs: [...listRuns()] }` (with readiness), narrowed to the node.
  - `POST /api/<p>/runs` `{ run, action: 'advance'|'skip'|'reopen'|'retry'|'cancel', stage? }` → `{ ok: true, ...result }`; 422 with the message.

- [ ] **Step 1: Write the workflows route**

```ts
import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { workflowsOf, admits } from '@/lib/runs';
import { startRun } from '@/lib/runs-run';

// op:api.workflows — GET → the product's workflows with their stages (and the `until` lines that do not parse, so a
// broken criterion is visible before it gates anything); ?node=<id> narrows to the ones that run on that kind.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = new URL(req.url).searchParams.get('node');
  const kind = node ? scope.idx.byId.get(node)?.kind ?? node.split(':')[0] : null;
  const workflows = workflowsOf(scope.graph, scope.idx)
    .filter(w => !kind || admits(w, kind))
    .map(w => ({ ...w, bad: w.stages.flatMap(s => s.badUntil.map(b => `${s.id}: ${b}`)) }));
  return NextResponse.json({ workflows }, { headers: { 'cache-control': 'no-store' } });
}

// POST { workflow, on, again? } → a run starts on that node.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json().catch(() => ({})) as { workflow?: string; on?: string; again?: boolean };
  if (!b.workflow || !b.on) return NextResponse.json({ error: 'invalid', message: 'workflow and on required' }, { status: 422 });
  try { const r = await startRun(product, b.workflow, b.on, { by: 'person', again: b.again }); return NextResponse.json({ ok: true, ...r }); }
  catch (e) { return NextResponse.json({ error: 'invalid', message: e instanceof Error ? e.message : String(e) }, { status: 422 }); }
}
```

(`by: 'person'` is the marker the change log already uses for a person's write — `lib/changes.ts`.)

- [ ] **Step 2: Write the runs route**

The same shape: GET returns `listRuns(scope)` or `runsOnNode(scope, node)`; POST switches on `action` over `advanceRun(product, run, { by, skip: action === 'skip' })`, `reopenRun(product, run, stage, { by })`, `retryRun`, `cancelRun`, and returns 422 with the thrown message for anything refused.

- [ ] **Step 3: Verify both by hand**

```bash
curl -s localhost:3456/api/wye/workflows | head -c 400
curl -s localhost:3456/api/wye/runs | head -c 400
```
Expected: `{"workflows":[]}` and `{"runs":[]}` before Task 11 ships a workflow — not a 500.

- [ ] **Step 4: Commit**

```bash
git add 'packages/web/src/app/api/[product]/workflows' 'packages/web/src/app/api/[product]/runs'
git commit -m "workflows: the workflows and runs API"
```

---

### Task 8: The CLI

Spec §5. `wye workflow` and `wye run`, in the shape of `wye hooks`.

**Files:**
- Modify: `bin/wye.js` (the `--help` block near line 52, and the command table)

**Interfaces:**
- Consumes: the Task 7 routes.
- Produces: `wye workflow list|show <id>|run <id> --on <node> [--again]`, `wye workflows` (alias of list), `wye run list|show <id>|advance <id>|skip <id>|reopen <id> --stage <s>|retry <id>|cancel <id>`.

- [ ] **Step 1: Add the help lines**

After the `wye hooks` line in the help block:

```
//   wye workflow list|show <id>             the product's workflows (decision:wf2.workflow-is-a-skill): stages, what each produces, its gate
//   wye workflow run <id> --on <node>       start a run on a node or document (--again to start a second one)
//   wye run list|show <id>                  the runs: workflow, what it runs on, the stage, its readiness
//   wye run advance|skip|retry|cancel <id>  the person's moves; wye run reopen <id> --stage <s> goes back
```

- [ ] **Step 2: Add the commands**

```js
  async workflow() {
    const sub = pos[1] || 'list';
    if (sub === 'run') {
      const j = await api('POST', `/api/${product()}/workflows`, { workflow: pos[2], on: flags.on, again: !!flags.again });
      return console.log(`${j.run} started`);
    }
    const j = await api('GET', `/api/${product()}/workflows`);
    if (!j.workflows.length) return console.log('no workflows — add a workflow-<slug>.md under the project\'s Skills page');
    for (const w of j.workflows) {
      if (sub === 'show' && w.id !== pos[2]) continue;
      console.log(`${w.id.padEnd(28)} ${w.status.padEnd(7)} on ${w.takes.join(', ') || '*'} · ${w.stages.length} stages`);
      if (sub === 'show') for (const s of w.stages) console.log(`  ${s.id.padEnd(26)} ${s.gate.padEnd(7)} ${s.produces.join(', ').padEnd(22)} ${s.until.map(u => u.kind).join(', ')}`);
      for (const b of w.bad) console.log(`  ! ${b} — not a criterion this engine knows`);
    }
  },
  async run() {
    const sub = pos[1] || 'list';
    if (['advance', 'skip', 'reopen', 'retry', 'cancel'].includes(sub)) {
      const j = await api('POST', `/api/${product()}/runs`, { run: pos[2], action: sub, stage: flags.stage });
      return console.log(`${pos[2]} ${sub}d${j.stage ? ` → ${j.stage}` : ''}${j.status ? ` (${j.status})` : ''}`);
    }
    const j = await api('GET', `/api/${product()}/runs`);
    if (!j.runs.length) return console.log('no runs — wye workflow run <id> --on <node>');
    for (const r of j.runs) {
      if (sub === 'show' && r.id !== pos[2]) continue;
      console.log(`${r.id.padEnd(22)} ${r.status.padEnd(9)} ${r.workflow.replace('workflow:', '').padEnd(14)} on ${r.on.padEnd(26)} ${r.stageTitle} (${r.step}/${r.of})`);
      if (sub === 'show') for (const row of r.readiness.rows) console.log(`  ${row.ok ? '✓' : '·'} ${row.label}${row.blocking.length ? ` — ${row.blocking.join(', ')}` : ''}`);
    }
  },
```

Register `workflows: cmds.workflow` as the alias.

- [ ] **Step 3: Verify**

Run: `wye workflow list --product wye && wye run list --product wye`
Expected: the two "no workflows / no runs" lines, no stack trace.

- [ ] **Step 4: Commit**

```bash
git add bin/wye.js
git commit -m "workflows: wye workflow and wye run"
```

---

### Task 9: ⌘P — the Workflow mode

Spec §5. A third mode beside PR and Ad-hoc; with no target, the typed idea becomes a document first.

**Files:**
- Modify: `packages/web/src/components/CommandBox.tsx:36-38` (mode state), `:101` (`isPr`), `:156-157` (the chip strip), the submit path
- Modify: `packages/web/src/components/CommandBox.tsx` header comment (say what the third mode does)

**Interfaces:**
- Consumes: `GET /api/<p>/workflows?node=<id>`, `POST /api/<p>/workflows`, `POST /api/<p>/<project>/doc`, `GET /api/<p>/projects`.
- Produces: nothing other code consumes.

- [ ] **Step 1: Widen the mode**

```ts
const [mode, setModeState] = useState<'pr' | 'adhoc' | 'workflow'>('pr');
const setMode = (m: 'pr' | 'adhoc' | 'workflow') => { setModeState(m); try { localStorage.setItem('wf-cmd-mode', m); } catch { /* ignore */ } };
```
and at line ~90 accept `'workflow'` as a remembered mode. `const isPr = mode === 'pr';` stays; add `const isWf = mode === 'workflow';`.

- [ ] **Step 2: The chip and the picker**

Beside the two existing chips:

```tsx
<button type="button" className={`chip ${isWf ? 'on' : ''}`} onClick={() => setMode('workflow')} title="Run a workflow on what you are looking at: its stages produce the documents, you advance each one">Workflow</button>
```

When `isWf`, fetch the workflows for the target once the box opens (`req.refs?.[0]` as `node`, else no `node` param) and render a `<select>` of `{id, title, stages.length}` where the agent/folder row sits in the other modes, plus a line of muted text: `stage 1 of N · <first stage title>`. Keep the selection in `const [wf, setWf] = useState('')`, defaulting to the first workflow.

- [ ] **Step 3: The submit path**

In the submit handler, before the PR / ad-hoc branches:

```ts
if (isWf) {
  let on = req.refs?.[0] ?? '';
  if (!on) { // an idea with nothing to hang it on: the box makes the document first (spec §5)
    const project = req.source?.project || (await fetch(`/api/${product}/projects`).then(r => r.json()).then(j => j.main).catch(() => ''));
    if (!project) { setMsg('no project to put the idea in'); setBusy(false); return; }
    const title = text.trim().split('\n')[0].slice(0, 80);
    const made = await fetch(`/api/${product}/${project}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, template: 'blank' }) }).then(r => r.json());
    if (!made.ok) { setMsg(made.message ?? 'the document could not be created'); setBusy(false); return; }
    on = made.node;
  }
  const r = await fetch(`/api/${product}/workflows`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: wf, on }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { setMsg(j.message ?? 'the run could not be started'); setBusy(false); return; }
  remember(text); setReq(null); setBusy(false);
  return;
}
```

The typed text becomes the document's title when a document is made; when there was a target, the text is remembered in the history but the run carries the target, not the text — the stage's skill reads the target.

- [ ] **Step 4: Verify in the app**

With the dev server running and Task 11's workflow in place: ⌘P on a document → the Workflow chip → the picker lists *Feature* → Enter → `wye run list --product wye` shows the run at stage 1. (Run this step after Task 11; until then confirm only that the chip renders and the picker is empty without throwing.)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/CommandBox.tsx
git commit -m "workflows: ⌘P runs one — a third mode, and an idea with no target becomes its document"
```

---

### Task 10: The column's Workflows section and the run strip

Spec §5.

**Files:**
- Create: `packages/web/src/components/WorkflowsSection.tsx`
- Create: `packages/web/src/components/RunStrip.tsx`
- Modify: `packages/web/src/components/PeekPanel.tsx:28,181` (mount the section beside `HooksSection`)
- Modify: `packages/web/src/app/[product]/[project]/d/[doc]/page.tsx:36` (mount the strip under `PrHead`)

**Interfaces:**
- Consumes: `GET /api/<p>/workflows?node=`, `GET /api/<p>/runs?node=`, `POST /api/<p>/runs`, `POST /api/<p>/workflows`.
- Produces: `<WorkflowsSection id={nodeId} />`, `<RunStrip product={p} node={docNodeId} />` (renders `null` with no live run).

- [ ] **Step 1: `WorkflowsSection`**

Copy `HooksSection.tsx` wholesale and change four things: it fetches both endpoints (`workflows?node=`, `runs?node=`); each workflow row reads `<id> · N stages · on <takes>` with a **Run** button that POSTs to `/workflows` (and shows the returned message on failure — "a run is already live on that node" is the one you will see); a `bad` array renders as a red line per unparseable `until`; and each live run on the node renders the stepper: `stage <step> of <of> · <stageTitle>`, one row per readiness row (`✓` / `·`, the label, the blocking ids as `SmartTag`s), and the buttons Advance (disabled unless `readiness.ok`), Reopen (a `<select>` of the workflow's stages), Skip, Retry (only when `blocked`), Cancel. Re-fetch on `wf:change` with `kinds` including `graph` or `session`, exactly as `HooksSection` does.

- [ ] **Step 2: Mount it**

In `PeekPanel.tsx`, next to line 181: `<WorkflowsSection key={`wf-${id}`} id={id} />`.

- [ ] **Step 3: `RunStrip`**

A client component: fetch `/api/<p>/runs?node=<node>`, keep the live ones, render nothing when there are none. One row per run, in `PrHead`'s existing classes: the workflow title, `stage <step> of <of> · <stageTitle>`, `<n> of <m> ready`, and the same buttons as the section. Listen on `wf:change` to refresh.

- [ ] **Step 4: Mount it**

In `d/[doc]/page.tsx`, directly after the `PrHead` line:

```tsx
<RunStrip product={product} node={d.module.id} />
```

- [ ] **Step 5: Badge the live runs on the folder row**

In the rail's folder row for the Workflow runs page, append a count of live runs when there are any (the rail already renders per-document counts — follow whatever it does for PRs). If the rail's shape makes this more than a few lines, stop and leave it: the strip and the section are the surfaces that matter, and the full rail treatment is not in this plan's scope.

- [ ] **Step 6: Verify**

Run: `npx --workspace=packages/web tsc --noEmit && npx --workspace=packages/web vitest run src/lib`
Then in the app: open a node's column → the Workflows section lists *Feature* with Run; run it → the strip appears on the document with its readiness rows.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/WorkflowsSection.tsx packages/web/src/components/RunStrip.tsx packages/web/src/components/PeekPanel.tsx 'packages/web/src/app/[product]/[project]/d/[doc]/page.tsx'
git commit -m "workflows: the column's Workflows section and the document's run strip"
```

---

### Task 11: The shipped pipeline (W2, W3)

Spec §6. Five skills, one workflow, two templates — all data, all editable in the app.

**Files:**
- Create: `prompts/research.md`, `prompts/prd.md`, `prompts/tech-design.md`, `prompts/test-design.md`, `prompts/plan.md`
- Create: `templates/docs/research.md`, `templates/docs/workflow-runs.md`, `templates/docs/workflow-feature.md`
- Modify: `packages/web/src/lib/skills.ts` (`BASE_SKILLS`, `ensureBaseWorkflows`)
- Modify: `packages/web/src/app/[product]/layout.tsx:51` (call it)

**Interfaces:**
- Consumes: `skillDocFromPrompt`, `ensureSkillsPage`, `instantiate`.
- Produces: `ensureBaseWorkflows(project: Project, root: string | null): Promise<string[]>`; the ids `skill:research`, `skill:prd`, `skill:tech-design`, `skill:test-design`, `skill:plan`, `workflow:feature`, `stage:feature.{research,prd,design,plan,dispatch}`.

- [ ] **Step 1: `templates/docs/research.md`**

```markdown
---
node: {{kind}}:{{slug}}
title: {{title}}
status: proposed
owner: unassigned
last-verified: {{date}}
part-of: {{parent}}
---

# {{title}}

## What was asked

The idea in the person's words, with its refs.

## What exists today

What the product already defines that touches this — nodes, documents, code — each one linked.

## What the outside says

Sources, each with what it actually claims and where it is from.

## What this would touch

The modules, documents and code the change would reach.

## Open questions

```yaml
- id: question:{{slug}}.first
  q: Something a person must answer before the PRD can be written.
```
```

- [ ] **Step 2: `templates/docs/workflow-runs.md`**

```markdown
---
node: {{id}}
type: module
title: Workflow runs
status: active
owner: unassigned
last-verified: {{date}}
{{root}}---

# Workflow runs

One card per run of a workflow (type:run, decision:wf2.run-holds-the-state): which workflow, what it runs on, the
stage it is at, its status, the documents it produced and the sessions it started; its content is the log. Readiness
is computed from the graph and shown on the document the run started from — it is never stored here. The person's
moves are Advance, Reopen, Skip, Retry and Cancel, on the strip or through `wye run`.

<!-- view:run -->
```

- [ ] **Step 3: `templates/docs/workflow-feature.md`** — the shipped workflow

Frontmatter `node: workflow:feature`, `type: workflow`, `title: Feature`, `status: active`, `takes: module, goal, req`, `part-of: {{parent}}`; a body that says in prose what the pipeline is; then the stages, each carrying `part-of: workflow:feature`:

```yaml
- id: stage:feature.research
  title: Explore the idea
  part-of: workflow:feature
  do: task "Research {{title}} and write it up in {{research}}" --worker agent --skill skill:research
  produces: research
  until: session done
  gate: person
- id: stage:feature.prd
  title: Write the PRD
  part-of: workflow:feature
  do: task "Write the PRD for {{title}} in {{prd}}, from {{research}}" --worker agent --skill skill:prd
  produces: prd
  until: every req in prd is agreed, no open question in prd
  gate: person
- id: stage:feature.design
  title: Tech design and test design
  part-of: workflow:feature
  do: |
    task "Tech design for {{title}} in {{dev-design}}, satisfying every req in {{prd}}" --worker agent --skill skill:tech-design
    task "Test design for {{title}} in {{test-design}}, verifying every req in {{prd}}" --worker agent --skill skill:test-design
  produces: dev-design, test-design
  until: every req in prd has satisfied-by, every req in prd has verified-by, no open contradiction
  gate: person
- id: stage:feature.plan
  title: Build the plan
  part-of: workflow:feature
  do: task "Implementation plan for {{title}} in {{plan}}: phases and tasks, each part of the req it implements" --worker agent --skill skill:plan
  produces: plan
  until: every req in prd has a task, every task in plan is ready
  gate: person
- id: stage:feature.dispatch
  title: Dispatch the work
  part-of: workflow:feature
  do: dispatch plan
  until: every task in plan is done
  gate: auto
```

Note the binding names with a hyphen (`{{dev-design}}`, `{{test-design}}`): `fillTemplate`'s pattern is `\{\{(\w+)\}\}`, which does **not** match a hyphen. Change it to `\{\{([\w-]+)\}\}` in `hooks.ts#fillTemplate` and add a test line to `hooks.test.ts`:

```ts
expect(fillTemplate('in {{dev-design}}', { 'dev-design': 'module:x-dev-design' })).toBe('in module:x-dev-design');
```

- [ ] **Step 4: The five prompts**

Each is a markdown file whose body becomes the editable skill document. Every one of them **must** state these four rules verbatim (spec §6), because the predicates depend on them:

```markdown
- Write by section: `wye doc write <doc> --section "<Heading>"`. Never replace a whole document — a person may be editing it.
- Write the traceability verb on every block you create: a decision or an operation `satisfies req:x`; a test `verifies req:x`; a task is `part-of req:x`. The inverse is generated for you; a link you do not write is a gap the stage will refuse to advance past.
- Never write an id that does not resolve. If something is undecided, write a `question:` card — not prose.
- Everything you write is `#proposed`. The person approves it.
```

Beyond that: **research** — read the graph first (`wye context`, `wye packet --for`), then the repo, then outside sources; fill the five sections of the research template; raise questions rather than deciding. **prd** — problem, goals and non-goals, then `req:` cards with `when:` / `then:` / `unless:` content blocks, ids as dotted paths, one behaviour per node; no implementation. **tech-design** — entities, value objects, state machines, operations, pages, rules, and a `decision:` card for every real choice with its alternatives and `satisfies req:x`. **test-design** — a `test:` node per area with its cases, each `verifies req:x`, and an honest "untested surfaces" list; it composes `skill:define-tests` (`skills: [skill:define-tests]` in its card). **plan** — phases with exit criteria, then `- [ ] task:` lines, each `part-of` the req it implements, `depends-on` where it must wait, `#ready` when a worker could take it.

- [ ] **Step 5: Register them**

In `skills.ts`, append to `BASE_SKILLS`:

```ts
  { slug: 'research', title: 'Explore an idea', role: 'worker', file: 'prompts/research.md', takes: '*', writes: ['question', 'decision', 'note'] },
  { slug: 'prd', title: 'Write a PRD', role: 'librarian', file: 'prompts/prd.md', takes: 'module', writes: ['req', 'goal', 'question', 'entity'] },
  { slug: 'tech-design', title: 'Write the technical design', role: 'librarian', file: 'prompts/tech-design.md', takes: 'module', writes: ['decision', 'entity', 'op', 'rule', 'state', 'page'] },
  { slug: 'test-design', title: 'Write the test design', role: 'librarian', file: 'prompts/test-design.md', takes: 'module', writes: ['test', 'ui-test', 'question'] },
  { slug: 'plan', title: 'Build the implementation plan', role: 'librarian', file: 'prompts/plan.md', takes: 'module', writes: ['task'] },
```

and add:

```ts
// The shipped workflows as documents beside the skills (decision:wf2.workflow-is-a-skill): written when missing, so a
// person can read and edit the pipeline itself. Returns the slugs written.
export async function ensureBaseWorkflows(project: Project, root: string | null): Promise<string[]> {
  const parent = await ensureSkillsPage(project, root);
  const written: string[] = [];
  for (const slug of ['feature']) {
    const file = path.join(project.docsDir, `workflow-${slug}.md`);
    if (await exists(file)) continue;
    const tpl = await readFile(path.join(REPO_ROOT, `templates/docs/workflow-${slug}.md`), 'utf8');
    await writeAtomic(file, fill(tpl, { slug, date: today(), parent }));
    written.push(slug);
  }
  return written;
}
```

In `app/[product]/layout.tsx:51`, add `await ensureBaseWorkflows(viewProject, m);` after `ensureBaseSkills`.

- [ ] **Step 6: Verify the workflow parses**

```bash
rm -rf /tmp/none && npm run dev   # open the product once so the documents are written
wye build --root data/products/wye && wye workflow show workflow:feature --product wye
```
Expected: five stages listed, each with its gate, what it produces and its predicate kinds; **no** `!` lines (a `!` means an `until` did not parse — fix the wording, not the parser).

- [ ] **Step 7: Commit**

```bash
git add prompts templates packages/web/src/lib/skills.ts 'packages/web/src/app/[product]/layout.tsx' packages/web/src/lib/hooks.ts packages/web/src/lib/hooks.test.ts
git commit -m "workflows: the Feature pipeline shipped as five skills and one workflow document"
```

---

### Task 12: The coverage view

Spec §6. The matrix a person reads before advancing the Design stage.

**Files:**
- Modify: `packages/web/src/lib/instance-table.ts` (the `coverage` flag and the derived columns)
- Modify: `packages/web/src/lib/instance-table.test.ts`
- Modify: `packages/web/src/components/InstanceTable.tsx` (render the three columns and the gap mark)

**Interfaces:**
- Consumes: `InstanceRow.rels` (`{ verb, to }[]`), already on the row.
- Produces: `coverageOf(row: InstanceRow): { satisfiedBy: string[]; verifiedBy: string[]; tasks: string[]; gap: boolean }`, and the `coverage=1` view flag.

**Deviation from the spec, on purpose:** the spec wrote this as a new `<!-- view:coverage for=prd -->` block. A new BlockNote block type plus its markdown round-trip is a large surface for what is three derived columns on a table that already exists. The markdown is `<!-- view:req coverage=1 group=doc -->` instead — the req view, with coverage columns. Same artifact, a tenth of the code.

- [ ] **Step 1: Write the failing test**

Add to `packages/web/src/lib/instance-table.test.ts`:

```ts
import { coverageOf } from './instance-table';

it('coverage: what satisfies a req, what verifies it, its tasks, and whether it is a gap', () => {
  const rels = [{ verb: 'satisfied-by', to: 'decision:d' }, { verb: 'verified-by', to: 'test:t' }, { verb: 'has', to: 'task:a' }];
  expect(coverageOf({ id: 'req:a', kind: 'req', title: '', status: '', file: '', doc: '', props: {}, rels })).toEqual({ satisfiedBy: ['decision:d'], verifiedBy: ['test:t'], tasks: ['task:a'], gap: false });
  expect(coverageOf({ id: 'req:b', kind: 'req', title: '', status: '', file: '', doc: '', props: {}, rels: [] }).gap).toBe(true);
  expect(coverageOf({ id: 'req:c', kind: 'req', title: '', status: '', file: '', doc: '', props: {}, rels: [{ verb: 'satisfied-by', to: 'decision:d' }] }).gap).toBe(true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --workspace=packages/web vitest run src/lib/instance-table.test.ts`
Expected: FAIL — `coverageOf is not a function`.

- [ ] **Step 3: Implement it**

```ts
// The coverage of a requirement (spec §6): what satisfies it, what verifies it, the tasks on it — a gap is a req
// missing either side, which is what the Design stage's criterion refuses to advance past.
export function coverageOf(r: InstanceRow): { satisfiedBy: string[]; verifiedBy: string[]; tasks: string[]; gap: boolean } {
  const to = (verb: string) => (r.rels ?? []).filter(e => e.verb === verb).map(e => e.to);
  const satisfiedBy = to('satisfied-by'), verifiedBy = to('verified-by'), tasks = to('has').filter(id => id.startsWith('task:'));
  return { satisfiedBy, verifiedBy, tasks, gap: !satisfiedBy.length || !verifiedBy.length };
}
```

- [ ] **Step 4: Render it**

In `InstanceTable.tsx`, when the view query carries `coverage=1`: three extra columns — *satisfied by*, *verified by*, *tasks* — each cell a list of `SmartTag`s, a `·` when empty; a gap row gets the muted-warning treatment the table already uses for a missing value; clicking an empty cell calls `requestSend({ text: \`Define ${col === 'verified by' ? 'test cases' : 'the design'} for ${r.id}\`, refs: [r.id] })` so ⌘P opens prefilled.

- [ ] **Step 5: Add the block to the PRD template**

In `templates/docs/prd.md`, before `## 11. Open questions`:

```markdown
## Coverage

<!-- view:req coverage=1 scope=project group=doc -->
```

- [ ] **Step 6: Run the tests**

Run: `npx --workspace=packages/web vitest run src/lib && npx --workspace=packages/web tsc --noEmit`
Expected: PASS; tsc silent.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/instance-table.ts packages/web/src/lib/instance-table.test.ts packages/web/src/components/InstanceTable.tsx templates/docs/prd.md
git commit -m "workflows: the coverage matrix — what satisfies and verifies each requirement, gaps marked"
```

---

### Task 13: One run, end to end, on a scratch product

Spec §3, §6. The parts are tested; this proves the pipeline moves.

**Files:** none (verification only; fixes go back into the task that owns them).

- [ ] **Step 1: Arm a scratch product**

```bash
wye init --product scratch-wf-1 --repo /tmp/scratch-wf-repo    # a fresh slug per run: the watcher registry is keyed
npm run dev &                                                   # or leave the existing dev server up
curl -s localhost:3456/api/scratch-wf-1/events >/dev/null &     # arm the watcher — hooks and runs do not fire without it
curl -s localhost:3456/scratch-wf-1 >/dev/null                  # open it once so the base skills and workflows are written
wye workflow list --product scratch-wf-1
```
Expected: `workflow:feature` listed, `5 stages`, no `!` lines.

- [ ] **Step 2: Start a run from the CLI and check the card**

```bash
wye doc create scratch-wf-1/main/an-idea --title "Recent commands in the box" --template blank
wye workflow run workflow:feature --on module:an-idea --product scratch-wf-1
wye run list --product scratch-wf-1
cat data/products/scratch-wf-1/projects/*/docs/workflow-runs.md
```
Expected: one `run:feature-1` at `stage:feature.research`, status `running`; a `research` document created `part-of` the idea; a task written under the idea and a session started on it (`wye session list --product scratch-wf-1`).

- [ ] **Step 3: Check that the gate holds**

```bash
wye run show run:feature-1 --product scratch-wf-1
wye run advance run:feature-1 --product scratch-wf-1
```
Expected: `show` prints the readiness rows with `·` against `every session done`; `advance` is **refused** with that row's label. This is the important assertion of the whole plan — a stage that is not ready cannot be advanced.

- [ ] **Step 4: Advance through a stage and back**

Let the session finish (or `wye session done <id>`), then:

```bash
wye run advance run:feature-1 --product scratch-wf-1     # → stage:feature.prd, a prd document appears
wye run reopen run:feature-1 --stage stage:feature.research --product scratch-wf-1
wye run show run:feature-1 --product scratch-wf-1
```
Expected: advance moves to the PRD stage and creates its document; reopen goes back and the log holds both passes; the research document is **not** recreated or overwritten.

- [ ] **Step 5: Check the surfaces**

In the app: the idea's page shows the run strip with the stage and its rows; the node's column shows the Workflows section; ⌘P → Workflow lists *Feature*; the Workflow runs page lists the run.

- [ ] **Step 6: Clean up and commit anything the run exposed**

```bash
rm -rf data/products/scratch-wf-1 /tmp/scratch-wf-repo
npm test
```
Expected: `npm test` green — the node tests, the kinds check and every vitest file.

```bash
git add -A && git commit -m "workflows: fixes from the first end-to-end run"
```

---

---

### Task 14: Write it into wye's own definition

Spec §7. Wye is described in itself; a feature that is not in the definition does not exist as far as the next session is concerned.

**Files:**
- Modify: `data/products/wye/projects/v2/docs/decisions.md`
- Modify: `data/products/wye/projects/v2/docs/requirements-agents.md`
- Modify: `README.md` (the "Skills and hooks" section)

- [ ] **Step 1: The five decisions**

Append to `decisions.md`, as cards in the form that document already uses (`date: 2026-09-22`, `status: approved`, `affects:` naming the types and nodes):

`decision:wf2.workflow-is-a-skill` — a workflow is a skill that declares stages, so there is no second registry; a skill with stages is executed by the app and never pasted into a prompt.
`decision:wf2.run-holds-the-state` — the state of a run is a `run:` card, not properties on the target, so any document can be a starting point and can be run twice.
`decision:wf2.until-is-closed` — the exit criterion comes from a closed predicate set, so it can be computed, shown as readiness rows and checked before it runs.
`decision:wf2.gate-is-the-persons` — the person advances each stage; `gate: auto` is opt-in per stage; the reason is that no predicate can see a thin PRD.
`decision:wf2.traceability-is-the-verb` — the stage's skill writes `satisfies` / `verifies`, the parser generates the inverse, the stage's criterion notices a missing one; nothing is derived or guessed.

- [ ] **Step 2: The requirements**

Add a `req:wf2.workflows` group to `requirements-agents.md` beside the existing `req:wf.pipeline` family, in that document's `when:` / `then:` form, one req per behaviour: running a workflow on any node; a stage producing its documents from templates; readiness computed and shown; the person's Advance; going back; a failed session blocking the run; the shipped Feature pipeline. Each `satisfied-by` the lib / component nodes the earlier tasks created, and `#proposed`.

- [ ] **Step 3: The README**

Rename the "Skills and hooks" section to "Skills, hooks and workflows" and add a paragraph: a workflow is a skill with stages; an idea run through it becomes research, a PRD, a tech and test design, a plan and dispatched work; each stage ends at your Advance; `wye workflow` and `wye run` from the terminal. Add the two new rows to the CLI table.

- [ ] **Step 4: Build, check, commit**

```bash
wye build --root data/products/wye && wye check --root data/products/wye && npm test
git add data/products/wye README.md && git commit -m "workflows: the decisions, the requirements and the README"
```


## Notes for the executor

- **The three refusals that matter** and must survive any refactor: an unparseable `until` is never green; a dangling link never counts as coverage; a stage that is not ready cannot be advanced except through Skip, which is logged.
- **Never write a card whose state did not change.** Every write rebuilds, every rebuild sweeps, and a sweep that writes is a loop.
- If a task turns out to need a decision the spec does not make, stop and ask rather than inventing one — the spec's §7 lists the decisions that were made deliberately.
- **Two deliberate deviations from the spec, both narrower than what it asked:** an unparseable `until` is surfaced by the workflows API, `wye workflow list|show` and the column's Workflows section rather than by `wye check` — the check runs in `lib/*.js` and would need the predicate grammar written a second time in another language; and the coverage matrix is `<!-- view:req coverage=1 -->` on the existing instance table rather than a new `view:coverage` block (Task 12 says why). Nothing else in the spec is skipped.
