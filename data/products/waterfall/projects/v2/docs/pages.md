---
node: module:pages
type: module
title: Pages
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:experience
order: 22
---

# Pages

Every page of the app by area: its route, what it shows, its actions. The table is the graph; the cards are the definition.


## Agents and sessions

<!-- list:page -->

```yaml
- id: page:web/session-changes
  route: /<product>/sessions/<id>/changes
  component: packages/web/src/app/[product]/sessions/[id]/changes/page.tsx; packages/web/src/components/SessionChanges.tsx
  purpose: >
    A session's changes as a page: every block it added, changed or removed, per document, with the change and kind
    filters; live while the session runs.
  part-of: module:pages
- id: page:web/session
  route: /<product>/sessions/<id>
  component: packages/web/src/app/[product]/sessions/[id]/page.tsx
  purpose: >
    A session as a page: the task (instruction, refs, source, the follow-up messages and their states), the page
    the plan was written on, the todo items that came out of it with their state now, every block it added or
    changed grouped by kind with its status now, and the result. Live while the session runs. The conversation
    itself stays in the right column (a button opens it there).
  part-of: module:pages
- id: page:web/sessions
  title: Agents
  route: /<product>/sessions (named "Agents" in the rail, the top bar and its heading); a session opens in the context column
  component: packages/web/src/app/[product]/sessions/page.tsx; packages/web/src/components/SessionList.tsx; packages/web/src/components/SessionView.tsx; packages/web/src/components/Console.tsx; packages/web/src/components/AskQuestions.tsx
  actions:
    - action:new-conversation: + New conversation starts a chat session with the default agent
    - action:command-palette:  ⌘P / Ctrl+P anywhere opens the command box (component:command-box — the same one every "Send to agent" opens, decision:wf2.one-command-box) in the middle of the screen; the node under the cursor and the document travel along as refs; what is typed starts a chat session that plans first (rule:plan-first) — a clean slate by default, rule:clean-slate — or goes into a live conversation chosen in "to" (with "clear context first" its agent restarts from nothing), or is queued for a runner; images pasted or dropped into the box (thumbnails, ×, up to 8) become the session's files and go with the message (req:wf2.ui.palette-images); the conversation opens in the context column
    - action:open-session:     a row opens the session in the context column: status, agent, instruction, refs, then the console
    - action:send-message:     type (⌘↵) or paste images; sent now or queued while a turn runs (rule:session-queue)
    - action:answer-question:  choose options / type an answer on the agent's question card; Answer returns the choices to the agent, Skip lets it go on (rule:agent-questions)
    - action:allow-deny:       Allow or Deny any other permission request; the card shows the tool and what it wants
    - action:expand-activity:  open a folded "n steps" row to read every tool call and result
    - action:see-usage:        the console bar shows the context size (the last call's prompt, as a share of the model's window) and the tokens the session spent so far (read, including cache, and written) — each turn's result event carries its usage (agent-host#claudeUsage; Codex: in/out only), the console adds them up (task:new-441)
    - action:see-knowledge:    after each turn a "knowledge" row lists the blocks the turn added (+), changed (~) or removed (−) as tags plus a paragraph count (lib:artifacts, rule:block-attribution), and the header keeps a live "knowledge" strip of everything the session changed with +n ~n n¶ counts, a ↗ to page:web/session-changes and a "changes" fold (req:wf2.sessions.knowledge-changes, req:wf2.sessions.changes-page)
    - action:stop-resume:      Stop the agent (console bar, or on hover on an Agents row: the process ends, the context comes back with Resume or a message); Close on an active row ends the process, drops the waiting items and cancels the conversation; "Stop idle (n)" in the header stops every live conversation with no open turn and nothing waiting (req:wf2.sessions.stop-from-list); Resume restarts the agent on the same conversation (rule:agent-host)
    - action:see-queue:        under a row's instruction, the conversation's queue with each item's state — working, waiting (fresh/keep toggle, remove), done folded — and a summary (req:wf2.sessions.queue-on-agents); the console's queue panel shows the same, and its message box has a "clear context first" tick that is honoured when the item's turn comes (req:wf2.sessions.fresh-in-queue)
    - action:hand-off:         continue the work under another agent (rule:agent-sessions)
  display-rules:
    - Runners online and working; Active / All filters; a row shows status, first line of the instruction, agent, mode, folder, age and refs
    - a row is a worker: under its request line, every plan it is on or has done (component:plan-list — status, title → the plan page, tasks done / all, when), the current one marked; one agent works on many plans, one at a time (decision:wf2.plan-per-request)
    - the console is the conversation: user messages (with images), the agent's replies as markdown, questions and permission cards, folded activity rows, subagents nested under their Task, turn ends with time and cost, `wf session log` lines and the `wf session done` summary in place by time (rule:console-flow)
    - a pending question is the agent waiting: nothing continues until Answer or Skip
- id: page:skill/context-v2
  route: skills/waterfall-context/SKILL.md (rewritten)
  component: skills/waterfall-context/SKILL.md
  description: >
    The agent contract in tool names — graph.packet before code, decisions.post for every decision, graph.patch
    before shipping, graph.check before done — plus the wiring section for Claude Code and Codex.
- id: page:agents-snippet
  route: templates/AGENTS-snippet.md (pasted into a project's CLAUDE.md and AGENTS.md)
  component: templates/AGENTS-snippet.md
  description: One paragraph stating the same contract for agents that do not load skills.
```

<!-- /list:page -->

## Documents and editing

<!-- list:page -->

```yaml
- id: page:web/node
  route: /p/<project>/d/<doc>#n-<id>   (a node's page is its definition inside its document; /p/<project>/n/<id> redirects there)
  component: packages/web/src/app/[product]/[project]/d/[doc]/page.tsx; packages/web/src/components/NodeCard.tsx; packages/web/src/components/PeekPanel.tsx
  reads: [op:graph.get, op:tasks.list, op:decisions.list, op:contradictions.list]
  actions:
    - action:edit-property:   change a yaml key in the properties panel (text, enum for status, id list with typeahead for edge keys)
    - action:edit-prose:      edit a prose key in BlockNote (rule:blocknote-prose-only)
    - action:save:            send the page as a patch with its hash -(calls)-> op:graph.patch
    - action:reload-or-overwrite: on conflict, show a diff of mine vs current and choose
    - action:tap-relation:    chip → the related node -(navigates)-> page:web/node
    - action:show-in-graph:   open the graph focused here -(navigates)-> page:web/graph
    - action:recheck:         ask the clerk to re-check this node -(calls)-> op:clerk.run
    - action:retry-clerk:     retry a failed clerk run for a decision on the right rail -(calls)-> op:clerk.run
  display-rules:
    - the document renders as text: frontmatter header, prose, tables, and one card per node in each yaml block (rule:node-cards); ids everywhere are smart tags (rule:smart-tags)
    - a card: kind and status pills, title (or id), when/then/unless as one sentence, prose keys as paragraphs, remaining keys as a property strip, raw yaml behind a toggle, anchor n-<id>
    - clicking a tag opens the peek panel (card + relations grouped by verb + Go to definition + Show in graph) without leaving the document; Escape closes
    - the document ends with Linked documents: other files reached by structural edges in either direction, with counts (rule:document-tree)
    - the document is a single Notion-style page (rule:single-page-editor): every block is editable in place, typed blocks carry kind, slug and status, "/" inserts a typed block, selecting a phrase and choosing "⌁ node" links it to any node; the header's title, status, owner and last-verified are inline inputs saved on blur; the rail has "+ New document" (rule:new-document); one save-state hint for the page
    - right rail (proposed): linked tasks, decisions (superseded greyed), open contradictions
- id: page:web/context-column
  route: the right column on every route; opened by any tag, row or ⇢ action, hidden with ⌘.
  component: packages/web/src/components/PeekPanel.tsx; packages/web/src/components/PeekProvider.tsx; packages/web/src/components/TypeView.tsx; packages/web/src/components/SessionView.tsx; packages/web/src/components/Console.tsx
  reads: [op:graph.get, op:graph.neighbors]
  actions:
    - action:open-item:        a tag, a list row or a graph node pushes the item on the column's chip stack; ← goes back, 📍 pins a chip so it survives, × removes it
    - action:select-block:     a click anywhere on a typed block of the document selects it: the Context root shows the node (rule:block-select); tags inside the block still push
    - action:go-to-definition: jump to the node's block in its document -(navigates)-> page:web/node
    - action:show-in-graph:    open the graph focused on the node -(navigates)-> page:web/graph
    - action:send-to-agent:    send the node (id, title, link) to an active session or a new one (rule:agent-sessions)
    - action:edit-content:     type, or / for a block, in a node's Content editor: the blocks are written under the node's line in its document -(calls)-> op:node.content
    - action:open-type-page:   on a type: node -(navigates)-> page:web/types
    - action:edit-type:        on a product type, edit its own properties (name, value type, required, inverse; + property) and purpose; Save to document rewrites the type card
    - action:answer-question:  in a session console, answer the agent's question (rule:agent-questions)
  display-rules:
    - a node shows its card, then (typed nodes) Properties — effective properties with placeholders and the inverses read from the other side — then Connected as a list grouped by relation (incoming relations labelled by their inverse name) or as a graph 1–2 hops out
    - a Connected or tracking row expands in place into the node's embedded card; a group heading expands or collapses all of its rows (rule:connected-cards)
    - in a document, a click anywhere on a typed block — card, table row or embed, its text included — selects it: the column comes to its Context root and shows that node (rule:block-select)
    - a defined node's details are its kind and id, its properties, then Content — one editor scoped to the node whose first block is the node's text and whose other blocks are the blocks under it in the document (rule:content-editor, decision:wf2.text-is-first-block); a child's card there opens the child one level deeper, ← comes back (decision:ontology.depth-by-navigation)
    - Related (the knowledge nearest to the block) is a bar with a show / hide button, closed by default and remembered per browser; no search runs while closed (rule:related-collapsed)
    - a goal's or task's Produced (its sessions, the documents they wrote, the nodes they changed, the inbox items) is the last section, a bar with counts and a show / hide button, closed on every node; nothing is fetched while closed (rule:produced-collapsed)
    - a document shows a preview (title, status, intro, outline, Open document →) and Connected; a goal or task shows its tracking editor and what is part of it; a type shows its card, editable properties, instances and Connected; a session shows its console
    - Context mode (no item open on a document page) follows the block being edited and shows the knowledge nearest to it (rule:context-panel)
    - field, prop and block nodes never appear in Connected; a document's phrase links are read from its blocks (rule:ontology.hidden-kinds)
    - the bar at the top and a session's message box at the bottom stay in view; only what is between them scrolls (rule:column-frame)
```

<!-- /list:page -->

## Graph core and CLI

<!-- list:page -->

```yaml
- id: page:skill/describe-module
  route: ~/.claude/skills/waterfall-describe-module/SKILL.md (symlink)
  component: skills/waterfall-describe-module/SKILL.md:1-45
  description: The authoring process — locate, fan out explorers, read human docs, spot-check, write from template, build+check, publish, report.
  actions:
    - action:explore-server:  reference prompt skills/waterfall-describe-module/references/explore-server.md
    - action:explore-client:  reference prompt skills/waterfall-describe-module/references/explore-client.md
  ---
  id: page:skill/context
  route: ~/.claude/skills/waterfall-context/SKILL.md (symlink)
  component: skills/waterfall-context/SKILL.md:1-61
  description: The agent contract — packet before code, impact before change, delta before build, check before done, what goes where.
```

<!-- /list:page -->

## Knowledge and search

<!-- list:page -->

```yaml
- id: page:web/goals
  route: /<product>/goals
  component: app/[product]/goals/page.tsx
  purpose: >
    Every goal as a tracking list (search, status chips, sub-goals, progress); a row opens the goal in the context column.
  part-of: module:pages
- id: page:web/knowledge
  route: /<product>/knowledge and /knowledge/<kind>
  component: app/[product]/knowledge/page.tsx; app/[product]/knowledge/[kind]/page.tsx
  purpose: >
    Everything the graph knows, by kind; a kind page is component:instance-table over that kind — a declared type
    gets a column per property, a bare kind its relations — with search, status, group by and sort in the URL.
  part-of: module:pages
- id: page:web/questions
  route: /<product>/questions
  component: app/[product]/questions/page.tsx
  purpose: >
    Open question blocks (and inbox questions) first, resolved after; each can be sent to an agent.
  part-of: module:pages
- id: page:web/inbox
  route: /<product>/inbox
  component: app/[product]/inbox/page.tsx
  purpose: >
    Review queue: proposed decisions, requirements, rules and goals and open questions written in the documents — approve, reject, resolve in place; raw notes below to file or dismiss.
  part-of: module:pages
- id: page:web/graph
  route: /p/<project>/graph?focus=<id>&preset=<name>
  component: packages/web/src/app/[product]/graph/page.tsx; packages/web/src/components/GraphView.tsx
  reads: [op:graph.neighbors, op:graph.get]
  actions:
    - action:preset:          Requirements | Mechanics | Data | Drift | Everything (rule:graph-presets)
    - action:tap-node:        open the node page in a side panel -(navigates)-> page:web/node
    - action:recentre:        double-click makes the node the focus (rule:mindmap-layout)
    - action:drag-edge:       drag handle to handle, prompt for the verb -(calls)-> op:graph.patch
    - action:delete-edge:     select an edge and delete -(calls)-> op:graph.patch
    - action:rename-node:     inline title edit -(calls)-> op:graph.patch
    - action:add-child:       context menu on a node creates a node under it (refines for req, has for entity) -(calls)-> op:graph.create
  display-rules:
    - React Flow canvas; dagre tree layout over refines and has from the focus; other structural verbs drawn as curved cross-links; mentions hidden
    - an edit is shown only after the file changes and graph.changed arrives; until then the edge is dashed "pending"
    - status ring and hollow stubs as in the v0.1 viewer
- id: page:web/types
  route: /<product>/types and /<product>/types/<slug>
  component: packages/web/src/app/[product]/types/page.tsx; packages/web/src/app/[product]/types/[slug]/page.tsx; packages/web/src/components/TypeRows.tsx; packages/web/src/components/AddInstance.tsx; packages/web/src/components/AddType.tsx
  reads: [op:graph.get]
  actions:
    - action:open-type:        click anywhere on a type's row → the type in the context column (page:web/context-column); ↗ opens its page
    - action:add-instance:     + add <type> writes a <type>:<slug> card with the type's required properties into the type's home document -(calls)-> op:types.add
    - action:add-type:         + add type under the product's own types: name (→ slug), extends (any type, node by default), purpose, destination document; writes the type: card and opens the new type in the context column where its properties are added -(calls)-> op:types.create
  display-rules:
    - the index lists the product's own types first (name, extends, instance and own-property counts, purpose, where declared), then the base types
    - a type page: crumbs along the extends chain; properties (own and inherited, the root type's folded into one line); subtypes; every instance as component:instance-table — a column per property, search, status chips, a filter per enum / ref / bool property, group by, sort, all in the URL (req:ontology.type-page, req:wf2.instances.filter)
```

<!-- /list:page -->

## Memory

<!-- list:page -->

```yaml
- id: page:web/decisions
  status: retired
  route: /p/<project>/decisions?node=<id>
  component: packages/web/src/app/p/[project]/decisions/page.tsx
  reads: [op:decisions.list, op:decisions.get]
  actions:
    - action:filter-by-node:  typeahead over node ids -(calls)-> op:decisions.list
    - action:apply-delta:     shows the markdown diff, then applies -(calls)-> op:deltas.apply
    - action:reject-delta:    asks for a reason -(calls)-> op:deltas.reject
    - action:retry-clerk:     for a failed run -(calls)-> op:clerk.run
  display-rules:
    - newest first; superseded decisions greyed with a link to the superseder
    - each card: clerk status, related nodes, contradictions found, delta with Apply / Reject (gate:delta-apply hides them for untrusted sessions)
- id: page:web/contradictions
  status: retired
  route: /p/<project>/contradictions?status=open
  component: packages/web/src/app/p/[project]/contradictions/page.tsx
  reads: [op:contradictions.list]
  actions:
    - action:resolve:         pick a decision or task -(calls)-> op:contradictions.resolve
    - action:dismiss:         reason required -(calls)-> op:contradictions.dismiss
    - action:open-side:       tap a side → its node page or decision card -(navigates)-> page:web/node
  display-rules:
    - both sides show their text (node body or decision choice); kind badge structural / semantic; explanation below
```

<!-- /list:page -->

## Shell and navigation

<!-- list:page -->

```yaml
- id: page:web/search
  route: /<product>/search?q=&kind=
  component: packages/web/src/app/[product]/search/page.tsx; packages/web/src/components/SearchPanel.tsx
  purpose: >
    Every block that matches a search, as blocks: the instances view over `node` (every kind) or one kind, with the
    search in the URL. Opened by Enter in the ⌘F search panel (component:search-panel).
  part-of: module:pages
- id: page:web/overview
  route: /<product>
  component: app/[product]/page.tsx
  purpose: >
    Product overview: description, projects and goals, knowledge counts by kind.
  part-of: module:pages
- id: page:web/project
  route: /<product>/<project>
  component: app/[product]/[project]/page.tsx
  purpose: >
    Project overview: its documents; opens the main document directly when there is one.
  part-of: module:pages
- id: page:web/new-product
  route: /new
  component: app/new/page.tsx
  purpose: >
    Create a product (title, description, icon) — writes data/products/<slug>/_product.md.
  part-of: module:pages
- id: page:web/plans
  route: /<product>/plans
  component: app/[product]/plans/page.tsx
  purpose: >
    Every plan of the product (type:plan, all projects) as the filterable instance table — status, tasks, session,
    started, finished; a row opens the plan document. The page the rail's Plans folder opens (req:wf2.ui.plans-folder).
  part-of: module:pages
- id: page:web/sidebar
  route: every route; the left rail; first screen at phone width
  component: packages/web/src/components/DocTree.tsx
  reads: [op:projects.list, op:graph.search, op:tasks.list, op:contradictions.list]
  actions:
    - action:search:          type to search document titles, headings, node ids and titles; a node hit opens its definition -(navigates)-> page:web/node
    - action:open-document:   tap a document in the tree -(navigates)-> page:web/node
    - action:open-heading:    tap an outline entry under the open document (scrolls to the ## heading)
    - action:open-overview:   Overview — the product page (description, projects, knowledge counts)
    - action:open-goals:      Goals -(navigates)-> page:web/goals
    - action:open-tasks:      Tasks -(navigates)-> page:web/tasks
    - action:open-knowledge:  Knowledge — every kind of node as a list -(navigates)-> page:web/knowledge
    - action:open-types:      Types — the product's ontology -(navigates)-> page:web/types
    - action:open-graph:      Graph -(navigates)-> page:web/graph
    - action:open-questions:  Questions — open question blocks and inbox questions
    - action:open-inbox:      Inbox — proposed blocks and raw notes awaiting review
    - action:open-sessions:   Agents — every conversation and run, and the runners (the rail and the top bar say "Agents", task:new-917) -(navigates)-> page:web/sessions
    - action:open-plans:      Plans — the system folder at the end of the menu: the entry opens every plan as a table, the rows beneath open one plan document each, the caret collapses it (req:wf2.ui.plans-folder) -(navigates)-> page:web/plans
    - action:new-document:    + next to Documents creates a document under a parent
    - action:duplicate-document: right-click or ⋯ on a row → Duplicate: a copy next to the document, opened (rule:tree-menu) -(calls)-> op:api.docs.duplicate
    - action:delete-document: right-click or ⋯ on a row → Delete: confirm with the sub-document count, the subtree removed (rule:tree-menu) -(calls)-> op:api.docs.delete
  display-rules:
    - menu order: Overview, Search, Goals, Tasks, Knowledge, Types, Graph, Questions, Inbox, Agents, Plans (a folder: the plan documents newest first, the open one marked, collapsed state remembered — rule:plans-folder); a horizontal splitter (rule:rail-split); then the Documents tree (rule:documents-tree); the rail is collapsible (rule:app-navigation)
    - the rail lists documents, not nodes: root documents → sub-documents; the open document shows its ## outline beneath it
    - counts and lists refresh on graph, inbox and session change events (rule:live-refresh)
```

<!-- /list:page -->

## The static viewer

<!-- list:page -->

```yaml
- id: page:viewer/reqs
  route: "#view=reqs (default)"
  component: viewer/index.html:245-280
  reads: [entity:graph]
  actions:
    - action:open-req:        tap a row → page:viewer/node-sheet
  display-rules:
    - stat tiles: reqs, shipped, unverified/api-only (+ shipped-without-test), proposed, questions, drift rows   (viewer/index.html:249-258)
    - rows grouped by the ### heading the req was found under; tree built from refines edges              (:262-276)
    - status dot: green shipped+tested, amber unverified/api-only/shipped-without-test, dashed proposed, red question (:264-268)
- id: page:viewer/graph
  route: "#view=graph"
  component: viewer/index.html:282-399
  reads: [entity:graph]
  actions:
    - action:preset:          Requirements | Mechanics | Data | Drift | Everything   (:282-288)
    - action:kind-chip:       toggle a kind in/out of the visible set                (:296-297)
    - action:search-graph:    id/title match plus 1-hop neighbours                   (:327)
    - action:tap-node:        canvas hit-test → page:viewer/node-sheet               (:299, :353)
    - action:pan-zoom:        d3.zoom, pinch on touch                                (:298)
  display-rules:
    - canvas renderer, d3-force; tree-like forces on the Requirements preset (:338-346)
    - node radius by degree, reqs larger (:352); hollow = stub; status ring: amber non-shipped, dashed proposed, red question/drift (:381-389)
    - contradicts edges dashed red; selected node's edges accented, others dimmed (:361-375)
    - labels when zoom > 1.15 or ≤ 70 nodes, or for selected/hovered/neighbours (:377, :390)
    - isolated nodes dropped except on Everything / focus / search (:332)
- id: page:viewer/read
  route: "#view=read"
  component: viewer/index.html:401-439
  reads: [entity:graph, entity:module-doc]   # window.MD_FILES rendered with marked
  actions:
    - action:tap-id:          any kind:slug or unambiguous field name in the text → page:viewer/node-sheet (:413-421, :442)
    - action:contents:        floating button opens a TOC drawer of h2/h3 (:431-437)
  display-rules:
    - frontmatter shown as a yaml block; tables wrapped for horizontal scroll (:409)
    - anchors n-<id> on `id:` occurrences, first table cell and h3 headings so Show in text can scroll (:417-425)
- id: page:viewer/node-sheet
  route: "#n=<id> on any view"
  component: viewer/index.html:440-465
  actions:
    - action:focus-in-graph:  focusId = node; Mechanics preset with all kinds; two-hop neighbourhood (:196, :322)
    - action:show-in-text:    switch to Read and scroll to n-<id>, falling back to the field's owner (:197)
    - action:tap-neighbour:   chip → same sheet for that node
    - action:close:           Escape or Close
  display-rules:
    - pills: kind (colour by kind), status, "referenced only" for stubs
    - id line adds "field of <owner>" for fields and the link count
    - body linkified with the same COMBO regex as Read (:225-226, :442)
    - neighbours grouped by verb, outgoing then incoming, sorted req → rule → op → page → action → entity → field … (:447-449)
```

<!-- /list:page -->

## Work, changes and impact

<!-- list:page -->

```yaml
- id: page:web/work
  route: /<product>/work (the old /<product>/tasks redirects here)
  component: app/[product]/work/page.tsx
  purpose: >
    Every task of the product as one list, whoever holds it (req:exec.work-view): status, derived state, plan or
    goal, worker, document; grouped by status by default, switchable to state, goal, plan, document, worker; search
    and filters in the URL (q, status, state, worker, goal, plan, doc, done, group, mine); done and archived-done
    folded away unless "done work"; "mine" by the name remembered per browser (gate:none). Assign and Send on
    every row, Build on a request task's row with the Definition counts beside it.
  status: shipped
  part-of: module:pages
- id: page:web/tasks
  status: retired
  route: /p/<project>/tasks
  component: packages/web/src/app/p/[project]/tasks/page.tsx
  reads: [op:tasks.list, op:tasks.get, op:graph.packet]
  actions:
    - action:new-task:        create with links chosen by typeahead -(calls)-> op:tasks.create
    - action:move-task:       drag between status columns -(calls)-> op:tasks.update
    - action:open-task:       shows links, packet, decisions, deltas
  display-rules:
    - columns follow value:task-status; a move that state:task-lifecycle forbids snaps back with the reason
```

<!-- /list:page -->

## Unsorted

<!-- list:page -->

```yaml
- id: page:web/constitution
  route: /<product>/constitution
  component: packages/web/src/app/[product]/constitution/page.tsx
  purpose: >
    The constitution (decision:memory.constraint-type): the product's constraint: blocks — approved ones are what
    every agent prompt carries under "## Constitution"; proposed ones wait in the Inbox; retired ones are kept,
    greyed.
  status: proposed
  part-of: module:pages
- id: page:web/n-id
  route: /<product>/n/<id>
  component: packages/web/src/app/[product]/n/[id]/page.tsx
  purpose: >
    A node's page is its definition inside its document; the route stays for deep links.
  status: proposed
  part-of: module:pages
- id: page:web/sessions-id-chat
  route: /<product>/sessions/<id>/chat
  component: packages/web/src/app/[product]/sessions/[id]/chat/page.tsx
  purpose: >
    A conversation as a page in the content column (its own tab): the same view the context column shows — header,
    work, queue, transcript, message box — with the width of the page. The Agents page opens conversations here.
  status: proposed
  part-of: module:pages
- id: page:web/home
  route: /
  component: packages/web/src/app/page.tsx
  purpose: >
    (no header comment)
  status: proposed
  part-of: module:pages
- id: page:web/settings
  route: /<product>/settings
  component: packages/web/src/app/[product]/settings/page.tsx
  purpose: >
    The app's settings (Jev auto-linking design §0). Reached from every product's rail but not about one product:
    what is stored here applies to the whole app on this machine.
  status: proposed
  part-of: module:pages
```

<!-- /list:page -->
