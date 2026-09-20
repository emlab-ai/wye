---
node: plan:plan-work-task-app-trace-requirements-every
type: plan
title: Work on task:app.trace-requirements: For every requirement in the PRD that the app…
status: cancelled
owner: unassigned
last-verified: 2026-09-19
session: b9b458ace4
agent: codex
started: 2026-09-19T14:03:41.078Z
task: task:app.trace-requirements
part-of: module:v2-plans
finished: 2026-09-19T21:33:56.837Z
---

# Work on task:app.trace-requirements: For every requirement in the PRD that the app…

## Request

> Work on task:app.trace-requirements: For every requirement in the PRD that the app satisfies, add the component, lib or op that satisfies it to its `satisfied-by` (the map here names the pieces; the PRD's edges still point at rules only). Part of module:app.
> 
> It serves module:app.
> 
> When it is done: `wf node set task:app.trace-requirements --status done`; what you leave open stays as task lines under it.

_from: module:app · refs: task:app.trace-requirements_

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here; the plan is defined when every one is agreed._

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

## Tasks

_`- [ ] task:` lines, `part of plan:plan-work-task-app-trace-requirements-every`; their check state is what is in progress._

![[task:app.trace-requirements]]

## Result

_The session ended with status cancelled and no summary._

Blocks this plan produced:

- changed task:app.trace-requirements — For every requirement in the PRD that the app satisfies, add the component, lib or op that satisfies it to its
- changed rule:card-fold — Every card's header carries `FoldToggle` when the node has content — a chip "▸ n blocks" whose click opens the
- changed rule:card-essence — A question card shows q and its answer; the answer is the question's content (decision:wf2.answer-is-content) 
- changed req:wf2.ui.card-preview — A card of a node with content shows only its own first block; the content is in the details
- changed decision:wf2.answer-is-content — A question's answer is its content, edited with the block editor; no `answer:` key
- changed task:wf2.prose-area — Card prose sections keep local state;
- changed task:wf2.answer-content — Question card:
- changed task:wf2.details-q-once — Details panel shows q once and labels a question's content as its answer part of plan:plan-why-t-type-space-ty
- changed task:wf2.answer-rules — rule:card-essence and rule:card-fold updated through `wf impact` part of plan:plan-why-t-type-space-typing-ans
- added task:wf2.prose-newlines — A newline typed in a card's prose section (q, context, choice, alternatives) is folded to a space on save (`fi
- changed task:plan-why-t-type-space-typing-answer — why i can't type space when typing answer???
- changed plan:plan-why-t-type-space-typing-answer — why i can't type space when typing answer??? also no answer in details, it must be like…
- changed req:exec.backlog-for-agents — An agent can read the backlog and add to it
- changed task:exec.impl.librarian-role — role on the session record;
- changed task:exec.librarian-role — Session role on the record;
- changed task:exec.impl.wye-turns — the librarian's first turn (explain with tags), the question form along when / then / unless, `wf propose` wri
- changed task:exec.impl.plan-definition — type:plan statuses (proposed, defining, defined, building, done, cancelled) and the Definition section in lib:
- changed task:exec.wye-context-card — The Context card in the context column:
- changed task:exec.wye-turns — The librarian's first turn (explain with tags, say when satisfied or contradicting), the question form along w
- changed task:exec.plan-definition — type:plan statuses and the Definition section in lib:plan-doc;
- changed task:exec.impl.wye-context-card — the Context card in the context column:
- changed task:exec.impl.build — Build on a plan:
- changed task:exec.build — Build on a plan:
- added module:app-work — Work, changes, impact and the librarian
- added rule:work-state — A task's status is the word on its line (todo, open, in-progress, blocked, review, done — `#ready` a mark besi
- added rule:work-nesting — On the Work view a plan's tasks nest under the plan's request task (`task:<plan-slug>`, written by the plan te
- added rule:assign-refusal — Assign refuses a done task and a task blocked by a task that is not done (422 with the reason); a task a sessi
- added rule:capture-home — A captured task line goes under the node it was captured from when that node has a document and takes content 
- added rule:take-ready — A runner started with `--take-ready` asks op:api.work.next when nothing is queued for it; the app answers with
- added rule:change-record — Change records are made from the watcher's rebuild diff, one code path for every writer: for each changed type
- added rule:change-review — Accept marks the record accepted by the person and nothing else moves; Revert writes `before` back through the
- added rule:impact-candidates — An edit's structural candidates are the changed node's content first (its `has` children, undecayed), then two
- added rule:impact-run — An impact run belongs to a pending change record: candidates are computed and stored on the record at once; wi
- added rule:impact-apply — Apply writes a proposed update through the node writer (the edited text when the person changed it) only when 
- added rule:librarian-tools — A session with role librarian is claude on the host with prompts/librarian-system.md as its system prompt, in 
- added rule:definition — A plan's Definition section holds ids at its top level — `![[id]]` embeds, cards, prose lines; what is indente
- added rule:build — Build assigns a plan's request task with `build: <plan ref>`: the instruction gains the Definition — every blo
- added page:web/work — Every task of the product as one list, whoever holds it (req:exec.work-view): status, derived state, plan or g
- added component:work-list — the Work view's grid — rows nested per rule:work-nesting, groups, chips, the I-am name, the Assign / Build dia
- added component:assign — the Assign / Build dialog — a person, an agent (a conversation, plan first, folder) or the runner pool, a note
- added component:task-work — a task's Work section in the column (req:exec.done-comes-back) — state, worker, Assign, Build and the plan's D
- added component:change-card — the Inbox's Changes group (req:exec.change-kept, req:exec.change-review) — old and new per changed key with a 
- added component:impact-card — the impact set on a change card (req:exec.impact-set, req:exec.impact-patch) — candidates grouped by verdict w
- added component:context-card — the Context card at the top of a librarian conversation (req:exec.wye-context) — the packet's nodes and the se
- added component:explain-card — Explain on any node (req:exec.explain-anywhere) — one librarian turn, the current state around the node with t
- added component:changed-badge — the "changed" badge on a node's header while a change record on it is pending; the old value on hover, a link 
- added lib:work — Pure: `workItems(graph, idx, sessions)` (rule:work-state, rule:work-nesting), `filterWork`, `groupWork`, `work
- added lib:work-io — loadWork (sessions from disk, live state from the host, the plans' Definition counts), assignTask (rule:assign
- added lib:changes — change records (rule:change-record) — nodeValue, changedKeys, tracking keys, claims, recordsFromDiff (pure), t
- added lib:diff — a word-level LCS diff for the change card and the impact patches
- added lib:impact — Shared by ctx and the app: structuralCandidates (rule:impact-candidates), verbatimUpdate, judgeImpact — the im
- added lib:impact-run — the run on a change record (rule:impact-run) — candidatesFor with the semantic hits, scheduleImpact from the w
- added lib:explain — one librarian turn (req:exec.explain-anywhere) — the packet and the context around a node or a text to the mod
- added store:changes — One record per edit of a typed node (decision:exec.change-record): node, document, file and line, before and a
- added op:api.work — api.work
- added op:api.work.assign — api.work.assign
- added op:api.work.next — api.work.next
- added op:api.changes — api.changes
- added op:api.impact — api.impact
- added op:api.impact.apply — api.impact.apply
- added op:api.propose — api.propose
- added op:api.plan — api.plan
- added op:api.explain — api.explain
- added flag:impact — impact
- added flag:auto-take — auto-take
- added flag:impact-model — impact-model
- changed test:web-lib — vitest over the pure modules of the web app — also packages/web/src/lib/presets.test.ts and packages/web/src/l
- added test:impact — impact
- added ui-test:work-view — work-view
- added ui-test:work-assign — work-assign
- added ui-test:change-review — change-review
- added ui-test:ask-wye — ask-wye
- added ui-test:build-plan — build-plan
- added test:librarian — The librarian's turns on a recorded conversation: explains with tags, asks only unfilled slots, proposes into 
- changed req:exec.work-view — One Work view lists every task of the product, whoever holds it
- changed req:exec.work-states — A task's live state comes from its sessions; its status stays on the line
- changed req:exec.dispatch — A task is handed to a worker from where it is listed
- changed req:exec.request-is-a-task — A request sent to an agent is on the Work view from the moment it is sent
- changed req:exec.done-comes-back — A finished task shows what it produced and what it asks for
- changed req:exec.human-work — A person's work is on the same view as an agent's
- changed req:exec.change-kept — An edit of a typed node keeps its old value
- changed req:exec.change-review — A pending change is accepted or reverted in the Inbox
- changed req:exec.change-validated — A change is validated on write like a new block
- changed req:exec.impact-set — An edit's change card shows what it reaches and why
- changed req:exec.impact-patch — A proposed update is a patch with old and new, applied from the card
- changed req:exec.impact-rework — An update that is more than a line becomes a task on the Work view
- changed req:exec.impact-contradiction — A candidate the new value cannot hold with becomes a contradiction
- changed req:exec.impact-sub-items — A node's own content is the first thing an edit reaches
- changed req:exec.impact-for-agents — An agent gets the same impact analysis for an edit it is about to make
- added ui-test:explain — explain
- changed req:exec.capture — A work item is captured in one gesture, from anywhere, without assigning it
- changed req:exec.ready-for-runners — A runner takes only what a person marked ready
- changed req:exec.ask-wye — A request typed to Wye starts a definition conversation on its own plan
- changed req:exec.wye-context — Wye finds what the product knows and shows it in the context column while it reads
- changed req:exec.wye-explains — Wye explains the current state before it proposes anything
- changed req:exec.wye-asks — Wye asks along the requirement shape, few questions, as a form
- changed req:exec.wye-proposes — Wye proposes the definition as blocks in their home documents, embedded on the plan
- changed req:exec.plan-defined — A plan is defined when its Definition is agreed
- changed req:exec.build-from-definition — A defined plan is built by any worker from its Definition
- changed req:exec.definition-tracked — Every change a definition conversation proposes is tracked as part of the plan
- changed req:exec.explain-anywhere — What do we know about this?" works on any node without starting a request
- added decision:exec.later-is-alt-enter — Later in the command box is a button and ⌥↵; ⇧↵ stays a new line
- added decision:exec.rework-on-the-backlog — A rework verdict becomes a task on the project's backlog, not a "Follow up" plan document
- added lesson:exec.registries-survive-dev-reloads — A registry kept on globalThis (the session end hooks, the watcher, the write claims) survives Next's dev reloa
- changed task:exec.impl.tests — unit tests per lib (work states, plan-doc request task, change record, impact candidates, impact apply, rework
- added task:exec.librarian-replay — test:librarian as a recorded replay:
- added task:exec.impact-benchmark — A benchmark for impact verdicts once a few live runs exist:
- added task:exec.switch-impact-on — Set `impact:
- added task:exec.librarian-codex — The librarian on codex:
- added task:exec.definition-on-the-plan-page — Show the Definition's state (n blocks, k agreed, j open, contradicted) on the plan document's header and in th
- added task:exec.attribution-by-claim — Credit blocks to a session by its write claim rather than to every running session (the Definition already doe
- changed task:exec.ui-tests — ui-test:work-view, ui-test:work-assign, ui-test:change-review in Chrome (playwright-core):
- changed plan:plan-build-one-too — build this one too
- added decision:memory.instructions-compiled — Agent instructions are typed blocks compiled from lessons, proposed as patches with evidence, reviewed like any change, 
- added req:memory.instruction-patch — A session's outcome can propose one instruction patch, with evidence, for review
- added req:memory.instructions-in-prompt — The prompt carries the approved instructions that apply to the session, in full, within a budget
- added decision:memory.evaluation — Every memory claim has a benchmark on Wye's own history, a with-and-without run, and a page that shows both
- added req:memory.eval-benchmarks — Each memory claim has a benchmark on the product's own history
- added req:memory.eval-compare — The same request runs with and without the memory and the two are shown side by side
- added req:memory.eval-page — One page shows the numbers, over time
- added question:memory.eval-judge — Who labels the judge's validation set, and how many pairs are enough?
- added decision:memory.public-benchmarks — Two public benchmarks now — MOOSEDev bench and the requirement-pair conflict sets — a MemoryAgentBench adapter next, Lon
- added module:benchmarks — Benchmarks — set up, run, compare
- added store:eval-results — One run of one suite: `{ suite, date, graphSha, model, promptHashes, judge, scores: { <benchmark>: { value, n,
- added task:memory.eval-truth — `wf eval own --build-truth`:
- added task:memory.eval-judge-set — `eval/judge/labels.jsonl` (50 pairs labelled by the person), `wf eval judge --agreement` (Cohen's κ), rerun on
- added task:memory.eval-moosedev-import — The MOOSEDev corpus importer:
- added task:memory.eval-reqpairs-loader — Loaders for WorldVista / UAV / PURE / OpenCOSS and the stratified sample;
- added task:memory.eval-mab-adapter — The Wye adapter for MemoryAgentBench (add with write-time adjudication, query through the packet with currency
- added task:memory.instructions — type:instruction and type:lesson in the base ontology;
- added task:memory.eval-suite — `eval/own`:
- added task:memory.eval-compare — `wf eval compare`:
- added task:memory.eval-public — `eval/public`:
- added task:memory.eval-page — page:web/eval and op:api.eval:

268 paragraphs added or changed — [per document](/waterfall/sessions/b9b458ace4/changes)
