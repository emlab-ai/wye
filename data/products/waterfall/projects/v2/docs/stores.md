---
node: module:stores
type: module
title: Storage
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:domain
order: 33
---

# Storage

Where everything lives on disk: markdown is canonical, everything under _build is derived, sessions and changes are operational records.


## Stores

<!-- list:store -->

```yaml
- id: store:product-file
  path: data/products/<product>/_product.md
  format: markdown
  purpose: >
    The product: title, icon, description. Created by op:api.products.create.
  part-of: module:stores
- id: store:project-file
  path: data/products/<product>/projects/<project>/_project.md
  format: markdown
  purpose: >
    A project or goal: title, kind, status, icon, main document.
  part-of: module:stores
- id: store:documents
  path: data/products/<product>/projects/<project>/docs/*.md
  format: markdown
  purpose: >
    The knowledge itself: every document with its frontmatter (node: <kind>:<slug> — the page's node, of any declared type, module by default (rule:page-node-line); part-of; the type's properties), prose, typed blocks and yaml cards. The single source of truth (rule:markdown-canonical).
  part-of: module:stores
- id: store:assets
  path: data/products/<product>/projects/<project>/docs/assets/*
  format: binary
  purpose: >
    Images pasted or dropped into documents, named <date>-<base>-<hex>.<ext>.
  part-of: module:stores
- id: store:drawings
  path: data/products/<product>/projects/<project>/docs/drawings/<slug>.{excalidraw,svg,png,md}
  format: excalidraw
  purpose: >
    Excalidraw scenes with their SVG (shown), PNG (for agents) and annotation description (for agents).
  part-of: module:stores
- id: store:build
  path: data/products/<product>/_build/graph.json (+ data.js for the site)
  format: json
  purpose: >
    The parsed graph: nodes, edges, modules, kinds, types, inverses, problems. Rebuilt by ctx build (the app spawns it after every write and on watcher changes); never edited.
  part-of: module:stores
- id: store:embeddings
  path: data/products/<product>/_build/embeddings.json
  format: json
  purpose: >
    Cached sentence embeddings per node for the local semantic search; refreshed per node when its text changes.
  part-of: module:stores
- id: store:sessions
  path: data/products/<product>/_sessions/<id>.json
  format: json
  purpose: >
    An agent session: instruction, refs, status, log, result, queue, transcript (chat events), artifacts. Mutated under a file lock.
  part-of: module:stores
- id: store:session-files
  path: data/products/<product>/_sessions/<id>-files/*
  format: binary
  purpose: >
    Images attached to a session's messages — pasted into the composer (action:send-message) or into the
    command box with the request (action:command-palette); the latter are listed on the session as `images`
    and sent with its first message (image blocks for Claude, --image for Codex, a temp copy by path for a
    runner). Served by /api/<product>/sessions/<id>/file/<name>.
  part-of: module:stores
- id: store:inbox
  path: data/products/<product>/inbox/<timestamp>-<type>-<title>.md
  format: markdown
  purpose: >
    Raw material with no document yet: notes, pasted conversations, agent items; filed into a document or dismissed (rule:inbox-review).
  part-of: module:stores
- id: store:agent-instructions
  path: data/products/<product>/_agent.md
  format: markdown
  purpose: >
    Product-specific instructions appended to the agent contract (optional).
  part-of: module:stores
- id: store:base-ontology
  path: schema/base-ontology.md
  format: markdown
  purpose: >
    The base types every product has, read first by the parser; kinds.yaml is its prose summary.
  part-of: module:stores
- id: store:model-cache
  path: .cache/models
  format: binary
  purpose: >
    The MiniLM sentence model transformers.js downloads once for the semantic search; nothing leaves the machine.
  part-of: module:stores
- id: store:changes
  path: data/products/<product>/_changes/<id>.json
  format: json
  purpose: >
    One record per edit of a typed node (decision:exec.change-record): node, document, file and line, before and
    after (text, textKey, status, props), the changed keys, by, session, at, updatedAt, state (pending | accepted |
    reverted), tracking / own marks, acceptedBy, revertedBy, revertOf, and the impact set. Operational like
    _sessions/, git-ignored; the documents stay canonical (constraint:wf2.text-canonical).
  part-of: module:stores
```

<!-- /list:store -->
