---
node: module:components
type: module
title: Blocks and components
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:experience
order: 23
---

# Blocks and components

The editor's blocks and the components the pages are made of, by area.


## Agents and sessions

<!-- list:component -->

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
  part-of: module:components
- id: component:ask-questions
  file: packages/web/src/components/AskQuestions.tsx
  side: client
  purpose: >
    The agent's AskUserQuestion, rendered as a form instead of a permission dump. Answers go back inside the tool's input as `answers: { \"<question>\": \"<label>\" }` (multi-select comma-separated), the shape Claude Code reads.
  part-of: module:components
- id: component:session-view
  file: packages/web/src/components/SessionView.tsx
  side: client
  purpose: >
    One agent session in the right column: what was sent, its status, and the live log (polled while active). The
    knowledge strip counts the blocks it changed (+added ~changed −removed ¶paragraphs, ↗ the changes page) and a
    "changes" fold under it holds component:session-changes. Under the head, "work" lists the session's plans
  (component:plan-list) — the pages where its tasks and results are.
  part-of: module:components
- id: component:session-changes
  file: packages/web/src/components/SessionChanges.tsx
  side: client
  purpose: >
    Everything a session changed in the knowledge base, block by block: per document, the nodes it added, changed
    or removed (badge, tag, title; a row opens the node in the context column), prose paragraphs folded under
    "n paragraphs"; filter by change kind and by kind of node. Rendered under the knowledge strip of the session
    view and as a page of its own, /<product>/sessions/<id>/changes.
  part-of: module:components
- id: component:session-list
  file: packages/web/src/components/SessionList.tsx
  side: client
  purpose: >
    All agent sessions of a product, active first; polls while any is active. A row opens the session in the right
    column and shows its queue with states (component:queue-list, req:wf2.sessions.queue-on-agents); on hover it
    offers Stop (live rows) and Close (active rows), the header "Stop idle (n)" (req:wf2.sessions.stop-from-list);
    row actions refetch the list at once and never open the conversation; under the request line the row lists the
  worker's plans (component:plan-list) — every work item it is on or has done, the current one marked.
  part-of: module:components
- id: component:queue-list
  file: packages/web/src/components/QueueList.tsx
  side: client
  purpose: >
    A conversation's queue with the state of every item (decision:wf2.queue-item-state): the working item first,
    the waiting ones in order — each with its fresh/keep toggle (control `item`) and a remove button — and the
    finished ones folded under "n done". Rendered in the console's queue panel and under an Agents row.
  part-of: module:components
- id: component:produced
  file: packages/web/src/components/Produced.tsx
  side: client
  purpose: >
    Everything that came out of the sessions that worked on a task: the sessions themselves (with their logs), the documents they wrote, the nodes they changed, and the inbox items (questions, decisions, notes) they filed. Rendered last in the context column as a bar with counts and a show / hide button (req:wf2.ui.produced-collapsed, rule:produced-collapsed); the sessions and the inbox are fetched only while it is open.
  part-of: module:components
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
  part-of: module:components
- id: component:session-page
  status: retired
  file: packages/web/src/components/SessionPage.tsx
  side: client
  purpose: >
    The body of page:web/session: head (agent, status, when, "open conversation"), the task (through
    component:transcript-markdown; the title with plain app-link labels), "plan on" links
    (every `open` event of the transcript → document#node), the todo list (task lines with a live check state,
    "n of m done"), the blocks by kind (badge + tag + status pill, a row opens the node in the context column,
    paragraphs folded), the result. Refetches op:api.sessions.page on graph and session changes while live.
  part-of: module:components
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
  part-of: module:components
- id: component:plan-list
  file: packages/web/src/components/PlanList.tsx
  side: client
  purpose: >
    A worker's work items (decision:wf2.plan-per-request): the session's plans oldest first — status pill, the
    title as a link to the plan page, tasks done / all, when it started or finished; the plan the session is on
    now is marked while it is active (a `proposed` plan on a running session shows as running). Used by
    component:session-list under each row and by component:session-view in the head; clicks inside it never open
    the conversation.
  part-of: module:components
```

<!-- /list:component -->

## Documents and editing

<!-- list:component -->

```yaml
- id: component:doc-editor
  file: packages/web/src/components/DocEditor.tsx
  side: client
  purpose: >
    The single-page BlockNote editor of a document (rule:single-page-editor): prose blocks, node cards and prose
    nodes, data tables (component:data-table), view blocks, embeds, drawings and images, the slash and mention
    menus, and the round trip to markdown through lib:import and lib:serialize; it publishes the block under the
    cursor to the context column and saves with the document's hash.
  part-of: module:components
- id: component:data-table
  file: packages/web/src/components/DocEditor.tsx
  side: client
  purpose: >
    The "Data table" block of the editor (CollectionBlock, RowNode, TypeRow): a header with the type picker and one
    grid row per child node block — name, status, then target/due, progress and owner for goals and tasks, or one
    column per declared property for a product's own type (rule:type-tables, rule:goals-and-tasks). The header and
    every row are separate blocks that share one column template (`typeGrid`), so they line up without a <table>.
    The header also holds the table's filters (useTableFilter — search, status, one per column; kept on the
    marker line; rows that do not match are hidden, not removed: rule:table-filter).
  part-of: module:components
- id: component:document-reader
  file: packages/web/src/components/DocumentReader.tsx
  side: server
  purpose: >
    Read-only rendering of a document (server component). Shown until the editor hydrates, and used by anything that needs the document as text without editing.
  part-of: module:components
- id: component:live-document
  file: packages/web/src/components/LiveDocument.tsx
  side: client
  purpose: >
    Shows the server-rendered reader until the client is ready, then the single-page editor takes over.
  part-of: module:components
- id: component:doc-not-found
  file: packages/web/src/components/DocNotFound.tsx
  side: server
  purpose: >
    The content of a document page whose file is not on disk: the shell around it stays and only this notice takes
    the document's place; LiveRefresh renders the page back into the editor when the file returns
    (rule:doc-gone-in-place).
  part-of: module:components
- id: component:doc-props
  file: packages/web/src/components/DocProps.tsx
  side: client
  purpose: >
    The document header is the page node's card (req:wf2.page.header-card): a type picker pill (the product's own
    types first, then the base types — picking one calls op:doc.retype and reports how many links followed), the
    id, the status, the icon and the title, then the type's effective properties as editable fields (enum → select,
    bool → checkbox, text → textarea, ref → a select of that type's instances, list → an input with suggestions and
    tags; the root type's folded behind "n more" unless filled); a field saves to the frontmatter when it loses
    focus (op:doc.frontmatter). An unknown type shows a warning.
  part-of: module:components
- id: component:node-card
  file: packages/web/src/components/NodeCard.tsx
  side: server
  purpose: >
    A yaml flow list \"[a, b, c]\" renders as its items; anything else as linkified text.
  part-of: module:components
- id: component:drawing-block
  file: packages/web/src/components/DrawingBlock.tsx
  side: client
  purpose: >
    An embedded Excalidraw drawing. The markdown keeps a plain image link (![Title](drawings/x.excalidraw)); the scene and an SVG export live under docs/drawings/. The page shows the SVG; clicking it opens the full-screen editor.
  part-of: module:components
- id: component:ask-agent
  file: packages/web/src/components/AskAgent.tsx
  side: client
  purpose: >
    A command box at the selection: what you type goes to an active conversation together with the selected text, the block it sits in, and a link to the page. \"New conversation…\" hands the same payload to the full dialog.
  part-of: module:components
- id: component:node-cards
  file: packages/web/src/components/NodeCards.tsx
  side: client
  purpose: >
    The cards a typed block renders as — the plain node block, the question card, the decision card — as one
    set of components parameterised by a text slot and a host (peek, copy link, send, header click). The document
    editor puts the block's inline content in the slot; an embed (component:embed-block) puts a text area there.
    One code path, so the two renderings cannot drift (decision:wf2.embed-renders-source-card). A card whose node has content shows none of it — a count chip in its header opens the details (rule:card-fold).
  part-of: module:components
- id: component:embed-block
  file: packages/web/src/components/EmbedBlock.tsx
  side: client
  purpose: >
    An embedded node inside a document: a block whose markdown is one line, `![[kind:slug]]`, rendered as the
    node's card the way its source page renders it (the same card components as component:doc-editor — prose
    node block, question card, decision card, task with its checkbox). Fetches the node from op:api.node,
    saves a field through op:node.edit 700 ms after the last keystroke, and refetches on every graph change
    (`wf:change`), so the source page and every other embed show the edit. Also usable outside the editor
    (EmbeddedCard) — the session changes page, lists, the context column.
  part-of: module:components
```

<!-- /list:component -->

## Knowledge and search

<!-- list:component -->

```yaml
- id: component:track-list
  file: packages/web/src/components/TrackList.tsx
  side: client
  purpose: >
    Goals or tasks as a tracking list: search, status filter, nested sub-items; a row opens the item in the right column.
  part-of: module:components
- id: component:node-editor
  file: packages/web/src/components/NodeEditor.tsx
  side: client
  purpose: >
    A node's page in the right column, laid out like a Notion task (task:new-826, bug:properties-need-to-be): the
    kind and id, then every property as a label/value row — status, the ones its type declares (enum →
    select, bool → checkbox, ref → a select of that type's instances or ids with tags), the keys the card carries,
    and for goals and tasks their tracking fields (due/target, owner, progress, part-of goal — the former
    TrackEditor, folded in here); the node's text is not a field here but the first block of the Content editor
    under the properties (decision:wf2.text-is-first-block); empty optional ones under "n more properties". Images in a prose node's text show
    under the title and stay in the line. Every change writes back to the defining line (prose) or the yaml card
    (patchYamlCard) and rebuilds the graph.
  part-of: module:components
- id: component:question-list
  file: packages/web/src/components/QuestionList.tsx
  side: client
  purpose: >
    Question blocks and inbox questions as one list, open first; each row sends the question to an agent or opens it.
  part-of: module:components
- id: component:inbox-list
  file: packages/web/src/components/InboxList.tsx
  side: client
  purpose: >
    Inbox items to review: each one can be filed into a document as a node (with a suggested document and id) or dismissed. Filed and dismissed items stay for the record.
  part-of: module:components
- id: component:inbox-note
  file: packages/web/src/components/InboxNote.tsx
  side: client
  purpose: >
    Add a text note (or a pasted conversation) to the product inbox.
  part-of: module:components
- id: component:review-list
  file: packages/web/src/components/ReviewList.tsx
  side: client
  purpose: >
    Review what agents wrote into the documents: approve, reject or resolve in place; open the node or its document.
  part-of: module:components
- id: component:graph-view
  file: packages/web/src/components/GraphView.tsx
  side: client
  purpose: >
    React Flow needs to own node state to record measured sizes; re-seed it whenever the computed graph changes.
  part-of: module:components
- id: component:context-panel
  file: packages/web/src/components/ContextPanel.tsx
  side: client
  purpose: >
    Context for what is being written: the current block's text goes to the product's local semantic search and the closest knowledge comes back; \"+ link\" inserts a smart tag at the cursor, the tag opens the node.
  part-of: module:components
- id: component:type-rows
  file: packages/web/src/components/TypeRows.tsx
  side: client
  purpose: >
    Rows of the Types page: the whole row opens the type in the context column; the ↗ and the parent tag are their own links.
  part-of: module:components
- id: component:instance-table
  file: packages/web/src/components/InstanceTable.tsx
  side: client
  purpose: >
    Every instance of one type (or every node of one kind) as a filterable table: search, status chips with counts,
    one filter per enum / ref / bool property, group by, sort by column, a column per declared property; the filters
    live in the URL so a filtered list is a link. Rendered by the type page, the kind page and the view block.
  part-of: module:components
- id: component:view-block
  file: packages/web/src/components/ViewBlock.tsx
  side: client
  purpose: >
    The `view` block of the editor: a live, read-only component:instance-table of one type inside a document. Its
    header picks the type; the rows come from op:api.view (refetched on every graph change); the filters are the
    block's `query` prop and are written back to its `<!-- view:<slug> key=value -->` line (rule:view-block).
  part-of: module:components
- id: component:type-view
  file: packages/web/src/components/TypeView.tsx
  side: client
  purpose: >
    A type in the context column: its card (purpose, extends, open), its own properties as an editable table, the inherited ones greyed with their declaring type, then every instance — the \"connected\" list of a type.
  part-of: module:components
- id: component:add-instance
  file: packages/web/src/components/AddInstance.tsx
  side: client
  purpose: >
    \"+ add\" on a type page: writes a `<type>:<slug>` card with the type's required properties into the type's home document.
  part-of: module:components
- id: component:add-type
  file: packages/web/src/components/AddType.tsx
  side: client
  purpose: >
    \"+ add type\" on the Types index: writes a `type:<slug>` card (extends, purpose) into the product's ontology document and opens the new type in the context column, where its properties are added.
  part-of: module:components
```

<!-- /list:component -->

## Shell and navigation

<!-- list:component -->

```yaml
- id: component:search-panel
  file: packages/web/src/components/SearchPanel.tsx
  side: client
  purpose: >
    The ⌘F search panel (req:wf2.ui.search): text or `kind: text`, hits on the left with kind, title, status, where and a
    snippet, the highlighted hit's card (component:embed-block) as the preview on the right; ↑↓, Enter opens page:web/search
    with every hit, ⌘Enter opens the hit, Esc closes. Reads /api/<product>/view/node once per opening.
  part-of: module:components
- id: component:shell
  file: packages/web/src/components/Shell.tsx
  side: client
  purpose: >
    The app frame: a collapsible rail, the content, and — while a node, context or session is open — the right column, separated from the content by a draggable splitter. The rail starts hidden on document and session pages (working views) and open elsewhere; the choice and the splitter position are remembered per browser.
  part-of: module:components
- id: component:rail
  file: packages/web/src/components/Rail.tsx
  side: client
  purpose: >
    The left rail: product switcher, menu (Overview, Search, Goals, Tasks, Knowledge, Types, Graph, Questions, Inbox, Agents) ending
    with the Plans system folder (component:plan-folder — the plan documents the product layout took out of the tree,
    rule:plans-folder), a horizontal splitter (rule:rail-split), then every project's documents as one tree (component:doc-tree).
  part-of: module:components
- id: component:plan-folder
  file: packages/web/src/components/PlanFolder.tsx
  side: client
  purpose: >
    The rail's Plans system folder (req:wf2.ui.plans-folder): the entry to page:web/plans with a caret, and under it
    the product's plan documents newest first as rows (icon, title, the open one marked); collapsed state remembered
    in localStorage (`wf-plans-open`). No drag, no menu — plans are made by requests, not by hand.
  part-of: module:components
- id: component:top-bar
  file: packages/web/src/components/TopBar.tsx
  side: client
  purpose: >
    The bar above the content, Notion style: sidebar control, back / forward (‹ ›, ⌘[ / ⌘] — rule:history-nav,
    req:wf2.ui.history-nav), breadcrumbs (product › parents › document; Agents › session › changes on session pages),
    last edit, copy link and send to agent.
  part-of: module:components
- id: component:doc-tree
  file: packages/web/src/components/DocTree.tsx
  side: client
  purpose: >
    Docmost-style document tree: chevron for documents with children, a dot for leaves, an emoji icon, the title. Rows can be dragged: onto a row nests the document under it, between rows reorders, a zone under the tree makes it top level; a hover \"+\" adds a child; right-click or the hover \"⋯\" opens the row's menu — Duplicate, Delete (rule:tree-menu). The row is a module-level component so a drag survives the tree's re-render (rule:doc-tree-row-stable).
  part-of: module:components
- id: component:search
  status: retired
  file: packages/web/src/components/Search.tsx
  side: client
  purpose: >
    Rail search over document titles, headings and node ids/titles; a hit opens the document or the node.
  part-of: module:components
- id: component:new-doc
  file: packages/web/src/components/NewDoc.tsx
  side: client
  purpose: >
    a document lives in its parent's project; without a parent the project can be picked when there are several
  part-of: module:components
- id: component:live-refresh
  file: packages/web/src/components/LiveRefresh.tsx
  side: client
  purpose: >
    Follows the product on disk: when an agent or an editor writes a document, the graph, the inbox or a session, the server-rendered parts of the page (rail, lists, panels) refresh on their own.
  part-of: module:components
- id: component:peek-provider
  file: packages/web/src/components/PeekProvider.tsx
  side: client
  purpose: >
    What the editor is working on right now: the current block's text, the ids it already links, and a function that inserts a tag at the cursor. The panel's Context mode searches the product's knowledge for it.
  part-of: module:components
- id: component:peek-panel
  file: packages/web/src/components/PeekPanel.tsx
  side: client
  purpose: >
    The context column itself: the bar (←, the chip stack, ×) fixed at the top and, under it, the one scroller
    (`.peek-body`) that shows the open item — a node's card, properties and relations; a document's preview; a type;
    a session's header and console; or Context mode (rule:column-frame). Every Connected or tracking row can open
    in place into the node's embedded card (rule:connected-cards).
  part-of: module:components
- id: component:peek-graph
  file: packages/web/src/components/PeekGraph.tsx
  side: client
  purpose: >
    The open node's neighbourhood as a small mind map inside the panel; clicking a node opens it in the panel.
  part-of: module:components
- id: component:doc-peek
  file: packages/web/src/components/DocPeek.tsx
  side: client
  purpose: >
    A document in the right column: its title, status, first paragraph and outline, so a link can be checked without leaving the page; headings jump into the document.
  part-of: module:components
- id: component:smart-tag
  file: packages/web/src/components/SmartTag.tsx
  side: client
  purpose: >
    A node id as a clickable tag with the kind colour; click opens the node in the context column, ⌘-click on a document opens it.
  part-of: module:components
- id: component:id-link
  file: packages/web/src/components/IdLink.tsx
  side: server
  purpose: >
    Renders text with every kind:slug token as a SmartTag; trailing punctuation stays text.
  part-of: module:components
- id: component:pills
  file: packages/web/src/components/Pills.tsx
  side: server
  purpose: >
    Kind, status and stub pills shared by cards, lists and the peek panel.
  part-of: module:components
- id: component:progress
  file: packages/web/src/components/Progress.tsx
  side: server
  purpose: >
    A small progress bar; undefined means \"not known\".
  part-of: module:components
```

<!-- /list:component -->

## Work, changes and impact

<!-- list:component -->

```yaml
- id: component:work-list
  file: packages/web/src/components/WorkList.tsx
  purpose: the Work view's grid — rows nested per rule:work-nesting, groups, chips, the I-am name, the Assign / Build dialog
  part-of: module:components
- id: component:assign
  file: packages/web/src/components/Assign.tsx
  purpose: the Assign / Build dialog — a person, an agent (a conversation, plan first, folder) or the runner pool, a note; a held task asks before it re-queues; Build lists the unagreed blocks
  part-of: module:components
- id: component:task-work
  file: packages/web/src/components/TaskWork.tsx
  purpose: a task's Work section in the column (req:exec.done-comes-back) — state, worker, Assign, Build and the plan's Definition state for a request task, ✓ done, the last session's result, the blocks it produced with their status and Review into the Inbox on them
  part-of: module:components
- id: component:change-card
  file: packages/web/src/components/ChangeList.tsx
  purpose: the Inbox's Changes group (req:exec.change-kept, req:exec.change-review), laid out for the decision (rule:review-readable) — old and new per changed key with a word diff; open conflicts and the impact's one line on the surface; the unchanged framing fields, id and other verdicts under details, the verdicts on the new value, changed-since, Accept / Revert, and the impact set
  part-of: module:components
- id: component:impact-card
  file: packages/web/src/components/ImpactCard.tsx
  purpose: the impact set on a change card (req:exec.impact-set, req:exec.impact-patch) — candidates grouped by verdict with path and reason, an update's diff editable with Apply / Skip / Apply all, the task, contradiction or question an outcome became, the unjudged ones and an Impact / Run again button
  part-of: module:components
- id: component:context-card
  file: packages/web/src/components/ContextCard.tsx
  purpose: the Context card at the top of a librarian conversation (req:exec.wye-context) — the packet's nodes and the semantic hits grouped as what exists, required, decided and constrained, open questions, work; grows with the session's knowledge events
  part-of: module:components
- id: component:explain-card
  file: packages/web/src/components/ExplainCard.tsx
  purpose: Explain on any node (req:exec.explain-anywhere) — one librarian turn, the current state around the node with the nodes as tags
  part-of: module:components
- id: component:changed-badge
  file: packages/web/src/components/ChangedBadge.tsx
  purpose: the "changed" badge on a node's header while a change record on it is pending; the old value on hover, a link to the Inbox
  part-of: module:components
```

<!-- /list:component -->

## Unsorted

<!-- list:component -->

```yaml
- id: component:file-route
  file: packages/web/src/app/[product]/[project]/d/assets/[file]/route.ts
  side: server
  purpose: >
    Images and files a document embeds: docs/assets/<file>, served relative to the document's URL so the markdown
    can say ![caption](assets/<file>) and render both here and on GitHub.
  status: proposed
  part-of: module:components
- id: component:product-layout
  file: packages/web/src/app/[product]/layout.tsx
  side: server
  purpose: >
    (no header comment)
  status: proposed
  part-of: module:components
- id: component:root-layout
  file: packages/web/src/app/layout.tsx
  side: server
  purpose: >
    (no header comment)
  status: proposed
  part-of: module:components
- id: component:attachments
  file: packages/web/src/components/Attachments.tsx
  side: client
  purpose: >
    Images a person pastes (or drops) into a message box before sending: the session composer and the command box
    take them the same way — up to 8, shown as thumbnails with a remove button, sent as data URLs and stored as the
    session's files (store:session-files). Claude Code takes pasted images the same way.
  status: proposed
  part-of: module:components
- id: component:constitution-list
  file: packages/web/src/components/ConstitutionList.tsx
  side: client
  purpose: >
    (no header comment)
  status: proposed
  part-of: module:components
- id: component:editor-scope
  file: packages/web/src/components/EditorScope.ts
  side: client
  purpose: >
    The node whose content a DocEditor edits (decision:wf2.content-editor-scoped); null on a document page. Its own
    module so a block component can read it without importing the editor (which imports the blocks).
  status: proposed
  part-of: module:components
- id: component:question-toasts
  file: packages/web/src/components/QuestionToasts.tsx
  side: client
  purpose: >
    (no header comment)
  status: proposed
  part-of: module:components
- id: component:tabs
  file: packages/web/src/components/Tabs.tsx
  side: client
  purpose: >
    A strip of tabs, editor style (req:wf2.ui.tabs): one row that scrolls sideways, the open tab on the
    content's ground, the others sunk; × closes (the middle button too), a pinned tab keeps its place and shows a
    pin instead of ×. The same strip sits above the content and above the context column, so both read the same way.
  status: proposed
  part-of: module:components
- id: component:settings-jev
  file: packages/web/src/components/SettingsJev.tsx
  side: client
  purpose: >
    The Jev key (Jev auto-linking design §0): masked field, Save / Remove, and Test — one real question with the
    stored key, its round trip shown. A stored key is what switches auto-linking on; there is no other toggle.
  status: proposed
  part-of: module:components
```

<!-- /list:component -->
