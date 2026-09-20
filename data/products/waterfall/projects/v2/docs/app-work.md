---
node: module:app-work
type: module
title: Work, changes and impact
status: proposed
owner: alex
sources:
  - packages/web/src/lib/work.ts
  - packages/web/src/lib/work-io.ts
  - packages/web/src/lib/changes.ts
  - packages/web/src/lib/impact-run.ts
  - packages/web/src/lib/explain.ts
  - packages/web/src/lib/pr-doc.ts
  - packages/web/src/lib/pr-docs.ts
  - lib/impact.js
  - prompts/librarian-system.md
  - packages/web/src/components/WorkList.tsx
  - packages/web/src/components/Assign.tsx
  - packages/web/src/components/TaskWork.tsx
  - packages/web/src/components/ChangeList.tsx
  - packages/web/src/components/ImpactCard.tsx
  - packages/web/src/components/ContextCard.tsx
  - packages/web/src/components/ExplainCard.tsx
part-of: module:app
order: 43
last-verified: 2026-09-20
---

# Work, changes and impact

Work, changes and impact

The code behind module:prd-execution (built 2026-09-19, pr:15): the Work view and dispatch (E.1),
the backlog (E.4), change records (E.2), the impact run (E.3) and the librarian with the plan's Definition (E.5).
What it must do is written on the PRD — goal:exec.work-and-impact, goal:exec.define-first and their requirements;
this document maps the code onto it: the pages, components, libraries, stores and endpoints, and the rules the code
enforces.


## Rules

<!-- list:rule -->

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
  source: packages/web/src/lib/work.ts#stateOf; packages/web/src/lib/work-io.ts#assignTask; packages/web/src/lib/pr-doc.ts#requestTaskStatusOnEnd
  status: shipped
- id: rule:work-nesting
  statement: >
    On the Work view a plan's tasks nest under the plan's request task (`task:<plan-slug>`, written by the plan
    template) or, for a plan created by an assignment, under the task the plan was assigned for (`task:` in the plan's
    frontmatter; the plan embeds it instead of writing a second request task); a sub-task (part of task:x) nests
    under its task. Roots and children are ordered by priority (lower first, unset last), then document and line.
  source: packages/web/src/lib/work.ts#workItems; packages/web/src/lib/pr-doc.ts#planDocBody
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
    question waits; folded when everything reached is unaffected or still pending). Nothing else on the surface:
    who, when, where, the id, "checked against n neighbours · consistent", the unchanged frame, the other fields
    (context, alternatives, consequences, source, evidence), refs, consistent and refines verdicts and the
    reached-not-judged list are under a "details" fold. lib:review-summary decides these (pure, tested).
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
  source: packages/web/src/lib/pr-doc.ts#definitionIds; packages/web/src/lib/pr-doc.ts#definitionState; packages/web/src/lib/pr-docs.ts#refreshPlanStatuses; packages/web/src/lib/pr-docs.ts#trackDefinitions; packages/web/src/app/api/[product]/propose/route.ts
  status: shipped
- id: rule:build
  statement: >
    Build assigns a plan's request task with `build: <plan ref>`: the instruction gains the Definition — every block's
    id, status and text, the change records of the plan's sessions with before and after — the session works on that
    plan (its id added to the plan's `session:`, no new plan document), the plan's status becomes building, and when
    the session ends the Result lists each Definition block as implemented, changed or left; a librarian's hold on
    the request task does not refuse it; the dialog names the unagreed blocks and says "Build anyway".
  source: packages/web/src/lib/work-io.ts#assignTask; packages/web/src/lib/pr-docs.ts#definitionContext; packages/web/src/lib/pr-docs.ts#finishPlanDoc
  status: shipped
- id: rule:todo-tasks
  statement: >
    A checkbox line whose first token is an id (`- [ ] task:slug Do the thing`) defines that node with status
    open, `- [x]` with status done; a #status hashtag overrides. In the editor such a node shows a checkbox in its
    header; toggling it rewrites the line. task is a node kind (alias tk:) and the default for the "task block"
    slash item.
  source: lib/parse.js; packages/web/src/lib/import.ts#proseNode; packages/web/src/lib/serialize.ts#nodeToMarkdown
  status: unverified
  verified-by: [test:prose, test:web-lib#import]
- id: rule:goals-and-tasks
  statement: >
    Goals and tasks are tracked like Atlassian goals. Every product has a Goals page and a Tasks page (search, status
    chips, sub-goals nested under the goal they are part of, columns name / status / target or due / progress or goal /
    owner / document); a row opens the item in the right column, whose node view adds a tracking section (status,
    target, owner, progress, sub-goals, tasks and requirements that are part of it). A document may hold a goals or
    tasks table: the lines between `<!-- goals -->` and `<!-- /goals -->` (or tasks) are ordinary goal/task lines to
    the parser and an editable table in the editor (status select, target/due, progress, owner; "+ add" appends a
    row). Progress is `(progress: n)` when given, else the share of done/shipped/complete parts. Goal statuses are
    proposed, on-track, at-risk, off-track, paused, complete, non-goal.
  source: packages/web/src/components/TrackList.tsx; packages/web/src/lib/track.ts; packages/web/src/lib/doc.ts#nodeIndex; packages/web/src/components/DocEditor.tsx#RowNode
  status: shipped
  verified-by: [test:web-lib#import, test:web-lib#props]
- id: rule:prs-folder
  statement: >
    The rail treats a project's PRs page (`module:<project>-prs`, lib/pr-doc#prsPageId) as a system folder: the
    product layout takes it and its sub-documents out of the Documents tree and hands the PRs (every project, sorted
    by the PR card's `started` descending) to the PRs folder in the rail's menu, whose entry is /<product>/prs; the
    folder groups them by where they are — refining (draft and refining), approved, building — with the ended ones
    folded under done. A PR is found by the tree, not by its type: what sits under the PRs page is a PR. Files stay
    in the project's docs folder (decision:wf2.plans-system-folder).
  source: packages/web/src/app/[product]/layout.tsx#withoutPrs; packages/web/src/components/Rail.tsx; packages/web/src/components/PrFolder.tsx; packages/web/src/app/[product]/prs/page.tsx; packages/web/src/lib/pr-doc.ts#prsPageId
  status: shipped
  verified-by: [ui-test:plans-folder]
  related-to: [rule:documents-tree, rule:pr-doc]
- id: rule:plan-first
  statement: >
    A session started from the command palette carries `plan: true`, and its first message ends with a plan-first
    section. Before changing code the agent (1) understands — `wf context` on the request, resolves the nodes,
    reads their documents and the code involved; (2) models — names the subject of the request as one node
    (`kind:slug`: the node under the cursor or the document the palette sent when they fit, else found, else the
    new node the request creates), makes sure its type exists (`wf node type:<slug>`; else `wf type add`, a
    proposed `type:` card in the product's ontology document) and picks the subject's page: the document where the
    node is defined, else the one open in the palette, else the type's home, and only when the subject is new and
    no document fits a new one (`wf doc create`); (3) writes the plan on that page, not in chat — the subject's
    card when it is new, and everything understood as blocks in the page's sections: `req:` (proposed),
    `decision:` (proposed), `question:` (open), `- [ ] task:` lines, links to the modules and code touched; `ctx
    check` green; (4) shows it — `wf session open <id> <product/project/doc>[#node]` navigates the person's browser
    to the page while the session stays in the context column, and one chat line says what is there; (5)
    collaborates — the person edits, comments and answers on the page; one AskUserQuestion (header "Plan", "Build
    what the page says?", Proceed / Adjust / Cancel) rendered as a question card (rule:agent-questions); Adjust
    re-reads the page and revises it, Cancel ends the session; (6) builds only after Proceed, after re-reading the
    page once more — code and tests for what the page says, then statuses (tasks done, reqs shipped) and `wf
    session done`. The palette can switch the protocol off for a plain run. The flag is part of the prompt, not a
    session mode: the session, host and console are the ones every conversation uses.
  source: packages/web/src/components/CommandBox.tsx; packages/web/src/lib/agent-host.ts#PLAN_FIRST; packages/web/src/lib/sessions.ts#createSession; bin/wf.js#session
  status: proposed
  verified-by: [ui-test:command-palette]
  related-to: [rule:agent-questions, rule:agent-host, component:command-box, decision:wf2.plan-is-a-page, op:session.open]
- id: rule:task-artifacts
  statement: >
    A session's output is traceable from the task it worked on. While a session runs, the app records what it
    produced: documents written on disk (credited by the watcher to every running session of the product, except
    the app's own task-link writes), nodes it changed through the node API (the wf CLI sends its session id in
    x-wf-session), and inbox items it filed (they carry the session id). Tasks among the session's refs get
    `(session: <ids>, produced: module:…)` in their property group — `produced` is an edge — and marking a task
    done with wf node set adds the session too. The task's panel shows a Produced section: the sessions (with
    status and result), the documents, the nodes changed and the inbox items (questions, decisions) with their
    review status — folded at the bottom of the column until asked for (rule:produced-collapsed). An html comment ends a prose node's text, so tables' closing markers never leak into a task.
  source: packages/web/src/lib/artifacts.ts; packages/web/src/components/Produced.tsx; lib/parse.js
  status: shipped
  verified-by: [test:prose]
```

<!-- /list:rule -->

## Decisions

<!-- list:decision -->

```yaml
- id: decision:wf2.plan-first-is-a-prompt
  title: Plan-first is a section of the first message, not a session mode or a second agent
  context: >
    The command palette (⌘P) must make an agent understand and propose before it builds, and let the person confirm.
    That could be a distinct session mode with its own host and console, a separate planning agent that hands off,
    or a protocol in the prompt.
  choice: >
    A `plan: true` flag on the session appends a plan-first section to the first message (understand → propose →
    confirm with one AskUserQuestion → build). The confirmation uses the question card every conversation already
    renders (rule:agent-questions); the session, host and console are unchanged. The palette can untick it.
  alternatives: >
    A session mode — duplicates the host and console for one difference; a planning agent handing off to a builder
    — loses the context it just gathered; a fixed "plan" tool — Claude Code's AskUserQuestion already is the form.
  consequences: rule:plan-first; action:command-palette; a later agent can carry the same flag from any entry point
  status: proposed
  date: 2026-09-17
  related-to: [rule:plan-first, rule:agent-questions, decision:wf2.agent-questions-are-forms]
  session: 8aa3926e18
- id: decision:wf2.plan-is-a-page
  title: The plan is the subject's page, worked on together, not a chat message
  context: >
    The first plan-first protocol had the agent propose in a chat message and ask Proceed / Adjust / Cancel. A chat
    message is gone once the session ends, the person can only answer it, and nothing forced the agent to say which
    entity the request is about, whether its type exists, or where it lives.
  choice: >
    The plan lives on the subject's page: the agent names the subject as one node, makes sure its type and its
    document exist (existing document first, a new one only when nothing fits), writes what it understood there as
    typed blocks (req, decision, question, task — proposed), navigates the person to the page (`wf session open`),
    and the two work on the page until the person answers Proceed. The build is what the page says at that moment.
  alternatives: >
    Keep the plan in chat and copy blocks to a document afterwards — the person cannot edit the plan itself and the
    copy drifts; a dedicated "plan" document per session — one more place to look, and the knowledge belongs with
    the entity anyway.
  consequences: rule:plan-first; op:session.open; `wf doc create`, `wf type add`, `wf session open` in bin/wf.js; req:wf2.ui.command-palette
  status: proposed
  date: 2026-09-17
  related-to: [decision:wf2.plan-first-is-a-prompt, rule:plan-first, rule:agent-questions]
  session: 0e07e8fd53
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
  affects: [type:task, rule:pr-doc, rule:task-artifacts, page:web/sessions]
  part-of: goal:exec.work-and-impact
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

<!-- /list:decision -->

## Libraries

<!-- list:lib -->

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
```

<!-- /list:lib -->

## Flags and gates

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
