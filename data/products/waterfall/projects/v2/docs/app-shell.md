---
node: module:app-shell
type: module
title: App — shell and navigation
status: proposed
owner: unassigned
last-verified: 2026-09-17
part-of: module:app
sources:
  - packages/web/src/components/Shell.tsx
  - packages/web/src/components/Rail.tsx
  - packages/web/src/components/TopBar.tsx
  - packages/web/src/components/DocTree.tsx
  - packages/web/src/components/Search.tsx
  - packages/web/src/components/NewDoc.tsx
  - packages/web/src/components/LiveRefresh.tsx
  - packages/web/src/components/PeekProvider.tsx
  - packages/web/src/components/PeekPanel.tsx
  - packages/web/src/components/PeekGraph.tsx
  - packages/web/src/components/DocPeek.tsx
  - packages/web/src/components/SmartTag.tsx
---

# App — shell and navigation

```yaml
- id: module:app-shell
  purpose: >
    The frame everything sits in: the rail with the product menu and the Documents tree, the top bar, the content, and the context column (the right column that opens any node, document, type or session without leaving the page).
```

## Requirements and rules

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.ui, req:wf2.ui.sidebar, req:wf2.ui.live, req:wf2.ui.phone. Rules the code enforces: rule:app-navigation, rule:documents-tree, rule:document-tree, rule:smart-tags, rule:deep-links, rule:doc-links, rule:live-refresh, rule:new-document, rule:product-layout. Pages: page:web/sidebar, page:web/context-column, page:web/overview, page:web/project, page:web/new-product.

## Pages

Screens this module adds (the others are described in the dev design and linked above).

```yaml
- id: page:web/overview
  route: /<product>
  component: app/[product]/page.tsx
  purpose: >
    Product overview: description, projects and goals, knowledge counts by kind.
  part-of: module:app-shell
- id: page:web/project
  route: /<product>/<project>
  component: app/[product]/[project]/page.tsx
  purpose: >
    Project overview: its documents; opens the main document directly when there is one.
  part-of: module:app-shell
- id: page:web/new-product
  route: /new
  component: app/new/page.tsx
  purpose: >
    Create a product (title, description, icon) — writes data/products/<slug>/_product.md.
  part-of: module:app-shell
```

## Components

React components (`component:` cards). `side` says whether it renders on the server or hydrates in the browser.

```yaml
- id: component:shell
  file: packages/web/src/components/Shell.tsx
  side: client
  purpose: >
    The app frame: a collapsible rail, the content, and — while a node, context or session is open — the right column, separated from the content by a draggable splitter. The rail starts hidden on document and session pages (working views) and open elsewhere; the choice and the splitter position are remembered per browser.
  part-of: module:app-shell
- id: component:rail
  file: packages/web/src/components/Rail.tsx
  side: client
  purpose: >
    The left rail: product switcher, menu (Overview, Search, Knowledge, Graph, Inbox), then projects with their pages.
  part-of: module:app-shell
- id: component:top-bar
  file: packages/web/src/components/TopBar.tsx
  side: client
  purpose: >
    The bar above the content, Notion style: sidebar control, back / forward (‹ ›, ⌘[ / ⌘] — rule:history-nav,
    req:wf2.ui.history-nav), breadcrumbs (product › parents › document; Agents › session › changes on session pages),
    last edit, copy link and send to agent.
  part-of: module:app-shell
- id: component:doc-tree
  file: packages/web/src/components/DocTree.tsx
  side: client
  purpose: >
    Docmost-style document tree: chevron for documents with children, a dot for leaves, an emoji icon, the title. Rows can be dragged: onto a row nests the document under it, between rows reorders; a hover \"+\" adds a child.
  part-of: module:app-shell
- id: component:search
  file: packages/web/src/components/Search.tsx
  side: client
  purpose: >
    Rail search over document titles, headings and node ids/titles; a hit opens the document or the node.
  part-of: module:app-shell
- id: component:new-doc
  file: packages/web/src/components/NewDoc.tsx
  side: client
  purpose: >
    a document lives in its parent's project; without a parent the project can be picked when there are several
  part-of: module:app-shell
- id: component:live-refresh
  file: packages/web/src/components/LiveRefresh.tsx
  side: client
  purpose: >
    Follows the product on disk: when an agent or an editor writes a document, the graph, the inbox or a session, the server-rendered parts of the page (rail, lists, panels) refresh on their own.
  part-of: module:app-shell
- id: component:peek-provider
  file: packages/web/src/components/PeekProvider.tsx
  side: client
  purpose: >
    What the editor is working on right now: the current block's text, the ids it already links, and a function that inserts a tag at the cursor. The panel's Context mode searches the product's knowledge for it.
  part-of: module:app-shell
- id: component:peek-panel
  file: packages/web/src/components/PeekPanel.tsx
  side: client
  purpose: >
    The context column itself: the bar (←, the chip stack, ×) fixed at the top and, under it, the one scroller
    (`.peek-body`) that shows the open item — a node's card, properties and relations; a document's preview; a type;
    a session's header and console; or Context mode (rule:column-frame).
  part-of: module:app-shell
- id: component:peek-graph
  file: packages/web/src/components/PeekGraph.tsx
  side: client
  purpose: >
    The open node's neighbourhood as a small mind map inside the panel; clicking a node opens it in the panel.
  part-of: module:app-shell
- id: component:doc-peek
  file: packages/web/src/components/DocPeek.tsx
  side: client
  purpose: >
    A document in the right column: its title, status, first paragraph and outline, so a link can be checked without leaving the page; headings jump into the document.
  part-of: module:app-shell
- id: component:smart-tag
  file: packages/web/src/components/SmartTag.tsx
  side: client
  purpose: >
    A node id as a clickable tag with the kind colour; click opens the node in the context column, ⌘-click on a document opens it.
  part-of: module:app-shell
- id: component:id-link
  file: packages/web/src/components/IdLink.tsx
  side: server
  purpose: >
    Renders text with every kind:slug token as a SmartTag; trailing punctuation stays text.
  part-of: module:app-shell
- id: component:pills
  file: packages/web/src/components/Pills.tsx
  side: server
  purpose: >
    Kind, status and stub pills shared by cards, lists and the peek panel.
  part-of: module:app-shell
- id: component:progress
  file: packages/web/src/components/Progress.tsx
  side: server
  purpose: >
    A small progress bar; undefined means \"not known\".
  part-of: module:app-shell
```

## Libraries

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

```yaml
- id: lib:scope
  file: packages/web/src/lib/scope.ts
  side: server
  purpose: >
    Server-only: everything a page needs for one product (and optionally one project), loaded once per request.
  part-of: module:app-shell
- id: lib:load
  file: packages/web/src/lib/load.ts
  side: server
  purpose: >
    Server-only: the one place the web app touches the filesystem. Keep graph.ts free of node: imports so client components can use it.
  part-of: module:app-shell
- id: lib:knowledge
  file: packages/web/src/lib/knowledge.ts
  side: shared
  purpose: >
    The knowledge index: how nodes are grouped and named for humans.
  part-of: module:app-shell
- id: lib:ids
  file: packages/web/src/lib/ids.ts
  side: shared
  purpose: >
    The kind list is open: a product's type: cards add kinds (graph.kinds). setKinds is called with the graph's kinds on the server (loadScope) and in the client provider, so every consumer of ID_RE sees the product's ids.
  part-of: module:app-shell
- id: lib:presets
  file: packages/web/src/lib/presets.ts
  side: shared
  purpose: >
    Graph presets: which kinds and verbs each view shows (Requirements, Mechanics, Data, Drift, Everything).
  part-of: module:app-shell
- id: lib:layout
  file: packages/web/src/lib/layout.ts
  side: shared
  purpose: >
    Every visible edge ranks the layout so non-tree presets (Drift, Data) still spread into layers; only refines/has are marked as tree edges for styling. refines points child → parent; has points parent → child; both are ranked parent → child. Other verbs rank from → to.
  part-of: module:app-shell
```

## API

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.

```yaml
- id: op:api.products.create
  args: POST /api/products
  does: >
    Create a product: { title, description, icon } → data/products/<slug>/_product.md.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-shell
- id: op:api.projects.create
  args: POST /api/<product>/projects
  does: >
    Create a project (or goal) in a product: { title, kind, description }.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-shell
- id: op:api.docs.move
  args: POST /api/<product>/docs/move
  does: >
    Move a document in the tree: sets part-of, moves the file into the parent's project, reorders.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-shell
```
