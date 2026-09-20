---
node: module:session-notes
type: module
title: Session notes (retired)
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:archive
order: 91
---

# Session notes (retired)

Plan sections that past sessions left inside definition pages, kept here retired. The plan documents under Plans hold the same history.


## Plan: the blocks a session changed (task:session-knowledge-changes) (from app-agents)

What is shipped (req:wf2.sessions.knowledge-changes): the console's turn-done row and the header's knowledge
strip list the *documents* a session wrote and the *nodes* it changed through the API. What is missing is the
block level: an agent that edits a document on disk (most do — I did this whole session with heredocs) is credited
with the document, not with the requirements, decisions and paragraphs it added or changed inside it. The task asks
for a run id on every such block and a page that lists all of them. The plan: attribute per block by diffing the
graph at every rebuild (the session id is the run id; the attribution is stored with the session, derived — the
documents are not rewritten), then show it as a Changes list on the session and as a page.


Work, in order:



## Plan: stop an agent, see its queue, clear context in the queue (session 181e88ad1f) (from app-agents)

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


Work, in order:



## Plan: a page for each session — the task, its todo items, the blocks it touched (session efee530d46) (from app-agents)

What is there today: a session lives in the right column (component:session-view) — the instruction folded away,
a knowledge strip, a "changes" fold and the console. The plan an agent writes is a section on the subject's page
(decision:wf2.plan-is-a-page), and once the agent has built it nothing shows the plan as one thing: what was asked,
which task lines came out of it and where each one stands, which blocks were proposed and which of them shipped.
`/<product>/sessions/<id>` does not exist — only `/changes` under it. And there is no way back: after `wf session
open` (or a click on the console's "opened …" line, a plain anchor that reloads the app and drops the right
column's stack) the only way to return is the browser's own button, and the top bar (component:top-bar) has none.

The plan: the session gets a page of its own at `/<product>/sessions/<id>` — derived from the session record and the
current graph, like the changes page — and the top bar gets back / forward.


Work, in order:



## Plan: a Waterfall link in a transcript is shown as what it points at (session 64813dfdab) (from app-agents)

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


Work, in order:



## Plan: a plan document per request — `plan-<slug>` under the documents (session 672f4fdf3d) (from app-agents)

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

The document type is type:pr (a base type in `schema/base-ontology.md`, rule:pr-type-base). A plan document:

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

<the instruction, verbatim, markdown>  · from: module:app-agents › (node under the cursor) · refs: …

<the agent's tags and embeds: modules, documents, nodes, code paths it found>

<prose; questions as question: blocks; decisions as decision: blocks; embeds of the blocks defined elsewhere>

- [ ] task:… … part of plan:session-plan-page

<empty until the session is done; then the summary and the changes>
```


Work, in order:



## Plan: the console shows the request, not the agent's first-message wrapper (session c2bbac979d) (from app-agents)

What is there today: lib:agent-host `buildPrompt` builds the agent's first message — a product line, "## Instruction"
with the request and its image paths, "## Context" with the refs resolved, the plan-first protocol (rule:plan-first)
when the request came from the palette, and "## How to work" — and `startProcess` emits that whole text as the
`user` event, so component:console shows the person a page of protocol above their own words (the same on a fresh
restart, agent-host#restartFresh). The wrapper is for the agent; the person wrote only the request.




## Plan: all instances of a type, with filters (task:new-453) (from app-knowledge)

Today a type's instances are a plain table on `/types/<slug>` (page:web/types) and a kind's nodes a plain list on
`/knowledge/<kind>` (page:web/knowledge); only Goals and Tasks (component:track-list) have search, status chips and
group by. task:new-453 asks for one place to see *all* cards of a type — pages, managers, tasks — and narrow them.
The plan: one client component, component:instance-table, that both pages render, then the same table as a block
inside a document (a Notion "linked database": a live view, nothing stored).


Work, in order:



## Plan: the blocks a session changed (task:session-knowledge-changes) (from app-agents)

What is shipped (req:wf2.sessions.knowledge-changes): the console's turn-done row and the header's knowledge
strip list the *documents* a session wrote and the *nodes* it changed through the API. What is missing is the
block level: an agent that edits a document on disk (most do — I did this whole session with heredocs) is credited
with the document, not with the requirements, decisions and paragraphs it added or changed inside it. The task asks
for a run id on every such block and a page that lists all of them. The plan: attribute per block by diffing the
graph at every rebuild (the session id is the run id; the attribution is stored with the session, derived — the
documents are not rewritten), then show it as a Changes list on the session and as a page.


Work, in order:



## Plan: stop an agent, see its queue, clear context in the queue (session 181e88ad1f) (from app-agents)

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


Work, in order:



## Plan: a page for each session — the task, its todo items, the blocks it touched (session efee530d46) (from app-agents)

What is there today: a session lives in the right column (component:session-view) — the instruction folded away,
a knowledge strip, a "changes" fold and the console. The plan an agent writes is a section on the subject's page
(decision:wf2.plan-is-a-page), and once the agent has built it nothing shows the plan as one thing: what was asked,
which task lines came out of it and where each one stands, which blocks were proposed and which of them shipped.
`/<product>/sessions/<id>` does not exist — only `/changes` under it. And there is no way back: after `wf session
open` (or a click on the console's "opened …" line, a plain anchor that reloads the app and drops the right
column's stack) the only way to return is the browser's own button, and the top bar (component:top-bar) has none.

The plan: the session gets a page of its own at `/<product>/sessions/<id>` — derived from the session record and the
current graph, like the changes page — and the top bar gets back / forward.


Work, in order:



## Plan: a Waterfall link in a transcript is shown as what it points at (session 64813dfdab) (from app-agents)

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


Work, in order:



## Plan: a plan document per request — `plan-<slug>` under the documents (session 672f4fdf3d) (from app-agents)

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

The document type is type:pr (a base type in `schema/base-ontology.md`, rule:pr-type-base). A plan document:

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

<the instruction, verbatim, markdown>  · from: module:app-agents › (node under the cursor) · refs: …

<the agent's tags and embeds: modules, documents, nodes, code paths it found>

<prose; questions as question: blocks; decisions as decision: blocks; embeds of the blocks defined elsewhere>

- [ ] task:… … part of plan:session-plan-page

<empty until the session is done; then the summary and the changes>
```


Work, in order:



## Plan: the console shows the request, not the agent's first-message wrapper (session c2bbac979d) (from app-agents)

What is there today: lib:agent-host `buildPrompt` builds the agent's first message — a product line, "## Instruction"
with the request and its image paths, "## Context" with the refs resolved, the plan-first protocol (rule:plan-first)
when the request came from the palette, and "## How to work" — and `startProcess` emits that whole text as the
`user` event, so component:console shows the person a page of protocol above their own words (the same on a fresh
restart, agent-host#restartFresh). The wrapper is for the agent; the person wrote only the request.
