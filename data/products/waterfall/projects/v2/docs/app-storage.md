---
node: module:app-storage
type: module
title: Storage and serving
status: proposed
owner: unassigned
last-verified: 2026-09-17
part-of: module:app
sources:
  - packages/web/src/lib/products.ts
  - packages/web/src/lib/watch.ts
  - packages/web/src/lib/artifacts.ts
  - packages/desktop/main.js
---

# App — storage and serving

```yaml
- id: module:app-storage
  purpose: >
    Where everything lives on disk and how the app follows it: the data folder layout (products, projects, documents, assets, drawings, build output, sessions, inbox), the watcher that rebuilds the graph when anything changes, the atomic writes, the events stream the UI refreshes from, and the desktop shell that owns the server. Markdown is canonical; everything under _build is derived.
```

## Requirements and rules

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.store, req:wf2.store.products, req:wf2.serve, req:wf2.serve.live, req:wf2.serve.last-good, req:wf2.write.single-path, req:wf2.ui.live. Rules the code enforces: rule:markdown-canonical, rule:product-layout, rule:watcher-debounce, rule:last-good-graph, rule:live-refresh, rule:sse-refresh, rule:atomic-file-write, rule:per-file-queue, rule:task-artifacts.

## Libraries

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

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
```

## Stores

Where data lives (`store:` cards): path pattern, format, purpose. Markdown stores are canonical; json ones are derived or operational.

```yaml
- id: lib:desktop.main
  file: packages/desktop/main.js
  side: server
  purpose: >
    The Electron main process: owns the Next.js server as a child, waits until it answers, opens the window; agents are children of the server so everything dies together.
  part-of: module:app-storage
- id: store:product-file
  path: data/products/<product>/_product.md
  format: markdown
  purpose: >
    The product: title, icon, description. Created by op:api.products.create.
  part-of: module:app-storage
- id: store:project-file
  path: data/products/<product>/projects/<project>/_project.md
  format: markdown
  purpose: >
    A project or goal: title, kind, status, icon, main document.
  part-of: module:app-storage
- id: store:documents
  path: data/products/<product>/projects/<project>/docs/*.md
  format: markdown
  purpose: >
    The knowledge itself: every document with its frontmatter (node: <kind>:<slug> — the page's node, of any declared type, module by default (rule:page-node-line); part-of; the type's properties), prose, typed blocks and yaml cards. The single source of truth (rule:markdown-canonical).
  part-of: module:app-storage
- id: store:assets
  path: data/products/<product>/projects/<project>/docs/assets/*
  format: binary
  purpose: >
    Images pasted or dropped into documents, named <date>-<base>-<hex>.<ext>.
  part-of: module:app-storage
- id: store:drawings
  path: data/products/<product>/projects/<project>/docs/drawings/<slug>.{excalidraw,svg,png,md}
  format: excalidraw
  purpose: >
    Excalidraw scenes with their SVG (shown), PNG (for agents) and annotation description (for agents).
  part-of: module:app-storage
- id: store:build
  path: data/products/<product>/_build/graph.json (+ data.js for the site)
  format: json
  purpose: >
    The parsed graph: nodes, edges, modules, kinds, types, inverses, problems. Rebuilt by ctx build (the app spawns it after every write and on watcher changes); never edited.
  part-of: module:app-storage
- id: store:embeddings
  path: data/products/<product>/_build/embeddings.json
  format: json
  purpose: >
    Cached sentence embeddings per node for the local semantic search; refreshed per node when its text changes.
  part-of: module:app-storage
- id: store:sessions
  path: data/products/<product>/_sessions/<id>.json
  format: json
  purpose: >
    An agent session: instruction, refs, status, log, result, queue, transcript (chat events), artifacts. Mutated under a file lock.
  part-of: module:app-storage
- id: store:session-files
  path: data/products/<product>/_sessions/<id>-files/*
  format: binary
  purpose: >
    Images attached to a session's messages — pasted into the composer (action:send-message) or into the
    command box with the request (action:command-palette); the latter are listed on the session as `images`
    and sent with its first message (image blocks for Claude, --image for Codex, a temp copy by path for a
    runner). Served by /api/<product>/sessions/<id>/file/<name>.
  part-of: module:app-storage
- id: store:inbox
  path: data/products/<product>/inbox/<timestamp>-<type>-<title>.md
  format: markdown
  purpose: >
    Raw material with no document yet: notes, pasted conversations, agent items; filed into a document or dismissed (rule:inbox-review).
  part-of: module:app-storage
- id: store:agent-instructions
  path: data/products/<product>/_agent.md
  format: markdown
  purpose: >
    Product-specific instructions appended to the agent contract (optional).
  part-of: module:app-storage
- id: store:base-ontology
  path: schema/base-ontology.md
  format: markdown
  purpose: >
    The base types every product has, read first by the parser; kinds.yaml is its prose summary.
  part-of: module:app-storage
- id: store:model-cache
  path: .cache/models
  format: binary
  purpose: >
    The MiniLM sentence model transformers.js downloads once for the semantic search; nothing leaves the machine.
  part-of: module:app-storage
```

## API

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.

```yaml
- id: op:api.events
  args: GET /api/<product>/events
  does: >
    Server-sent events: what changed on disk (documents, graph, inbox, sessions), batched per 300 ms.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-storage
```
