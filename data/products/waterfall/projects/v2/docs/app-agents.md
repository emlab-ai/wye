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

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.api, req:wf2.api.identity, req:wf2.api.skills, req:wf2.sessions.questions, req:wf2.sessions.quiet-console, req:wf2.sessions.summary-in-flow, req:wf.skills, req:wf.skills.mcp. Rules the code enforces: rule:agent-sessions, rule:agent-host, rule:agent-runner, rule:session-queue, rule:subagents-in-console, rule:agent-questions, rule:console-flow, rule:agent-contract, rule:task-artifacts. Pages: page:web/sessions, page:skill/context-v2, page:agents-snippet.

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
    reported up (onKnowledge) so the session header's knowledge strip grows live.
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
    "changes" fold under it holds component:session-changes.
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
    All agent sessions of a product, active first; polls while any is active. A row opens the session in the right column.
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
    plan-first tick, and that agent restarts from nothing before reading it — or is queued for a runner; images
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
    The agent host: the app runs Claude Code / Codex as child processes for chat sessions, keeps the conversation open, turns their streaming JSON into ChatEvents, persists them to the session and pushes them to subscribers. Lives on globalThis so dev-server module reloads do not orphan the processes. restartFresh swaps a conversation's process for a new one without its context (rule:clean-slate); armIdleStop ends a claude process idle for WF_AGENT_IDLE_MIN minutes (rule:idle-stop).
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
    Shared (browser-safe) session types and the agents that can be chosen.
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
    Queue a message (text, refs, link, images) for the agent; resumes the agent if it is not running. With
    `fresh: true` the agent restarts from nothing first (agent-host#restartFresh, rule:clean-slate) and gets the
    message as a first message, plan-first when `plan` is set.
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
    stop, resume, permission (answer a request, including AskUserQuestion answers), batch one|all, unqueue.
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

