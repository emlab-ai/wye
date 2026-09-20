---
node: module:app-agents
type: module
title: Agents and sessions
status: proposed
owner: unassigned
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
part-of: module:app
order: 45
last-verified: 2026-09-20
---

# Agents and sessions

Agents and sessions

```yaml
- id: module:app-agents
  purpose: >
    How agents work inside Waterfall: chat sessions hosted by the app (Claude Code, Codex as child processes), the console that shows the conversation and asks the person the agent's questions, the queue, runners that pick up queued sessions, the wf CLI agents use to read and write knowledge, the contract every agent receives as its system prompt, and what a session produced.
```

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.api, req:wf2.api.identity, req:wf2.api.skills, req:wf2.sessions.questions, req:wf2.sessions.quiet-console, req:wf2.sessions.summary-in-flow, req:wf.skills, req:wf.skills.mcp. Rules the code enforces: rule:agent-sessions, rule:agent-host, rule:agent-runner, rule:session-queue, rule:subagents-in-console, rule:agent-questions, rule:console-flow, rule:agent-contract, rule:task-artifacts. Pages: page:web/sessions, page:web/session, page:web/session-changes, page:skill/context-v2, page:agents-snippet.

React components (`component:` cards). `side` says whether it renders on the server or hydrates in the browser.

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.


## Rules

<!-- list:rule -->

```yaml
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
- id: rule:pr-type-base
  statement: >
    type:pr is declared in schema/base-ontology.md, read first for every product, so a PR page (`node: pr:<slug>`)
    parses in any product: the app writes PR pages wherever a request is made, and a type the app writes instances
    of is never a product-local card. schema/kinds.yaml lists pr as a base kind.
  source: schema/base-ontology.md; schema/kinds.yaml; lib/parse.js#parseFiles
  status: shipped
  verified-by: [test:page-node]
  related-to: [rule:pr-doc, rule:page-node-line, rule:ontology.open-kinds]
- id: rule:pr-doc
  statement: >
    The PR page is written, not derived: lib:pr-doc makes the slug (`pr-` + the first words of the request
    slugified, `-2`, `-3` on a collision in the project), the body from templates/docs/pr.md (frontmatter `node:
    pr:<slug>`, `type: pr`, `session`, `agent`, `started`, `status`, `part-of: module:<project>-prs`; Request /
    Context / Definition / Impact / Tasks / Result), the Result section from the session's summary and the
    artifacts.blocks inside the PR's window (`started`…`finished`, minus the PR's own page and the PRs page), the
    readiness list from the Definition and the Tasks (`readiness`), and a session's PRs from the graph (`prsOf`:
    pr nodes whose `session` names the id, oldest first, tasks `part of` the PR counted). lib/pr-docs does the IO:
    `ensurePrsPage` writes `prs.md` when missing; `createPrDoc` runs for a PR session (⌘P in PR mode, Ask Wye —
    born refining) and for an assigned task's worker (born building), and for every fresh item
    agent-host#restartFresh hands a PR conversation — after `closePrDoc` cancelled the PR the session left
    unfinished — and stores `prDoc` (a stored `planDoc` is read as prDoc); an ad-hoc conversation gets no page.
    `finishPrDoc` runs from lib:sessions' end hook (done / failed / cancelled) and rewrites Result; a librarian
    leaving puts a refining PR back to draft; `adoptPrDoc` adds a handed-off session's id to `session`;
    `approvePr` / `cancelPr` / `reopenPr` are the person's moves. The first message carries "The request page"
    (agent-host#refiningNote for a librarian, #prDocNote for a worker: where it is, what goes where). The sessions
    API answers each session with `prs` (SessionPr[]). `/<product>/sessions/<id>` redirects to the current PR page
    when the session has one, else to `/changes`.
  source: packages/web/src/lib/pr-doc.ts; packages/web/src/lib/pr-docs.ts; packages/web/src/lib/sessions.ts#onSessionEnd; packages/web/src/app/api/[product]/sessions/route.ts; packages/web/src/lib/agent-host.ts#prDocNote; packages/web/src/lib/agent-host.ts#refiningNote; packages/web/src/lib/agent-host.ts#restartFresh; templates/docs/pr.md
  status: shipped
  verified-by: [test:web-lib#pr-doc, test:web-lib#pr-docs, ui-test:plan-doc]
  related-to: [rule:embed-line, rule:block-attribution, decision:wf2.pr-lifecycle]
- id: rule:column-frame
  statement: >
    The context column is a flex column: `.peek-nav` (the bar) is fixed at the top, `.peek-body` is the one scroll
    container under it, and a session's `.console-input` is `position: sticky; bottom: 0` inside it, so the session
    header and the conversation scroll as one under the bar and above the message box. The console has no height and
    no scroll of its own; the conversation's stick-to-bottom follows the nearest scroll ancestor.
  source: packages/web/src/app/globals.css (.peek, .peek-nav, .peek-body, .console, .console-input); packages/web/src/components/Console.tsx
  status: shipped
- id: rule:content-editor
  statement: >
    `DocEditor` takes a `scope` — a node id. Scoped, it loads the node's text as its first block and the content
    markdown under it (given by `NodeContent` from op:node.content with the document's hash) through the same
    import as a page, and saves with PUT …/node/<id>/content under that hash — the first block's inline text as
    `text`, the rest as `content` (decision:wf2.text-is-first-block); it publishes no editing context and never clears the selected node, so
    the column keeps showing the node whose content it edits; the half-wipe guard and the dev handles are the
    page's only. A block asks its own editor through a DOM event (`emit`: wf:select, wf:peek) that bubbles to the
    editor's container — two editors on one page never hear each other — and in a scoped editor a select opens
    the child on the chip stack instead of selecting it at the root (decision:ontology.depth-by-navigation); an
    embedded card reads the same scope from `EditorScope`. The page editor ignores a block change while it has no
    focus (a reload after the column saved), so the selected node survives the refetch. `NodeContent` refetches on
    every graph change; the editor ignores a refetch while its own save is pending.
  source: packages/web/src/components/DocEditor.tsx:527 (scope, rootRef, publishContext, save); packages/web/src/components/PeekPanel.tsx:157; packages/web/src/components/EditorScope.ts; packages/web/src/components/EmbedBlock.tsx
  status: shipped
- id: rule:agent-sessions
  statement: >
    Any block can be sent to an agent: "Send to agent" sits in every block's drag-handle menu, on node block headers,
    on goal/task table rows and in the right column's node view. It opens the one command box (component:command-box,
    the same ⌘P opens — decision:wf2.one-command-box) with the block text and the ids it defines or links prefilled;
    the request starts a new conversation by default — with the agent (Claude Code, Codex, the Waterfall clerk) and
    the working folder used last, and plan-first (rule:clean-slate) — or goes into a live conversation chosen in
    "to", whose agent restarts from nothing first when "clear context first" is ticked; sending creates
    a session (`data/products/<product>/_sessions/<id>.json`, status queued, gitignored) and opens it in the right
    column, which shows the instruction, refs, status and a log that is polled while the session is queued or
    running. The Agents page lists sessions (active first). Runners update a session with PATCH { status, line,
    result }.
  source: packages/web/src/components/CommandBox.tsx; packages/web/src/components/SessionView.tsx; packages/web/src/lib/sessions.ts; packages/web/src/app/api/[product]/sessions
  status: shipped
- id: rule:agent-runner
  statement: >
    External agents connect through the `wf` CLI (bin/wf.js) against the running web app. `wf agent listen --product
    p --agent claude-code|codex` registers a runner (heartbeat every 10 s to /api/<product>/runners, entries expire
    after 30 s), claims the oldest queued session for its agent (POST /sessions/claim, first come first served),
    builds a prompt (instruction + every ref and the source link resolved to text + how to talk back), runs the
    agent command with the prompt on stdin (`claude -p …` / `codex exec …`, overridable with --cmd), streams every
    output line into the session log, and marks the session done or failed from the exit code. Agents read and write
    through `wf resolve|doc|node|context|node set|doc write|session log|done|fail|handoff`. A hand-off creates a
    queued child session for another agent carrying the instruction, refs, log tail and result; the parent is
    cancelled if still active and both are linked. `/wf-restore <id>` picks a session up interactively (`wf session
    take`). The Sessions page shows runners online, how many are working, and every session's live log.
  source: bin/wf.js; packages/web/src/lib/sessions.ts; skills/waterfall-agent/SKILL.md; skills/wf-restore/SKILL.md
  status: shipped
- id: rule:agent-host
  statement: >
    Chat sessions are hosted by the app: the server spawns the agent as a child process (Claude Code with
    `-p --input-format stream-json --output-format stream-json --permission-prompt-tool stdio`, Codex with
    `codex exec --json`, one process per turn resumed by thread id, spawned with stdin closed — `codex exec` appends
    a piped stdin to the prompt and waits for its EOF, so an open pipe hung every turn with no output until
    2026-09-20; a failed turn's message is the turn's error, said once), keeps the conversation open, normalises the
    agent's events into ChatEvents (user, assistant, thinking, tool_use, tool_result, result, permission, stderr,
    exit), persists them to the session transcript and streams them to the UI over server-sent events. The console
    in the right column shows the transcript live (rule:console-flow), renders the agent's questions as forms and
    other permission requests as Allow/Deny cards (rule:agent-questions), offers Stop, and Resume (which restarts
    Claude Code with --resume and its own session id). Stop (console or Agents row) ends the process and records
    the session done with "stopped by the user — Resume or a message continues with the same context"; Close
    (Agents row) ends the process, drops the waiting items and records cancelled — a cancelled conversation does not
    resume on a plain message, only on a fresh one or Resume (req:wf2.sessions.stop-from-list). A stopped process
    counts as gone at once (`Live.stopped`: isLive false, the pump quiet, the exit handler leaves the status alone). Sending a message while a turn runs queues it. The host
    lives on globalThis so dev reloads do not orphan processes; agents die with the server, and the desktop app owns
    the server. The host does not ask Claude to replay user messages (no --replay-user-messages) and the transcript
    drops a user event that repeats the previous one before the turn ended (dedupeUserEvents), because a turn has
    exactly one user message. A running agent process keeps the arguments and the stdout handler it was spawned
    with: a host code change reaches a session only when its process restarts (Stop / Resume).
  source: packages/web/src/lib/agent-host.ts; packages/web/src/components/Console.tsx; packages/web/src/app/api/[product]/sessions/[id]/{stream,message,control}/route.ts
  status: shipped
- id: rule:session-queue
  statement: >
    Every message to a chat session goes through the session's persistent queue (items with id, text, refs, link,
    images, fresh, plan, addedAt, sentAt, doneAt, failedAt, error in the session file). The host hands the next item
    to the agent as soon as it is idle — one item per turn, or every pending item joined into one message when the
    session's batch mode is "all", but a fresh item always alone (nextTake: a batch stops before it) — and a
    resumed agent takes what waited. An item's state is derived from its stamps (queueState: waiting → working →
    done | failed, decision:wf2.queue-item-state): the host remembers the ids it handed to the open turn
    (`Live.turn`) and stamps them on the turn's `result` (failed when is_error), on a process exit during the turn
    (failed, "agent exited with N during the turn") and on a Codex turn's close. The console's queue panel and the
    Agents row show every item with its state (component:queue-list): working first, waiting in order — each with
    its fresh/keep toggle and a remove button — the finished ones folded under "n done"; the summary reads
    "1 working · 2 waiting · 5 done". All session mutations (queue, transcript, status, log) run under the session
    file's lock with unique temp names, because concurrent read-modify-write cycles corrupted a file once.
  source: packages/web/src/lib/sessions.ts#enqueue; packages/web/src/lib/sessions.ts#markTurnEnd; packages/web/src/lib/session-types.ts#nextTake; packages/web/src/lib/agent-host.ts#pump; packages/web/src/components/QueueList.tsx
  status: shipped
- id: rule:subagents-in-console
  statement: >
    Claude Code runs with --forward-subagent-text; events produced inside a subagent carry the parent tool use id
    and the console nests them, collapsible, under the Task call that started them, with the subagent type,
    description, event and tool-call counts and whether it has finished (the parent's tool_result arrived).
  source: packages/web/src/lib/agent-host.ts#onClaudeLine; packages/web/src/components/Console.tsx#Subagent
  status: shipped
- id: rule:agent-questions
  statement: >
    An agent's question (Claude Code's AskUserQuestion, which arrives as a permission request over the stdio
    permission channel) is rendered as a question card, never as a permission dump: header, question, options as
    choice buttons with descriptions (multi-select when asked, an "Other…" free-text row, text and number kinds).
    Answer is enabled once every question has a value and returns the choices to the agent inside the tool input as
    `answers: { "<question>": "<label>" }` (multi-select comma-separated) — the shape Claude Code reads; Skip denies
    the request and the agent goes on without an answer. An answered card shows what was chosen; a permission
    answered without answers reads "allowed without an answer". Every other permission request shows the tool and
    what it wants to do (the command, the file) with the raw input folded away, and Allow/Deny. Nothing answers a
    permission on the person's behalf.
  source: packages/web/src/components/AskQuestions.tsx; packages/web/src/components/Console.tsx#Event; packages/web/src/lib/agent-host.ts#answerPermission
  status: proposed
- id: rule:agent-contract
  statement: >
    Every agent Waterfall starts receives the Waterfall contract as its system prompt (prompts/agent-system.md, plus
    data/products/<product>/_agent.md, served at /api/<product>/agent-prompt): read Waterfall before acting (wf
    context / resolve / doc, ctx packet), cite node ids, and record knowledge — every decision made by the person
    or the agent above all, plus new requirements, rules and questions — in the product inbox with `wf inbox add`,
    never directly into the documents. Statuses of existing nodes may be set directly. Claude Code gets it via
    --append-system-prompt (+ --add-dir for the Waterfall repo); Codex gets it on top of the first turn; runners
    fetch it from the API.
  source: prompts/agent-system.md; packages/web/src/lib/agent-prompt.ts; packages/web/src/lib/agent-host.ts; bin/wf.js
  status: shipped
```

<!-- /list:rule -->

## Decisions

<!-- list:decision -->

```yaml
- id: decision:wf2.cli-is-wye
  title: The agent CLI is `wye`; `wf` stays an alias until nothing says it any more
  context: >
    The product was renamed Wye (decision:waterfall.rename-scope) and the CLI kept its old name, wf. The person asked
    for the rename on 2026-09-20.
  choice: >
    `bin/wye.js` is the command (package bin, install.sh link, the agents' allow-lists); `bin/wf.js` holds the code
    and stays linked as `wf` for sessions and documents that still say it. Every prompt, skill, README line and app
    string says `wye`; the environment variables keep their names (WF_URL, WF_PRODUCT, WF_SESSION) so running agents
    are not cut off. Documents written before the rename keep `wf` in their prose; new ones say `wye`.
  alternatives: >
    Rename the file and the environment variables in one go (breaks the sessions in flight and every old plan);
    keep wf (the product is not called that).
  consequences: two links on PATH for a while; a later sweep removes the alias and renames the env vars.
  date: 2026-09-20
  status: proposed
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  affects: [rule:agent-runner, rule:agent-contract, rule:librarian-tools]
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
- id: decision:wf2.plan-is-a-document
  title: A plan is a document of its own — plan-<slug> under the page it was asked on — not a derived session page
  context: >
    decision:wf2.plan-is-a-page put the plan on the subject's page and decision:wf2.session-page-derived added a
    computed session page to see it as one thing. The person wants the one thing to be a page in the documents:
    created for the request, editable, in the tree, with the tasks, the context and later the result.
  choice: >
    A plan document per palette request, created by the app at session start from a template (type:pr), a
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
    the two work on — now its own); req:wf2.sessions.plan-doc, req:wf2.sessions.plan-result, rule:pr-doc,
    lib:pr-doc, type:pr; page:web/session, component:session-page, lib:session-page and
    op:api.sessions.page are removed; rule:plan-first's steps 2–3 change; sessions without a plan document keep
    the changes page only. Refined the same day by decision:wf2.plans-folder (the parent is the project's Plans
    page, not the source document) and decision:wf2.plan-per-request (every request, not only plan-first ones).
  status: proposed
  supersedes: decision:wf2.session-page-derived
  date: 2026-09-18
  related-to: [decision:wf2.plan-is-a-page, decision:wf2.session-page-derived, rule:plan-first, rule:embed-line, decision:wf2.plans-folder, decision:wf2.plan-per-request]
  session: 672f4fdf3d
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
- id: decision:wf2.agents-via-cli
  title: Agents integrate through a CLI over the web app's HTTP API, not through an MCP server or direct file access
  context: Claude Code and Codex both run shell commands well; sessions, links and knowledge must reach any agent the same way, and writes must go through the app so the graph rebuilds and locks hold.
  choice: One `wf` CLI (read, write, sessions, runner) talking to the Next.js API; runners are plain processes started next to the code they work on; skills teach Claude Code the CLI.
  alternatives: [MCP server per agent — more tooling to keep in sync and Codex support differs, agents editing markdown directly — bypasses locks and rebuilds and loses the session log, a message queue — unnecessary for a local-first tool]
  consequences: The web app must be running for agents to work; an MCP wrapper can be added later on top of the same API.
  status: approved
  date: 2026-09-16
```

<!-- /list:decision -->

## Libraries

<!-- list:lib -->

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
- id: lib:core.wf
  file: bin/wf.js
  side: server
  purpose: >
    The wf CLI: an agent's door into the running app — resolve, doc, node, context, inbox add, session log/done/take, agent listen (runner).
  part-of: module:app-agents
- id: lib:session-page
  status: retired
  file: packages/web/src/lib/session-page.ts
  side: shared
  purpose: >
    What the session page shows, derived: the todo rows — tasks the session added or changed (artifacts.blocks),
    tasks among its refs, tasks whose `session:` names it — joined with the graph (status now, title, part-of);
    the other blocks grouped by kind, each with its status now; the pages opened (from the transcript's `open`
    events). Pure; tested by test:web-lib#session-page.
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
- id: lib:pr-doc
  status: retired
  file: packages/web/src/lib/pr-doc.ts
  side: server
  purpose: >
    Pure: `planSlug(request, taken)`, `planTitle`, `planDocBody(template, vars)`, `resultSection(session, window)`
    (summary + the blocks inside the plan's window), `withResult(markdown, section)` (the app owns what is under
    "## Result"), `planStatusOnEnd`, `getFrontmatter` / `setFrontmatter`, `plansOf(product, graph, sessionId)`
    (a worker's plans with task counts), `planDocPath`, `plansPageId(project)` (module:<project>-plans — the Plans page
    the rail treats as a system folder, rule:prs-folder). Tested by test:web-lib#plan-doc (12 tests). The IO —
    Plans page, create, finish, close, adopt — is lib/plan-docs.ts.
  part-of: module:app-agents
```

<!-- /list:lib -->
