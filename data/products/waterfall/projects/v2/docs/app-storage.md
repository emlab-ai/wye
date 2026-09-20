---
node: module:app-storage
type: module
title: Storage and serving
status: proposed
owner: unassigned
sources:
  - packages/web/src/lib/products.ts
  - packages/web/src/lib/watch.ts
  - packages/web/src/lib/artifacts.ts
  - packages/desktop/main.js
part-of: module:app
order: 48
last-verified: 2026-09-20
---

# Storage and serving

Storage and serving

```yaml
- id: module:app-storage
  purpose: >
    Where everything lives on disk and how the app follows it: the data folder layout (products, projects, documents, assets, drawings, build output, sessions, inbox), the watcher that rebuilds the graph when anything changes, the atomic writes, the events stream the UI refreshes from, and the desktop shell that owns the server. Markdown is canonical; everything under _build is derived.
```

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.store, req:wf2.store.products, req:wf2.serve, req:wf2.serve.live, req:wf2.serve.last-good, req:wf2.write.single-path, req:wf2.ui.live. Rules the code enforces: rule:markdown-canonical, rule:product-layout, rule:watcher-debounce, rule:last-good-graph, rule:live-refresh, rule:sse-refresh, rule:atomic-file-write, rule:per-file-queue, rule:task-artifacts.

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

Where data lives (`store:` cards): path pattern, format, purpose. Markdown stores are canonical; json ones are derived or operational.

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.


## Rules

<!-- list:rule -->

```yaml
- id: rule:question-decision-nodes
  statement: >
    The template gains a §D Decisions section (ADR keys date, context, options, choice, consequences, optional
    decision-id) and §11 questions are yaml nodes with an id and q; the parser treats both as ordinary yaml nodes.
    The section map (rule:section-map) places new decision and question nodes there.
  source: templates/module.md; schema/kinds.yaml
  status: proposed
  requires-tests: [test:core-parser#question-and-decision-nodes]
- id: rule:live-refresh
  statement: >
    The app follows the product on disk: a recursive watcher on data/products/<product> (lib/watch.ts, on
    globalThis) rebuilds the graph 400 ms after a document changes and pushes change events (doc, graph, inbox,
    session) over /api/<product>/events; the LiveRefresh client refreshes the server-rendered parts (rail, lists,
    panels) on graph, inbox and session changes, so documents, tasks, questions and inbox items written by agents
    or editors appear without a reload. A document being edited in the browser is not reloaded while a save is
    pending.
  source: packages/web/src/lib/watch.ts; packages/web/src/app/api/[product]/events/route.ts; packages/web/src/components/LiveRefresh.tsx
  status: shipped
- id: rule:product-layout
  statement: data/products/<product>/_product.md (title, icon, description), projects/<project>/_project.md (title, kind project|goal, status, icon), projects/<project>/docs/*.md (pages), inbox/ (dropped notes and files, unprocessed), _build/graph.json (the product's knowledge, built by ctx from every page of every project; files and folders starting with _ and the inbox are skipped). Routes: /<product>, /<product>/knowledge[/<kind>], /<product>/graph, /<product>/inbox, /<product>/<project>, /<product>/<project>/d/<page>.
  source: packages/web/src/lib/products.ts; packages/web/src/lib/scope.ts; bin/ctx.js#findDocs
  status: unverified
  requires-tests: [test:server-api#serve-starts-with-two-projects]

```

<!-- /list:rule -->

## Libraries

<!-- list:lib -->

```yaml
- id: lib:products
  file: packages/web/src/lib/products.ts
  side: server
  purpose: >
    Server-only registry of products and projects, read from the data folder: <data>/products/<product>/_product.md <data>/products/<product>/projects/<project>/_project.md <data>/products/<product>/projects/<project>/docs/*.md <data>/products/<product>/_build/graph.json (one graph per product: all its projects' docs) <dat
  part-of: module:app-storage
- id: lib:watch
  file: packages/web/src/lib/watch.ts
  side: server
  purpose: >
    Watches the product data on disk so the app follows what agents and editors write: any change under data/products/<product> (documents, inbox, sessions) is pushed to subscribers, and a changed document rebuilds the graph (agents may edit files without running ctx build). Lives on globalThis across dev reloads.
  part-of: module:app-storage
- id: lib:artifacts
  file: packages/web/src/lib/artifacts.ts
  side: server
  purpose: >
    What a session produced: documents written while it ran (from the disk watcher), nodes it changed (from the node API), the blocks it added / changed / removed (from the graph diff at each rebuild, rule:block-attribution) and inbox items it filed (they carry the session id themselves). Running sessions of a product are credited with document changes; the tasks a session works on get `session:` and `produced:` links so t
  part-of: module:app-storage
- id: lib:desktop.main
  file: packages/desktop/main.js
  side: server
  purpose: >
    The Electron main process: owns the Next.js server as a child, waits until it answers, opens the window; agents are children of the server so everything dies together.
  part-of: module:app-storage
```

<!-- /list:lib -->
