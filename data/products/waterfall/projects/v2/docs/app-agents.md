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
    User, assistant and summary rows render through component:transcript-markdown (rule:app-link).
    Rows are full width, without a time column (task:new-954): an event's time appears at the row's right edge
    only while it is hovered (`.ev time`, globals.css). A `knowledge` event renders as a row of tags and is
    reported up (onKnowledge) so the session header's knowledge strip grows live. The queue panel (component:queue-list)
    shows every item with its state while something is working or waiting; the message box has a "clear context
    first" tick (plan-first under it) that rides on the queued item (req:wf2.sessions.fresh-in-queue). The first
    user row shows the request as the person wrote it; the Waterfall wrapper the agent received is behind a
    collapsed "what the agent received" fold (req:wf2.console.first-message-is-the-request).
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
    "changes" fold under it holds component:session-changes. Under the head, "work" lists the session's plans
  (component:plan-list) — the pages where its tasks and results are.
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
    row actions refetch the list at once and never open the conversation; under the request line the row lists the
  worker's plans (component:plan-list) — every work item it is on or has done, the current one marked.
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
    The body of page:web/session: head (agent, status, when, "open conversation"), the task (through
    component:transcript-markdown; the title with plain app-link labels), "plan on" links
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

## Plan: a Waterfall link in a transcript is shown as what it points at (session 64813dfdab)

What is there today: the first message of every conversation (lib:agent-host buildPrompt) and the session page
carry the app's own URLs — `http://localhost:3456` in the opening line, `http://localhost:3456/waterfall/v2/d/todo#n-task%3Anew-226`
under Context — and component:console and component:session-page render them with react-markdown as plain `<a>`
links: the raw URL as the text, a full page load on click. Inside the desktop app (decision:wf2.desktop-electron)
a raw `localhost` address is noise, and a click on any other link would navigate the window away from the app.
Ids in the transcript (`task:new-226`) are plain text too, while every document renders them as tags.

The plan: one markdown renderer for transcripts. A link whose target is this app (same origin as the page, or
localhost / 127.0.0.1 on the app's port — the agent's `WF_URL` is whatever host the request came in on, and the
desktop always loads localhost) is shown as what it points at and opens in place: a node link as the document's
title and the node's tag (`todo › task:new-226`, the tag opens the peek like any tag), a document link as the
document's title, a session link as `session <id>`, the root as `Waterfall`. Any other link opens outside the app
in the desktop (a new tab in the browser). Ids in the text become tags (lib:remark-tags, as in documents). The
rule holds in the browser and in the desktop alike: the label is derived from the URL's path, the app's origin is
read from the page, so nothing is hard-wired to localhost.

```yaml
- id: req:wf2.transcript.app-links
  title: A Waterfall link in a transcript is shown as what it points at
  when: >
    a user, assistant, summary or instruction text in a conversation or on a session page contains a link whose
    target is this app (same origin as the page, or localhost / 127.0.0.1 on the app's port)
  then: >
    the link is rendered as its target — a document as the document's title, a node as `<document> › <tag>` with
    the tag opening the peek panel, a session as `session <id>`, the app root as `Waterfall` — with the full URL as
    the tooltip, and a click navigates inside the app (client-side, the right column kept, no page load); the
    same text's kind:slug ids are tags
  unless: >
    the link points elsewhere — it stays a normal link that opens outside the app (a new tab in the browser, the
    system browser in the desktop); a document the graph does not know is shown by its slug
  status: shipped
  refines: req:wf2.sessions.page
  satisfied-by: [component:transcript-markdown, lib:app-link, rule:app-link]
  verified-by: [test:web-lib#app-link, ui-test:app-links]
  part-of: module:app-agents
- id: rule:app-link
  title: app-link
  statement: >
    `appLink(href, origin)` (lib/app-link.ts) decides whether a URL is this app's and what it points at; it is pure:
    the origin comes from the page (window.location.origin) and localhost / 127.0.0.1 on the same port count as
    the app as well. Every transcript renderer (component:console, component:session-page) goes through
    component:transcript-markdown, which maps `a` to that decision and adds lib:remark-tags; no transcript renders
    its own `<a>`. The desktop's `will-navigate` handler opens every URL outside the app's origin externally, so
    an in-app click is the only way to leave a page. The plain-text form (`plainAppLinks`) labels the same URLs
    where no tag can render: the session page's title and the Agents rows.
  source: packages/web/src/lib/app-link.ts:1
  status: shipped
  related-to: [rule:session-page, decision:wf2.desktop-electron]
- id: decision:wf2.transcript-app-links
  title: A transcript shows a Waterfall URL as its target, derived from the path, never from a hard-wired host
  context: >
    The desktop app loads http://localhost:3456; the web app can be opened on any host that reaches the server.
    The agent's first message carries the app's URLs (they are what `wf resolve` takes), so they must stay in the
    text the agent gets, but a person reading the transcript should see the todo page and the task, not the
    address of their own machine.
  choice: >
    Keep the URLs in the prompt as they are; change only the rendering. lib:app-link parses an app URL's path
    (`/<product>/<project>/d/<doc>#n-<id>`, `/<product>/sessions/<id>`, `/`) into a label and an in-app path,
    with the origin taken from the page at render time; component:transcript-markdown renders the label as a link
    (client-side navigation) and the node part as a tag. The desktop shell blocks navigation away from its origin
    and opens such URLs in the system browser.
  alternatives: >
    Rewrite the prompt to omit URLs — the agent needs them for `wf resolve` and the session link; a special
    `waterfall://` scheme in the desktop — two forms of the same link, and the web would still show localhost;
    rendering only in the desktop — the web has the same raw URLs.
  consequences: >
    component:transcript-markdown, lib:app-link, rule:app-link; component:console and component:session-page
    render through it; packages/desktop/main.js gains a `will-navigate` handler; ui-test:app-links.
  date: 2026-09-18
  status: proposed
  affects: [component:console, component:session-page, lib:agent-host, decision:wf2.desktop-electron]
  related-to: [req:wf2.transcript.app-links, rule:app-link]
- id: component:transcript-markdown
  file: packages/web/src/components/TranscriptMarkdown.tsx
  side: client
  purpose: >
    The one markdown renderer for conversation and session text: react-markdown with GFM and lib:remark-tags,
    `a` mapped through lib:app-link — an app link becomes its target's label with client-side navigation (a node
    link: the document's title and the node's tag), any other link opens outside the app. The page's origin is read
    after mount (the server render shows plain links, so hydration matches). `keepBreaks` keeps a person's single
    line breaks. Used by component:console (user, assistant, summary rows), component:session-page (task, result)
    and component:session-view (instruction, result).
  part-of: module:app-agents
- id: lib:app-link
  file: packages/web/src/lib/app-link.ts
  side: shared
  purpose: >
    Pure: `appLink(href, origin)` → null for a foreign URL, else `{ path, hash, kind: 'root' | 'doc' | 'node' |
    'session' | 'page', product, project, doc, node, session }`; `appLinkLabel(link, titles)` → the label from the
    document title (or slug) and the node id; `docTitles(index)` → titles by document slug from the client's node
    index (a document's node may be a card elsewhere, so by id, not by file); `plainAppLinks(text, origin, titles)`
    → the same labels as text. localhost / 127.0.0.1 on the origin's port count as the origin. Tested (app-link.test).
  part-of: module:app-agents
- id: ui-test:app-links
  title: A transcript's app links are labels, foreign links leave the app
  steps: >
    1. Open a conversation whose first message has the Context link to a todo task: the Context shows
    `TODO › task:…` with the tag; the opening line shows `Waterfall`. 2. Click the document part: the todo page
    opens in the main column, the conversation stays in the right column. 3. Click the tag: the peek shows the
    task. 4. A message with https://example.com renders as a normal link with target _blank. 5. The session page
    shows the same labels in Instruction and Result.
  covers: [req:wf2.transcript.app-links]
  status: passed
  result: >
    run by hand with playwright-core (Chrome, headless) on 2026-09-18 against a probe session whose transcript held
    buildPrompt-shaped text: the opening line showed `Waterfall`, Context showed `TODO › task:new-226` (href
    /waterfall/v2/d/todo, the URL as title), a session link `session <id>`, a document link its title (`Agents and
    sessions` for app-agents, whose node is a card in app.md); https://example.com/x stayed a link with target
    _blank; the document click moved the main column to the todo page with the conversation still in the right
    column; the tag click peeked the task; the session page's task and result and the Agents rows showed the same
    labels, no raw localhost anywhere. Desktop (CDP on the relaunched shell): a click on a foreign link left the
    window on http://localhost:3456/waterfall.
```

Work, in order:

- [x] task:app-link-lib lib:app-link (pure, vitest): parse an app URL against the page origin (localhost / 127.0.0.1 on the same port count), label it from the document title or slug and the node id; refuse foreign URLs. Part of req:wf2.transcript.app-links and rule:app-link. (session: 64813dfdab)
- [x] task:transcript-markdown component:transcript-markdown: react-markdown + GFM + lib:remark-tags with `a` mapped through lib:app-link (Next Link for in-app paths, the node as SmartTag, the URL as title; foreign links target _blank); component:console (user, assistant, summary rows), component:session-page (instruction, result) and component:session-view (instruction, result) render through it; the session page's title and the Agents rows use the plain-text labels. Part of req:wf2.transcript.app-links. (session: 64813dfdab)
- [x] task:desktop-external-links packages/desktop/main.js: `will-navigate` keeps the window on the app's origin and opens any other URL with shell.openExternal. Part of rule:app-link. (session: 64813dfdab)
- [x] task:app-links-ui-test Run ui-test:app-links in Chrome (playwright-core) against a live conversation; record the result. Part of req:wf2.transcript.app-links. (session: 64813dfdab)
- [x] task:app-links-knowledge After shipping: statuses to shipped, component:console and component:session-page purposes mention component:transcript-markdown. Part of decision:wf2.transcript-app-links. (session: 64813dfdab)

## Plan: a plan document per request — `plan-<slug>` under the documents (session 672f4fdf3d)

What is there today: a request from the command palette makes the agent write its plan as blocks on the subject's
page (decision:wf2.plan-is-a-page), and the session gets a page of its own at `/<product>/sessions/<id>`
(page:web/session) computed from the session record and the graph (decision:wf2.session-page-derived). The person
liked what that page shows — the task, the todo items with their state now, the blocks, the result — but not how it
is made: it is a view outside the documents, not a page they can edit, comment on, or find in the document tree
later; the plan itself is spread over the subject's page as a section among others.

The plan: every request from the palette gets a **plan document** — `plan-<slug>`, a sub-page in the documents
section — created by the app the moment the session starts, filled by the agent and the person while they plan,
and finished by the app with the result when the session is done. It is what the session's "page ↗" opens; the
derived session page is retired. The document holds three things the person asked for: the **tasks** (`- [ ] task:`
lines the agent proposes, ticked as the graph ticks them), the **context** (the request, the node and document it
came from, the refs, and what the agent found — as tags and embeds), and later the **result** (the session's
summary and the blocks it changed). Requirements, decisions and rules the agent proposes are still defined where
the entity lives and *embedded* on the plan page (`![[req:x]]`, rule:embed-line) — one source, no drift, which is
what decision:wf2.plan-is-a-page rejected a plan document for.

The document type is type:plan (a base type in `schema/base-ontology.md`, rule:plan-type-base). A plan document:

```markdown
---
node: plan:session-plan-page
type: plan
title: page link on the session as a plan document
status: proposed          # proposed → building (after Proceed) → done | cancelled
session: 672f4fdf3d
agent: claude-code
part-of: module:app-agents
---
# page link on the session as a plan document

## Request
<the instruction, verbatim, markdown>  · from: module:app-agents › (node under the cursor) · refs: …

## Context
<the agent's tags and embeds: modules, documents, nodes, code paths it found>

## Plan
<prose; questions as question: blocks; decisions as decision: blocks; embeds of the blocks defined elsewhere>

## Tasks
- [ ] task:… … part of plan:session-plan-page

## Result
<empty until the session is done; then the summary and the changes>
```

```yaml
- id: req:wf2.sessions.plan-doc
  title: Every request that starts work becomes a plan document under the project's Plans page
  when: >
    a request starts work — a new session (from the command box or the API, chat or queued) or a fresh-context
    message on a live conversation — with or without "plan first"
  then: >
    the app creates `plan-<slug>` in the project the request came from, a sub-page of that project's Plans page
    (`plans.md`, module:<project>-plans, created when missing — decision:wf2.plans-folder), with the type:plan card
    in its frontmatter (`session`, `agent`, `started`, `status: proposed`), the request verbatim under "Request"
    with the source document, node and refs as tags, and empty "Context", "Plan", "Tasks" and "Result" sections;
    the session record keeps the current `planDoc: <product/project/slug>`; the agent's first message names the
    document; the agent fills Context (what it found, as tags and embeds), Plan (prose, `question:` and `decision:`
    blocks, embeds of the `req:`/`rule:` blocks it defined on the entities' pages) and Tasks (`- [ ] task:` lines,
    `part of plan:<slug>`, ticked as it goes — what is in progress) and opens the page (`wf session open`); the
    person edits, comments and answers there; the document tree shows it under Plans; the page header shows the
    session as a link that opens the conversation; a handed-off session continues the same plan (its id is added
    to `session`)
  unless: >
    a follow-up message without "clear context first" — it continues the current plan; the product has no
    project — no document, the agent is told to plan on the subject's page
  status: shipped
  refines: req:wf2.ui.command-palette
  satisfied-by: [type:plan, lib:plan-doc, rule:plan-doc]
  verified-by: [ui-test:plan-doc, ui-test:plans]
- id: req:wf2.sessions.plan-result
  title: The plan document ends with the result — the app's section, scoped to the plan
  when: >
    a session with a plan document is set done, failed or cancelled (`wf session done <id> "<result>"`, Cancel,
    Close), or a fresh request replaces a plan the session never finished
  then: >
    the app writes "Result" — the summary as markdown, then the blocks credited to the session between the plan's
    `started` and `finished` (artifacts.blocks by `at`; the plan's own page and the Plans page left out) as a list
    with the change badge and a tag per block, paragraphs as a count with a link to the changes page — replacing
    whatever was under the heading, so ending twice writes it once; and sets the card's `status` (done / failed /
    cancelled; a replaced plan is cancelled with "Left unfinished") and `finished`; the tasks under "Tasks" keep the
    check state the graph has (the agent ticks them with `wf node set`)
  unless: the session has no plan document — nothing is written
  status: shipped
  refines: req:wf2.sessions.plan-doc
  satisfied-by: [lib:plan-doc, rule:plan-doc]
  verified-by: [ui-test:plan-doc, ui-test:plans]
- id: rule:plan-type-base
  statement: >
    type:plan is declared in schema/base-ontology.md, read first for every product, so a plan page (`node:
    plan:<slug>`) parses in any product: the app writes plan documents wherever a request is made, and a type the
    app writes instances of is never a product-local card. schema/kinds.yaml lists plan as a base kind.
  source: schema/base-ontology.md; schema/kinds.yaml; lib/parse.js#parseFiles
  status: shipped
  verified-by: [test:page-node]
  related-to: [rule:plan-doc, rule:page-node-line, rule:ontology.open-kinds]
- id: rule:plan-doc
  statement: >
    The plan document is written, not derived: lib:plan-doc makes the slug (`plan-` + the first words of the
    request slugified, `-2`, `-3` on a collision in the project), the body from templates/docs/plan-request.md
    (frontmatter `node: plan:<slug>`, `type: plan`, `session`, `agent`, `started`, `status`, `part-of:
    module:<project>-plans`; Request / Context / Plan / Tasks / Result), the Result section from the session's
    summary and the artifacts.blocks inside the plan's window (`started`…`finished`, minus the plan's own page and
    the Plans page), and a session's plans from the graph (`plansOf`: plan nodes whose `session` names the id,
    oldest first, tasks `part of` the plan counted). lib/plan-docs does the IO: `ensurePlansPage` writes
    `plans.md` when missing; `createPlanDoc` runs for every session the POST creates (chat or queued) and for
    every fresh item agent-host#restartFresh hands over — after `closePlanDoc` cancelled the plan the session left
    unfinished — and stores `planDoc`; `finishPlanDoc` runs from lib:sessions' end hook (done / failed /
    cancelled) and rewrites Result; `adoptPlanDoc` adds a handed-off session's id to `session`. The first
    message always carries "The plan document" (agent-host#planDocNote: where it is, what goes where — tasks,
    questions and decisions on the plan page; requirements, rules, components and pages on the entity's page,
    embedded on the plan page); the plan-first protocol adds its steps when the tick is on. The sessions API
    answers each session with `plans` (SessionPlan[]). `/<product>/sessions/<id>` redirects to the current plan
    document when the session has one, else to `/changes`.
  source: packages/web/src/lib/plan-doc.ts; packages/web/src/lib/plan-docs.ts; packages/web/src/lib/sessions.ts#onSessionEnd; packages/web/src/app/api/[product]/sessions/route.ts; packages/web/src/lib/agent-host.ts#planDocNote; packages/web/src/lib/agent-host.ts#restartFresh; templates/docs/plan-request.md
  status: shipped
  verified-by: [test:web-lib#plan-doc, ui-test:plan-doc]
  related-to: [rule:plan-first, rule:embed-line, rule:block-attribution]
- id: lib:plan-doc
  file: packages/web/src/lib/plan-doc.ts
  side: server
  purpose: >
    Pure: `planSlug(request, taken)`, `planTitle`, `planDocBody(template, vars)`, `resultSection(session, window)`
    (summary + the blocks inside the plan's window), `withResult(markdown, section)` (the app owns what is under
    "## Result"), `planStatusOnEnd`, `getFrontmatter` / `setFrontmatter`, `plansOf(product, graph, sessionId)`
    (a worker's plans with task counts), `planDocPath`. Tested by test:web-lib#plan-doc (12 tests). The IO —
    Plans page, create, finish, close, adopt — is lib/plan-docs.ts.
  part-of: module:app-agents
- id: component:plan-list
  file: packages/web/src/components/PlanList.tsx
  side: client
  purpose: >
    A worker's work items (decision:wf2.plan-per-request): the session's plans oldest first — status pill, the
    title as a link to the plan page, tasks done / all, when it started or finished; the plan the session is on
    now is marked while it is active (a `proposed` plan on a running session shows as running). Used by
    component:session-list under each row and by component:session-view in the head; clicks inside it never open
    the conversation.
  part-of: module:app-agents
- id: ui-test:plan-doc
  title: A palette request makes a plan document; the result lands on it
  steps: >
    1. ⌘P on a document, type a request with "plan first" on, Enter: the document tree shows `plan-…` under
    that document; the page shows the request under Request with the document as a tag; the session head's
    "page ↗" opens it. 2. The agent (or a probe through the API) adds a task line under Tasks and an embed of
    a req it defined on the entity's page: the page shows the task unchecked and the req card. 3. Set the task
    done through the API: the check ticks on the page. 4. `wf session done <id> "shipped x"`: Result shows
    "shipped x" and the changed blocks; the card's status is done. 5. `/waterfall/sessions/<id>` redirects
    to the plan document. (2026-09-18, session 07aa6645ad: steps 1, 4 and 5 covered by ui-test:plans through the
    API and Chrome — a queued session's plan under Plans with session / agent / started, the request quoted with
    its source; Result written once with the summary and status done; ending twice keeps one Result. Steps 2–3
    are what every plan-first session does by hand — plan-work-in-progress-visibility is one.)
  covers: [req:wf2.sessions.plan-doc, req:wf2.sessions.plan-result]
  status: passed
- id: decision:wf2.plan-is-a-document
  title: A plan is a document of its own — plan-<slug> under the page it was asked on — not a derived session page
  context: >
    decision:wf2.plan-is-a-page put the plan on the subject's page and decision:wf2.session-page-derived added a
    computed session page to see it as one thing. The person wants the one thing to be a page in the documents:
    created for the request, editable, in the tree, with the tasks, the context and later the result.
  choice: >
    A plan document per palette request, created by the app at session start from a template (type:plan), a
    sub-page of the document the request was made on. Tasks, questions and decisions of the plan live on it;
    requirements, rules and components are defined on the entity's page and embedded on the plan page so there
    is one source. The app appends the result when the session ends. The derived session page is retired; its
    route redirects to the plan document.
  alternatives: >
    Keep the derived page and add a "save as document" — two shapes of the same thing; keep the plan on the
    subject's page only — the person cannot find or scope one request later; a plan document with copies of
    every block — the drift decision:wf2.plan-is-a-page rejected, avoided here by embeds.
  consequences: >
    supersedes decision:wf2.session-page-derived; refines decision:wf2.plan-is-a-page (the plan is still a page
    the two work on — now its own); req:wf2.sessions.plan-doc, req:wf2.sessions.plan-result, rule:plan-doc,
    lib:plan-doc, type:plan; page:web/session, component:session-page, lib:session-page and
    op:api.sessions.page are removed; rule:plan-first's steps 2–3 change; sessions without a plan document keep
    the changes page only. Refined the same day by decision:wf2.plans-folder (the parent is the project's Plans
    page, not the source document) and decision:wf2.plan-per-request (every request, not only plan-first ones).
  status: proposed
  date: 2026-09-18
  related-to: [decision:wf2.plan-is-a-page, decision:wf2.session-page-derived, rule:plan-first, rule:embed-line, decision:wf2.plans-folder, decision:wf2.plan-per-request]
  session: 672f4fdf3d
- id: question:wf2.plan-doc-parent
  q: >
    Which document is the plan's parent? Proposed: the document the request was made on (the palette's
    Context), else the project's plan document (module:wf2-plan). Alternative: always under one "Plans" page
    per project, so every request is in one list.
  context: >
    The parent is where the person finds the plan later in the tree; with "the document it was asked on" the
    plans of a module sit under that module, with a "Plans" page they sit in one chronological list. Answered by
    the person on 2026-09-18: a Plans folder — decision:wf2.plans-folder.
  status: resolved
  related-to: [req:wf2.sessions.plan-doc, decision:wf2.plans-folder]
- id: question:wf2.plan-doc-slug
  q: >
    What is the `xxx` in `plan-xxx`? Proposed: the first words of the request, slugified (`plan-page-link-on-the-
    session`), with `-2` on a collision. Alternative: the session id (`plan-672f4f`) — unique and short but says
    nothing.
  context: the slug is the URL and the node id (`plan:<slug>`); it should read as the request when it shows in a tag
  status: open
  related-to: [req:wf2.sessions.plan-doc, rule:plan-doc]
- id: question:wf2.plan-doc-knowledge
  q: >
    Do requirements, rules and components an agent proposes stay on the entity's page (embedded on the plan) as
    proposed here, or should everything the plan proposes be defined on the plan page and only referenced from
    the entity's page?
  context: >
    Defining on the entity's page keeps a module's knowledge in one document (what decision:wf2.plan-is-a-page
    wanted); defining on the plan page makes the plan self-contained but scatters a module's requirements over
    many plan pages.
  status: open
  related-to: [decision:wf2.plan-is-a-document, rule:embed-line]
- id: question:wf2.plan-doc-status-building
  q: >
    Should the card's status move from proposed to building when the person answers Proceed (the host sees the
    answer to the "Plan" question), or is proposed → done enough for the first version?
  context: the status tells, in the tree and on the card, whether a plan is still being discussed, is being built, or is finished
  status: open
  related-to: [req:wf2.sessions.plan-doc]
```

Work, in order:

- [x] task:plan-doc-lib lib:plan-doc (pure, vitest): `planSlug` (first words of the request, slugified, `-2` on collision), `planDocBody` from templates/docs/plan-request.md (frontmatter with the type:plan card, Request with the source document, node and refs as tags, empty Context / Plan / Tasks / Result), `resultSection` (summary + blocks list from artifacts.blocks), `withResult`. Part of req:wf2.sessions.plan-doc and rule:plan-doc.
- [x] task:plan-doc-create createSession and a fresh queue item with `plan: true` create the plan document in the request's project under the source document (else the project's plan document), store `planDoc` on the session, log "plan document <path>"; the write carries x-wf-session so it is not attributed to the agent. Part of req:wf2.sessions.plan-doc. (built by session 672f4fdf3d; changed by decision:wf2.plans-folder and decision:wf2.plan-per-request in plan:plan-work-in-progress-visibility, session 07aa6645ad)
- [x] task:plan-first-prompt PLAN_FIRST names the plan document (path and node) and says where blocks go: tasks (`part of plan:<slug>`), questions and decisions on the plan page; req/rule/component/page on the entity's page, embedded on the plan page with `![[id]]`; the type/card step stays for a new entity. Part of rule:plan-first and rule:plan-doc.
- [x] task:plan-doc-result the PATCH that sets a session done / failed / cancelled writes the Result section (summary, blocks, paragraphs count → changes page) and the card's `status` and `finished`. Part of req:wf2.sessions.plan-result.
- [x] task:plan-doc-links "page ↗" on the session head (component:session-view), the Agents rows (component:session-list) and the console's "opened …" line open the plan document; sessions without one show no "page" link (the changes link stays). Part of req:wf2.sessions.plan-doc. (the single link became component:plan-list — every plan of the worker, task:plans-in-agents-view)
- [x] task:session-page-retire `/<product>/sessions/<id>` redirects to the plan document (else to `/changes`); remove component:session-page, lib:session-page and op:api.sessions.page with their tests; keep the changes page; decision:wf2.session-page-derived → superseded, req:wf2.sessions.page → superseded. Part of decision:wf2.plan-is-a-document.
- [x] task:plan-doc-ui-test Run ui-test:plan-doc in Chrome (playwright-core) against a live palette request; record the result. Part of req:wf2.sessions.plan-doc.
- [x] task:plan-doc-knowledge After shipping: statuses to shipped, module:app-agents' purpose and rule:plan-first mention the plan document, this session's own plan moved to `plan-…` as the first instance. Part of decision:wf2.plan-is-a-document.

## Plan: the console shows the request, not the agent's first-message wrapper (session c2bbac979d)

What is there today: lib:agent-host `buildPrompt` builds the agent's first message — a product line, "## Instruction"
with the request and its image paths, "## Context" with the refs resolved, the plan-first protocol (rule:plan-first)
when the request came from the palette, and "## How to work" — and `startProcess` emits that whole text as the
`user` event, so component:console shows the person a page of protocol above their own words (the same on a fresh
restart, agent-host#restartFresh). The wrapper is for the agent; the person wrote only the request.

```yaml
- id: req:wf2.console.first-message-is-the-request
  when: a conversation's first message goes to the agent (a new session, or a fresh restart with a queued item)
  then: >
    the console's user row shows what the person asked — the instruction text (a batch joined the way the queue
    joins it) and its images — and not the product line, Context, plan-first protocol or How-to-work sections;
    the full text the agent received stays on the event and opens from a small "what the agent received" fold
    under the row, collapsed by default
  unless: the transcript was recorded before this shipped — those rows keep the text they have
  status: shipped
  satisfied-by: [lib:agent-host, component:console, lib:session-types, lib:transcript]
  verified-by: [test:web-lib#transcript, ui-test:first-message-fold]
  part-of: module:app-agents
- id: decision:wf2.first-message-shown-as-request
  title: The user row shows the instruction; the full prompt rides on the event behind a fold
  context: >
    The first message an agent gets is the request wrapped in the Waterfall preamble (product line, Context,
    plan-first, How to work). The console shows the event's text, so the person sees the preamble as if they had
    typed it. Where to cut: in the host when the event is emitted, in the console by recognising the wrapper's
    headings, or by moving the wrapper out of the message into the system prompt.
  choice: >
    lib:agent-host emits the `user` event with `text` = the instruction (what the person or the batch said) and a
    new `prompt` field = the full message sent; component:console renders `text` as today and, when `prompt`
    differs, a collapsed `<details>` "what the agent received" with the prompt. The message to the agent does not
    change; Codex and Claude paths and agent-host#restartFresh do the same. Old transcripts are untouched.
  alternatives: >
    Strip in the console by heading markers — fragile when the wrapper's wording changes and wrong for old rows;
    move the wrapper into the system prompt — the plan-first section is per request (its plan document) and Codex
    has no system-prompt flag, so the message would still carry it; hide the wrapper entirely — the person
    could no longer see what the agent was told when a session goes wrong.
  consequences: >
    ChatEvent gains `prompt?: string`; lib:transcript's dedupe still compares `text`; component:console's user row
    gets a fold; a `shown` text accompanies `firstMessage` in agent-host#startChat.
  status: proposed
  date: 2026-09-18
  affects: [lib:agent-host, component:console, lib:session-types, req:wf2.console.first-message-is-the-request]
  related-to: [rule:plan-first, decision:wf2.plan-first-is-a-prompt]
  session: c2bbac979d
- id: ui-test:first-message-fold
  title: The console's first user row is the request; the wrapper opens from a fold
  steps: >
    1. Start a chat session from the API (or the palette) with a one-line instruction. 2. Open it from the Agents
    list: the first user row shows only the instruction; under it a collapsed "what the agent received".
    3. Open the fold: the full first message (product line, Instruction, How to work) is there.
  covers: [req:wf2.console.first-message-is-the-request]
  status: passed
  result: >
    run with playwright-core (Chrome, headless) on 2026-09-18 against probe session 90e580f3bb: the row's visible
    text was the instruction alone, the fold was present and closed, its summary "what the agent received"; opened,
    it held the preamble and the How-to-work section. The transcript event carried text = instruction and a
    999-character prompt.
```

- [x] task:first-message-shown lib:agent-host: `startProcess` emits the first `user` event with `text` = the instruction (`s.instruction`, or the joined batch text for a fresh restart, passed as `shown` next to `firstMessage`) and `prompt` = the full message; both the Claude and the Codex path; `ChatEvent.prompt` added in lib:session-types; lib:transcript `firstUserEvent` (tested). Part of req:wf2.console.first-message-is-the-request and plan:plan-text-which-sent-agent-beginning-no. (session: c2bbac979d)
- [x] task:first-message-fold component:console: a user row whose `prompt` differs from `text` renders a collapsed "what the agent received" fold with the prompt below the text; styles in globals.css. Verified in the browser (ui-test:first-message-fold). Part of req:wf2.console.first-message-is-the-request and plan:plan-text-which-sent-agent-beginning-no. (session: c2bbac979d)
- [x] task:first-message-knowledge After shipping: req:wf2.console.first-message-is-the-request shipped, component:console's purpose mentions the fold. Part of decision:wf2.first-message-shown-as-request and plan:plan-text-which-sent-agent-beginning-no. (session: c2bbac979d)
