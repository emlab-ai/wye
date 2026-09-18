---
node: module:app-agents
type: module
title: Agents and sessions
status: proposed
owner: unassigned
last-verified: 2026-09-17
part-of: module:app
sources:
  - packages/web/src/components/Console.tsx
  - packages/web/src/components/AskQuestions.tsx
  - packages/web/src/components/SessionView.tsx
  - packages/web/src/components/SessionList.tsx
  - packages/web/src/components/Produced.tsx
  - packages/web/src/components/CommandBox.tsx
  - packages/web/src/lib/agent-host.ts
  - packages/web/src/lib/agent-prompt.ts
  - packages/web/src/lib/sessions.ts
  - packages/web/src/lib/session-types.ts
  - packages/web/src/lib/transcript.ts
  - packages/web/src/lib/resolve.ts
---

# App — agents and sessions

```yaml
- id: module:app-agents
  purpose: >
    How agents work inside Waterfall: chat sessions hosted by the app (Claude Code, Codex as child processes), the console that shows the conversation and asks the person the agent's questions, the queue, runners that pick up queued sessions, the wf CLI agents use to read and write knowledge, the contract every agent receives as its system prompt, and what a session produced.
```

## Requirements and rules

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.api, req:wf2.api.identity, req:wf2.api.skills, req:wf2.sessions.questions, req:wf2.sessions.quiet-console, req:wf2.sessions.summary-in-flow, req:wf.skills, req:wf.skills.mcp. Rules the code enforces: rule:agent-sessions, rule:agent-host, rule:agent-runner, rule:session-queue, rule:subagents-in-console, rule:agent-questions, rule:console-flow, rule:agent-contract, rule:task-artifacts. Pages: page:web/sessions, page:web/session, page:web/session-changes, page:skill/context-v2, page:agents-snippet.

## Components

React components (`component:` cards). `side` says whether it renders on the server or hydrates in the browser.

```yaml
- id: component:console
  file: packages/web/src/components/Console.tsx
  side: client
  purpose: >
    The live conversation with an agent: every event of the transcript, streamed over SSE, plus a message box.
    Rows are full width, without a time column (task:new-954): an event's time appears at the row's right edge
    only while it is hovered (`.ev time`, globals.css). A `knowledge` event renders as a row of tags and is
    reported up (onKnowledge) so the session header's knowledge strip grows live. The queue panel (component:queue-list)
    shows every item with its state while something is working or waiting; the message box has a "clear context
    first" tick (plan-first under it) that rides on the queued item (req:wf2.sessions.fresh-in-queue).
  part-of: module:app-agents
- id: component:ask-questions
  file: packages/web/src/components/AskQuestions.tsx
  side: client
  purpose: >
    The agent's AskUserQuestion, rendered as a form instead of a permission dump. Answers go back inside the tool's input as `answers: { \"<question>\": \"<label>\" }` (multi-select comma-separated), the shape Claude Code reads.
  part-of: module:app-agents
- id: component:session-view
  file: packages/web/src/components/SessionView.tsx
  side: client
  purpose: >
    One agent session in the right column: what was sent, its status, and the live log (polled while active). The
    knowledge strip counts the blocks it changed (+added ~changed −removed ¶paragraphs, ↗ the changes page) and a
    "changes" fold under it holds component:session-changes. "page ↗" in the head opens page:web/session.
  part-of: module:app-agents
- id: component:session-changes
  file: packages/web/src/components/SessionChanges.tsx
  side: client
  purpose: >
    Everything a session changed in the knowledge base, block by block: per document, the nodes it added, changed
    or removed (badge, tag, title; a row opens the node in the context column), prose paragraphs folded under
    "n paragraphs"; filter by change kind and by kind of node. Rendered under the knowledge strip of the session
    view and as a page of its own, /<product>/sessions/<id>/changes.
  part-of: module:app-agents
- id: component:session-list
  file: packages/web/src/components/SessionList.tsx
  side: client
  purpose: >
    All agent sessions of a product, active first; polls while any is active. A row opens the session in the right
    column and shows its queue with states (component:queue-list, req:wf2.sessions.queue-on-agents); on hover it
    offers Stop (live rows) and Close (active rows), the header "Stop idle (n)" (req:wf2.sessions.stop-from-list);
    row actions refetch the list at once and never open the conversation; "page ↗" on hover opens page:web/session.
  part-of: module:app-agents
- id: component:queue-list
  file: packages/web/src/components/QueueList.tsx
  side: client
  purpose: >
    A conversation's queue with the state of every item (decision:wf2.queue-item-state): the working item first,
    the waiting ones in order — each with its fresh/keep toggle (control `item`) and a remove button — and the
    finished ones folded under "n done". Rendered in the console's queue panel and under an Agents row.
  part-of: module:app-agents
- id: component:produced
  file: packages/web/src/components/Produced.tsx
  side: client
  purpose: >
    Everything that came out of the sessions that worked on a task: the sessions themselves (with their logs), the documents they wrote, the nodes they changed, and the inbox items (questions, decisions, notes) they filed.
  part-of: module:app-agents
- id: component:command-box
  file: packages/web/src/components/CommandBox.tsx
  side: client
  purpose: >
    The one command box (decision:wf2.one-command-box): ⌘P / Ctrl+P opens it with what the person is looking at
    (the document, the node under the cursor); every "Send to agent" opens it with the block's text, refs and
    source prefilled (requestSend dispatches a `wf:send` window event). What is typed starts a new conversation by
    default (rule:clean-slate: the "to" picker opens on New conversation with the agent and the working folder
    used last — localStorage wf-agent-/wf-cwd-<product> — and the plan-first tick) or goes into a live
    conversation chosen in "to" — with "clear context first" ticked the message carries `fresh: true` and the
    plan-first tick, and that agent restarts from nothing before reading it, after its open turn when one runs
    (req:wf2.sessions.fresh-in-queue) — or is queued for a runner; images
    pasted or dropped go along; Enter runs, Shift+Enter breaks a line. Replaced SendToAgent.tsx and CommandPalette.tsx.
  part-of: module:app-agents
```

## Libraries

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

```yaml
- id: lib:agent-host
  file: packages/web/src/lib/agent-host.ts
  side: server
  purpose: >
    The agent host: the app runs Claude Code / Codex as child processes for chat sessions, keeps the conversation open, turns their streaming JSON into ChatEvents, persists them to the session and pushes them to subscribers. Lives on globalThis so dev-server module reloads do not orphan the processes. The pump hands queue items to the idle agent and, on a fresh item, calls restartFresh, which swaps the conversation's process for a new one without its context (rule:clean-slate); `Live.turn` remembers the handed items and the turn's end stamps them done / failed (rule:session-queue); armIdleStop ends a claude process idle for WF_AGENT_IDLE_MIN minutes (rule:idle-stop); stopChat ends a process for Stop / Close and marks the entry stopped so it counts as gone at once.
  part-of: module:app-agents
- id: lib:agent-prompt
  file: packages/web/src/lib/agent-prompt.ts
  side: server
  purpose: >
    The system prompt every agent started by Waterfall receives: the shared contract (prompts/agent-system.md) plus the product's own instructions (data/products/<product>/_agent.md) when present.
  part-of: module:app-agents
- id: lib:graph-diff
  file: packages/web/src/lib/graph-diff.ts
  side: shared
  purpose: >
    What changed between two builds of the graph: defined nodes (typed blocks and block: paragraphs) that are new,
    changed (title, status, body — the app's own session / produced task links ignored) or gone, each with its
    document. Pure; tested by test:web-lib#graph-diff.
  part-of: module:app-agents
- id: lib:session-changes
  file: packages/web/src/lib/session-changes.ts
  side: shared
  purpose: >
    A session's block attribution joined with the current graph (kind, status now, still exists) and grouped per
    document, prose paragraphs apart; counts and the counts line. Derived, never stored.
  part-of: module:app-agents
- id: lib:sessions
  file: packages/web/src/lib/sessions.ts
  side: server
  purpose: >
    Agent sessions: work sent from a block, node or page to an agent. Stored as JSON files under the product's _sessions/ folder (the parser skips _-prefixed folders). Execution is not wired yet: a session is queued and an external runner will pick it up later and stream its log here.
  part-of: module:app-agents
- id: lib:session-types
  file: packages/web/src/lib/session-types.ts
  side: shared
  purpose: >
    Shared (browser-safe) session types and the agents that can be chosen; the pure queue helpers — queueState,
    queueSummary, queueView, nextTake (a batch splits at a fresh item) — tested in session-types.test.ts.
  part-of: module:app-agents
- id: lib:transcript
  file: packages/web/src/lib/transcript.ts
  side: shared
  purpose: >
    A turn has one user message (a batch is joined into one), so a user event that repeats the previous user event's text before the turn ended is a replay, not a message — the host once emitted one for Claude's --replay-user-messages echo on top of its own (task:duplicate-user-event). Dropped when appending.
  part-of: module:app-agents
- id: lib:resolve
  file: packages/web/src/lib/resolve.ts
  side: server
  purpose: >
    What a link points at: a document, a node, a hashed block or a heading section. Shared by the resolve API (agents via wf resolve) and the agent host (prompts).
  part-of: module:app-agents
```

## Core

```yaml
- id: lib:core.wf
  file: bin/wf.js
  side: server
  purpose: >
    The wf CLI: an agent's door into the running app — resolve, doc, node, context, inbox add, session log/done/take, agent listen (runner).
  part-of: module:app-agents
```

## API

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.

```yaml
- id: op:api.resolve
  args: GET /api/<product>/resolve?link=
  does: >
    What a link or id points at — document, node, block or section, with drawing annotations — for agents (wf resolve).
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.agent-prompt
  args: GET /api/<product>/agent-prompt
  does: >
    The system prompt agents get: the contract plus the product's _agent.md.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions
  args: GET | POST /api/<product>/sessions
  does: >
    List sessions; create one (agent, instruction, refs, source, mode chat|run, cwd) — chats start their agent process at once.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions.session
  args: GET | PATCH /api/<product>/sessions/<id>
  does: >
    A session; PATCH appends log lines, changes status or sets the result (runners, wf session log/done, Cancel).
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions.message
  args: POST /api/<product>/sessions/<id>/message
  does: >
    Queue a message (text, refs, link, images, fresh, plan) for the agent; resumes the agent if it is not running
    — or, when the head of the queue is a fresh item, starts a new agent with it (agent-host#restartFresh). `fresh`
    rides on the item and is honoured when its turn comes (rule:clean-slate): at once when the agent is idle, after
    the open turn when it is busy; plan-first in that first message when `plan` is set.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions.stream
  args: GET /api/<product>/sessions/<id>/stream
  does: >
    Server-sent events for a chat: the stored transcript, then live events, queue and pings.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions.changes
  args: GET /api/<product>/sessions/<id>/changes
  does: >
    Every block the session added, changed or removed, per document, joined with the current graph; counts. Read
    by component:session-changes, the changes page and `wf session changes`.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/changes/route.ts
  part-of: module:app-agents
- id: op:api.sessions.control
  args: POST /api/<product>/sessions/<id>/control
  does: >
    stop (the process ends, the session is done; Resume or a message brings the context back), close (the process
    ends, the waiting items are dropped, the session is cancelled), resume, permission (answer a request, including
    AskUserQuestion answers), batch one|all, unqueue, item (set or clear the fresh mark of a waiting item).
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions.handoff
  args: POST /api/<product>/sessions/<id>/handoff
  does: >
    A new queued session for another agent that continues this one.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions.file
  args: GET /api/<product>/sessions/<id>/file/<name>
  does: >
    A file attached to a session message (pasted image).
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.sessions.claim
  args: POST /api/<product>/sessions/claim
  does: >
    A runner takes the oldest queued session for its agent (204 when none).
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
- id: op:api.runners
  args: GET | POST /api/<product>/runners
  does: >
    Runners online; heartbeat and sign-off from wf agent listen.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-agents
```

## Plan: the blocks a session changed (task:session-knowledge-changes)

What is shipped (req:wf2.sessions.knowledge-changes): the console's turn-done row and the header's knowledge
strip list the *documents* a session wrote and the *nodes* it changed through the API. What is missing is the
block level: an agent that edits a document on disk (most do — I did this whole session with heredocs) is credited
with the document, not with the requirements, decisions and paragraphs it added or changed inside it. The task asks
for a run id on every such block and a page that lists all of them. The plan: attribute per block by diffing the
graph at every rebuild (the session id is the run id; the attribution is stored with the session, derived — the
documents are not rewritten), then show it as a Changes list on the session and as a page.

```yaml
- id: req:wf2.sessions.block-attribution
  title: Every block a session adds, changes or removes is attributed to it
  when: >
    a document of the product changes on disk (an agent's editor, wf doc write, the app's editor) while one or
    more sessions are running, and the graph rebuilds
  then: >
    the nodes that are new, changed (title, status, body or text) or gone since the previous build — typed blocks
    and prose paragraphs (block: nodes) alike — are recorded on every running session as `artifacts.blocks`
    ({ id, change: added | changed | removed, doc, title, at }); a node changed through the API with x-wf-session
    is recorded on that session only (as today); the turn-done "knowledge" row and the header strip show the
    blocks (added / changed counts per document) instead of bare document tags
  unless: >
    the change is the app's own task-link write (session / produced on a task line), which is never credited;
    or no session is running — then nothing is recorded, as today
  status: shipped
  refines: req:wf2.sessions.knowledge-changes
  satisfied-by: [lib:artifacts, lib:graph-diff, rule:block-attribution]
  verified-by: [test:web-lib#graph-diff, ui-test:session-changes]
- id: req:wf2.sessions.changes-page
  title: A session's changes open as one list, per document, block by block
  when: >
    a person clicks the knowledge strip of a session (or "n changes" on a session row), or opens
    /<product>/sessions/<id>/changes, or runs `wf session changes <id>`
  then: >
    every block the session added, changed or removed is listed per document with a badge (added / changed /
    removed), its tag and title; a row opens the node in the context column; prose paragraphs are folded under
    "n paragraphs" per document; chips filter by change and by kind (req, decision, task, …); the page is derived
    from the session's artifacts and the current graph — nothing is stored beyond the attribution
  unless: >
    the session changed nothing — the strip and the page say so
  status: shipped
  refines: req:wf2.sessions.knowledge-changes
  satisfied-by: [component:session-changes, page:web/session-changes, op:api.sessions.changes]
  verified-by: [ui-test:session-changes]
- id: page:web/session-changes
  route: /<product>/sessions/<id>/changes
  component: packages/web/src/app/[product]/sessions/[id]/changes/page.tsx; packages/web/src/components/SessionChanges.tsx
  purpose: >
    A session's changes as a page: every block it added, changed or removed, per document, with the change and kind
    filters; live while the session runs.
  part-of: module:app-agents
- id: rule:block-attribution
  statement: >
    Attribution is per block and derived. The watcher keeps the graph as it last saw it; after every rebuild it
    diffs that against the new build (lib:graph-diff) and records the added / changed / removed nodes — typed blocks
    and block: paragraphs — as `artifacts.blocks` on every session whose recorded status is running (mergeBlocks:
    one entry per block; added then changed stays added, added then removed disappears). A node PUT with
    x-wf-session records the block as changed on that session at once. The app's own task-link writes (session,
    produced) are invisible to the diff. The console's knowledge row marks each tag + ~ − and counts paragraphs;
    the session strip shows +n ~n −n n¶ and links the changes page. No document is rewritten for attribution
    (decision:wf2.attribution-derived-not-written).
  source: packages/web/src/lib/watch.ts; packages/web/src/lib/graph-diff.ts; packages/web/src/lib/artifacts.ts#mergeBlocks; packages/web/src/app/api/[product]/node/[id]/route.ts; packages/web/src/lib/agent-host.ts#reportKnowledge
  status: shipped
  verified-by: [test:web-lib#graph-diff, ui-test:session-changes]
  related-to: [rule:task-artifacts, req:wf2.sessions.block-attribution]
- id: decision:wf2.attribution-derived-not-written
  title: The run id lives with the session, not on every block line
  context: >
    task:session-knowledge-changes proposes attaching a run id to every block a session adds or modifies, like a
    commit hash, and filtering by it. Two places can hold it: the block's own line (`(session: <id>)` in its
    property group, `session:` on a card) or the session's record.
  choice: >
    Attribution is derived — a graph diff at every rebuild, stored on the running sessions' artifacts — and the
    documents are not rewritten for it. The session id stays the run id; the session's Changes list is the filter.
    `session:` keeps being written where it already is: on the tasks a session works on (rule:task-artifacts) and
    on the decisions, questions and requirements an agent writes with a `session:` key itself.
  alternatives: >
    Write `(session: <id>)` onto every touched block — git-visible and it survives a deleted session file, but
    every requirement, rule and paragraph line grows a trailing id per session that touched it, the app's own
    rewrite would itself be a change to credit, and a person's edit in the editor while an agent runs would be
    stamped with the agent's id. Can be added later as an explicit "stamp" step if the derived list proves short-lived.
  consequences: >
    lib:artifacts gains blocks; the graph is diffed on rebuild (lib:graph-diff, pure, tested); the strip, the
    turn-done row, the session row and wf session show read the blocks; attribution stays coarse when several
    sessions run at once (all of them are credited, as for documents today) — the API path with x-wf-session is
    exact.
  status: proposed
  date: 2026-09-17
  related-to: [rule:task-artifacts, req:wf2.sessions.knowledge-changes, task:session-knowledge-changes]
- id: question:wf2.attribution-several-sessions
  q: >
    When two sessions run at once and one edits a document on disk, both are credited with every block. Is that
    acceptable for now, or should the app ask agents to write through `wf doc write` (exact credit) and stop
    crediting disk edits to more than one session?
  context: >
    The disk watcher cannot tell which process wrote a file. Today documents are already credited to every running
    session; block attribution inherits that. Exact credit needs the write to carry the session id (x-wf-session).
  status: open
  related-to: [decision:wf2.attribution-derived-not-written, rule:task-artifacts]
```

Work, in order:

- [x] task:graph-diff lib:graph-diff — pure diff of two graphs: added / changed / removed defined nodes (typed and block:), with title, doc and change; vitest. Part of req:wf2.sessions.block-attribution. (session: 53f99bfd98)
- [x] task:block-attribution The watcher keeps the previous graph per product, diffs after each rebuild and records the blocks on every running session (`artifacts.blocks`, capped); the API node PUT records the node as changed on its session; the app's own task-link writes stay excluded. Part of req:wf2.sessions.block-attribution. (session: 53f99bfd98)
- [x] task:session-changes-view component:session-changes under the knowledge strip (the strip shows "+n added · n changed per document" and opens it), the same component on /<product>/sessions/<id>/changes, op:api.sessions.changes (GET …/sessions/<id>/changes: the blocks joined with the current graph), `wf session changes <id>`, and the console's knowledge row with added / changed marks. Part of req:wf2.sessions.changes-page. (session: 53f99bfd98)
- [x] task:session-changes-ui-test ui-test:session-changes — a probe session edits a document on disk (one new req, one changed rule, one paragraph); the strip, the changes page and wf session changes list them. Part of req:wf2.sessions.changes-page. (run by hand with playwright-core, 2026-09-18; in CI when task:ui-tests-in-ci lands)

## Plan: stop an agent, see its queue, clear context in the queue (session 181e88ad1f)

What is there today: the Agents page (component:session-list) lists conversations with a `working` / `live` pill,
but the only way to end an agent is the Stop button inside its console, one conversation at a time. A conversation's
queue (rule:session-queue) is visible only in the console, and only the items still waiting — once an item is
handed to the agent it disappears, so nothing says which tasks an agent got, which one it is on and which are
done. And "clear context first" (rule:clean-slate) acts *now*: `restartFresh` kills the running process even when
a turn is open, so ticking it while the agent is busy on the previous task cuts that task short instead of
clearing the context between the two tasks.

The plan: stop and close from the list; every queue item keeps its life (waiting → working → done | failed) and
the row shows the queue with those states; `fresh` becomes a property of the queue item, honoured when the item's
turn comes.

```yaml
- id: req:wf2.sessions.stop-from-list
  title: An agent can be stopped or closed from the Agents page
  when: a person hovers a conversation row on the Agents page
  then: >
    a live row offers Stop — the process ends, the context survives (`--resume` brings it back, as rule:idle-stop)
    and the row leaves Active; every active row offers Close — the process ends if there is one, the pending queue
    items are dropped, the session is recorded as cancelled and the row leaves Active (it stays under All); the
    page header offers "Stop idle (n)" that stops every live conversation with no open turn and nothing queued; a
    row's action never opens the conversation
  unless: the row is a runner's session (mode run) — it has no process here; Close alone applies
  status: shipped
  refines: req:wf2.ui.live
  satisfied-by: [component:session-list, op:api.sessions.control]
  verified-by: [ui-test:agents-queue]
- id: req:wf2.sessions.queue-on-agents
  title: Each agent row shows the tasks it got and where each one stands
  when: a conversation has received one or more messages through its queue
  then: >
    the row shows the queue under the instruction: each item's first line with a state — waiting (not handed to
    the agent yet), working (the turn it opened is running), done (that turn ended), failed (the turn ended with an
    error or the process exited during it) — the working item first, then the waiting ones in order, the done ones
    folded under "n done"; a waiting item can be removed and the row's summary says "1 working · 2 waiting · 5 done";
    the console's queue panel shows the same states, so both views read one record
  unless: the conversation never used its queue — the row shows only the instruction, as today
  status: shipped
  refines: req:wf2.ui.live
  satisfied-by: [component:session-list, component:console, lib:sessions, lib:agent-host]
  verified-by: [ui-test:agents-queue]
- id: req:wf2.sessions.fresh-in-queue
  title: Clear context applies when the task's turn comes, not when it is queued
  when: a person queues a message for a conversation with "clear context first" ticked (command box, or the console's message box)
  then: >
    the item is queued carrying `fresh` (and the plan-first choice); when the agent is idle it restarts from
    nothing at once and gets the item as its first message (as rule:clean-slate today); when a turn is open, that
    turn finishes first — then the host restarts the agent from nothing and hands it the item; the queue shows the
    item with a "fresh" mark, and the mark can be toggled on a waiting item; a fresh item is always handed alone,
    even in batch mode (items queued before it go in their own batch first)
  unless: the tick is off — the item goes into the running agent with its context kept, as today
  status: shipped
  refines: req:wf2.sessions.clean-slate
  satisfied-by: [lib:agent-host, lib:sessions, component:command-box, component:console, op:api.sessions.message, op:api.sessions.control]
  verified-by: [ui-test:agents-queue]
- id: decision:wf2.fresh-is-a-queue-property
  title: "Clear context" is a property of the queued item, honoured by the pump
  context: >
    rule:clean-slate implemented "clear context first" as an immediate restart: the message route calls
    `restartFresh`, which ends the running process, before enqueueing. With an idle agent that is what the person
    means. With a busy agent it ends the task in progress — the person wanted the *next* task to start clean, not
    the current one to stop. decision:wf2.clean-slate also kept the tick out of the console's own message box,
    reasoning that the console is where context is wanted; but the console is also where the person queues the
    next task while watching the current one.
  choice: >
    `fresh` (and `plan`) live on the QueueItem. The message route only enqueues; the pump, when the next item to
    hand over is fresh, does what restartFresh did — ends the process, forgets the agent's session id, writes the
    "context cleared" note — and starts a new process with that item as its first message. Idle agent: immediate,
    as before. Busy agent: after the open turn's `result`. The tick appears in the console's message box too,
    off by default, and a waiting item's fresh mark can be toggled from the queue list. Batch mode splits at a
    fresh item.
  alternatives: >
    Keep the immediate restart and only disable the tick while the agent is busy — the person cannot express
    "clean slate for the next task" at all; a separate "restart when idle" action next to Stop — two controls for
    one intent; keep the tick out of the console — the person has to open ⌘P and pick the conversation in "to"
    to say what a tick next to the message box could say.
  consequences: >
    rule:clean-slate is refined (the restart moves from the route to the pump; the console box gets the tick);
    decision:wf2.clean-slate's "no tick in the console" is superseded; QueueItem gains fresh, plan, state fields
    (rule:session-queue refined); op:api.sessions.message keeps `fresh` / `plan` but enqueues them;
    op:api.sessions.control gains `item` (set fresh on a waiting item), `close` and `stop` stays.
  date: 2026-09-18
  status: proposed
  affects: [rule:clean-slate, rule:session-queue, component:command-box, component:console, op:api.sessions.message, op:api.sessions.control, lib:agent-host]
  related-to: [decision:wf2.clean-slate, req:wf2.sessions.fresh-in-queue]
  session: 181e88ad1f
- id: decision:wf2.queue-item-state
  title: A queue item keeps its state on the session record; the turn end marks it
  context: >
    Items today carry `addedAt` and `sentAt`; nothing records that the turn an item opened has ended, so no view can
    say "done" or "failed" per task. The transcript has the `result` events, but joining items to results by time
    is brittle (a batch is one turn; a fresh restart is a turn without an item).
  choice: >
    The host remembers the ids of the items it handed to the open turn (`Live.turn`); on `result` it stamps them
    `doneAt` (or `failedAt` when `is_error`), on a process exit during a turn `failedAt` with the exit code as
    `error`; Codex the same on its process close. The states in the UI are derived: waiting = no sentAt, working =
    sentAt and neither doneAt nor failedAt, done, failed. The list API already returns the queue; the console's
    `queue` SSE event carries every item with its state instead of the pending ones only.
  alternatives: >
    Derive done from the transcript (result events after sentAt) — brittle, see context; keep a separate per-item
    status field written by hand — the same thing with more ways to drift.
  consequences: >
    QueueItem { …, fresh?, plan?, doneAt?, failedAt?, error? }; sessions#markTurnEnd; notifyQueue sends all items;
    Console and SessionList read the same shape (a shared `queueState(item)` in lib/session-types).
  date: 2026-09-18
  status: proposed
  affects: [lib:sessions, lib:session-types, lib:agent-host, component:console, component:session-list, rule:session-queue]
  related-to: [req:wf2.sessions.queue-on-agents]
  session: 181e88ad1f
- id: question:wf2.close-keeps-record
  q: >
    Close marks the conversation cancelled and keeps it under All (the transcript and its Produced stay readable).
    Should Close also hide it from All — an archive — or delete the session file?
  context: >
    "Close / kill" can mean end the process (Stop), end the work (Close → cancelled) or make the record go away.
    The plan does the first two; a deletion would also drop the session's artifacts credits on tasks
    (rule:task-artifacts). The default is to keep the record.
  status: open
  related-to: [req:wf2.sessions.stop-from-list]
- id: ui-test:agents-queue
  title: Stop and Close from the Agents page; queue states; fresh honoured after the open turn
  steps: >
    1. Start a probe conversation (secret word in turn one). While its turn runs, queue two messages from the
    console: the first plain, the second with "clear context first" ticked. The Agents row shows 1 working ·
    2 waiting; the second waiting item has the fresh mark. 2. The first turn ends: the row shows the first queued
    item working, the transcript has no "context cleared" note yet. 3. That turn ends: the note appears, a new
    process starts, the fresh item is its first message; asked for the secret word the agent does not know it;
    the row shows 2 done · 1 working. 4. Stop on a live idle row ends its process; the row leaves Active; Resume
    from the console brings it back with the context. 5. Close on a busy row: the process ends, the waiting items
    are gone, the recorded status is cancelled, the row is under All only. 6. "Stop idle (n)" stops every live idle
    conversation and nothing else.
  covers: [req:wf2.sessions.stop-from-list, req:wf2.sessions.queue-on-agents, req:wf2.sessions.fresh-in-queue]
  status: passed
  result: run by hand with playwright-core (Chrome) on 2026-09-18 against probes 146c8dff62 and bb8ea7cbd2: fresh item waited for the open turn, then 'context cleared' and 'no idea'; items stamped done; Stop → exit 0, status done, resume kept the context; Close → 1 waiting item dropped, the working one failed 'exited with 143', status cancelled; the Agents row showed 1 working · 2 waiting with FRESH/KEEP toggles, Stop/Close on hover, 'Stop idle (2)'; the console panel showed the states and the fresh tick
```

Work, in order:

- [x] task:queue-item-state QueueItem gains `fresh`, `plan`, `doneAt`, `failedAt`, `error`; `Live.turn` remembers the handed item ids; the host stamps them on `result` (done / failed by is_error) and on a process exit mid-turn; Codex on its close; `notifyQueue` / the stream snapshot send every item with its derived state (`queueState` in lib/session-types, pure, tested). Part of req:wf2.sessions.queue-on-agents; follows decision:wf2.queue-item-state. (session: 181e88ad1f)
- [x] task:fresh-at-take-time The message route enqueues `fresh` / `plan` on the item instead of calling restartFresh; the pump restarts the agent from nothing when the next item is fresh (idle: at once; busy: after the open turn's result) and hands it as a first message built like a new session's; batch mode splits at a fresh item; the console's message box gets the "clear context first" tick (off by default); control `item` toggles fresh on a waiting item. rule:clean-slate and rule:session-queue refined, op:api.sessions.message and op:api.sessions.control refined. Part of req:wf2.sessions.fresh-in-queue; follows decision:wf2.fresh-is-a-queue-property. (session: 181e88ad1f)
- [x] task:agents-queue-rows component:session-list shows each row's queue: working item, waiting items (with remove and the fresh mark), done items folded, a "n working · n waiting · n done" summary; component:console's queue panel shows the same states. Part of req:wf2.sessions.queue-on-agents. (session: 181e88ad1f)
- [x] task:agent-stop-from-list Stop (live rows) and Close (active rows) on hover in component:session-list, "Stop idle (n)" in the header; control action `close` = stopChat + drop pending items + status cancelled; row actions do not open the conversation. Part of req:wf2.sessions.stop-from-list. (session: 181e88ad1f)
- [x] task:agents-queue-ui-test Run ui-test:agents-queue in Chrome (playwright-core) and record the result on the rules. Part of req:wf2.sessions.stop-from-list. (session: 181e88ad1f)

## Plan: a page for each session — the task, its todo items, the blocks it touched (session efee530d46)

What is there today: a session lives in the right column (component:session-view) — the instruction folded away,
a knowledge strip, a "changes" fold and the console. The plan an agent writes is a section on the subject's page
(decision:wf2.plan-is-a-page), and once the agent has built it nothing shows the plan as one thing: what was asked,
which task lines came out of it and where each one stands, which blocks were proposed and which of them shipped.
`/<product>/sessions/<id>` does not exist — only `/changes` under it. And there is no way back: after `wf session
open` (or a click on the console's "opened …" line, a plain anchor that reloads the app and drops the right
column's stack) the only way to return is the browser's own button, and the top bar (component:top-bar) has none.

The plan: the session gets a page of its own at `/<product>/sessions/<id>` — derived from the session record and the
current graph, like the changes page — and the top bar gets back / forward.

```yaml
- id: page:web/session
  route: /<product>/sessions/<id>
  component: packages/web/src/app/[product]/sessions/[id]/page.tsx; packages/web/src/components/SessionPage.tsx
  purpose: >
    A session as a page: the task (instruction, refs, source, the follow-up messages and their states), the page
    the plan was written on, the todo items that came out of it with their state now, every block it added or
    changed grouped by kind with its status now, and the result. Live while the session runs. The conversation
    itself stays in the right column (a button opens it there).
  part-of: module:app-agents
- id: component:session-page
  file: packages/web/src/components/SessionPage.tsx
  side: client
  purpose: >
    The body of page:web/session: head (agent, status, when, "open conversation"), the task, "plan on" links
    (every `open` event of the transcript → document#node), the todo list (task lines with a live check state,
    "n of m done"), the blocks by kind (badge + tag + status pill, a row opens the node in the context column,
    paragraphs folded), the result. Refetches op:api.sessions.page on graph and session changes while live.
  part-of: module:app-agents
- id: lib:session-page
  file: packages/web/src/lib/session-page.ts
  side: shared
  purpose: >
    What the session page shows, derived: the todo rows — tasks the session added or changed (artifacts.blocks),
    tasks among its refs, tasks whose `session:` names it — joined with the graph (status now, title, part-of);
    the other blocks grouped by kind, each with its status now; the pages opened (from the transcript's `open`
    events). Pure; tested by test:web-lib#session-page.
  part-of: module:app-agents
- id: op:api.sessions.page
  args: GET /api/<product>/sessions/<id>/page
  does: >
    The session page's data — todo rows, blocks by kind, opened pages, counts — joined with the current graph.
    Read by component:session-page while the session is live.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/page/route.ts
  part-of: module:app-agents
- id: req:wf2.sessions.page
  title: Every session has a page that shows its task, its todo items and the blocks it touched
  when: >
    a person opens /<product>/sessions/<id> — from the ↗ on the session's head in the right column, from a row's
    "page" action on the Agents page, or from the "opened …" line of the console
  then: >
    the page shows the agent, the status and when; the instruction in full (markdown) with its refs and source; the
    follow-up messages of its queue with their states; "plan on" — the document and node every `wf session open`
    pointed at; the todo list — every task the session added, changed, was sent or is named on (`session:`) — as
    task lines with the check state the graph has now and "n of m done"; every other block it added, changed or
    removed, grouped by kind (req, decision, question, rule, page, component, …), each with the change badge and
    its status now (proposed = still to approve or build, shipped, open, done); paragraphs folded per document; a
    row opens the node in the context column; the result when the session is done; a button opens the
    conversation in the right column; the page refreshes while the session runs
  unless: the session does not exist — 404; or it changed nothing yet — the lists say so
  status: shipped
  refines: req:wf2.sessions.knowledge-changes
  satisfied-by: [page:web/session, component:session-page, lib:session-page, op:api.sessions.page, rule:session-page]
  verified-by: [ui-test:session-page]
- id: req:wf2.ui.history-nav
  title: Back and forward from the top bar
  when: a person clicks ‹ or › in the top bar, or presses ⌘[ / ⌘] (Ctrl on Windows)
  then: >
    the browser goes back or forward in its history; every in-app navigation — links, `wf session open`, the
    console's "opened …" line, search hits — is client-side, so the right column keeps its stack across it
  unless: there is nothing to go back or forward to — the button is disabled (the Navigation API when the browser has it, `history.length` otherwise)
  status: shipped
  refines: req:wf2.ui
  satisfied-by: [component:top-bar, rule:history-nav]
  verified-by: [ui-test:session-page]
- id: rule:session-page
  statement: >
    The session page is computed, never stored: lib:session-page joins the session record with the current graph on
    every render and on every graph or session change while the session is live. Todo rows are the tasks the session
    added or changed (artifacts.blocks), the tasks among its refs and the tasks whose `session:` names it — once each,
    in that order — with `done` read from the graph now; the check box is read-only (the document or the task's card
    changes it). Every other block is grouped by kind (req, decision, question, rule, goal, page, component, … then
    alphabetical) with its status now; paragraphs are a count with a link to the changes page; "plan on" is every
    `open` event of the transcript, latest first, once per path. The transcript and the log are left out of the
    page's payload.
  source: packages/web/src/lib/session-page.ts; packages/web/src/app/[product]/sessions/[id]/page.tsx; packages/web/src/app/api/[product]/sessions/[id]/page/route.ts; packages/web/src/components/SessionPage.tsx
  status: shipped
  verified-by: [test:web-lib#session-page, ui-test:session-page]
  related-to: [rule:block-attribution, decision:wf2.session-page-derived]
- id: rule:history-nav
  statement: >
    ‹ › in the top bar call history.back / history.forward; ⌘[ / ⌘] (Ctrl on Windows) do the same. Whether there
    is anywhere to go comes from the Navigation API (canGoBack / canGoForward, re-read on currententrychange) when
    the browser has it, else back needs history.length > 1 and forward is always offered. Every in-app navigation
    is client-side (next/link, router.push) — including `wf session open` and the console's "opened …" line — so
    the right column's stack survives it.
  source: packages/web/src/components/TopBar.tsx#useHistoryNav; packages/web/src/components/Console.tsx
  status: shipped
  verified-by: [ui-test:session-page]
  related-to: [component:top-bar, component:peek-provider, op:session.open]
- id: decision:wf2.session-page-derived
  title: The session page is derived from the session and the graph, not a plan document
  context: >
    A "dedicated page for each plan" could be a document written per session (a plan.md next to the subject's page)
    or a view computed from what already exists: the session record (instruction, queue, transcript's open events,
    block attribution, result) and the current graph (status of every block now).
  choice: >
    A derived page at /<product>/sessions/<id>. The plan keeps living on the subject's page as typed blocks
    (decision:wf2.plan-is-a-page); the session page is the lens that shows the task, the todo items and the blocks
    with their state today. Nothing new is stored: the `open` events already say where the plan was written, the
    block attribution already says what was added or changed, the graph says where each stands.
  alternatives: >
    A plan document per session — a second copy of the blocks that drifts from the subject's page, and one more
    document in the tree per request (rejected already in decision:wf2.plan-is-a-page); a "plan" tab in the right
    column only — too narrow for a task list plus blocks by kind, and not linkable.
  consequences: >
    page:web/session, component:session-page, lib:session-page, op:api.sessions.page; the session head and the
    Agents rows link the page; the console's "opened" line navigates client-side.
  status: proposed
  date: 2026-09-18
  related-to: [decision:wf2.plan-is-a-page, decision:wf2.attribution-derived-not-written, req:wf2.sessions.page]
  session: efee530d46
- id: question:wf2.session-page-per-item
  q: >
    A conversation that received several messages (queue items) has one page. Should the todo items and blocks be
    sliced per message — by the block's `at` between the item's sentAt and doneAt — so each task in the conversation
    shows its own plan, or is one list per session enough while conversations are clean-slate by default?
  context: >
    rule:clean-slate makes one session ≈ one task, so the first version shows one list per session with the queue
    items listed under the task. Slicing is possible later from the timestamps already stored.
  status: open
  related-to: [req:wf2.sessions.page, rule:clean-slate, decision:wf2.queue-item-state]
```

Work, in order:

- [x] task:session-page-lib lib:session-page — pure: `sessionPage(s, graph)` → todo rows (tasks from blocks ∪ refs ∪ `session:` back-links, joined with the graph: status now, title, part-of), blocks by kind with status now, opened pages from `open` events, counts; vitest. Part of req:wf2.sessions.page. (session: efee530d46)
- [x] task:session-page page:web/session at `/<product>/sessions/<id>` (server-rendered from the record and the graph) with component:session-page; op:api.sessions.page for the live refetch; entry points — ↗ "page" on the session head in component:session-view, a "page" hover action on component:session-list rows, the console's "opened …" line as a client-side link. Part of req:wf2.sessions.page; follows decision:wf2.session-page-derived. (session: efee530d46)
- [x] task:history-nav ‹ › in component:top-bar before the crumbs (history.back / forward, disabled when there is nowhere to go), ⌘[ / ⌘] shortcuts; `wf session open` and the console's "opened" line stay client-side so the right column keeps its stack. Part of req:wf2.ui.history-nav. (session: efee530d46)
- [x] task:session-page-ui-test ui-test:session-page — a session with a task line added and a req proposed: the page lists the task unchecked, the req as proposed; setting the task done and the req shipped through the API updates the page; ‹ in the top bar returns to the previous page with the session still in the right column. Part of req:wf2.sessions.page. (session: efee530d46)
