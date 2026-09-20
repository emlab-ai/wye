---
node: module:app-work
type: module
title: Work, changes, impact and the librarian
status: proposed
owner: alex
last-verified: 2026-09-19
part-of: module:app
sources:
  - packages/web/src/lib/work.ts
  - packages/web/src/lib/work-io.ts
  - packages/web/src/lib/changes.ts
  - packages/web/src/lib/impact-run.ts
  - packages/web/src/lib/explain.ts
  - packages/web/src/lib/plan-doc.ts
  - packages/web/src/lib/plan-docs.ts
  - lib/impact.js
  - prompts/librarian-system.md
  - packages/web/src/components/WorkList.tsx
  - packages/web/src/components/Assign.tsx
  - packages/web/src/components/TaskWork.tsx
  - packages/web/src/components/ChangeList.tsx
  - packages/web/src/components/ImpactCard.tsx
  - packages/web/src/components/ContextCard.tsx
  - packages/web/src/components/ExplainCard.tsx
---

# Work, changes, impact and the librarian

The code behind module:prd-execution (built 2026-09-19, plan:plan-build-one-too): the Work view and dispatch (E.1),
the backlog (E.4), change records (E.2), the impact run (E.3) and the librarian with the plan's Definition (E.5).
What it must do is written on the PRD — goal:exec.work-and-impact, goal:exec.define-first and their requirements;
this document maps the code onto it: the pages, components, libraries, stores and endpoints, and the rules the code
enforces.

## Rules the code enforces

```yaml
- id: rule:work-state
  statement: >
    A task's status is the word on its line (todo, open, in-progress, blocked, review, done — `#ready` a mark beside
    it); its state is derived from the session records and never written: queued when a session on it is queued,
    working when one is running or live, stalled when the last one failed or was cancelled with the task not done,
    held when a worker holds it with nothing running, unassigned otherwise. The sessions on a task are the ones its
    `session:` names plus the ones whose refs name it. The app moves the status itself at two points only: to
    in-progress when a session takes the task (Assign spends the ready mark), and to review when the session that
    held it ends with the task not done (todo when that session failed or was cancelled).
  source: packages/web/src/lib/work.ts#stateOf; packages/web/src/lib/work-io.ts#assignTask; packages/web/src/lib/plan-doc.ts#requestTaskStatusOnEnd
  status: shipped
- id: rule:work-nesting
  statement: >
    On the Work view a plan's tasks nest under the plan's request task (`task:<plan-slug>`, written by the plan
    template) or, for a plan created by an assignment, under the task the plan was assigned for (`task:` in the plan's
    frontmatter; the plan embeds it instead of writing a second request task); a sub-task (part of task:x) nests
    under its task. Roots and children are ordered by priority (lower first, unset last), then document and line.
  source: packages/web/src/lib/work.ts#workItems; packages/web/src/lib/plan-doc.ts#planDocBody
  status: shipped
- id: rule:assign-refusal
  statement: >
    Assign refuses a done task and a task blocked by a task that is not done (422 with the reason); a task a session
    already holds — queued or working — is refused with 409 until the same call comes with `force`, unless the holder
    is a librarian and the call is Build. A person as worker sets `worker:` and nothing else happens; an agent gets
    a conversation (chat) with the task, its document and what it serves as refs; `runner` a queued run session.
  source: packages/web/src/lib/work.ts#assignRefusal; packages/web/src/lib/work-io.ts#assignTask
  status: shipped
- id: rule:capture-home
  statement: >
    A captured task line goes under the node it was captured from when that node has a document and takes content
    (not a page, plan or paragraph); else it is appended to the project's plan document (`plan.md`) under
    "## Backlog", created when missing. The line carries `by:` and `since:`, `#ready` when asked, and `part-of:`
    the source node. Its id is `task:<product>.<first six words>` with `-2`, `-3` on a collision.
  source: packages/web/src/lib/work-io.ts#captureTask
  status: shipped
- id: rule:take-ready
  statement: >
    A runner started with `--take-ready` asks op:api.work.next when nothing is queued for it; the app answers with the
    oldest task that is `#ready`, unblocked, unassigned, not done, not archived and not on a plan still defining —
    assigned as if a person had done it (a queued run session, the task in progress under the runner's agent) — and
    the runner claims that session next. A task without the ready mark is never taken; `auto-take: off` in
    _product.md switches the answer off.
  source: packages/web/src/lib/work.ts#nextReady; packages/web/src/lib/work-io.ts#nextForRunner; bin/wf.js#agent
  status: shipped
- id: rule:change-record
  statement: >
    Change records are made from the watcher's rebuild diff, one code path for every writer: for each changed typed
    node (defined, not a paragraph, not a generated, structural or judge node) the record keeps `before` and
    `after` — text (the title, or the first text key), status, every other key as a property — the keys that
    differ, who, session, time and a state. Who: the writer's claim on the node or its file (the node, content and
    document routes and wf propose claim with the session header or `x-wf-by`), else the one running session, else
    "person". A change of only status and tracking keys (session, produced, worker, owner, priority, ready, dates…)
    is recorded accepted and never listed; a person's edit of a proposed / draft / open block is accepted at once;
    an agent's edit, and any edit of an approved or shipped node, is pending. Edits by the same writer on the same
    node within five minutes fold into one record (the first `before`, the latest `after`). A silent claim (a
    revert, an applied patch) makes no record: the app recorded it itself.
  source: packages/web/src/lib/changes.ts#recordsFromDiff; packages/web/src/lib/changes.ts#recordChanges; packages/web/src/lib/watch.ts
  status: shipped
- id: rule:change-review
  statement: >
    Accept marks the record accepted by the person and nothing else moves; Revert writes `before` back through the
    node writer — only the keys that changed, a card's title as a property, a removed key as null — marks the record
    reverted and saves the revert as its own accepted change with `revertOf`; a record whose node moved on since
    (the current value's hash differs from `after`) is refused with the old value unless `force`; a node that is no
    longer defined is refused with the old value to paste. An open contradicts / duplicate verdict on the new value
    blocks Accept on the card until it is resolved on the block. The constraint packet ends with the packet's nodes
    that have a pending record, so a worker knows the value it read is unreviewed.
  source: packages/web/src/app/api/[product]/changes/[id]/route.ts; packages/web/src/lib/changes.ts#revertPatch; packages/web/src/lib/packet.ts#packetFor
  status: shipped
- id: rule:review-readable
  statement: >
    An Inbox card is laid out for the person's decision, not for completeness. On the surface: the kind, the title
    (a prose node's clipped title is replaced by its full first description, said once), one description that is
    enough to understand the block — a requirement as "When …, then …, unless …", a decision as its choice, a
    question as its question, the rest as their statement — or, for a change, what changed as status pills, a
    property old → new, a text as a word diff; then only what asks for a decision: open contradicts / duplicate
    verdicts with their reason, and the impact in one line (opened when an update, rework, contradiction or
    question waits; folded when everything reached is unaffected or still pending); who, when, where and "checked
    against n neighbours · consistent" in one muted line. Everything else — the id, the unchanged frame, the other
    fields (context, alternatives, consequences, source, evidence), refs, consistent and refines verdicts, the
    reached-not-judged list — is under a "details" fold. lib:review-summary decides these (pure, tested).
  source: packages/web/src/lib/review-summary.ts; packages/web/src/components/ChangeList.tsx; packages/web/src/components/ReviewList.tsx; packages/web/src/components/ImpactCard.tsx
  status: shipped
  verified-by: [test:web-lib#review-summary]
- id: rule:impact-candidates
  statement: >
    An edit's structural candidates are the changed node's content first (its `has` children, undecayed), then two
    hops over the edges that carry meaning — outgoing satisfied-by, verified-by, governs, affects, resolves,
    depends-on, refines, part-of; incoming refines, part-of, depends-on, governed-by, satisfied-by, verified-by,
    affects, governs, mentions, related-to, has, resolves, produced — each verb with its own decay, a floor of 0.4,
    never a step back along the inverse of the step just taken (a mechanism's other requirements are siblings, not
    dependents), never through a page, plan, paragraph, verdict or contradiction, and mechanisms (op, component, lib,
    test, page, action, entity, tool, store, flag, setting, gate) as leaves. Each candidate carries its path
    ("refined-by → satisfied-by") and weight. The app adds the semantic hits structure did not reach (score ≥ 0.45)
    marked "by text". A child whose text repeats the changed value verbatim is an update without a model call.
  source: lib/impact.js#structuralCandidates; lib/impact.js#verbatimUpdate; packages/web/src/lib/impact-run.ts#candidatesFor
  status: shipped
- id: rule:impact-run
  statement: >
    An impact run belongs to a pending change record: candidates are computed and stored on the record at once;
    with `impact: auto` in _product.md (or on demand — the card's Impact, `wf impact`) the model judges them in
    batches of ten through lib/judge.js#ask, the record updated as each batch lands, at most `impact-budget`
    candidates (20) and three calls per run, answers cached in _build/impact.json per (node, before, after,
    candidate text, model, prompt); one run per node in flight, a further edit reruns after; `manual` keeps the
    candidates without verdicts; `off` (the default) makes no run. Tracking-only changes never run. Outcomes land
    when the run is done: a rework becomes an unassigned task (`change:` the record) on the backlog, a contradicts
    an open contradiction line under the changed node, an ask a question block there; an update waits for Apply.
  source: packages/web/src/lib/impact-run.ts#runImpact; packages/web/src/lib/impact-run.ts#landOutcomes; packages/web/src/lib/impact-run.ts#impactMode
  status: shipped
- id: rule:impact-apply
  statement: >
    Apply writes a proposed update through the node writer (the edited text when the person changed it) only when
    the candidate's current text still hashes as it did at the run — else 409, the patch is stale — records the write
    as a change accepted by the person, marks the candidate applied, and schedules the verdict pass on it when it is
    a decision, requirement, rule or constraint; Skip marks it declined with a reason; Apply all takes every update
    not yet dealt with.
  source: packages/web/src/lib/impact-run.ts#applyPatch; packages/web/src/app/api/[product]/changes/[id]/impact/route.ts
  status: shipped
- id: rule:librarian-tools
  statement: >
    A session with role librarian is claude on the host with prompts/librarian-system.md as its system prompt, in the
    Wye repo, with `--allowedTools Bash(wf:*) Read Grep Glob` and `--disallowedTools Edit Write MultiEdit
    NotebookEdit Bash(git:*) Bash(rm:*) Bash(npm:*) Bash(node:*) Agent Task`; its first message carries the plan
    (status defining, role librarian), the protocol (explain first, ask along when / then / unless as a form, propose
    with wf propose, report verdicts) and the wf reads — no folder, no code. Questions keep the permission channel,
    so they render as question cards.
  source: packages/web/src/lib/agent-host.ts#startProcess; packages/web/src/lib/agent-host.ts#buildPrompt; packages/web/src/lib/agent-prompt.ts
  status: shipped
- id: rule:definition
  statement: >
    A plan's Definition section holds ids at its top level — `![[id]]` embeds, cards, prose lines; what is indented
    under a block is that block's content, and verdicts and contradictions never count. wf propose writes one card
    into the named document and embeds it there, or defines it on the plan itself under Definition with `home: none
    yet` when no document is named; every typed block a running librarian session wrote (its claim on the write)
    is embedded there by the watcher. The Definition is agreed when every block is approved, resolved, rejected,
    done or shipped — a task once it is work rather than proposed — and no open contradiction touches an agreed one;
    after every rebuild a plan in defining with an agreed Definition becomes defined, and a defined plan whose
    Definition is no longer agreed goes back to defining; other statuses stay. A librarian's session ending leaves
    the plan's status alone and puts the request task in review.
  source: packages/web/src/lib/plan-doc.ts#definitionIds; packages/web/src/lib/plan-doc.ts#definitionState; packages/web/src/lib/plan-docs.ts#refreshPlanStatuses; packages/web/src/lib/plan-docs.ts#trackDefinitions; packages/web/src/app/api/[product]/propose/route.ts
  status: shipped
- id: rule:build
  statement: >
    Build assigns a plan's request task with `build: <plan ref>`: the instruction gains the Definition — every block's
    id, status and text, the change records of the plan's sessions with before and after — the session works on that
    plan (its id added to the plan's `session:`, no new plan document), the plan's status becomes building, and when
    the session ends the Result lists each Definition block as implemented, changed or left; a librarian's hold on
    the request task does not refuse it; the dialog names the unagreed blocks and says "Build anyway".
  source: packages/web/src/lib/work-io.ts#assignTask; packages/web/src/lib/plan-docs.ts#definitionContext; packages/web/src/lib/plan-docs.ts#finishPlanDoc
  status: shipped
```

## Pages and components

```yaml
- id: page:web/work
  route: /<product>/work (the old /<product>/tasks redirects here)
  component: app/[product]/work/page.tsx
  purpose: >
    Every task of the product as one list, whoever holds it (req:exec.work-view): status, derived state, plan or
    goal, worker, document; grouped by status by default, switchable to state, goal, plan, document, worker; search
    and filters in the URL (q, status, state, worker, goal, plan, doc, done, group, mine); done and archived-done
    folded away unless "done work"; "mine" by the name remembered per browser (gate:none). Assign and Send on
    every row, Build on a request task's row with the Definition counts beside it.
  status: shipped
  part-of: module:app-work
- id: component:work-list
  file: packages/web/src/components/WorkList.tsx
  purpose: the Work view's grid — rows nested per rule:work-nesting, groups, chips, the I-am name, the Assign / Build dialog
  part-of: module:app-work
- id: component:assign
  file: packages/web/src/components/Assign.tsx
  purpose: the Assign / Build dialog — a person, an agent (a conversation, plan first, folder) or the runner pool, a note; a held task asks before it re-queues; Build lists the unagreed blocks
  part-of: module:app-work
- id: component:task-work
  file: packages/web/src/components/TaskWork.tsx
  purpose: a task's Work section in the column (req:exec.done-comes-back) — state, worker, Assign, Build and the plan's Definition state for a request task, ✓ done, the last session's result, the blocks it produced with their status and Review into the Inbox on them
  part-of: module:app-work
- id: component:change-card
  file: packages/web/src/components/ChangeList.tsx
  purpose: the Inbox's Changes group (req:exec.change-kept, req:exec.change-review), laid out for the decision (rule:review-readable) — old and new per changed key with a word diff; open conflicts and the impact's one line on the surface; the unchanged framing fields, id and other verdicts under details, the verdicts on the new value, changed-since, Accept / Revert, and the impact set
  part-of: module:app-work
- id: component:impact-card
  file: packages/web/src/components/ImpactCard.tsx
  purpose: the impact set on a change card (req:exec.impact-set, req:exec.impact-patch) — candidates grouped by verdict with path and reason, an update's diff editable with Apply / Skip / Apply all, the task, contradiction or question an outcome became, the unjudged ones and an Impact / Run again button
  part-of: module:app-work
- id: component:context-card
  file: packages/web/src/components/ContextCard.tsx
  purpose: the Context card at the top of a librarian conversation (req:exec.wye-context) — the packet's nodes and the semantic hits grouped as what exists, required, decided and constrained, open questions, work; grows with the session's knowledge events
  part-of: module:app-work
- id: component:explain-card
  file: packages/web/src/components/ExplainCard.tsx
  purpose: Explain on any node (req:exec.explain-anywhere) — one librarian turn, the current state around the node with the nodes as tags
  part-of: module:app-work
- id: component:changed-badge
  file: packages/web/src/components/ChangedBadge.tsx
  purpose: the "changed" badge on a node's header while a change record on it is pending; the old value on hover, a link to the Inbox
  part-of: module:app-work
```

## Libraries and stores

```yaml
- id: lib:review-summary
  file: packages/web/src/lib/review-summary.ts
  side: shared
  purpose: >
    Pure: what a review card shows on the surface and what it folds (rule:review-readable) — `describeBlock` (one
    description per kind and the secondary fields), `changeSegments` / `changeSentence` (an edit as status, property
    and text segments, and as one sentence), `verdictSummary` (open conflicts, one line for the rest),
    `impactSummary` (one line, what asks for action first, whether the card opens). Tested by
    test:web-lib#review-summary.
- id: lib:work
  file: packages/web/src/lib/work.ts
  side: server
  purpose: >
    Pure: `workItems(graph, idx, sessions)` (rule:work-state, rule:work-nesting), `filterWork`, `groupWork`,
    `workCounts`, `nextReady`, `assignRefusal`. Tested by test:web-lib#work.
  part-of: module:app-work
- id: lib:work-io
  file: packages/web/src/lib/work-io.ts
  side: server
  purpose: loadWork (sessions from disk, live state from the host, the plans' Definition counts), assignTask (rule:assign-refusal, rule:build), captureTask (rule:capture-home), nextForRunner (rule:take-ready), taskDetail; the end hook that moves an assigned task to review or todo
  part-of: module:app-work
- id: lib:changes
  file: packages/web/src/lib/changes.ts
  side: server
  purpose: change records (rule:change-record) — nodeValue, changedKeys, tracking keys, claims, recordsFromDiff (pure), the store under _changes/, folding, changedSince, revertPatch. Tested by test:web-lib#changes.
  part-of: module:app-work
- id: lib:diff
  file: packages/web/src/lib/diff.ts
  side: both
  purpose: a word-level LCS diff for the change card and the impact patches
  part-of: module:app-work
- id: lib:impact
  file: lib/impact.js
  side: both
  purpose: >
    Shared by ctx and the app: structuralCandidates (rule:impact-candidates), verbatimUpdate, judgeImpact — the
    impact prompt (unaffected | update | rework | contradicts | ask), batches of ten through lib/judge.js#ask,
    cache per (before, after, candidate, model, prompt), budget, onBatch. Tested by test:impact with the fake
    impact judge (test/fake-impact.js).
  part-of: module:app-work
- id: lib:impact-run
  file: packages/web/src/lib/impact-run.ts
  side: server
  purpose: the run on a change record (rule:impact-run) — candidatesFor with the semantic hits, scheduleImpact from the watcher, runImpact, landOutcomes, applyPatch / skipPatch (rule:impact-apply), whatIf for `wf impact`
  part-of: module:app-work
- id: lib:explain
  file: packages/web/src/lib/explain.ts
  side: server
  purpose: one librarian turn (req:exec.explain-anywhere) — the packet and the context around a node or a text to the model (WF_EXPLAIN_MODEL, default claude-sonnet-5) with the librarian's brief; the answer with the ids it names as refs
  part-of: module:app-work
- id: store:changes
  path: data/products/<product>/_changes/<id>.json
  format: json
  purpose: >
    One record per edit of a typed node (decision:exec.change-record): node, document, file and line, before and
    after (text, textKey, status, props), the changed keys, by, session, at, updatedAt, state (pending | accepted |
    reverted), tracking / own marks, acceptedBy, revertedBy, revertOf, and the impact set. Operational like
    _sessions/, git-ignored; the documents stay canonical (constraint:wf2.text-canonical).
  part-of: module:app-work
```

## API

```yaml
- id: op:api.work
  args: GET /api/<product>/work [?id=task:x]; POST { text, partOf?, project?, ready?, by? }
  does: >
    GET: every task with its derived state, plan, goal, worker, sessions, produced count and the plans' Definition
    counts; with ?id one task with its sessions and the blocks they produced (req:exec.done-comes-back). POST:
    capture a task line (rule:capture-home) — `wf work add`, Later in the command box, an inbox note filed as a task.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/work/route.ts; packages/web/src/lib/work-io.ts
  status: shipped
  part-of: module:app-work
- id: op:api.work.assign
  args: POST /api/<product>/work/assign { id, worker, note?, plan?, cwd?, force?, agent?, by?, build? }
  does: hands a task to a worker (rule:assign-refusal); with `build` the plan's Definition goes with it (rule:build). 422 refused, 409 held.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/work/assign/route.ts; packages/web/src/lib/work-io.ts#assignTask
  status: shipped
  part-of: module:app-work
- id: op:api.work.next
  args: GET /api/<product>/work/next [?goal=]; POST { agent, runner, goal? }
  does: the oldest ready, unblocked, unassigned task (rule:take-ready); POST takes it as an assignment for the runner's agent — 204 when none or when auto-take is off
  gate: none (local app)
  source: packages/web/src/app/api/[product]/work/next/route.ts; packages/web/src/lib/work-io.ts#nextForRunner
  status: shipped
  part-of: module:app-work
- id: op:api.changes
  args: GET /api/<product>/changes [?state=&node=&all=1]; GET /changes/<id>; POST /changes/<id> { action: accept | revert | reopen, by?, force? }
  does: the change records with `stale` and `exists` (rule:change-record, rule:change-review)
  gate: none (local app)
  source: packages/web/src/app/api/[product]/changes/route.ts; packages/web/src/app/api/[product]/changes/[id]/route.ts
  status: shipped
  part-of: module:app-work
- id: op:api.impact
  args: POST /api/<product>/changes/<id>/impact { action: run | apply | apply-all | skip, candidate?, text?, props?, force?, reason?, by? }; POST /api/<product>/impact { id, after, judge? }
  does: the impact run on a change record and its outcomes (rule:impact-run, rule:impact-apply); the what-if for an edit an agent is about to make — candidates with paths, verdicts when judge is not false, nothing written (`wf impact <id> --after`)
  gate: none (local app)
  source: packages/web/src/app/api/[product]/changes/[id]/impact/route.ts; packages/web/src/app/api/[product]/impact/route.ts; packages/web/src/lib/impact-run.ts
  status: shipped
  part-of: module:app-work
- id: op:api.impact.apply
  args: POST /api/<product>/changes/<id>/impact { action: apply, candidate, text?, props?, force? }
  does: Apply one proposed update (rule:impact-apply); 409 when the candidate moved on
  gate: none (local app)
  source: packages/web/src/lib/impact-run.ts#applyPatch
  status: shipped
  part-of: module:app-work
- id: op:api.propose
  args: POST /api/<product>/propose { card, plan, doc? } (x-wf-session credits the writer)
  does: one proposed block into the named document, embedded on the plan's Definition; on the plan itself when no document is named (rule:definition); 409 when the id exists — refine it instead. `wf propose` calls it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/propose/route.ts
  status: shipped
  part-of: module:app-work
- id: op:api.plan
  args: GET /api/<product>/plan?ref=; PATCH { ref, status }; POST { action: refresh }
  does: a plan's status, role, task and Definition state (total, agreed, open, missing, contradicted, defined, items); set the status; recompute defining ↔ defined for every plan. `wf plan` calls it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/plan/route.ts; packages/web/src/lib/plan-docs.ts#planDefinition
  status: shipped
  part-of: module:app-work
- id: op:api.explain
  args: POST /api/<product>/explain { id } | { text }
  does: one librarian turn — the current state around a node or a text with the nodes as tags, nothing written (lib:explain). `wf explain` and the node's Explain call it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/explain/route.ts; packages/web/src/lib/explain.ts
  status: shipped
  part-of: module:app-work
```

## Flags

```yaml
- id: flag:impact
  scope: product            # `impact: auto | manual | off` in _product.md (WF_IMPACT overrides), default off — the impact run on change records (rule:impact-run); `impact-budget: n` candidates per run (20)
  source: packages/web/src/lib/impact-run.ts#impactMode
- id: flag:auto-take
  scope: product            # `auto-take: off` in _product.md — op:api.work.next answers nothing, so no runner takes ready tasks (rule:take-ready)
  source: packages/web/src/lib/work-io.ts#nextForRunner
- id: flag:impact-model
  scope: env                # WF_IMPACT_MODEL — the model the impact judge calls through `claude -p` (default: the judge's, flag:judge-model); WF_EXPLAIN_MODEL the one Explain and wf explain call (default claude-sonnet-5)
  source: lib/impact.js; packages/web/src/lib/explain.ts
```
