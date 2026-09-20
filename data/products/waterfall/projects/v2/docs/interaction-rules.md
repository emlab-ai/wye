---
node: module:interaction-rules
type: module
title: Interaction rules
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:experience
order: 24
---

# Interaction rules

What the interface guarantees, by area — click, fold, drag, select, review cards. Rules whose source is a component or a stylesheet.

## Agents and sessions

```yaml
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
- id: rule:connected-cards
  statement: >
    The Connected list and a goal's tracking lists share one row (`RelRow`): the expand toggle (`.rel-x`, ▸/▾,
    only when the index says the node is defined), the tag, the status and the title, then — when the id is in
    the node view's expanded set — the node's `EmbeddedCard`. A group heading carries a cards / tags toggle
    (`.rel-all`) that adds or removes all of the group's defined ids; the set is state of the node view, so it
    resets with the open node and survives the card's own refetch after an edit.
  source: packages/web/src/components/PeekPanel.tsx#RelRow; packages/web/src/app/globals.css#rels
  status: shipped
- id: rule:block-select
  statement: >
    `PeekProvider` keeps `focused` (the node a click selected) next to the chip stack; `select(id)` sets it,
    moves the cursor to the Context root (-1) and shows the column. The Context root renders `focused ??
    editing.nodeId`. Every typed block of a document calls `select` from a click handler on its outermost
    element (`.nblock` for cards, `.nrow` for rows, `.embed` for embeds) unless the click's target is inside
    an `a` (a tag or link); the kind pill does the same in a document, so no part of a block behaves
    differently. The editor's `publishContext` clears `focused` when the caret moves to another block, so
    keyboard movement takes over from the last click. In the context column an embedded card never selects
    (a click in its text area is an edit, not navigation); its pill and tags push as before. `open` from the root
    (cursor -1) keeps every chip and appends — nothing is "above" the root — so a session read before a block
    click survives the next tag click.
  source: packages/web/src/components/PeekProvider.tsx#select; packages/web/src/components/NodeCards.tsx#selectOn; packages/web/src/components/EmbedBlock.tsx; packages/web/src/components/DocEditor.tsx#selectBlockOnClick
  status: shipped
- id: rule:produced-collapsed
  statement: >
    NodeView renders `Produced` after Connected (list or graph) for a goal or task with sessions; `Produced` is
    a bar (`.peek-bar.peek-sub.produced-bar`) with the counts it knows without a request — the entry's sessions
    and the `produced` edge — and a show / hide button; the sessions and the inbox are fetched only while it is
    open, in local state that resets with the node.
  source: packages/web/src/components/Produced.tsx; packages/web/src/components/PeekPanel.tsx
  status: shipped
- id: rule:related-collapsed
  statement: >
    The Context root renders Related as a bar with a show / hide button (`Related` in PeekPanel); `ContextPanel`
    — the component that runs the semantic search — is mounted only while it is open, so no request goes out
    while it is closed. The state is `relatedOpen` in `PeekProvider`, read from and written to localStorage
    (`wf-related`), closed by default.
  source: packages/web/src/components/PeekPanel.tsx:145; packages/web/src/components/PeekProvider.tsx:46
  status: shipped
- id: rule:console-flow
  statement: >
    The console is one conversation in time order. Runs of tool calls, results and thinking between two messages
    fold into one collapsed activity row (n steps · duration · errors · the latest step, a live dot while the agent
    works) that opens to every step; a single call stays inline. User messages, the agent's replies, question and
    permission cards, subagent groups and turn ends (time, cost) stay in the flow. `wf session log` lines appear as
    small log notes and the `wf session done` summary as a summary card at the time they were written; after a
    turn (~1 s later, once the watcher has credited the writes) a `knowledge` row names the documents and nodes
    the session changed since the last such row (agent-host#reportKnowledge, the session's artifacts); a chat
    session has no separate Result or Log panel. Rows carry no time column — the width goes to the content; an
    event's time shows at the row's right edge only while it is hovered (task:new-954).
  source: packages/web/src/components/Console.tsx#foldActivity; packages/web/src/components/Console.tsx#Activity; packages/web/src/components/SessionView.tsx
  status: proposed
```

## Documents and editing

```yaml
- id: rule:table-scroll
  statement: >
    The editor block that holds a data table (the collection block with its child rows) is the horizontal scroll
    container: `overflow-x: auto`. The header and every row have `min-width: min-content`, so a row is never
    narrower than its column minima — the name column's minimum is 200px, status 100px, the property columns as
    typeGrid says — and all rows stay one width whether the block scrolls or not.
  source: packages/web/src/app/globals.css#.nrow; packages/web/src/components/DocEditor.tsx#typeGrid
  status: shipped
  related-to: [rule:type-tables, rule:goals-and-tasks]
  verified-by: [ui-test:table-scroll]
- id: rule:card-fold
  statement: >
    Every card's header carries `FoldToggle` when the node has content — a chip "▸ n blocks" whose click opens the
    node's details (`host.fold.open`: wf:select in the editor, the peek's select for an embed); no content shows
    in the card. In the editor (`EditorCard`) the count is the block's children; a style element zero-heights all
    of them by the block's id (`.bn-block-outer[data-id] > .bn-block > .bn-block-group > .bn-block-outer`), so
    they stay blocks and in the file, and the arrow keys skip them; the editor's own selection (not the DOM's —
    a programmatic caret lands before the DOM follows) inside one of them shows them ("▾ n blocks") and leaving
    folds again. An embedded card gets the node's content from op:node.edit's GET (`content`) only to count its
    blocks (`contentBlocks`); there is no preview under the card. The one exception is a question: its content is
    its answer (decision:wf2.answer-is-content), so `useFold` never folds it and the blocks render under the card
    (styled as the answer section in globals.css); the card carries `host.answer` instead of a fold chip.
  source: packages/web/src/components/NodeCards.tsx:31 (FoldToggle); packages/web/src/components/DocEditor.tsx:426 (EditorCard); packages/web/src/components/EmbedBlock.tsx
  status: shipped
- id: rule:mention-menu
  statement: >
    Typing @ in the editor opens a search over every node and document by id or title; choosing one inserts its
    tag inline. Typing an id as plain text (`req:wf2.ui`) also becomes a tag when the block loses focus. Selecting
    a phrase and choosing "⌁ node" links the phrase instead of inserting a tag.
  source: packages/web/src/components/DocEditor.tsx#mentionItems
  status: unverified
  requires-tests: [ui-test:edit-node-flow]
- id: rule:node-page-layout
  statement: >
    The context column shows a node as a page, not a form: the kind and id small on top, the title large and
    editable (a yaml card's title key, else its text — a prose node is its text), then the properties as rows of
    label and value in one column: status first, then the text key when the title is separate, the tracking fields
    of a goal or task, the type's declared properties (own, then inherited, each marked), the root type's link
    properties the node fills in (related-to, depends-on…), and keys the card carries beyond its type. Empty
    optional properties fold under "n more properties"; required empty ones are marked. A value edits in place
    and saves when the field is left (Enter in the title saves it). Relations, sessions and the graph views follow
    below as before (task:new-826).
  source: packages/web/src/components/NodeEditor.tsx; packages/web/src/app/globals.css#ne-props
  status: shipped
  verified-by: [ui-test:table-rows]
  related-to: [component:node-editor, req:wf2.ui.edit-in-context]
- id: rule:app-navigation
  statement: >
    The app frame has a collapsible rail (hidden by default on document and session pages, shown elsewhere; toggle
    button bottom-left or ⌘\; remembered per browser) and, when the right column is open, a draggable splitter
    between content and column (width remembered; the column keeps at least 320 px and the content at least 360 px,
    re-clamped on resize and rail toggle).
  source: packages/web/src/components/Shell.tsx
  status: shipped
- id: rule:blocknote-prose-only
  statement: >
    BlockNote edits only the text of a prose key; on save its blocks are exported to markdown and written back as
    that key's block scalar; the node's other keys never pass through BlockNote, because its markdown round-trip
    is lossy.
  source: packages/web/src/components/ProseEditor.tsx
  status: proposed
  requires-tests: [test:web-components#node-page-prose-editor]
```

## Knowledge and search

```yaml
- id: rule:questions-view
  statement: >
    The Questions page lists every open question about the product: question nodes (kind question or status
    question) from the documents and question items waiting in the inbox, newest first, with refs, where they
    come from, a send-to-agent action, and open/all filters.
  source: packages/web/src/app/[product]/questions/page.tsx; packages/web/src/components/QuestionList.tsx
  status: shipped
```

## Shell and navigation

```yaml
- id: rule:table-rows
  statement: >
    A row of any table (goals, tasks, a type's) is selected by a click anywhere in it — its status select, a property
    cell, the grid background, not only its text: the click puts the editor cursor in the row without taking focus
    from the control, so the context column shows the row's node the same way as for a node block (whose header
    behaves alike). Settling a table never rewrites its children: a missing trailing empty row is inserted after the
    last row, a slug is set on the row alone, stray empty rows are removed only when the cursor leaves the table, and
    a paragraph Enter opens inside a table becomes a row of the table's kind — so typing at any speed stays in the
    row. Copy link, Send to agent and the peek dot on a row that has text but no slug yet assign the slug first, so
    a link never ends in `bug:`.
  source: packages/web/src/components/DocEditor.tsx#selectBlockOnClick; packages/web/src/components/DocEditor.tsx#withSlug; packages/web/src/components/DocEditor.tsx#settleCollections
  status: shipped
  verified-by: [ui-test:table-rows]
  related-to: [rule:goals-and-tasks, rule:type-tables]
- id: rule:doc-tree-row-stable
  statement: >
    The document tree's row is a module-level component (Row) that takes the tree's shared state as one prop; it
    is never a component defined inside DocTree's render. A nested component takes a new identity on every state
    change, so setDrag on dragstart remounted every row, and Chrome ends a native HTML5 drag the moment its source
    node leaves the document — the tree's drag and drop did nothing (bug:doc-tree-dnd). The same holds for any
    draggable row in the app.
  source: packages/web/src/components/DocTree.tsx:10; packages/web/src/components/DocTree.tsx:47
  status: shipped
- id: rule:rail-split
  statement: >
    The rail is two panes — `.rail-top` (menu, search, the Plans folder) and the Documents pane — with `.rail-split`
    between them. Untouched, the top pane is `flex: 0 1 auto; max-height: 60%` and scrolls, so Documents always
    shows; a drag sets its flex-basis in px from the drag's delta (mousedown height + pointer travel, clamped so
    each pane keeps MIN_PANE = 96px, the splitter counted), stored in localStorage `wf-rail-split` from a ref at
    mouseup (never from a state updater — a double-click's reset would be overwritten by the queued write); a
    double-click clears both. `body.resizing-y` disables selection while dragging.
  source: packages/web/src/components/Rail.tsx#onSplit; packages/web/src/app/globals.css
  status: shipped
  related-to: [rule:app-navigation, rule:plans-folder]
  verified-by: [ui-test:rail-split]
- id: rule:deep-links
  statement: >
    Every view is a route under /p/<project>; the node page is /n/<id>, the graph /graph?focus=<id>&preset=<name>,
    lists carry their filters in the query; navigating updates the URL and loading a URL restores the view.
  source: packages/web/src/app/p/[project]/layout.tsx; packages/web/src/app/p/[project]/graph/page.tsx
  status: unverified
  requires-tests: [ui-test:deep-link]
```
