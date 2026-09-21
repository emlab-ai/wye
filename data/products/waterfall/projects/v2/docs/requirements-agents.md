---
node: module:req-agents
type: module
title: Agents and sessions
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 17
---

# Agents and sessions

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Agents and sessions); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

```yaml
- id: req:wf2.sessions.question-toast
  title: An agent's open question reaches the person wherever they are
  status: shipped
  refines: req:wf2.sessions.questions
  satisfied-by: [component:question-toasts, lib:asking, op:api.sessions]
  verified-by: [test:web-lib#asking]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-agents
```

  - when:wf2.sessions.question-toast a live conversation is waiting on the person — the agent asked a question (AskUserQuestion) or a tool needs permission — and nobody has answered

  - then:wf2.sessions.question-toast a toast appears at the bottom right of every page naming the agent and the question (or the tool and what it wants), with the request it belongs to; a click opens the conversation in the column with the question card; × hides that question until a new one comes; the toasts follow session changes and poll every twenty seconds

```yaml
- id: req:wf2.sessions.block-attribution
  title: Every block a session adds, changes or removes is attributed to it
  status: shipped
  refines: req:wf2.sessions.knowledge-changes
  satisfied-by: [lib:artifacts, lib:graph-diff, rule:block-attribution]
  verified-by: [test:web-lib#graph-diff, ui-test:session-changes]
```

  - when:wf2.sessions.block-attribution a document of the product changes on disk (an agent's editor, wf doc write, the app's editor) while one or more sessions are running, and the graph rebuilds

  - then:wf2.sessions.block-attribution the nodes that are new, changed (title, status, body or text) or gone since the previous build — typed blocks and prose paragraphs (block: nodes) alike — are recorded on every running session as `artifacts.blocks` ({ id, change: added | changed | removed, doc, title, at }); a node changed through the API with x-wf-session is recorded on that session only (as today); the turn-done "knowledge" row and the header strip show the blocks (added / changed counts per document) instead of bare document tags

  - unless:wf2.sessions.block-attribution the change is the app's own task-link write (session / produced on a task line), which is never credited; or no session is running — then nothing is recorded, as today

```yaml
- id: req:wf2.sessions.changes-page
  title: A session's changes open as one list, per document, block by block
  status: shipped
  refines: req:wf2.sessions.knowledge-changes
  satisfied-by: [component:session-changes, page:web/session-changes, op:api.sessions.changes]
  verified-by: [ui-test:session-changes]
```

  - when:wf2.sessions.changes-page a person clicks the knowledge strip of a session (or "n changes" on a session row), or opens /<product>/sessions/<id>/changes, or runs `wf session changes <id>`

  - then:wf2.sessions.changes-page every block the session added, changed or removed is listed per document with a badge (added / changed / removed), its tag and title; a row opens the node in the context column; prose paragraphs are folded under "n paragraphs" per document; chips filter by change and by kind (req, decision, task, …); the page is derived from the session's artifacts and the current graph — nothing is stored beyond the attribution

  - unless:wf2.sessions.changes-page the session changed nothing — the strip and the page say so

```yaml
- id: req:wf2.sessions.stop-from-list
  title: An agent can be stopped or closed from the Agents page
  status: shipped
  refines: req:wf2.ui.live
  satisfied-by: [component:session-list, op:api.sessions.control]
  verified-by: [ui-test:agents-queue]
```

  - when:wf2.sessions.stop-from-list a person hovers a conversation row on the Agents page

  - then:wf2.sessions.stop-from-list a live row offers Stop — the process ends, the context survives (`--resume` brings it back, as rule:idle-stop) and the row leaves Active; every active row offers Close — the process ends if there is one, the pending queue items are dropped, the session is recorded as cancelled and the row leaves Active (it stays under All); the page header offers "Stop idle (n)" that stops every live conversation with no open turn and nothing queued; a row's action never opens the conversation

  - unless:wf2.sessions.stop-from-list the row is a runner's session (mode run) — it has no process here; Close alone applies

```yaml
- id: req:wf2.sessions.queue-on-agents
  title: Each agent row shows the tasks it got and where each one stands
  status: shipped
  refines: req:wf2.ui.live
  satisfied-by: [component:session-list, component:console, lib:sessions, lib:agent-host]
  verified-by: [ui-test:agents-queue]
```

  - when:wf2.sessions.queue-on-agents a conversation has received one or more messages through its queue

  - then:wf2.sessions.queue-on-agents the row shows the queue under the instruction: each item's first line with a state — waiting (not handed to the agent yet), working (the turn it opened is running), done (that turn ended), failed (the turn ended with an error or the process exited during it) — the working item first, then the waiting ones in order, the done ones folded under "n done"; a waiting item can be removed and the row's summary says "1 working · 2 waiting · 5 done"; the console's queue panel shows the same states, so both views read one record

  - unless:wf2.sessions.queue-on-agents the conversation never used its queue — the row shows only the instruction, as today

```yaml
- id: req:wf2.sessions.fresh-in-queue
  title: Clear context applies when the task's turn comes, not when it is queued
  status: shipped
  refines: req:wf2.sessions.clean-slate
  satisfied-by: [lib:agent-host, lib:sessions, component:command-box, component:console, op:api.sessions.message, op:api.sessions.control]
  verified-by: [ui-test:agents-queue]
```

  - when:wf2.sessions.fresh-in-queue a person queues a message for a conversation with "clear context first" ticked (command box, or the console's message box)

  - then:wf2.sessions.fresh-in-queue the item is queued carrying `fresh` (and the plan-first choice); when the agent is idle it restarts from nothing at once and gets the item as its first message (as rule:clean-slate today); when a turn is open, that turn finishes first — then the host restarts the agent from nothing and hands it the item; the queue shows the item with a "fresh" mark, and the mark can be toggled on a waiting item; a fresh item is always handed alone, even in batch mode (items queued before it go in their own batch first)

  - unless:wf2.sessions.fresh-in-queue the tick is off — the item goes into the running agent with its context kept, as today

```yaml
- id: req:wf2.sessions.page
  title: Every session has a page that shows its task, its todo items and the blocks it touched
  status: shipped
  refines: req:wf2.sessions.knowledge-changes
  satisfied-by: [page:web/session, component:session-page, lib:session-page, op:api.sessions.page, rule:session-page]
  verified-by: [ui-test:session-page]
```

  - when:wf2.sessions.page a person opens /<product>/sessions/<id> — from the ↗ on the session's head in the right column, from a row's "page" action on the Agents page, or from the "opened …" line of the console

  - then:wf2.sessions.page the page shows the agent, the status and when; the instruction in full (markdown) with its refs and source; the follow-up messages of its queue with their states; "plan on" — the document and node every `wf session open` pointed at; the todo list — every task the session added, changed, was sent or is named on (`session:`) — as task lines with the check state the graph has now and "n of m done"; every other block it added, changed or removed, grouped by kind (req, decision, question, rule, page, component, …), each with the change badge and its status now (proposed = still to approve or build, shipped, open, done); paragraphs folded per document; a row opens the node in the context column; the result when the session is done; a button opens the conversation in the right column; the page refreshes while the session runs

  - unless:wf2.sessions.page the session does not exist — 404; or it changed nothing yet — the lists say so

```yaml
- id: req:wf2.ui.history-nav
  title: Back and forward from the top bar
  status: shipped
  refines: req:wf2.ui
  satisfied-by: [component:top-bar, rule:history-nav]
  verified-by: [ui-test:session-page]
```

  - when:wf2.ui.history-nav a person clicks ‹ or › in the top bar, or presses ⌘[ / ⌘] (Ctrl on Windows)

  - then:wf2.ui.history-nav the browser goes back or forward in its history; every in-app navigation — links, `wf session open`, the console's "opened …" line, search hits — is client-side, so the right column keeps its stack across it

  - unless:wf2.ui.history-nav there is nothing to go back or forward to — the button is disabled (the Navigation API when the browser has it, `history.length` otherwise)

```yaml
- id: req:wf2.transcript.app-links
  title: A Waterfall link in a transcript is shown as what it points at
  status: shipped
  refines: req:wf2.sessions.page
  satisfied-by: [component:transcript-markdown, lib:app-link, rule:app-link]
  verified-by: [test:web-lib#app-link, ui-test:app-links]
  part-of: module:req-agents
```

  - when:wf2.transcript.app-links a user, assistant, summary or instruction text in a conversation or on a session page contains a link whose target is this app (same origin as the page, or localhost / 127.0.0.1 on the app's port)

  - then:wf2.transcript.app-links the link is rendered as its target — a document as the document's title, a node as `<document> › <tag>` with the tag opening the peek panel, a session as `session <id>`, the app root as `Waterfall` — with the full URL as the tooltip, and a click navigates inside the app (client-side, the right column kept, no page load); the same text's kind:slug ids are tags

  - unless:wf2.transcript.app-links the link points elsewhere — it stays a normal link that opens outside the app (a new tab in the browser, the system browser in the desktop); a document the graph does not know is shown by its slug

```yaml
- id: req:wf2.sessions.plan-doc
  title: Every request that starts work becomes a plan document under the project's Plans page
  Documents tree); the page header shows the
    session as a link that opens the conversation; a handed-off session continues the same plan (its id is added
    to `session`)
  status: shipped
  refines: req:wf2.ui.command-palette
  satisfied-by: [type:pr, lib:pr-doc, rule:pr-doc]
  verified-by: [ui-test:plan-doc, ui-test:plans]
```

  - when:wf2.sessions.plan-doc a request starts work — a new session (from the command box or the API, chat or queued) or a fresh-context message on a live conversation — with or without "plan first"

  - then:wf2.sessions.plan-doc the app creates `plan-<slug>` in the project the request came from, a sub-page of that project's Plans page (`plans.md`, module:<project>-plans, created when missing — decision:wf2.plans-folder), with the type:pr card in its frontmatter (`session`, `agent`, `started`, `status: proposed`), the request verbatim under "Request" with the source document, node and refs as tags, and empty "Context", "Plan", "Tasks" and "Result" sections; the session record keeps the current `planDoc: <product/project/slug>`; the agent's first message names the document; the agent fills Context (what it found, as tags and embeds), Plan (prose, `question:` and `decision:` blocks, embeds of the `req:`/`rule:` blocks it defined on the entities' pages) and Tasks (`- [ ] task:` lines, `part of plan:<slug>`, ticked as it goes — what is in progress) and opens the page (`wf session open`); the person edits, comments and answers there; the rail's Plans folder shows it (req:wf2.ui.plans-folder — not the

  - unless:wf2.sessions.plan-doc a follow-up message without "clear context first" — it continues the current plan; the product has no project — no document, the agent is told to plan on the subject's page

```yaml
- id: req:wf2.pr
  title: A request is a Prompt Request — one page from typing it to its build, refined until clear, approved by the person, then built
  status: shipped
  refines: req:wf2.sessions.plan-doc
  satisfied-by: [type:pr, lib:pr-doc, lib:pr-docs, lib:pr-sessions, lib:pr-intake, lib:pr-questions, lib:pr-scope, lib:dispatch, op:api.pr, op:api.sessions, component:pr-head, component:pr-folder, component:pr-list, component:command-box, component:settings-agents, page:web/prs, rule:pr-doc, rule:prs-folder]
  verified-by: [test:web-lib#pr-doc, test:web-lib#pr-docs, test:web-lib#pr-scope, test:web-lib#dispatch, test:web-lib#pr-questions, test:web-lib#pr-intake, test:plans-to-prs, test:prs-number, ui-test:pr]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-agents
```

  - when:wf2.pr the person opens ⌘P in PR mode and types what they want (or sends a block to Wye)

  - then:wf2.pr a PR page is created under the project's PRs page (pr:<slug>, Request / Context / Definition / Impact / Tasks / Result) and a librarian refines it in the column — fills Context, proposes the Definition blocks in their home documents, asks its questions on the page as question cards the person answers there — until the readiness list on the PR's head is green (definition · agreed · impact · no contradiction · tasks); the person approves it there (Approve — with what is unagreed named when the list is not green — Cancel, Reopen; wye pr approve from the CLI), and an approved PR is built by the app: a worker starts on it as soon as a slot is free (Settings › Agents, parallel runners) and no building PR shares its scope (decision:wf2.pr-scheduler); the rail's PRs folder shows every PR grouped refining · approved · building, the ended ones under done; ad-hoc — the other ⌘P mode — is a conversation with a coding agent and makes no page

  - unless:wf2.pr the person cancels the PR — then it is cancelled and its refining session stopped; or the librarian leaves before approval — then the PR is a draft again

```yaml
- id: req:wf2.hooks
  title: Hooks and skills — a person defines a harness: when something happens to a node, a skill runs on it or blocks are added
  status: shipped
  refines: req:wf2.pr
  satisfied-by: [type:skill, type:hook, type:template, lib:skills, lib:hooks, lib:hooks-run, op:api.skills, op:api.hooks, component:skill-folder, lib:watch, lib:agent-host, lib:agent-prompt]
  verified-by: [test:web-lib#hooks, test:web-lib#skills]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-agents
```

  - when:wf2.hooks a node is created, its status moves, an edge with a verb now points at it, a PR is approved or built, or a session ends — and a hook card in the project's Hooks document says `on: <kind>.<event>` for it (with an optional `where:` filter: document, type, status, prop, role)

  - then:wf2.hooks the hook's `do:` lines run: `run skill:<id>` starts a session on the node with the skill's instruction — a document under the project's Skills page (the shipped prompts refine / build / describe-module and define-tests are skills a person reads and edits; `skills:` on a PR, a type card or a hook attaches skills to the sessions it starts) — and `add <template>` appends a template's blocks under the node; everything a hook writes is proposed (`by: hook:<slug>`) and reviewed like an agent's work; each firing is recorded (wye hooks) and a hook fires once per node unless it says `once: false`; a change a hook's session made can fire hooks again, three levels deep at most

  - unless:wf2.hooks the hook is paused, hooks are off (WF_HOOKS=0), the same hook already fired on that node, or the chain is deeper than three firings — then nothing runs; the two remaining actions, assign and notify, are H2 with the column's Hooks section and the Settings switch

```yaml
- id: req:wf2.sessions.plan-result
  title: The plan document ends with the result — the app's section, scoped to the plan
  status: shipped
  refines: req:wf2.sessions.plan-doc
  satisfied-by: [lib:pr-doc, rule:pr-doc]
  verified-by: [ui-test:plan-doc, ui-test:plans]
```

  - when:wf2.sessions.plan-result a session with a plan document is set done, failed or cancelled (`wf session done <id> "<result>"`, Cancel, Close), or a fresh request replaces a plan the session never finished

  - then:wf2.sessions.plan-result the app writes "Result" — the summary as markdown, then the blocks credited to the session between the plan's `started` and `finished` (artifacts.blocks by `at`; the plan's own page and the Plans page left out) as a list with the change badge and a tag per block, paragraphs as a count with a link to the changes page — replacing whatever was under the heading, so ending twice writes it once; and sets the card's `status` (done / failed / cancelled; a replaced plan is cancelled with "Left unfinished") and `finished`; the tasks under "Tasks" keep the check state the graph has (the agent ticks them with `wf node set`)

  - unless:wf2.sessions.plan-result the session has no plan document — nothing is written

```yaml
- id: req:wf2.console.first-message-is-the-request
  status: shipped
  satisfied-by: [lib:agent-host, component:console, lib:session-types, lib:transcript]
  verified-by: [test:web-lib#transcript, ui-test:first-message-fold]
  part-of: module:req-agents
```

  - when:wf2.console.first-message-is-the-request a conversation's first message goes to the agent (a new session, or a fresh restart with a queued item)

  - then:wf2.console.first-message-is-the-request the console's user row shows what the person asked — the instruction text (a batch joined the way the queue joins it) and its images — and not the product line, Context, plan-first protocol or How-to-work sections; the full text the agent received stays on the event and opens from a small "what the agent received" fold under the row, collapsed by default

  - unless:wf2.console.first-message-is-the-request the transcript was recorded before this shipped — those rows keep the text they have

```yaml
- id: req:wf2.ui.column-frame
  title: The context column's bar and message box stay put; only its content scrolls
  status: shipped
  refines: req:wf2.ui
  satisfied-by: [component:peek-panel, component:console, rule:column-frame]
  verified-by: [ui-test:column-frame]
```

  - when:wf2.ui.column-frame the context column shows more than fits — a long node, a session with a long conversation

  - then:wf2.ui.column-frame the bar at the top (←, the chips, ×) and, for a session, the message box at the bottom stay in view while the content between them — a node's card and relations, a session's header and conversation — scrolls; a new event keeps the conversation at its end when it was at its end

  - unless:wf2.ui.column-frame the content fits — nothing scrolls and the message box sits under the conversation

```yaml
- id: req:wf2.ui.connected-cards
  title: A connected node opens as its card under its row in the context column
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:peek-panel, component:embed-block, rule:connected-cards]
  verified-by: [ui-test:connected-cards]
```

  - when:wf2.ui.connected-cards a node is open in the context column and a person presses the expand toggle on a row of Connected (any relation group) or of a goal's Sub-goals / Tasks / Requirements, or the cards toggle on a group heading

  - then:wf2.ui.connected-cards the row (every row of the group) is followed by the node's card as its document shows it — kind, slug, status, text, properties — editable in place, with a line naming the document it comes from; the toggle collapses it again; the tag still opens the node in the column; the expanded set is forgotten when another node opens

  - unless:wf2.ui.connected-cards the row names a node that is only referenced, never defined — the row has no toggle

```yaml
- id: req:wf2.ui.block-select
  title: A click anywhere on a block shows its node in the context column
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:peek-panel, component:node-cards, component:embed-block, rule:block-select]
  verified-by: [ui-test:block-select]
```

  - when:wf2.ui.block-select a person clicks any part of a typed block in a document — a card's text, its properties, its header, a table row's cell, an embedded card's text area — whatever the column shows at that moment (a session, another node, the Context root)

  - then:wf2.ui.block-select the block is selected: the column comes back to its Context root and shows that node's details (the same view a tag opens), followed by the knowledge related to the block when the editor's caret is in it; the chips already open stay in the bar so the session or node the person was looking at is one click away

  - unless:wf2.ui.block-select the click lands on a tag or a link inside the block — those still push what they name; or on a plain paragraph — the root follows the caret as before (task:ontology.block-peek makes a paragraph's block node openable the same way)

```yaml
- id: req:wf2.ui.node-content
  title: A node's details are its properties and its content, edited with the document's editor
  status: shipped
  refines: req:wf2.ui.node-page
  depends-on: [req:ontology.content, decision:ontology.depth-by-navigation]
  satisfied-by: [component:peek-panel, component:doc-editor, rule:content-editor, op:node.content]
  verified-by: [ui-test:node-content]
  related-to: [page:web/context-column, component:node-editor]
```

  - when:wf2.ui.node-content a defined node of any kind — a requirement, a task, a decision, a product type's instance, a document — is shown in the context column (the Context root after a click on its block, or pushed by a tag)

  - then:wf2.ui.node-content the column shows its properties (component:node-editor) and, under a Content heading, its content in the same block editor a document page uses (component:doc-editor): the slash menu offers every block type, a typed block inserted there is a new node the parent has, tags, embeds, images and nested blocks work as on the page, and every change saves to the node's nested lines in its source document (req:ontology.content, one store); a child's card in that editor shows its head and first block, and a click on it opens the child in the column with its own properties and content editor — so a person goes one level deeper per click, to any depth, and ← comes back (decision:ontology.depth-by-navigation)

  - unless:wf2.ui.node-content the node is only referenced and never defined — no content, the row says so; or a block: node whose id is the hash of its text (question:wf2.content-of-block-nodes)

```yaml
- id: req:wf2.ui.card-preview
  title: A card of a node with content shows only its own first block; the content is in the details
  status: shipped
  refines: req:wf2.ui.connected-cards
  depends-on: req:ontology.content
  satisfied-by: [component:node-cards, component:embed-block, rule:card-fold]
  verified-by: [ui-test:node-content]
  related-to: [decision:ontology.depth-by-navigation]
```

  - when:wf2.ui.card-preview a node whose content is not empty renders as a card — on its document page, as an embed on another page, as an expanded Connected row in the column, or inside its parent's content editor

  - then:wf2.ui.card-preview the card shows its head (kind, id, status), its text — the node's first block (decision:wf2.text-is-first-block) — and its properties, and none of the blocks under it; the header carries a chip with the count ("▸ 3 blocks") and a click on the chip, like a click on the card (rule:block-select), opens the node's details, where the whole content is shown and edited

  - unless:wf2.ui.card-preview the editor's caret is inside one of the node's blocks on the page (a drag, a programmatic selection): they show while it is there, so nothing is typed blind, and fold again when it leaves; or the node is a question, whose content is its answer (decision:wf2.answer-is-content) and shows under the card

```yaml
- id: req:wf2.ui.related-collapsed
  title: Related knowledge in the column is hidden until asked for
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:peek-panel, component:context-panel, rule:related-collapsed]
  verified-by: [ui-test:node-content]
  related-to: [rule:context-panel]
```

  - when:wf2.ui.related-collapsed the Context root shows a node or follows the caret in a document, where today the knowledge closest to the block's text (rule:context-panel) is listed under Related

  - then:wf2.ui.related-collapsed Related is a collapsed heading with a "show" button; no search runs while it is collapsed; pressing it runs the search and lists the hits as today; the choice is remembered per browser so a person who wants Related open keeps it open across pages and reloads

  - unless:wf2.ui.related-collapsed no block is being edited — the Context root has nothing to search for and says so, as today

```yaml
- id: req:wf2.ui.produced-collapsed
  title: What a task's sessions produced is folded at the bottom of the column
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:produced, component:peek-panel, rule:produced-collapsed]
  verified-by: [ui-test:node-content]
  related-to: [req:wf2.ui.related-collapsed, rule:task-artifacts]
```

  - when:wf2.ui.produced-collapsed the context column shows a goal or task that has sessions (rule:task-artifacts)

  - then:wf2.ui.produced-collapsed Produced comes after Connected, as a bar that reads how many sessions and documents it holds and has a "show" button; pressing it fetches the sessions and the inbox and lists them as today (sessions with their result, documents, nodes changed, inbox items); "hide" folds it again; it is closed on every node it opens on

  - unless:wf2.ui.produced-collapsed the node has no sessions — no bar at all, as today

```yaml
- id: req:wf2.sessions.clean-slate
  title: A task starts from a clean slate; a chat keeps its context
  status: shipped
  refines: req:wf2.ui.command-palette
  satisfied-by: [rule:clean-slate, component:command-box]
  verified-by: [ui-test:command-palette]
```

  - when:wf2.sessions.clean-slate a person sends a request from the command box (⌘P or "Send to agent")

  - then:wf2.sessions.clean-slate the box proposes a new conversation — a fresh agent, in the folder and with the agent used last — so the task reads what it needs from Waterfall, not from the previous task's context; a live conversation can be chosen instead, and then a "clear context first" tick restarts its agent from nothing before the message, in the same folder and the same console

  - unless:wf2.sessions.clean-slate the person writes in a conversation's own message box or leaves the tick off — then the message goes to the running agent and its context is kept

```yaml
- id: req:wf2.sessions.idle-stop
  title: An idle agent does not hold its process for hours
  status: shipped
  refines: req:wf2.ui.live
  satisfied-by: [rule:idle-stop]
```

  - when:wf2.sessions.idle-stop a live conversation has had no turn and no queued message for the configured quiet time (30 minutes by default)

  - then:wf2.sessions.idle-stop the app stops the agent process, the session says why in its log, and Resume or the next message brings the agent back with the same context

  - unless:wf2.sessions.idle-stop the quiet time is set to 0

```yaml
- id: req:wf2.sessions.knowledge-changes
  title: The session shows which part of the knowledge base it changed
  status: shipped
  refines: req:wf2.ui.live
  satisfied-by: [action:see-knowledge, component:console, lib:artifacts]
```

  - when:wf2.sessions.knowledge-changes an agent in a chat session finishes a turn (or the session ends) after writing documents or nodes of the product — through wf doc write / wf node set, or by editing the markdown on disk

  - then:wf2.sessions.knowledge-changes the turn-done row in the console lists what changed in that turn as tags (documents by module, nodes by id, each opening in the context column), and the session header keeps a "Knowledge" strip with everything the session changed so far, updated live — the same artifacts the task's Produced section shows (rule:task-artifacts)

  - unless:wf2.sessions.knowledge-changes the turn changed no document or node — then the row reads as before (time, cost)

```yaml
- id: req:wf2.sessions.questions
  title: The agent's questions reach the person and the answer reaches the agent
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:agent-questions]
```

  - when:wf2.sessions.questions an agent in a chat session asks the person a question (Claude Code's AskUserQuestion)

  - then:wf2.sessions.questions the console shows a question card with the options as choices (multi-select, Other…, text or number kinds), the session visibly waits, and Answer returns exactly the chosen labels to the agent so its next step uses them

  - unless:wf2.sessions.questions the person chooses Skip, in which case the agent is told there was no answer

```yaml
- id: req:wf2.sessions.quiet-console
  title: The console reads as a conversation, not a tool log
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:console-flow]
```

  - when:wf2.sessions.quiet-console a turn makes several tool calls between two messages

  - then:wf2.sessions.quiet-console they fold into one collapsed row that names how many steps, how long, how many errors and the latest step, and opens on click; messages, questions, permission cards and turn ends are never folded

```yaml
- id: req:wf2.sessions.summary-in-flow
  title: A session's summary and progress notes are part of its conversation
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:console-flow]
```

  - when:wf2.sessions.summary-in-flow an agent writes `wf session log` lines or ends with `wf session done <summary>`

  - then:wf2.sessions.summary-in-flow the console shows them in the conversation at the time they were written; a chat session has no separate Result panel

```yaml
- id: req:wf.lint
  title: The graph cannot silently drift from the code
  status: shipped
  satisfied-by: [op:ctx.check, rule:rule-needs-source, rule:req-needs-satisfied-by, rule:shipped-needs-test, rule:source-path-resolves, rule:stub-nodes]
  verified-by: [test:smoke#check-ok]
  note: smoke proves the green path on the pilot only; no test asserts any red path

```

  - when:wf.lint ctx check runs (locally or in CI)

  - then:wf.lint it reports errors (rule without source, req without satisfied-by, referenced-but-undefined rule/req ids) and warnings (untested shipped reqs, other stubs, unresolvable source paths, contradiction count) and exits 1 on any error

```yaml
- id: req:wf.lint.source-roots
  title: Source paths resolve relative to where the module lives
  status: shipped
  satisfied-by: [flag:source-roots, rule:source-path-resolves]
  verified-by: []
  refines: req:wf.lint

```

  - when:wf.lint.source-roots a node cites `source: Items/Queries.cs:47`

  - then:wf.lint.source-roots the path is tried under each entry of the module's source-roots frontmatter, in order, before being reported missing

```yaml
- id: req:wf.lint.ci
  title: A PR that breaks the graph fails CI
  status: proposed
  refines: req:wf.lint

```

  - when:wf.lint.ci a pull request changes docs/context-graph or code cited by it

  - then:wf.lint.ci ctx build && ctx check --strict runs in CI and blocks the merge on errors

```yaml
- id: req:wf.lint.symbols
  title: Sources can point at symbols, not lines
  status: proposed
  refines: req:wf.lint

```

  - when:wf.lint.symbols a source is written as path#Symbol

  - then:wf.lint.symbols check verifies the symbol still exists in that file (grep), so line-number rot stops mattering

```yaml
- id: req:wf.lint.constraints
  title: House rules are graph queries
  status: proposed
  refines: req:wf.lint

```

  - when:wf.lint.constraints a constraint is written in _schema/constraints.yaml (e.g. "every op in module X has a gated-by edge", "any node touching money links the money-is-pence rule")

  - then:wf.lint.constraints ctx check evaluates it and reports violations like any other rule

```yaml
- id: req:wf.lint.semantic-drift
  title: Two rules that say different things about the same behaviour are flagged
  status: proposed
  refines: req:wf.lint
```

  - when:wf.lint.semantic-drift a new rule's statement overlaps an existing rule in its two-hop neighbourhood

  - then:wf.lint.semantic-drift check asks an LLM pass to classify it as refines / contradicts / duplicate and requires the edge to be written

```yaml
- id: req:wf.pipeline
  title: A feature enters the graph before it enters the code
  status: proposed
  satisfied-by: [entity:delta, page:skill/context]
  note: templates/delta.yaml and the skill describe the flow; nothing parses _deltas/ or enforces the order (drift row 3)

```

  - when:wf.pipeline someone wants new behaviour

  - then:wf.pipeline they write a delta — new or refined req nodes with status proposed plus the ops/rules/actions they intend — and it is reviewed and approved as its own change before implementation starts

```yaml
- id: req:wf.pipeline.status
  title: Node status is the state machine that gates work
  status: proposed
  satisfied-by: [state:node-lifecycle]
  refines: req:wf.pipeline

```

  - when:wf.pipeline.status a node moves proposed → approved → shipped (or deprecated)

  - then:wf.pipeline.status ctx check enforces the transitions — approved needs a reviewer, shipped needs real sources and verified-by, deprecated needs a replacement or a resolves edge

```yaml
- id: req:wf.pipeline.packet-scope
  title: An implementation touches only what its packet cites
  status: proposed
  refines: req:wf.pipeline

```

  - when:wf.pipeline.packet-scope an agent implements an approved delta

  - then:wf.pipeline.packet-scope it starts from ctx packet --delta <id>, edits files cited by the packet plus new files, and a Claude Code hook warns on edits to a described module with no approved delta touching it

```yaml
- id: req:wf.pipeline.done
  title: Done means the graph agrees with the code
  status: proposed
  satisfied-by: [page:skill/context, flag:strict]
  refines: req:wf.pipeline

```

  - when:wf.pipeline.done the implementation PR is opened

  - then:wf.pipeline.done every touched req is shipped with real file:line or file#Symbol sources and verified-by naming tests that exist and pass; ctx check --strict is green; the PR description lists node ids and resolved drift rows

```yaml
- id: req:wf.pipeline.code-markers
  title: Code points back at the graph
  status: proposed
  refines: req:wf.pipeline
```

  - when:wf.pipeline.code-markers a function or test implements a rule

  - then:wf.pipeline.code-markers a `// ctx: rule:<slug>` comment or a test trait names the rule, so check verifies both directions and impact can start from a file path

```yaml
- id: req:wf.skills
  title: The process is a skill, not a memory
  status: shipped
  satisfied-by: [page:skill/describe-module, page:skill/context, op:install]
  verified-by: []

```

  - when:wf.skills a user says "describe module X" or starts feature work in a repo with a graph

  - then:wf.skills Claude Code loads waterfall-describe-module (the authoring process, with explorer prompts) or waterfall-context (the read/write contract) from ~/.claude/skills

```yaml
- id: req:wf.skills.explorers
  title: Big modules are mapped by parallel explorers
  status: shipped            # process; proven on inventory
  satisfied-by: [page:skill/describe-module]
  verified-by: []
  refines: req:wf.skills

```

  - when:wf.skills.explorers the describe skill runs on a real codebase

  - then:wf.skills.explorers two Explore agents (server, client) run in parallel from the reference prompts and return structured maps with file:line citations; the author spot-checks 3–5 claims before writing

```yaml
- id: req:wf.skills.mcp
  title: Any agent can query the graph, not only Claude Code
  status: proposed
  refines: req:wf.skills

```

  - when:wf.skills.mcp an agent runtime without shell access needs the graph

  - then:wf.skills.mcp the same commands are available over MCP

```yaml
- id: req:wf.self
  title: Waterfall is developed through its own pipeline
  status: proposed
  satisfied-by: [entity:module-doc]
  note: this file is the first step; nothing enforces the rest yet (req:wf.pipeline)
```

  - when:wf.self a change to waterfall is proposed

  - then:wf.self it appears first as a req in this file, is approved, implemented, and flipped to shipped with a test

<!-- /list:req -->

## Open questions

<!-- list:question -->

```yaml
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
  related-to: [req:wf2.sessions.plan-doc, rule:pr-doc]
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

<!-- /list:question -->
