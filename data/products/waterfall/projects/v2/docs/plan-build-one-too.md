---
node: plan:plan-build-one-too
type: plan
title: build this one too
status: done
owner: unassigned
last-verified: 2026-09-19
session: de966d3bd9
agent: claude-code
started: 2026-09-19T13:05:04.876Z
part-of: module:v2-plans
finished: 2026-09-19T14:22:21.240Z
---

# build this one too

## Request

> build this one too

_from: module:prd-execution_

## Context

The request is module:prd-execution — the execution PRD, written 2026-09-19 after module:memory-review, whose build
(plan:plan-implement, session 9f3d83809b) is the "one" this is "too". Two goals, five areas, 21 task lines:

- goal:exec.work-and-impact — E.1 work as one list (decision:exec.task-is-the-unit, req:exec.work-view,
  req:exec.work-states, req:exec.dispatch, req:exec.request-is-a-task, req:exec.done-comes-back, req:exec.human-work),
  E.2 change records (decision:exec.change-record, req:exec.change-kept, req:exec.change-review,
  req:exec.change-validated), E.3 impact (decision:exec.impact-run, decision:exec.impact-trigger, req:exec.impact-set,
  req:exec.impact-patch, req:exec.impact-rework, req:exec.impact-contradiction, req:exec.impact-sub-items,
  req:exec.impact-for-agents), E.4 backlog (decision:exec.backlog-is-unassigned-work, req:exec.capture,
  req:exec.ready-for-runners, req:exec.backlog-for-agents).
- goal:exec.define-first — E.5 talk to Wye (decision:exec.wye-is-a-role, decision:exec.plan-lifecycle, req:exec.ask-wye,
  req:exec.wye-context, req:exec.wye-explains, req:exec.wye-asks, req:exec.wye-proposes, req:exec.plan-defined,
  req:exec.build-from-definition, req:exec.definition-tracked, req:exec.explain-anywhere).

![[goal:exec.work-and-impact]]

![[goal:exec.define-first]]

What exists that this builds on: rule:plan-doc and lib:plan-doc (`packages/web/src/lib/plan-doc.ts`, `plan-docs.ts`,
`templates/docs/plan-request.md`) write a plan document per request; rule:session-queue and rule:agent-runner
(`packages/web/src/lib/sessions.ts`, `bin/wf.js` `agent listen`, op:api.sessions.claim) queue and claim sessions;
rule:task-artifacts (`packages/web/src/lib/artifacts.ts`) links tasks to sessions; rule:block-attribution
(`packages/web/src/lib/watch.ts` + `graph-diff.ts`) diffs every rebuild against the graph the watcher last saw — the
one place that sees every edit, whoever made it; op:api.node (`packages/web/src/lib/node-edit.ts`) patches a defining
line or card; the verdict pass (`packages/web/src/lib/verdicts.ts`, `lib/judge.js`, decision:memory.model-calls-via-cli)
is the model-call path with cache and budget; the constraint packet (`packages/web/src/lib/packet.ts`,
`lib/graph.js#constraints`, req:memory.intake-packet) and `lib/graph.js#impact` (reverse structural closure, three
hops, no paths, no semantics); component:track-list (`packages/web/src/components/TrackList.tsx`, `lib/track.ts`) is
the Tasks page this replaces; component:command-box (`CommandBox.tsx`) is where "Later" and "Ask Wye" go; the
Inbox (`app/[product]/inbox/page.tsx`, `lib/review.ts`, `ReviewList.tsx`) gains the Changes group; the agent host
(`packages/web/src/lib/agent-host.ts`) spawns claude with `--append-system-prompt` — the librarian is the same spawn
with another prompt and a tool allow-list. task:memory.verdict-pass and task:memory.constraint-packet, which E.2 and
E.5 depend on, are done.

Parser facts that shape the work: a task line is `- [ ] task:x text (key: value, …) #status` (`lib/parse.js`
prose nodes; the property group is the parenthesised tail); type:task today has `due` and `session`; type:plan has
`session`, `agent`, `started`, `finished`; TASK_STATUSES in `packages/web/src/lib/props.ts` is
todo / open / in-progress / blocked / done.

## Plan

The PRD is complete enough to build from: every behaviour is a requirement with a mechanism named in `satisfied-by`,
and the two areas that need a model (E.3 impact, E.5 the librarian) have their design decided. What this plan adds
is the order, the seams in the existing code, and the few choices the PRD left open that block the build.

**Order.** E.1 first — the task as the unit is what everything else lands on (rework tasks in E.3, the backlog in
E.4, the request task Build assigns in E.5). Then E.4 (small, on top of E.1), E.2 (the change store — the input of
E.3), E.3, and E.5 last, because Build dispatches through E.1 and the librarian's proposals ride on E.2's change
records. Each area is committed on its own so the person can stop after any of them with a working app.

**Seams.** Change records come from one place — the watcher's rebuild diff — not from every writer: the editor, `wf
node set`, op:api.node and an agent writing the file all end in a rebuild, and `watch.ts` already has the graph
before and after. The API and the editor only tag who is writing (a short-lived attribution map keyed by node id)
so the record names the person or the session. Impact judgements reuse `lib/judge.js#ask` (the agent CLI,
`WF_JUDGE_CMD` for tests) with a second prompt and a second cache; nothing new talks to a model. The librarian is the
existing host with a second system prompt and claude's `--allowedTools` / `--disallowedTools`. The Work view's
derived state (queued / working / stalled / unassigned) is computed by `lib/work.ts` from the graph plus the session
records, pure and tested, and served by op:api.work; the Tasks rail entry becomes Work.

**Flags.** As with the memory build, the model-in-the-loop pieces are off until the person switches them on:
`impact: auto | manual | off` in `_product.md` (default off — change records are still kept), `take-ready` per
runner flag only. Nothing runs a model on an edit unless asked.

**What is not in this plan.** "Apply all" and the Definition's word-level diff are in scope; a benchmark for impact
verdicts (question:exec.impact-model's second half) is not — it is a follow-up task once the first live runs exist.

```yaml
- id: decision:exec.build-order
  title: The execution PRD is built E.1 → E.4 → E.2 → E.3 → E.5, one commit per area, model pieces behind flags
  context: >
    Twenty-one tasks across five areas with dependencies among them: rework tasks (E.3) and Build (E.5) need the task
    as the unit and dispatch (E.1); the impact run (E.3) needs the change record (E.2); the librarian's proposals (E.5)
    are proposed blocks and change records. The memory build (plan:plan-implement) shipped its model-in-the-loop
    pieces behind product flags and the person switched them on after looking.
  choice: >
    E.1 (task props, request task, work API, Work view, Assign, task result), then E.4 (capture, ready), E.2 (change
    store, change card), E.3 (impact lib, run, outcomes, CLI), E.5 (librarian role, context card, turns, plan
    definition, Build), tests last per area; one commit per area; `impact:` in _product.md defaults off and
    `--take-ready` is opt-in per runner.
  alternatives: E.5 first (the person's headline ask, but it dispatches through E.1 and proposes through E.2); everything behind one flag.
  consequences: the Work view exists before the impact run does; a stop after any area leaves a working app; the flags are documented on flag:impact and rule:agent-runner.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  part-of: plan:plan-build-one-too
  affects: [goal:exec.work-and-impact, goal:exec.define-first]
```

```yaml
- id: decision:exec.changes-from-the-rebuild-diff
  title: Change records are made from the watcher's rebuild diff, not by every writer; writers only tag who
  context: >
    decision:exec.change-record wants a record for every edit of a typed node — editor, op:api.node, `wf node set`,
    an agent writing the file. Four writers, one of which (a file write by an agent) the app never sees as a call.
    rule:block-attribution already diffs the graph before and after every rebuild in watch.ts and knows which nodes
    changed; it lacks only the old body and who wrote.
  choice: >
    lib:changes takes the rebuild diff (before graph, after graph, changed ids) and writes one record per changed
    typed node (kind in decision / req / rule / constraint / goal / task / entity / question, form prose or yaml)
    with `before` and `after` as the node's text and property rows, folding into an open record on the same node
    within five minutes. op:api.node and the document editor's save put (node id → who, session) into a short-lived
    attribution map before they write, and the record reads it; an agent's file write is credited to the running
    session the way blocks are; a change nobody claims is "person". A change whose diff is only status or tracking
    keys (status, session, produced, worker, owner, priority, ready, last-verified) is recorded accepted, not listed.
  alternatives: a record written by each writer (four code paths, and an agent's file write has none); git diff of the file (no node identity, no properties).
  consequences: one code path; a record may lag the write by the rebuild's debounce (400 ms); the attribution map is per process, so a runner's `wf node set` is credited through its session header.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  part-of: plan:plan-build-one-too
  affects: [decision:exec.change-record, rule:block-attribution, req:exec.change-kept]
```

```yaml
- id: decision:exec.impact-through-the-judge
  title: Impact judgements go through lib/judge.js's model call with their own prompt, cache and budget
  context: >
    decision:exec.impact-run asks for one model call per candidate, batched and cached by pair hash.
    decision:memory.model-calls-via-cli settled how the app calls a model: lib/judge.js spawns the agent CLI (or
    WF_JUDGE_CMD), batches ten pairs per call, caches per pair in _build/verdicts.json. question:exec.impact-model
    asks which model and what budget.
  choice: >
    lib/impact.js reuses judge.js's `ask` with an impact prompt (before, after, candidate, path → unaffected | update
    with new text or property values | rework with a sentence | contradicts | ask with a question), ten candidates
    per call, cached in _build/impact.json keyed by (before hash, after hash, candidate id + text hash, model, prompt
    hash), budget per run 20 candidates / 3 calls (a product can raise it in _product.md: `impact-budget: 40`).
    The model is the judge's (WF_JUDGE_MODEL, default haiku); WF_IMPACT_MODEL overrides it. Verbatim repeats in a
    child (req:exec.impact-sub-items) are patched without a call.
  alternatives: a second provider path; the large model by default (a requirement with twenty candidates would cost twenty large calls per edit).
  consequences: no new dependency; tests use WF_JUDGE_CMD with a fake impact judge; the benchmark for impact is a follow-up.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  resolves: question:exec.impact-model
  part-of: plan:plan-build-one-too
  affects: [decision:exec.impact-run, decision:memory.model-calls-via-cli]
```

```yaml
- id: decision:exec.librarian-on-the-host
  title: The librarian is Claude Code on the existing host with its own system prompt and a tool allow-list; one clean session per request
  context: >
    decision:exec.wye-is-a-role makes Wye a session role with a closed tool set and no code edits.
    question:exec.wye-model asks which agent and model run it and whether it continues a conversation. The host
    spawns claude with --append-system-prompt; claude's -p mode takes --allowedTools and --disallowedTools.
  choice: >
    A session with role `librarian` is spawned like a worker but with prompts/librarian-system.md (read Wye, explain
    with tags, ask along when / then / unless, propose blocks with `wf propose`, never edit code, never approve) and
    `--allowedTools "Bash(wf:*)" Read Grep Glob AskUserQuestion --disallowedTools Edit Write MultiEdit NotebookEdit
    "Bash(git:*)"`; the model is claude's default. Every "Ask Wye" starts a clean session on a new plan; continuing a
    definition is a message to that conversation (the plan stays defining). Codex gets the role later if wanted.
  alternatives: the Messages API directly (a second runtime); codex (no system-prompt flag, no tool allow-list).
  consequences: role on the session record and the plan card; the command box's agent list is not shown for Ask Wye; `wf propose` and `wf plan` join the CLI.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  resolves: question:exec.wye-model
  part-of: plan:plan-build-one-too
  affects: [decision:exec.wye-is-a-role, rule:agent-host, component:command-box]
```

```yaml
- id: decision:exec.order-is-document-then-priority
  title: Within a plan the order of task lines is the order; across plans `priority` orders, lower first
  context: >
    question:exec.priority — a board needs an order; the document has one, and decision:exec.task-is-the-unit adds
    `priority: number?`.
  choice: >
    The Work view sorts a group by priority (a number on the line, lower first, unset last), then by document and
    line — so inside one plan the person orders by moving lines in the editor and never needs a number, and a number
    is only written to lift a task across plans. Drag-to-reorder is not built; "priority" is set from the task panel.
  alternatives: priority on every line (churn on every reorder); document order only (no order across plans).
  consequences: `priority` is a tracking field (a change to it is accepted at once); the Unassigned group shows ready tasks first, then this order.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  resolves: question:exec.priority
  part-of: plan:plan-build-one-too
  affects: [req:exec.work-view, decision:exec.task-is-the-unit]
```

```yaml
- id: decision:exec.definition-home-fallback
  title: When a proposed block has no home document yet, Wye writes it on the plan under Definition and says so
  context: >
    question:exec.definition-home — a requirement for a new area has no PRD section; rule:embed-line keeps one
    definition per block, the plan embeds.
  choice: >
    `wf propose` takes `--doc`; without it the librarian names the home document it found (the PRD of the project,
    the design doc, the module page — from `wf context`'s hits); when none fits, the block is defined on the plan
    document itself under Definition (a plan is a document) with a line saying it needs a home, and the person moves
    it with the Inbox's filing or by cut and paste — the id stays.
  alternatives: create a document per orphan block (clutter); ask every time (the person asked for fewer questions).
  consequences: a plan may define blocks, not only embed them; the Inbox's "file into a document" works on them as on any node.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  resolves: question:exec.definition-home
  part-of: plan:plan-build-one-too
  affects: [req:exec.wye-proposes, rule:embed-line]
```

Three things landed differently from the PRD's letter while building, each small enough to decide here and small
enough to reverse:

```yaml
- id: decision:exec.later-is-alt-enter
  title: Later in the command box is a button and ⌥↵; ⇧↵ stays a new line
  context: >
    decision:exec.backlog-is-unassigned-work names ⇧↵ for Later; the command box already uses ⇧↵ for a new line
    (its placeholder says so and people type multi-line requests that way).
  choice: a Later button beside Run, and ⌥↵ (Alt / Option + Enter) as its key; ⇧↵ keeps inserting a line.
  alternatives: ⇧↵ for Later and a different key for the newline (breaks a habit for a rarer act).
  consequences: the palette's hint names Later (⌥↵); nothing else changes.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  part-of: plan:plan-build-one-too
  affects: [decision:exec.backlog-is-unassigned-work, component:command-box]
- id: decision:exec.rework-on-the-backlog
  title: A rework verdict becomes a task on the project's backlog, not a "Follow up" plan document
  context: >
    decision:exec.impact-run says a rework task goes under the change's plan, else under a plan the app creates
    ("Follow up: <node>"). A plan document is a request with a session (type:plan requires `session`); an app-made
    plan with no request and no session would be an empty page per rework.
  choice: >
    the rework task is captured like any backlog item (rule:capture-home): a task line with `change:` the record,
    part of the candidate, `by: wye:impact`, on the project's plan document under Backlog — on the Work view's
    Unassigned group at once, assignable from there with the change in its refs.
  alternatives: a plan document per change (empty pages; a plan without a session); under the changed node's content (a task hidden inside a requirement).
  consequences: no "Follow up" plans; the backlog is where the app's own follow-ups live, next to the person's.
  date: 2026-09-19
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  part-of: plan:plan-build-one-too
  affects: [decision:exec.impact-run, req:exec.impact-rework]
- id: lesson:exec.registries-survive-dev-reloads
  statement: >
    A registry kept on globalThis (the session end hooks, the watcher, the write claims) survives Next's dev
    reloads, so a reloaded module registers a second copy of its hook beside the stale one — the old closure keeps
    running old code (a librarian's plan was finished as done by the stale hook). Key every registration and drop
    unkeyed ones on load; bump the watcher's VERSION when its callback changes.
  about: [lib:sessions, lib:watch]
  status: proposed
  by: agent:claude-code
  evidence: [session:de966d3bd9]
  part-of: plan:plan-build-one-too
```

```yaml
- id: question:exec.ask-wye-default
  title: Does "Ask Wye" become the command box's default, replacing "New conversation · plan first"?
  q: >
    req:exec.ask-wye says Ask Wye is the default when nothing is selected and no live conversation is chosen. Today
    ⌘P defaults to a new worker conversation with plan first on (rule:clean-slate, rule:plan-first). Flipping the
    default means every request goes to the librarian first and is built by a second dispatch (Build on the plan);
    keeping it means Ask Wye is a choice in "to". This plan builds the req as written — Ask Wye default — unless
    answered otherwise.
  context: the difference is one line in CommandBox.tsx; the habit it changes is the person's.
  status: open
  related-to: [req:exec.ask-wye, rule:clean-slate, rule:plan-first]
  part-of: plan:plan-build-one-too
```

## Tasks

- [x] task:exec.impl.task-props type:task gains worker, priority, blocked-by (inverse blocks), change, ready; `review` and `ready` join TASK_STATUSES / marks; the parser reads them from the property group; TrackList shows worker. part of plan:plan-build-one-too (task: exec.task-props, session: de966d3bd9)
- [x] task:exec.impl.request-task the plan template and lib:plan-doc write the request as `task:<plan-slug>` with worker and session; the session's refs carry it; the end hook moves it to review or done. part of plan:plan-build-one-too (task: exec.request-task, session: de966d3bd9)
- [x] task:exec.impl.work-api lib/work.ts pure (derived state from session records: queued, working, stalled, unassigned; plan, goal, worker, sessions, produced counts) + op:api.work. part of plan:plan-build-one-too (task: exec.work-api, session: de966d3bd9)
- [x] task:exec.impl.work-view page:web/work replaces the Tasks entry: rows, groups (status, goal, plan, document, worker), URL filters, nesting, "mine", done folded. part of plan:plan-build-one-too (task: exec.work-view, session: de966d3bd9)
- [x] task:exec.impl.assign Assign on a row and on the task panel: worker picker (people from the product file, agents, runner pool), note, plan-first; creates or queues the session with the constraint packet; refuses done and blocked tasks; op:api.work.assign. part of plan:plan-build-one-too (task: exec.assign, session: de966d3bd9)
- [x] task:exec.impl.task-result the task panel's result: summary, blocks, open questions, proposed decisions with Inbox state, Review action, tick done. part of plan:plan-build-one-too (task: exec.task-result, session: de966d3bd9)
- [x] task:exec.impl.capture "Later" in the command box (⇧↵) and "+ backlog" on nodes and documents write a task line to the plan document or under the node; inbox notes file as tasks; `wf work list|add`. part of plan:plan-build-one-too (task: exec.capture, session: de966d3bd9)
- [x] task:exec.impl.take-ready `#ready` on task lines; `wf work next`; `wf agent listen --take-ready` claims the oldest ready unblocked unassigned task; product setting `auto-take: off`. part of plan:plan-build-one-too (task: exec.take-ready, session: de966d3bd9)
- [x] task:exec.impl.change-store lib/changes.ts + store:changes (`_changes/<id>.json`) written from the watcher's rebuild diff with attribution tags from op:api.node and the editor; folding; states; the changed badge; op:api.changes. part of plan:plan-build-one-too (task: exec.change-store, decision: exec.changes-from-the-rebuild-diff, session: de966d3bd9)
- [x] task:exec.impl.change-card component:change-card in the Inbox under Changes: property and word diff, framing fields, Accept, Revert (through the writer, recorded), "changed since", the write-time verdicts. part of plan:plan-build-one-too (task: exec.change-card, session: de966d3bd9)
- [x] task:exec.impl.impact-lib lib/impact.js pure: structural candidates two hops over reversed edges with decay and paths, content first, verbatim-repeat detection; semantic candidates from the embeddings not reached by structure (web side). part of plan:plan-build-one-too (task: exec.impact-lib, session: de966d3bd9)
- [x] task:exec.impl.impact-run op:api.impact: the run on a change record — batched judgements through lib/judge.js#ask, verdicts update | rework | contradicts | ask | unaffected, patches, cache, budget; asynchronous; `impact: auto | manual | off`; the trigger on blur / save. part of plan:plan-build-one-too (task: exec.impact-run, decision: exec.impact-through-the-judge, session: de966d3bd9)
- [x] task:exec.impl.impact-outcomes Apply / Skip / Apply all (op:api.impact.apply, stale-candidate check); rework → task line under the plan or a "Follow up" plan; contradicts → contradiction; ask → question block. part of plan:plan-build-one-too (task: exec.impact-outcomes, session: de966d3bd9)
- [x] task:exec.impl.impact-cli `wf impact <id> --after` and `ctx impact --semantic --explain`; the agent contract asks for it before editing an approved node. part of plan:plan-build-one-too (task: exec.impact-cli, session: de966d3bd9)
- [x] task:exec.impl.librarian-role role on the session record; prompts/librarian-system.md; the host's tool allow-list per role; "Ask Wye" and "Explain" in the command box and on nodes; `wf explain`. part of plan:plan-build-one-too (task: exec.librarian-role, decision: exec.librarian-on-the-host, session: de966d3bd9)
- [x] task:exec.impl.wye-context-card the Context card in the context column: the constraint packet and semantic hits grouped by kind, filling in live from the session's knowledge events; stays at the top. part of plan:plan-build-one-too (task: exec.wye-context-card, session: de966d3bd9)
- [x] task:exec.impl.wye-turns the librarian's first turn (explain with tags), the question form along when / then / unless, `wf propose` writing proposed blocks to home documents (or the plan, decision:exec.definition-home-fallback) and embedding them under Definition with verdicts. part of plan:plan-build-one-too (task: exec.wye-turns, session: de966d3bd9)
- [x] task:exec.impl.plan-definition type:plan statuses (proposed, defining, defined, building, done, cancelled) and the Definition section in lib:plan-doc; blocks and change records of a defining session embed automatically; `defined` computed; the plan page shows the list with status and diffs. part of plan:plan-build-one-too (task: exec.plan-definition, session: de966d3bd9)
- [x] task:exec.impl.build Build on a plan: assign the request task with the Definition as context; unagreed blocks listed when not defined; the Result maps what was built to each block. part of plan:plan-build-one-too (task: exec.build, session: de966d3bd9)
- [x] task:exec.impl.tests unit tests per lib (work states, plan-doc request task, change record, impact candidates, impact apply, rework task, capture); test:librarian on recorded turns with the fake judge; ui-test:work-view, ui-test:work-assign, ui-test:change-review, ui-test:ask-wye, ui-test:build-plan in Chrome (playwright-core). part of plan:plan-build-one-too (task: exec.librarian-tests, task: exec.ui-tests) (session: de966d3bd9; the librarian replay is task:exec.librarian-replay)

Follow-ups this session left:

- [ ] task:exec.librarian-replay test:librarian as a recorded replay: a saved librarian transcript against a fake host (WF_JUDGE_CMD-style), asserting explains-with-tags first, questions only for unfilled slots, proposals into home documents, no file edits — today the evidence is the live run on ui-test:ask-wye. part of plan:plan-build-one-too, part of goal:exec.define-first
- [ ] task:exec.impact-benchmark A benchmark for impact verdicts once a few live runs exist: changes with a known "what should have changed" label, recall / precision per model and prompt hash like test:verdict-bench (the second half of question:exec.impact-model). part of plan:plan-build-one-too, part of goal:exec.work-and-impact
- [ ] task:exec.switch-impact-on Set `impact: auto` (or manual) in waterfall's _product.md when the person wants change records judged — flag:impact defaults off; verdicts and consolidation are the same call (task:memory.impl.switch-on). part of plan:plan-build-one-too
- [ ] task:exec.librarian-codex The librarian on codex: codex exec has no system-prompt flag or tool allow-list, so the role is claude-only today (decision:exec.librarian-on-the-host); give codex the role when its CLI can take a closed tool set. part of plan:plan-build-one-too, part of goal:exec.define-first
- [ ] task:exec.definition-on-the-plan-page Show the Definition's state (n blocks, k agreed, j open, contradicted) on the plan document's header and in the Plans table, not only on the Work view and the task panel (req:exec.plan-defined says the plan page shows it). part of plan:plan-build-one-too, part of goal:exec.define-first
- [ ] task:exec.attribution-by-claim Credit blocks to a session by its write claim rather than to every running session (the Definition already does; artifacts and the Result still credit all — question:wf2.attribution-several-sessions). part of plan:plan-build-one-too

## Result

Built the execution PRD (module:prd-execution) in five commits, one per area, plus tests and knowledge. E.1 — the task is the unit: type:task gains worker, priority, blocked-by, change and the #ready mark, review joins the statuses; every request's plan carries the request as task:<plan-slug>; lib/work derives queued / working / stalled / held / unassigned from the session records; page:web/work replaces Tasks (groups, URL filters, mine, done folded); Assign hands a task to a person, an agent or the runner pool with the packet in the first message; the task panel shows the result and Review into the Inbox. E.4 — Later (⌥↵) and ＋ capture a task under the node or on the plan's Backlog; inbox notes file as tasks; wf work list|add|next|assign; wf agent listen --take-ready. E.2 — change records from the watcher's rebuild diff (one path for every writer), old and new side by side in the Inbox with a word diff, verdicts, changed-since, Accept / Revert, the changed badge, the packet marks pending nodes. E.3 — lib/impact.js (content first, two hops with decay and paths, no sibling hops), verbatim repeats without a call, verdicts through the judge with cache and budget, impact: auto | manual | off; update patches applied from the card, rework → backlog task, contradicts → contradiction, ask → question; wf impact, ctx impact --explain. E.5 — the librarian: Ask Wye starts claude with prompts/librarian-system.md and a closed tool set on a plan with a Definition; wf propose, wf plan, wf explain / Explain on nodes; blocks it writes embed automatically; defined when every block is agreed and nothing contradicts; Build assigns the request with the Definition as context and the Result maps what was built. Verified: 42 Chrome checks on a scratch product, the librarian and impact live with the real models; 27 requirements shipped; module:app-work documents the code. Proposed on the plan: 7 decisions (build order, changes from the diff, impact through the judge, librarian on the host, order = document then priority, definition-home fallback, Later is ⌥↵, rework on the backlog), a lesson on dev-reload registries; open: question:exec.ask-wye-default. Follow-ups: task:exec.librarian-replay, task:exec.impact-benchmark, task:exec.switch-impact-on, task:exec.librarian-codex, task:exec.definition-on-the-plan-page, task:exec.attribution-by-claim.

Blocks this plan produced:

- added decision:exec.build-order — The execution PRD is built E.1 → E.4 → E.2 → E.3 → E.5, one commit per area, model pieces behind flags
- added decision:exec.changes-from-the-rebuild-diff — Change records are made from the watcher's rebuild diff, not by every writer; writers only tag who
- added decision:exec.impact-through-the-judge — Impact judgements go through lib/judge.js's model call with their own prompt, cache and budget
- added decision:exec.librarian-on-the-host — The librarian is Claude Code on the existing host with its own system prompt and a tool allow-list; one clean session pe
- added decision:exec.order-is-document-then-priority — Within a plan the order of task lines is the order; across plans `priority` orders, lower first
- added decision:exec.definition-home-fallback — When a proposed block has no home document yet, Wye writes it on the plan under Definition and says so
- added question:exec.ask-wye-default — Does "Ask Wye" become the command box's default, replacing "New conversation · plan first"?
- added task:exec.impl.task-props — type:task gains worker, priority, blocked-by (inverse blocks), change, ready;
- added task:exec.impl.request-task — the plan template and lib:plan-doc write the request as `task:<plan-slug>` with worker and session;
- added task:exec.impl.work-api — lib/work.ts pure (derived state from session records:
- added task:exec.impl.work-view — page:web/work replaces the Tasks entry:
- added task:exec.impl.assign — Assign on a row and on the task panel:
- added task:exec.impl.task-result — the task panel's result:
- added task:exec.impl.capture — "Later" in the command box (⇧↵) and "+ backlog" on nodes and documents write a task line to the plan document 
- added task:exec.impl.take-ready — `#ready` on task lines;
- added task:exec.impl.change-store — lib/changes.ts + store:changes (`_changes/<id>.json`) written from the watcher's rebuild diff with attribution
- added task:exec.impl.change-card — component:change-card in the Inbox under Changes:
- added task:exec.impl.impact-lib — lib/impact.js pure:
- added task:exec.impl.impact-run — op:api.impact:
- added task:exec.impl.impact-outcomes — Apply / Skip / Apply all (op:api.impact.apply, stale-candidate check);
- added task:exec.impl.impact-cli — `wf impact <id> --after` and `ctx impact --semantic --explain`;
- added task:exec.impl.librarian-role — role on the session record;
- added task:exec.impl.wye-context-card — the Context card in the context column:
- added task:exec.impl.wye-turns — the librarian's first turn (explain with tags), the question form along when / then / unless, `wf propose` wri
- added task:exec.impl.plan-definition — type:plan statuses (proposed, defining, defined, building, done, cancelled) and the Definition section in lib:
- added task:exec.impl.build — Build on a plan:
- added task:exec.impl.tests — unit tests per lib (work states, plan-doc request task, change record, impact candidates, impact apply, rework
- changed type:task — task
- changed task:exec.task-props — type:task gains worker, priority, blocked-by (inverse blocks) and the review status;
- changed task:exec.request-task — The plan template and lib:plan-doc write the request as a task line with worker and session;
- changed task:exec.work-api — op:api.work:
- changed task:exec.work-view — page:web/work replaces the Tasks entry:
- changed task:exec.assign — Assign on a row and on the task panel:
- changed task:exec.task-result — The task panel's result:
- changed task:exec.capture — "Later" in the command box and "+ backlog" on nodes and documents write a task line to the plan document or un
- changed task:exec.take-ready — `#ready` on task lines;
- changed task:exec.change-store — store:changes and op:api.changes:
- changed task:exec.change-card — component:change-card in the Inbox under Changes:
- changed task:exec.impact-lib — lib:impact pure:
- changed task:exec.impact-run — op:api.impact:
- changed task:exec.impact-outcomes — Apply / Skip / Apply all for patches (op:api.impact.apply, stale-candidate check);
- changed task:exec.impact-cli — `wf impact <id> --after` and `ctx impact --semantic --explain`;
- added plan:plan-why-t-type-space-typing-answer — why i can't type space when typing answer??? also no answer in details, it must be like…
- added task:plan-why-t-type-space-typing-answer — why i can't type space when typing answer???
- added decision:wf2.answer-is-content — A question's answer is its content, edited with the block editor; no `answer:` key
- added task:wf2.prose-area — Card prose sections keep local state;
- added task:wf2.answer-content — Question card:
- added task:wf2.details-q-once — Details panel shows q once and labels a question's content as its answer part of plan:plan-why-t-type-space-ty
- added task:wf2.answer-rules — rule:card-essence and rule:card-fold updated through `wf impact` part of plan:plan-why-t-type-space-typing-ans
- changed task:app.trace-requirements — For every requirement in the PRD that the app satisfies, add the component, lib or op that satisfies it to its
- added plan:plan-work-task-app-trace-requirements-every — Work on task:app.trace-requirements: For every requirement in the PRD that the app…
- changed rule:card-fold — Every card's header carries `FoldToggle` when the node has content — a chip "▸ n blocks" whose click opens the
- changed rule:card-essence — A question card shows q and its answer; the answer is the question's content (decision:wf2.answer-is-content) 
- changed req:wf2.ui.card-preview — A card of a node with content shows only its own first block; the content is in the details
- added task:wf2.prose-newlines — A newline typed in a card's prose section (q, context, choice, alternatives) is folded to a space on save (`fi
- changed req:exec.backlog-for-agents — An agent can read the backlog and add to it
- changed task:exec.librarian-role — Session role on the record;
- changed task:exec.wye-context-card — The Context card in the context column:
- changed task:exec.wye-turns — The librarian's first turn (explain with tags, say when satisfied or contradicting), the question form along w
- changed task:exec.plan-definition — type:plan statuses and the Definition section in lib:plan-doc;
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
- changed task:exec.ui-tests — ui-test:work-view, ui-test:work-assign, ui-test:change-review in Chrome (playwright-core):
- added decision:exec.later-is-alt-enter — Later in the command box is a button and ⌥↵; ⇧↵ stays a new line
- added decision:exec.rework-on-the-backlog — A rework verdict becomes a task on the project's backlog, not a "Follow up" plan document
- added lesson:exec.registries-survive-dev-reloads — A registry kept on globalThis (the session end hooks, the watcher, the write claims) survives Next's dev reloa
- added task:exec.librarian-replay — test:librarian as a recorded replay:
- added task:exec.impact-benchmark — A benchmark for impact verdicts once a few live runs exist:
- added task:exec.switch-impact-on — Set `impact:
- added task:exec.librarian-codex — The librarian on codex:
- added task:exec.definition-on-the-plan-page — Show the Definition's state (n blocks, k agreed, j open, contradicted) on the plan document's header and in th
- added task:exec.attribution-by-claim — Credit blocks to a session by its write claim rather than to every running session (the Definition already doe

72 paragraphs added or changed — [per document](/waterfall/sessions/de966d3bd9/changes)
