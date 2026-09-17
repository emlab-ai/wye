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
    One agent session in the right column: what was sent, its status, and the live log (polled while active).
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
    source prefilled (requestSend dispatches a `wf:send` window event). What is typed goes to an active
    conversation — the "to" picker defaults to the most recent live one — or starts a new conversation (agent,
    working folder, plan-first tick) or is queued for a runner; images pasted or dropped go along; Enter runs,
    Shift+Enter breaks a line. Replaced SendToAgent.tsx and CommandPalette.tsx.
  part-of: module:app-agents
```

## Libraries

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

```yaml
- id: lib:agent-host
  file: packages/web/src/lib/agent-host.ts
  side: server
  purpose: >
    The agent host: the app runs Claude Code / Codex as child processes for chat sessions, keeps the conversation open, turns their streaming JSON into ChatEvents, persists them to the session and pushes them to subscribers. Lives on globalThis so dev-server module reloads do not orphan the processes.
  part-of: module:app-agents
- id: lib:agent-prompt
  file: packages/web/src/lib/agent-prompt.ts
  side: server
  purpose: >
    The system prompt every agent started by Waterfall receives: the shared contract (prompts/agent-system.md) plus the product's own instructions (data/products/<product>/_agent.md) when present.
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
    Queue a message (text, refs, link, images) for the agent; resumes the agent if it is not running.
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
