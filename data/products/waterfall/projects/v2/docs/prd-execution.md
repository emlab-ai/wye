---
node: module:prd-execution
type: module
title: PRD — execution: work, workers, and edits with impact
status: proposed
owner: alex
last-verified: 2026-09-19
part-of: module:wf2-prd
order: 36
sources:
  - packages/web/src/lib/agent-host.ts        # buildPrompt, pump, restartFresh: how a request reaches a worker today
  - packages/web/src/lib/sessions.ts          # queue, claim, end hook
  - packages/web/src/lib/plan-docs.ts         # a plan document per request
  - packages/web/src/lib/artifacts.ts         # what a session produced; block attribution
  - packages/web/src/lib/node-edit.ts         # PUT node: edits the defining line or card
  - packages/web/src/components/TrackList.tsx # the Tasks and Goals lists
  - lib/graph.js                              # impact (reverse structural closure), packet
---

# PRD — execution: work, workers, and edits with impact

Three asks from the person on 2026-09-19, after the memory review (module:memory-review):

1. Sending any page or block with an instruction to an agent works. Keep it — and make every such dispatch a work
   item, so nothing that is being worked on is invisible.
2. One view of **all planned work**, whoever is doing it. Agents are workers; the work is the unit, not the agent.
3. When a block is edited — a requirement, a rule, a decision — the app **works out the impact**: what refines it,
   what it is satisfied or verified by, what mentions it, what sits under it, and proposes the updates those need;
   where an update is more than a line, it asks a worker to make it. The edit and its ripple are reviewed the way
   proposed blocks are (the Inbox, validated on write per decision:memory.write-time-verdict), with the **old and
   new value** side by side.

Two more, added the same day (E.4 and E.5):

4. A place to **drop items for a worker to discover** — "maybe it is the inbox" — so work can be captured before
   anyone is asked to do it, and an agent can pick it up.
5. **Talk to Wye.** "I want to improve the editor, to allow stopping a running task" — and the system, not a coding
   agent, finds everything relevant and shows it in the context column, explains the current state, asks what it
   must, proposes the requirements, decisions and tasks, and agrees them with the person **before** anything is
   built; Wye keeps every proposed change of that conversation as one set, so it can be built later, by anyone.

Every behaviour is a `req:` block (`when` / `then` / `unless`, status proposed); the choices this document makes on
its own are `decision:` blocks (proposed); what it cannot decide is a `question:` block. Ids are `exec.<slug>`.

## What exists, and what the research says

**Today.** A request from the command box or a "Send to agent" starts a chat session with a plan document
(rule:plan-doc, decision:wf2.plan-per-request) and a queue (rule:session-queue); runners claim queued sessions
(rule:agent-runner, op:api.sessions.claim); the Agents page lists workers with their plans; the Tasks page
(component:track-list) lists task lines from every document with search and status; a task carries the sessions and
documents it produced (rule:task-artifacts). What is missing: a work item is not a task (a request is a plan page; its
tasks come later, if the agent writes them); there is no place that lists todo, queued, working and blocked work
across plans, documents and workers; a task cannot be handed to a worker from where it is listed; and an edit to a
node is written (op:api.node, rule:block-attribution records that it changed) with no old value kept, no impact
computed and no review.

**Research.**

- *Work assignment.* GitHub's Copilot cloud agent for Linear (GA July 2026): an issue is assigned to the agent like
  to a person; the agent works in its own environment, streams progress to the issue's timeline and asks for review
  when done; per-issue and per-team settings choose model and custom agent. amux and the 2026 orchestration
  guides converge on one primitive — a shared board with atomic claiming, one agent per task with a clear scope,
  human review checkpoints. Wye has claiming at the session level; the board and the task-as-unit are the gap.
- *Change impact analysis.* The 2026 vision paper on semantically-seeded, graph-propagated impact analysis blends
  two signals — cosine similarity to the changed artifact and multi-hop propagation over reversed typed edges with
  geometric decay — and reports semantic-only at 0.87 recall / 0.42 precision, the blend at 1.0 recall on its
  benchmark, with artifacts of zero textual overlap recovered by propagation alone; LLM verification of the ranked
  candidates is its next step. "LLM-Driven Cost-Effective Requirements Change Impact Analysis" (2025) does the
  verification with RAG over requirements plus trace links and a change description. Kiro's specs regenerate only
  what a change reaches (a task change rebuilds tasks; a requirement change rebuilds design and tasks) on an explicit
  "sync", never silently. STALE (memory review) shows the propagated, second-hop conflicts are the ones models miss.
- *Approval UX.* The 2026 agent-approval guidance: show the affected records, the previous state and the proposed
  change, plus the unchanged fields that constrain interpretation; make proposals editable so the reviewer fixes
  rather than re-prompts; require fresh approval when the proposal changed after review; name the states —
  proposed, awaiting approval, running, completed, partially completed, failed, unknown; undo restores state, cancel
  stops work. Suggesting-mode implementations keep the before and after values as a pending proposal that is
  accepted or rejected like a diff.
- *Define before build.* Kiro's specs (requirements → design → tasks, each gated by approval) and Claude Code's
  plan mode (read-only until the person allows writes) are the two shipped shapes; neither knows the product's
  existing requirements, so both start from the request alone. ReqElicitGym (2026) measured seven models
  interviewing for requirements: the best elicited 32% of the implicit requirements, models "overwhelmingly favour
  probing over clarification", and the fix the authors propose is ontology-guided coverage — ask along a taxonomy of
  what a requirement needs, not whatever comes to mind. "From Chat to Interview" (2026) does that with an experience
  ontology steering the questions and stakeholders validating the extracted requirements. Wye has the taxonomy
  already: `when` / `then` / `unless` on type:req, the constraints in force, and the open questions on the nodes the
  request touches.

## Goal

```yaml
- id: goal:exec.work-and-impact
  title: All work is one list, any worker can take any item, and an edit shows what it changes before it lands
  description: >
    Every request, task and ripple edit is a work item on one Work view with its state, its worker (a person or an
    agent) and what it serves; an item is dispatched to a worker from that view and comes back with what it produced;
    an edit to a typed node keeps its old value, computes the nodes it reaches, proposes the updates they need — as a
    patch when it is a line, as a work item when it is more — and everything waits in the Inbox with old and new side
    by side, validated on write.
  status: proposed
  owner: alex
  part-of: module:prd-execution
  depends-on: [goal:memory.validated-asks, req:wf2.sessions.plan-doc, rule:task-artifacts]
```

## E.1 Work — the unit, and one view of it

```yaml
- id: decision:exec.task-is-the-unit
  title: The task is the unit of work; a plan is a request with its tasks; a session is a worker's shift
  context: >
    Today a request becomes a plan document and, when the agent writes them, task lines; a session is what a runner
    claims. Linear + Copilot and every 2026 orchestration guide use the issue / task as the thing assigned, claimed and
    reviewed. The person: "agents are just workers".
  choice: >
    A work item is a task: node — the `- [ ] task:` line the parser already reads, anywhere in the documents — with
    its status (todo, open, in-progress, blocked, review, done) on the line. A request from the command box creates a
    plan document as now *and* one task line in it (`task:<plan-slug>` — the request itself) that the session's
    `refs` carry, so the request is on the board from the first second; tasks the agent adds under the plan are its
    steps and nest under it. A session is a worker's shift on one or more tasks: it never appears on the Work view as
    an item, only as the worker column of the tasks it holds. A task's `session:` links (rule:task-artifacts) say
    which shifts worked it; `worker:` says who holds it now — a person's name or an agent name.
  alternatives: >
    Plans as the unit (a step that needs a different worker has no row); sessions as the unit (the Agents page today:
    work is invisible until someone is on it); a separate task store (the v2 design's task table — rejected with the
    database, decision:wf2.plan-is-a-page).
  consequences: >
    `review` joins task statuses (an agent finished; a person checks); `worker: string?` and `priority: number?` join
    type:task; the plan document template gets the request task line; the Work view (E.1) lists tasks and nothing
    else; the Agents page keeps showing workers and their plans.
  date: 2026-09-19
  status: proposed
  affects: [type:task, rule:plan-doc, rule:task-artifacts, page:web/sessions]
  part-of: goal:exec.work-and-impact
```

```yaml
- id: req:exec.work-view
  title: One Work view lists every task of the product, whoever holds it
  when: the Work entry opens (/<product>/work; the Tasks entry becomes it)
  then: >
    every task: node from every document — plans, PRDs, designs, the ontology page — is one row: status, title, the
    plan or document it is in, what it is part of (goal, requirement), its worker (person or agent, or unassigned),
    the sessions on it and their state (queued, working, done, failed — derived from the session records, not typed
    on the line), blocked-by, priority, age; grouped by status by default, switchable to by goal, by plan, by
    document, by worker; filters and search in the URL like component:instance-table; sub-tasks nest under their
    task and a plan's tasks under its request task
  unless: a task is in an archived plan (decision:memory.forgetting), in which case it shows only with "done work" on
  status: shipped
  refines: req:wf2.ui.tasks
  satisfied-by: [page:web/work, op:api.work]
  requires-tests: [test:web-components#work-view, ui-test:work-view]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-view, test:web-lib#work]
- id: req:exec.work-states
  title: A task's live state comes from its sessions; its status stays on the line
  when: the Work view or a task's panel renders a task
  then: >
    the status on the line (todo, open, in-progress, blocked, review, done) is the person's or agent's word; a derived
    state beside it says what is happening now — queued (a session for it waits for a runner or in a worker's queue),
    working (a session's open turn holds it), stalled (a session on it stopped or failed with the task not done),
    unassigned (no worker, no session) — and the app moves the status itself only at two points: to in-progress when a
    session takes the task, and to review when the session that held it ends with the task not marked done
  unless: the task line says #blocked, which no session changes
  status: shipped
  refines: req:exec.work-view
  satisfied-by: [op:api.work, rule:task-artifacts, lib:sessions]
  requires-tests: [test:web-lib#work-states]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-view, ui-test:work-assign, test:web-lib#work]
- id: req:exec.dispatch
  title: A task is handed to a worker from where it is listed
  when: "Assign" on a task row or panel picks a worker — a person, a named agent, the runner pool — with an optional note and the plan-first tick
  then: >
    for an agent, a session is created (or the item queued on that worker's live conversation) whose instruction is
    the task's text and note, whose refs are the task, its document and what it is part of, and whose first message
    carries the constraint packet (req:memory.intake-packet); the task gets `worker:` and the session id; the row shows
    queued at once and working when a runner claims it; for a person, `worker:` is set and nothing else happens; a
    second Assign on a held task asks before it re-queues
  unless: the task is done, or blocked with a blocked-by that is not done, in which case Assign is refused with the reason
  status: shipped
  refines: req:exec.work-view
  satisfied-by: [op:api.work.assign, op:api.sessions, rule:session-queue, component:command-box]
  requires-tests: [test:server-services#dispatch-creates-session, ui-test:work-assign]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-assign]
- id: req:exec.request-is-a-task
  title: A request sent to an agent is on the Work view from the moment it is sent
  when: a request starts a session from the command box, a "Send to agent", a queued item with fresh context, or a hand-off
  then: >
    the plan document the app creates carries a task line for the request (`task:<plan-slug>`, the request's first
    line as its text, part of the goal or node it was sent from when there is one) with `worker:` the agent and the
    session id, and the session's refs include it; the agent's own task lines under the plan nest under it; when the
    session ends the request task moves to review, or to done when the agent marked it done
  unless: the request is a reply in a live conversation that already holds a task (the message joins that task)
  status: shipped
  refines: req:wf2.sessions.plan-doc
  satisfied-by: [lib:plan-doc, rule:plan-doc, op:api.sessions]
  requires-tests: [test:web-lib#plan-doc-request-task, ui-test:plans]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-assign, test:web-lib#plan-doc]
- id: req:exec.done-comes-back
  title: A finished task shows what it produced and what it asks for
  when: a session on a task ends
  then: >
    the task's panel and row show the result summary, the blocks the session added, changed or removed
    (rule:task-artifacts), the questions it left open and the decisions it proposed with their Inbox state, and a
    "Review" action that opens them in the Inbox filtered to this task; ticking the task done from the row or the
    panel sets the status and the session
  status: shipped
  refines: req:exec.work-view
  satisfied-by: [component:produced, op:api.sessions.changes, rule:task-artifacts]
  requires-tests: [test:web-components#task-result]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-assign]
- id: req:exec.human-work
  title: A person's work is on the same view as an agent's
  when: a task has a person as its worker, or no worker
  then: it is listed, grouped and filtered like any other; "mine" filters to the person; ticking it done records the person as `by`
  status: shipped
  refines: req:exec.work-view
  satisfied-by: [page:web/work]
  requires-tests: [test:web-components#work-view-people]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-view, ui-test:work-assign]
```

```yaml
- id: question:exec.auto-dispatch
  title: May a runner take unassigned open tasks on its own, or only tasks that were assigned?
  q: >
    Today runners claim queued sessions, which exist only because a person sent something. With tasks on one view, a
    runner could take the next open, unblocked, unassigned task of a goal in priority order — the amux / hub-and-spoke
    model. Is that wanted, for which goals, and with what stop (a budget of tasks per hour, a person's "go")?
  context: >
    req:exec.dispatch proposes explicit assignment only; auto-dispatch is a per-goal opt-in the person would switch on.
    The risk is the one the approval guidance names: work that starts without anyone having looked at it.
  status: open
  related-to: [req:exec.dispatch, rule:agent-runner]
- id: question:exec.priority
  title: How is order expressed — a priority number on the line, the order in the document, or both?
  q: >
    A board needs an order; the documents have one (the order of task lines), and a `priority:` property would be a
    second one. Is document order the priority within a plan, and `priority` the order across plans?
  context: >
    decision:exec.task-is-the-unit adds `priority: number?` to type:task; drag-to-reorder on the Work view would have
    to write one or the other back.
  status: open
  related-to: [decision:exec.task-is-the-unit, req:exec.work-view]
```

## E.2 An edit keeps its old value and is reviewed like a proposal

```yaml
- id: decision:exec.change-record
  title: Every edit of a typed node is written through, and a change record keeps the old and new value with a review state
  context: >
    An edit through op:api.node or the editor rewrites the defining line; rule:block-attribution notes that the
    block changed; the old value survives only in git. The person wants old and new side by side and the edit treated
    as an Inbox item. Suggesting-mode systems keep before and after as a pending proposal that is accepted or rejected
    like a diff; markdown is canonical here (rule:markdown-canonical) and a proposal that is not in the document is
    invisible to agents reading the file.
  choice: >
    The write goes through as today — the document shows the new value, git has the history. Beside it the app writes a
    change record (store:changes, `_changes/<id>.json`): node id, document and line, `before` and `after` (the whole
    defining block: text and properties), who (person or agent name), session, time, and a state — pending, accepted,
    reverted — plus the impact run it triggered (E.3) and the verdicts of the write-time pass
    (decision:memory.write-time-verdict). A node with a pending change shows a "changed" badge with the old value on
    hover; the Inbox lists pending changes under a Changes group with a field-level and word-level diff; Accept marks
    the record accepted (nothing else moves), Revert writes `before` back through the same writer (and records that as
    its own change). An edit by an agent to a node whose status is approved or shipped is also pending; the constraint
    packet marks such nodes "changed, pending review" so a worker reading it knows. A person's edits to their own
    proposed blocks are accepted at once (a draft is a draft).
  alternatives: >
    Suggesting mode in the markdown (the old value stays canonical, the proposal is a sibling block) — two truths in the
    document, agents read the wrong one; git only — no old value for a property, no review state, no impact link; a
    `history:` content block under the node — clutters every document with what the app can keep beside it.
  consequences: >
    A new operational store like sessions (json, not knowledge); the Inbox gains a group; Revert exists; the block
    editor and node-edit both write the record; the change record is the input and the parent of the impact run.
  date: 2026-09-19
  status: proposed
  affects: [op:api.node, rule:block-attribution, rule:inbox-review, rule:markdown-canonical]
  part-of: goal:exec.work-and-impact
```

```yaml
- id: req:exec.change-kept
  title: An edit of a typed node keeps its old value
  when: the defining line or card of a typed node is changed — in the editor, through op:api.node, by `wf node set`, or by an agent writing the file
  then: >
    a change record holds before and after (text and properties), who, session, time and state pending; the node shows
    a changed badge; the record is listed in the Inbox under Changes with a diff — property by property, and word by
    word inside a text — together with the unchanged fields that frame it (kind, status, parent, what it refines)
  unless: >
    the change is only a status or tracking field set through `wf node set` or a checkbox (recorded, accepted at once,
    not listed); or the block is a plain paragraph (no record; git has it); or the person edits their own proposed block
  status: shipped
  satisfied-by: [store:changes, op:api.changes, component:change-card, rule:block-attribution]
  requires-tests: [test:web-lib#change-record, test:web-components#change-diff]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:change-review, test:web-lib#changes]
- id: req:exec.change-review
  title: A pending change is accepted or reverted in the Inbox
  when: a change card's Accept or Revert is used
  then: >
    Accept marks the record accepted and clears the badge; Revert writes the old value back through the writer, marks
    the record reverted and records the revert as a change of its own; either one names the person and the time; a
    change that was edited again after it was listed shows "changed since" and asks for a fresh look before Accept
  unless: the document changed under the record (the line is gone or moved) — then Revert shows the old value and offers to paste it, never guesses a line
  status: shipped
  refines: req:exec.change-kept
  satisfied-by: [op:api.changes, component:change-card, rule:atomic-file-write]
  requires-tests: [test:web-lib#change-revert, ui-test:change-review]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:change-review, test:web-lib#changes]
- id: req:exec.review-readable
  title: A review card shows what a person needs to decide, and folds the rest
  when: a proposed block or a pending change is listed in the Inbox
  then: >
    the card reads as a title, one description enough to understand it (a requirement as its behaviour, a decision
    as its choice, a change as what changed with old and new), the open conflicts and the impact that asks for action,
    and nothing else; who, when, where, ids, unchanged fields, other properties, refs, consistent verdicts and the
    reached-not-judged list are under a details fold
  unless: a candidate or verdict asks for action, in which case it is on the surface with its reason
  status: shipped
  refines: req:exec.change-review
  satisfied-by: [rule:review-readable, lib:review-summary, component:change-card, component:review-list, component:impact-card]
  verified-by: [test:web-lib#review-summary]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.work-and-impact
- id: req:exec.change-validated
  title: A change is validated on write like a new block
  when: a change record is created for a decision, requirement, rule, constraint or goal
  then: >
    the write-time verdict pass (req:memory.verdicts) runs on the new value against the node's neighbours and the
    approved constraints, and its verdicts are shown on the change card; a contradicts verdict blocks Accept until the
    person chooses supersede, refine or dismiss-with-reason, exactly as for a new block
  status: shipped
  refines: req:memory.verdicts
  satisfied-by: [op:api.verdicts, component:change-card]
  requires-tests: [test:web-lib#change-verdicts]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:change-review]
```

## E.3 Impact — what an edit reaches, and the updates it needs

```yaml
- id: decision:exec.impact-run
  title: An edit's impact is computed structurally with semantic seeding, then a model judges each reached node and proposes its update
  context: >
    `ctx impact` walks the reverse structural closure three hops; op:api.context finds the semantically nearest nodes;
    neither says what an edit means for the nodes it reaches. The 2026 impact-analysis work finds that structure
    alone misses renamed or paraphrased dependents, semantics alone floods (0.42 precision), and the blend with a
    verification step is the shape that works; Kiro regenerates only what the change reaches, on an explicit sync.
    STALE finds second-hop, propagated effects are what models miss when left to notice them on their own.
  choice: >
    An impact run takes a change record and produces an impact set: (1) candidates from structure — the node's content
    (its sub-items), what refines it, what it is satisfied by and verified by, what it governs or is governed by,
    what depends on it, what is part of it, tasks that serve it, what mentions it — two hops over reversed edges with
    decay, each candidate with its path; (2) candidates from semantics — the nearest nodes to the new text that
    structure did not reach, marked "by text"; (3) one model call per candidate (batched, budgeted, cached by pair
    hash) that reads the before, the after, the candidate and its path and answers: unaffected | update — with the
    proposed new text or property values for the candidate | rework — a sentence saying what has to change when it is
    more than the block | contradicts — the new value and the candidate cannot both hold | ask — a question the
    person must answer first. The run is stored on the change record; the change card lists the impact set grouped by
    verdict, each with its path and reason; an update is a proposed patch with old and new that Apply writes through
    the writer (and records as a change by the app, accepted); a rework becomes a task line under the change's plan
    (or a new plan "Follow up: <node>") on the Work view, unassigned, with the reason as its text, which the person
    assigns to a worker (req:exec.dispatch); a contradicts opens a contradiction as in decision:memory.write-time-verdict;
    an ask is a question: block on the changed node.
  alternatives: >
    Structure only (misses paraphrased dependents); semantics only (floods); regenerate the dependents outright as Kiro
    does (the documents are the person's, not generated — patches and tasks, never rewrites); ask one agent session to
    "update everything" (unbounded, invisible, and it would edit approved blocks without review).
  consequences: >
    A run per change, budgeted per rebuild like the verdict pass; an impact set on the change card; patches, tasks,
    contradictions and questions as the four outcomes, each landing where that kind already lives; the Work view gains
    "follow-up" tasks the app wrote; `ctx impact` grows `--semantic` and `--explain` (paths) for agents.
  date: 2026-09-19
  status: proposed
  affects: [op:api.context, decision:memory.write-time-verdict, req:exec.dispatch, rule:inbox-review]
  part-of: goal:exec.work-and-impact
- id: decision:exec.impact-trigger
  title: Impact runs after the person stops editing a typed node, never on every keystroke, and only when something is reached
  context: >
    "not always" — the person does not want a model call on every edit. An edit is many keystrokes; a paragraph edit
    reaches nothing; a status change is not a change of meaning.
  choice: >
    A change record is created when the editor's block loses focus or the document saves, whichever is first, one per
    node per editing spell (edits within five minutes on the same node fold into one record); the impact run starts
    when the record has structural candidates or the text changed by more than a property value, at most one run per
    node in flight (a further edit restarts it); a status or tracking-field change, a plain paragraph and a node with
    no dependents produce no run. "Impact" on any node's panel runs it on demand, with or without a change. A product
    setting (`_product.md`: impact: auto | manual | off) and a per-run budget cap it; `manual` keeps the change records
    and skips the model.
  alternatives: >
    Run on every save (noise and cost); run only on demand (the person forgets, which is the failure the ask is about);
    run at session end only (a person's edit in the editor has no session).
  consequences: >
    The editor sends the change on blur/save; the run is asynchronous and its card fills in as verdicts arrive (the
    change is reviewable before the run finishes); the setting lives on the product file.
  date: 2026-09-19
  status: proposed
  affects: [op:api.node, store:product-file]
  part-of: goal:exec.work-and-impact
```

```yaml
- id: req:exec.impact-set
  title: An edit's change card shows what it reaches and why
  when: a change record's impact run has candidates
  then: >
    the card lists the impact set grouped by verdict — update, rework, contradicts, ask, unaffected folded — each
    candidate with its id, kind, the path from the changed node ("refined-by → satisfied-by", or "by text") and the
    model's one-sentence reason; the set fills in as verdicts arrive and the card says how many are still pending
  unless: the run is off for the product or over budget, in which case the card shows the structural candidates with no verdicts and an "Impact" button
  status: shipped
  satisfied-by: [op:api.impact, component:change-card, lib:impact]
  requires-tests: [test:web-lib#impact-candidates, test:web-components#impact-card]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:change-review, test:impact]
- id: req:exec.impact-patch
  title: A proposed update is a patch with old and new, applied from the card
  when: a candidate's verdict is update
  then: >
    the card shows the candidate's current text or property beside the proposed one as a diff; the proposal is
    editable in place; Apply writes it through the writer, records a change accepted by the person, and re-runs the
    verdict pass on the candidate if it is a decision, requirement, rule, constraint or goal; Skip marks it declined
    with an optional reason; Apply all takes every unedited update of the card
  unless: the candidate changed since the run (its hash differs) — then the card says so and the patch is recomputed before Apply
  status: shipped
  refines: req:exec.impact-set
  satisfied-by: [op:api.impact.apply, component:change-card, rule:atomic-file-write]
  requires-tests: [test:web-lib#impact-apply, test:web-lib#impact-stale-candidate]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:change-review]
- id: req:exec.impact-rework
  title: An update that is more than a line becomes a task on the Work view
  when: a candidate's verdict is rework
  then: >
    a task line is written — under the plan the change belongs to, else under a plan the app creates for the changed
    node ("Follow up: <title>") — with the reason as its text, part of the candidate and of the changed node, worker
    unassigned, and the change record links it; the Work view lists it with the change as its source; Assign sends it
    to a worker with the change (before, after, reason) in the refs
  status: shipped
  refines: req:exec.impact-set
  satisfied-by: [op:api.impact, lib:plan-doc, req:exec.dispatch]
  requires-tests: [test:web-lib#impact-rework-task]
  part-of: goal:exec.work-and-impact
  verified-by: [test:impact]
- id: req:exec.impact-contradiction
  title: A candidate the new value cannot hold with becomes a contradiction
  when: a candidate's verdict is contradicts
  then: >
    an open contradiction with both sides and the reason is created (decision:memory.write-time-verdict) and the
    change's Accept asks for supersede, refine or dismiss-with-reason
  status: shipped
  refines: req:exec.impact-set
  satisfied-by: [op:api.verdicts]
  requires-tests: [test:web-lib#impact-contradiction]
  part-of: goal:exec.work-and-impact
  verified-by: [test:impact]
- id: req:exec.impact-sub-items
  title: A node's own content is the first thing an edit reaches
  when: the changed node has content — sub-requirements, sub-tasks, child blocks, questions and decisions under it
  then: every child is a candidate at distance one with path "content", before any other edge; a child whose text repeats the old value verbatim is proposed as an update without a model call
  status: shipped
  refines: req:exec.impact-set
  satisfied-by: [lib:impact]
  requires-tests: [test:web-lib#impact-content-first]
  part-of: goal:exec.work-and-impact
  verified-by: [test:impact]
- id: req:exec.impact-for-agents
  title: An agent gets the same impact analysis for an edit it is about to make
  when: an agent runs `wf impact <id> --after "<new text>"` or `ctx impact <id> --semantic --explain`
  then: >
    the structural and semantic candidates with paths come back at once and the verdicts follow (wf waits up to
    the run's budget); the contract asks an agent to run it before editing an approved node and to list the
    updates it made or the tasks it left
  status: shipped
  refines: req:exec.impact-set
  satisfied-by: [op:api.impact, rule:agent-contract]
  requires-tests: [test:cli#wf-impact]
  part-of: goal:exec.work-and-impact
  verified-by: [test:impact, ui-test:change-review]
```

```yaml
- id: question:exec.agent-edits-pending
  title: Does an agent's edit to an approved node wait for review before agents downstream see it as current?
  q: >
    decision:exec.change-record writes every edit through and marks an agent's edit of an approved node pending. A
    second worker reading the graph sees the new value. Should the constraint packet and `wf context` serve the old
    value (the approved one) until Accept, the new one marked pending, or both?
  context: >
    Two truths in the document is what the decision avoided; serving the pending value marked is the cheapest; serving
    the approved value needs the packet to read the change record's `before`.
  status: open
  related-to: [decision:exec.change-record, req:memory.intake-packet]
- id: question:exec.impact-model
  title: Which model judges impact, and what does a run cost?
  q: >
    A change to a requirement with twenty structural candidates is twenty pair judgements. Is the verdict model the
    small fast one with the large one on demand, and is the budget per run, per hour or per product?
  context: >
    decision:memory.write-time-verdict caches by pair hash; the impact run can share the cache. The benchmark of
    decision:memory.benchmark can score models on impact too if the 78 drift edges get a "what should have changed" label.
  status: open
  related-to: [decision:exec.impact-run, decision:memory.benchmark]
```

## E.4 Backlog — items dropped for a worker to discover

```yaml
- id: decision:exec.backlog-is-unassigned-work
  title: The backlog is the unassigned tasks; the inbox folder stays raw material; a task marked ready may be taken by a runner
  context: >
    The person wants to drop items for an agent to discover and work on, "maybe it is the inbox". The inbox folder
    (store:inbox) holds raw material without a document — pasted conversations, notes — that a person files or
    dismisses (rule:inbox-review); the Inbox view lists proposed blocks. Work is a task line (decision:exec.task-is-the-unit).
    question:exec.auto-dispatch asked whether runners may take unassigned tasks on their own.
  choice: >
    A backlog item is a task line with no worker. Capture is one gesture from anywhere — the command box's "Later"
    (⌘P, type, ⇧↵) and a "+ backlog" on any node or document — that writes `- [ ] task:<slug> <text>` into the
    project's plan document (the follow-ups home rule:agent-contract already names) or under the node it was
    captured from when there is one, with `by:` the person and the date; an inbox note can be filed as a task the same
    way. The Work view's Unassigned group is the backlog, in priority then capture order. A task is discoverable by
    runners only when it says `#ready` (a person's word that it is defined enough to start): `wf work next` returns
    the oldest ready, unblocked, unassigned task of the product (or of a goal), a runner in auto mode (`wf agent
    listen --take-ready`) claims it as if assigned (req:exec.dispatch), and everything else on the backlog is
    visible to agents (`wf work list --unassigned`) but not taken. This resolves question:exec.auto-dispatch: never
    silently, per task, by the ready mark.
  alternatives: >
    A separate backlog document per product (one more place; the plan document is that place already); the inbox
    folder as the backlog (raw notes are not work items and have no status, goal or worker); auto-dispatch of every
    open task (work starts that nobody looked at).
  consequences: >
    `ready` joins the task statuses as a mark, not a stage (a ready task is still todo); the command box gains
    "Later"; `wf work list|next` join the CLI; a runner gains `--take-ready`; the Work view's Unassigned group shows
    the ready ones first with a mark.
  date: 2026-09-19
  status: proposed
  resolves: question:exec.auto-dispatch
  affects: [rule:inbox-review, store:inbox, component:command-box, rule:agent-runner, req:exec.dispatch]
  part-of: goal:exec.work-and-impact
```

```yaml
- id: req:exec.capture
  title: A work item is captured in one gesture, from anywhere, without assigning it
  when: the person uses "Later" in the command box, "+ backlog" on a node or document, or files an inbox note as a task
  then: >
    a task line is written into the project's plan document, or under the node it was captured from, with the text,
    `by:` and the date, no worker; it appears in the Work view's Unassigned group at once; the source node or note is
    linked as what the task is part of
  status: shipped
  refines: req:exec.work-view
  satisfied-by: [component:command-box, op:api.work, lib:plan-doc]
  requires-tests: [test:web-lib#capture-task, ui-test:work-capture]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-assign]
- id: req:exec.ready-for-runners
  title: A runner takes only what a person marked ready
  when: a runner listens with --take-ready and no session is queued for it
  then: >
    it claims the oldest ready, unblocked, unassigned task of its product — or of the goals it was given — as if a
    person had assigned it: a session with the task, its document, what it is part of and the constraint packet;
    the task shows the runner as worker and working; a task without the ready mark is never taken
  unless: the product setting says no auto-take, or the task's plan is still defining (E.5)
  status: shipped
  refines: req:exec.dispatch
  satisfied-by: [rule:agent-runner, op:api.work.next, op:api.sessions.claim]
  requires-tests: [test:server-services#take-ready-only, test:cli#wf-work-next]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-assign, test:web-lib#work]
- id: req:exec.backlog-for-agents
  title: An agent can read the backlog and add to it
  when: an agent runs `wf work list [--unassigned|--mine|--goal <id>]` or `wf work add "<text>" [--part-of <id>]`
  then: the list comes back with status, ready mark, goal, plan and worker; add writes a task line the same way the person's capture does, with `by:` the agent
  status: shipped
  refines: req:exec.capture
  satisfied-by: [op:api.work, rule:agent-contract]
  requires-tests: [test:cli#wf-work-list-add]
  part-of: goal:exec.work-and-impact
  verified-by: [ui-test:work-assign]
```

## E.5 Talk to Wye — define first, then build

```yaml
- id: goal:exec.define-first
  title: A request is understood, explained and agreed as knowledge before anyone builds it
  description: >
    The person tells Wye what they want in their own words; Wye finds what the product already knows about it and
    shows it in the context column, explains the current state in plain language with the nodes as tags, asks the
    few questions the requirement shape needs, proposes requirements, decisions, questions and tasks as blocks, and
    keeps them as one definition on the request's plan until every block is agreed; then the plan is built by any
    worker from that definition, and every change the conversation proposed is tracked as part of it.
  status: proposed
  owner: alex
  part-of: module:prd-execution
  depends-on: [goal:memory.validated-asks, goal:exec.work-and-impact, req:wf2.clerk]
```

```yaml
- id: decision:exec.wye-is-a-role
  title: Wye is a session role — the librarian — with the clerk's guardrails, not a new runtime
  context: >
    The v2 design has an internal agent, the clerk (req:wf2.clerk): propose-only, budgeted, cannot trigger itself.
    Sessions today host Claude Code and Codex as child processes with the agent contract as system prompt
    (rule:agent-host). The person wants to talk to "the system", which must read the graph, explain it and write
    proposed knowledge — never code.
  choice: >
    A session has a role: worker (today) or librarian. A librarian session runs on the same host with a different
    system prompt (prompts/librarian-system.md: read Wye, explain, ask along the requirement shape, propose blocks,
    never edit code, never mark anything approved) and a closed tool set — the wf read commands, `wf propose`
    (writes proposed blocks into home documents and embeds them on the plan), `wf plan` (the plan's status and
    definition), AskUserQuestion — with no shell, no file writes outside the product's documents, and a budget
    (req:wf2.clerk.budget). "Ask Wye" in the command box starts a librarian session on a new plan (status defining);
    the same role serves the on-demand explain ("what do we know about X") from any node.
  alternatives: >
    The worker agent with plan-first (it is a coding agent reading code; the person wants product state, and it
    would edit the code the moment it is allowed); a hand-rolled tool-use loop over the Messages API (the v2 clerk
    design — a second runtime to maintain when the host already streams, asks questions and records artifacts).
  consequences: >
    A role on the session record and the plan; a second system prompt; a tool allow-list per role on the host; the
    librarian's writes are proposed blocks only, so the Inbox and the verdict pass cover them.
  date: 2026-09-19
  status: proposed
  affects: [req:wf2.clerk, rule:agent-host, rule:agent-contract, component:command-box]
  part-of: goal:exec.define-first
- id: decision:exec.librarian-may-build
  title: "Build it" said to the librarian starts the build — the librarian runs `wf plan build`, it never tells the person to press a button
  context: >
    On 2026-09-20 the person told the librarian "i asked to build this one" on plan:plan-build and got a paragraph
    explaining that Build was theirs to press (decision:exec.wye-is-a-role: the librarian writes no code; rule:build
    lives in the UI; the wf CLI had no Build). Nothing started. The person's word in the conversation is the same
    approval the button gives.
  choice: >
    `wf plan build <plan> [--worker claude-code|codex|runner] [--force]` — the plan's request task assigned with
    `build: <plan>` through op:api.work.assign, exactly what the Build button does (rule:build): the Definition goes
    with it, unagreed blocks listed as such, the plan moves to building. The librarian's tool set includes it, and
    its prompt says: when the person says build / go ahead / do it / implement, run it at once, report the session
    that started and what was still open, and finish. The librarian still writes no code — the worker does. Never
    "that is yours to press".
  alternatives: >
    Keep Build UI-only and have the librarian ask the person to press it (what happened; the person had already said
    it); let the librarian implement (breaks the role).
  consequences: >
    bin/wf.js gains `plan build`; prompts/librarian-system.md and the host's librarian protocol gain the line;
    rule:build's "a librarian's hold does not refuse it" already covers the hand-over.
  date: 2026-09-20
  status: proposed
  refines: decision:exec.wye-is-a-role
  affects: [decision:exec.wye-is-a-role, rule:build, req:exec.build-from-definition]
  by: agent:claude
  part-of: goal:exec.define-first
- id: decision:exec.plan-lifecycle
  title: A plan goes proposed → defining → defined → building → done, and its Definition section is the set of blocks it will build
  context: >
    type:plan today: proposed → building (after Proceed) → done | cancelled (rule:plan-doc). The person wants to agree
    on all requirements first, then let it be implemented, and have every proposed change tracked so it can be built
    later — the v0.1 delta (entity:delta, "how a feature enters the graph before code") as a living page.
  choice: >
    A plan document gains a Definition section between Context and Plan: every block the librarian or the person
    proposed for this request — requirements, decisions, constraints, questions, and change records of edits to
    existing nodes — defined in their home documents and embedded here (rule:embed-line), each with its review state.
    Statuses: proposed (created), defining (a librarian session is on it), defined (every block in Definition is
    approved or resolved and no open contradiction touches them — computed, shown as a check), building (a worker
    holds its request task), done, cancelled. "Build" on a defined plan assigns the request task (req:exec.dispatch)
    with the Definition — the approved blocks' text, the change records' before / after, the constraint packet — as
    the instruction's context; a plan that is not defined can still be built, and the button says what is unagreed.
    The Definition is the plan's change set: the Work view and the plan page show it as "n blocks, k approved, j
    open", and a plan can be built weeks later by a different worker from the same page.
  alternatives: >
    Agree in the conversation only (the transcript is not a definition anyone can build from later); a separate
    spec document per request (the plan is that document); statuses on the conversation rather than the plan (a
    plan outlives its sessions).
  consequences: >
    type:plan gains statuses and the Definition section; lib:plan-doc writes and reads it; `defined` is computed from
    the embedded blocks' statuses; Build is a dispatch with the definition as context; rule:plan-doc is refined.
  date: 2026-09-19
  status: proposed
  affects: [type:plan, rule:plan-doc, lib:plan-doc, req:exec.dispatch]
  part-of: goal:exec.define-first
```

```yaml
- id: req:exec.ask-wye
  title: A request typed to Wye starts a definition conversation on its own plan
  when: the person types a request in the command box and chooses "Ask Wye" (the default when nothing is selected and no live conversation is chosen)
  then: >
    a plan document is created with the request and status defining, a librarian session opens on it in the content
    column as a chat page, and its first turn is the context search and the explanation (req:exec.wye-context,
    req:exec.wye-explains); the same request from a node's "Ask Wye" carries the node as the subject
  unless: the person chose "Do" or a live worker conversation, which behave as today
  status: shipped
  satisfied-by: [component:command-box, op:api.sessions, lib:plan-doc, decision:exec.wye-is-a-role]
  requires-tests: [test:server-services#ask-wye-creates-plan, ui-test:ask-wye]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.wye-context
  title: Wye finds what the product knows and shows it in the context column while it reads
  when: a librarian session takes a request
  then: >
    it runs the constraint packet for the request (req:memory.intake-packet) and the semantic search, and the context
    column shows a Context card that fills in live — the nodes found, grouped: what exists (pages, actions, ops with
    their status), what is required (requirements with status), what is decided and what constrains, open questions,
    work in progress or done on the same area (tasks, plans) — each a tag that opens the node; the card stays at the
    top of the column for the conversation
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [op:api.packet, component:context-panel, rule:context-panel]
  requires-tests: [test:web-components#wye-context-card]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.wye-explains
  title: Wye explains the current state before it proposes anything
  when: the Context card has filled in
  then: >
    the first reply is the current state in plain language with the nodes as tags — what the product does today in
    this area, what is already decided or constrained, what is in progress, what the request would change — and it
    says plainly when the request is already satisfied, partly satisfied, or contradicts a constraint or decision,
    naming the node
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [decision:exec.wye-is-a-role, component:transcript-markdown]
  requires-tests: [test:librarian#explains-with-tags]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye, ui-test:explain]
- id: req:exec.wye-asks
  title: Wye asks along the requirement shape, few questions, as a form
  when: the request leaves a requirement's when, then or unless unspecified, or a constraint in force makes two readings possible
  then: >
    it asks up to three questions at a time as a question form (rule:agent-questions), each tied to the slot it fills
    or the constraint it resolves, with the reading it would otherwise assume as the first option; a question the
    person skips becomes a question: block in the Definition; it does not ask what the graph already answers
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [component:ask-questions, rule:agent-questions, decision:exec.wye-is-a-role]
  requires-tests: [test:librarian#asks-shape-slots-only]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.wye-proposes
  title: Wye proposes the definition as blocks in their home documents, embedded on the plan
  when: the state is explained and the questions answered
  then: >
    it writes requirements (when / then / unless, refines, satisfied-by the existing mechanism where one exists),
    decisions (with alternatives and what they affect), constraints, questions and task lines — each `status:
    proposed` in the document where that kind lives (the PRD, the design, the module page), an edit of an existing node
    as a change record (req:exec.change-kept) — and embeds every one in the plan's Definition; the verdict pass runs
    on each (req:memory.verdicts) and the reply lists them with their verdicts; the person approves, edits or rejects
    in the Inbox, on the plan page or by replying
  unless: the request is already satisfied, in which case the reply says so and proposes nothing
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [op:api.node, lib:plan-doc, rule:embed-line, op:api.verdicts]
  requires-tests: [test:librarian#proposes-in-home-documents, test:web-lib#plan-definition-embeds]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.plan-defined
  title: A plan is defined when its Definition is agreed
  when: every block embedded in a plan's Definition is approved, resolved or rejected, and no open contradiction touches an approved one
  then: the plan's status becomes defined; the plan page and the Work view show "defined" with the counts; a change to any embedded block after that returns the plan to defining and says which block
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [lib:plan-doc, decision:exec.plan-lifecycle]
  requires-tests: [test:web-lib#plan-defined-computed]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye, test:web-lib#plan-doc]
- id: req:exec.build-from-definition
  title: A defined plan is built by any worker from its Definition
  when: Build is pressed on a plan, now or weeks later
  then: >
    the plan's request task is assigned (req:exec.dispatch) with the Definition as context — every approved block's
    text and id, every change record's before and after, the constraint packet — and the plan moves to building; the
    worker's tasks nest under the request task; on done the plan's Result lists what was built against each block of
    the Definition (implemented, changed, left) and the requirements the worker marked shipped
  unless: the plan is not defined, in which case Build lists the unagreed blocks and asks to go ahead anyway
  status: shipped
  refines: req:exec.plan-defined
  satisfied-by: [op:api.work.assign, lib:plan-doc, rule:task-artifacts]
  requires-tests: [test:server-services#build-carries-definition, ui-test:build-plan]
  part-of: goal:exec.define-first
  verified-by: [ui-test:build-plan]
- id: req:exec.definition-tracked
  title: Every change a definition conversation proposes is tracked as part of the plan
  when: a librarian session, or the person during it, adds a block or edits a node while the plan is defining
  then: the block or change record is embedded in the Definition automatically (the session id links them), so nothing proposed in the conversation exists only in the transcript; the plan page shows the Definition as a list with status per item and a diff for edits
  status: shipped
  refines: req:exec.plan-defined
  satisfied-by: [lib:plan-doc, rule:block-attribution, store:changes]
  requires-tests: [test:web-lib#definition-tracks-session-blocks]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.explain-anywhere
  title: "What do we know about this?" works on any node without starting a request
  when: "Explain" is used on a node or a selection, or `wf explain <id|text>` runs
  then: a librarian turn returns the current state for it — the Context card and the explanation — in the context column or on stdout, and proposes nothing
  status: shipped
  refines: req:exec.wye-explains
  satisfied-by: [decision:exec.wye-is-a-role, op:api.packet]
  requires-tests: [test:cli#wf-explain]
  part-of: goal:exec.define-first
  verified-by: [ui-test:explain]
```

```yaml
- id: question:exec.wye-model
  title: Which model and agent runs the librarian, and does it reuse a worker's conversation or always start clean?
  q: >
    The host runs Claude Code and Codex; the librarian could be either with the librarian prompt and tool
    allow-list, or the Messages API directly. A clean session per request keeps the context honest; a person may
    want to continue defining on the same conversation across days.
  context: decision:exec.wye-is-a-role keeps the host; the model and the continuation policy are not decided.
  status: open
  related-to: [decision:exec.wye-is-a-role, rule:clean-slate]
- id: question:exec.definition-home
  title: When the home document for a proposed block does not exist yet, where does Wye write it?
  q: >
    A requirement for a new area has no PRD section; a constraint has no constitution page until
    decision:memory.constraint-type lands. Does Wye create the document, write into the plan and let the person move it,
    or ask?
  context: rule:embed-line keeps one definition per block; the plan embeds. The Inbox's "file into a document" exists for notes.
  status: open
  related-to: [req:exec.wye-proposes, rule:embed-line]
```

## Types this PRD adds (declared once approved; a `markdown` fence, so nothing parses it yet)

```markdown
- id: type:task            # additions to the base type
  props:
    worker: string?        # a person's name or an agent name; who holds the task now
    priority: number?
    blocked-by: list of task? -(inverse)-> blocks
    change: string?        # the change record a follow-up task came from
    ready: bool?           # the person's mark that a backlog task may be taken by a runner (#ready)
- id: type:plan            # additions: statuses proposed | defining | defined | building | done | cancelled
  props:
    role: string?          # the session role that filled it: librarian | worker
    definition: text?      # the Definition section: embedded blocks and change records, computed counts
- id: type:session         # not a document node: additions to the session record
  props:
    role: enum [worker, librarian]
- id: type:change          # not a document node: the shape of a change record in store:changes
  purpose: an edit of a typed node — before, after, who, when, its review state, its impact run
  props:
    node: ref node
    before: text
    after: text
    by: string
    session: string?
    state: enum [pending, accepted, reverted]
    impact: text?          # the impact set: candidate, path, verdict, reason, patch or task
```

## Work

<!-- tasks -->
- [x] task:exec.task-props type:task gains worker, priority, blocked-by (inverse blocks) and the review status; the parser reads them from the property group; TrackList shows worker. Part of goal:exec.work-and-impact (decision:exec.task-is-the-unit). (session: de966d3bd9)
- [x] task:exec.request-task The plan template and lib:plan-doc write the request as a task line with worker and session; the session's refs carry it; the end hook moves it to review or done. Part of goal:exec.work-and-impact (req:exec.request-is-a-task). (session: de966d3bd9)
- [x] task:exec.work-api op:api.work: every task with its derived state from the session records (queued, working, stalled, unassigned), its plan, goal, worker, sessions, produced counts; lib:work pure and tested. Part of goal:exec.work-and-impact (req:exec.work-states). (session: de966d3bd9)
- [x] task:exec.work-view page:web/work replaces the Tasks entry: rows, groups (status, goal, plan, document, worker), URL filters, nesting, "mine", done folded. Part of goal:exec.work-and-impact (req:exec.work-view, req:exec.human-work). (session: de966d3bd9)
- [x] task:exec.assign Assign on a row and on the task panel: worker picker (people from the product file, agents, runner pool), note, plan-first; creates or queues the session with the constraint packet; refuses done and blocked tasks. Part of goal:exec.work-and-impact (req:exec.dispatch). (session: de966d3bd9)
- [x] task:exec.task-result The task panel's result: summary, blocks, open questions, proposed decisions with Inbox state, Review action, tick done. Part of goal:exec.work-and-impact (req:exec.done-comes-back). (session: de966d3bd9)
- [x] task:exec.change-store store:changes and op:api.changes: a record per edit from the editor, op:api.node, wf node set and the watcher (agent file writes, diffed by block); folding within five minutes; states; the changed badge. Part of goal:exec.work-and-impact (decision:exec.change-record, req:exec.change-kept). (session: de966d3bd9)
- [x] task:exec.change-card component:change-card in the Inbox under Changes: property and word diff, framing fields, Accept, Revert (through the writer, recorded), "changed since", the verdicts of the write-time pass. Part of goal:exec.work-and-impact (req:exec.change-review, req:exec.change-validated). Depends on task:memory.verdict-pass. (session: de966d3bd9)
- [x] task:exec.impact-lib lib:impact pure: structural candidates two hops over reversed edges with decay and paths, content first, verbatim-repeat detection, semantic candidates from the embeddings not reached by structure. Part of goal:exec.work-and-impact (req:exec.impact-set, req:exec.impact-sub-items). (session: de966d3bd9)
- [x] task:exec.impact-run op:api.impact: the run on a change record — batched pair judgements with before / after / candidate / path, verdicts update | rework | contradicts | ask | unaffected, patches with old and new, cached by pair hash, budgeted; asynchronous, the card fills in; product setting impact: auto | manual | off; the trigger on blur / save. Part of goal:exec.work-and-impact (decision:exec.impact-run, decision:exec.impact-trigger). (session: de966d3bd9)
- [x] task:exec.impact-outcomes Apply / Skip / Apply all for patches (op:api.impact.apply, stale-candidate check); rework → task line under the plan or a "Follow up" plan; contradicts → contradiction; ask → question block. Part of goal:exec.work-and-impact (req:exec.impact-patch, req:exec.impact-rework, req:exec.impact-contradiction). (session: de966d3bd9)
- [x] task:exec.impact-cli `wf impact <id> --after` and `ctx impact --semantic --explain`; the agent contract asks for it before editing an approved node. Part of goal:exec.work-and-impact (req:exec.impact-for-agents). (session: de966d3bd9)
- [x] task:exec.capture "Later" in the command box and "+ backlog" on nodes and documents write a task line to the plan document or under the node; inbox notes file as tasks; `wf work list|add`. Part of goal:exec.work-and-impact (req:exec.capture, req:exec.backlog-for-agents). (session: de966d3bd9)
- [x] task:exec.take-ready `#ready` on task lines; `wf work next`; `wf agent listen --take-ready` claims the oldest ready unblocked unassigned task as an assignment; product setting to switch it off. Part of goal:exec.work-and-impact (req:exec.ready-for-runners, decision:exec.backlog-is-unassigned-work). (session: de966d3bd9)
- [x] task:exec.librarian-role Session role on the record; prompts/librarian-system.md; the host's tool allow-list per role (wf read commands, wf propose, wf plan, questions; no shell, no code); "Ask Wye" and "Explain" in the command box and on nodes. Part of goal:exec.define-first (decision:exec.wye-is-a-role, req:exec.ask-wye, req:exec.explain-anywhere). (session: de966d3bd9)
- [x] task:exec.wye-context-card The Context card in the context column: the constraint packet and semantic hits grouped by kind, filling in live from the session's knowledge events; stays at the top for the conversation. Part of goal:exec.define-first (req:exec.wye-context). (session: de966d3bd9)
- [x] task:exec.wye-turns The librarian's first turn (explain with tags, say when satisfied or contradicting), the question form along when / then / unless and constraints (three at a time, skipped → question block), and `wf propose` writing proposed blocks to home documents and embedding them on the plan with verdicts. Part of goal:exec.define-first (req:exec.wye-explains, req:exec.wye-asks, req:exec.wye-proposes). Depends on task:memory.verdict-pass and task:memory.constraint-packet. (session: de966d3bd9)
- [x] task:exec.plan-definition type:plan statuses and the Definition section in lib:plan-doc; blocks and change records of a defining session embed automatically; `defined` computed; the plan page shows the list with status and diffs. Part of goal:exec.define-first (decision:exec.plan-lifecycle, req:exec.plan-defined, req:exec.definition-tracked). (session: de966d3bd9)
- [x] task:exec.build Build on a plan: assign the request task with the Definition as context; unagreed blocks listed when not defined; the Result maps what was built to each block. Part of goal:exec.define-first (req:exec.build-from-definition). (session: de966d3bd9)
- [ ] task:exec.librarian-tests test:librarian — recorded librarian turns on the YesSensei pilot: explains with tags, asks only unfilled slots, proposes into home documents, never edits code; ui-test:ask-wye and ui-test:build-plan in Chrome. Part of goal:exec.define-first.
- [x] task:exec.ui-tests ui-test:work-view, ui-test:work-assign, ui-test:change-review in Chrome (playwright-core): assign a task and see it queued then working; edit a requirement with a sub-requirement and see the change card with the child's proposed update; revert. Part of goal:exec.work-and-impact. (session: de966d3bd9)
<!-- /tasks -->

## Sources

- GitHub changelog, "Copilot cloud agent for Linear is now generally available" (2026-07-23) — github.blog/changelog/2026-07-23-copilot-cloud-agent-for-linear-is-now-generally-available; GitHub docs, Integrating Copilot cloud agent with Linear
- amux, AI Agent Orchestration in 2026: patterns, tools, architecture (shared board, atomic claiming) — amux.io/guides/ai-agent-orchestration-2026
- Toward Semantically-Seeded, Graph-Propagated Impact Analysis Across Software Artifacts: A Vision — arxiv.org/abs/2606.18855
- LLM-Driven Cost-Effective Requirements Change Impact Analysis — arxiv.org/abs/2511.00262
- From Seed to Scope: Reasoning to Identify Change Impact Sets (ICSE 2026); TraceLLM — arxiv.org/abs/2602.01253
- Kiro docs, Feature specs: requirements-first workflow and selective regeneration on sync — kiro.dev/docs/specs/feature-specs
- STALE: Can LLM Agents Know When Their Memories Are No Longer Valid? — arxiv.org/abs/2605.06527 (propagated conflicts)
- Humbleteam, AI agent UX: approval, undo, and human handoff (2026) — humbleteam.com/blog/ai-agent-ux-approval-undo-human-handoff
- Velt, Suggestion mode (before / after as a pending proposal) — velt.dev/suggestions
