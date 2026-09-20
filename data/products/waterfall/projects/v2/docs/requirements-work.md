---
node: module:req-work
type: module
title: Work, changes and impact
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 15
---

# Work, changes and impact

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Work, changes and impact); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

```yaml
- id: req:exec.assigned-visible
  title: An assigned task says who holds it and links to its execution plan
  when: a task has been assigned or built and its session is queued or running
  then: the task's Work section shows the worker, since when, a link to the execution plan the assignment created and the conversation; a finished session's result links to its plan too
  status: shipped
  refines: req:exec.dispatch
  satisfied-by: [component:task-work]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-work
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
  satisfied-by: [lib:pr-doc, rule:pr-doc, op:api.sessions]
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
  satisfied-by: [op:api.impact, lib:pr-doc, req:exec.dispatch]
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
- id: req:exec.capture
  title: A work item is captured in one gesture, from anywhere, without assigning it
  when: the person uses "Later" in the command box, "+ backlog" on a node or document, or files an inbox note as a task
  then: >
    a task line is written into the project's plan document, or under the node it was captured from, with the text,
    `by:` and the date, no worker; it appears in the Work view's Unassigned group at once; the source node or note is
    linked as what the task is part of
  status: shipped
  refines: req:exec.work-view
  satisfied-by: [component:command-box, op:api.work, lib:pr-doc]
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
- id: req:wf2.ui.tasks
  title: Tasks are a board
  when: the Tasks entry opens
  then: tasks show as columns by status; opening one shows its links, packet, decisions and deltas
  status: proposed
  satisfied-by: [page:web/tasks, op:tasks.list, op:graph.packet]
  requires-tests: [test:web-components#task-board]
  refines: req:wf2.ui

```

<!-- /list:req -->

## Open questions

<!-- list:question -->

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

<!-- /list:question -->
