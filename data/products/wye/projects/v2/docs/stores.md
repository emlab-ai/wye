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

Where everything lives and how the app reads it: markdown is canonical, everything under _build is derived, sessions and changes are operational records, and the graph the pages are served from is held in memory.


## How storage works

Wye has no database of record. A product is a folder of markdown, the graph is worked out from it, and the app keeps that graph in memory. Five layers, from what is kept to what can be thrown away:

| Layer | What | Where | If it is lost |
|---|---|---|---|
| Source | Documents, product and project files, assets, drawings | `projects/<project>/docs/`, `.wye/`, `_product.md`, `_project.md` | It is gone — this is the product; it is what Git holds |
| Derived | The graph, the search index, embeddings, judgement caches | `_build/` | Rebuilt from the source on the next build or search |
| Records | Sessions, change records, hook firings, the inbox | `_sessions/`, `_changes/`, `_hooks/`, `inbox/` | History is lost, the knowledge is not |
| Memory | The graph with its indexes, the parse cache, small per-file caches | The app's process | Refilled on the next request after a restart |
| Browser | The node index, panel and rail preferences | The page's memory, `localStorage` | Fetched again on load |

### The source: markdown

store:documents is the single source of truth (rule:markdown-canonical). Everything a person or an agent writes ends up as text in a `.md` file: prose, typed lines (a kind and an id, then the text), yaml cards. The pages the app writes for itself — Goals, Work, Hooks, Skills, the PR pages, comments — are markdown too, in the project's `.wye/` folder (store:system-pages), so they are built into the same graph and never mixed with the person's pages. A write goes to a temporary file and is renamed over the target (rule:atomic-file-write), one write per file at a time (rule:per-file-queue).

A product's folder is `data/products/<slug>/` by default. With `root: <path>` in `_product.md` everything but that file lives at the path instead — beside the product's code, in its repository (decision:wf2.product-folder). Installed from npm, the data folder is `~/.wye/data`.

### The graph: one derived file, held in memory

`_build/graph.json` (store:build) is the whole product parsed: every node, edge, page, type and problem — about 9 MB for 130 documents, 8,300 nodes and 41,000 edges. It is never edited and not in Git; removing it costs one build.

The app does not read that file per request. lib:build keeps, per product, in its own process:

- **the graph and its indexes** — nodes by id, edges by source and by target, and the node index the pages use for tags and pickers. A request gets these from memory; the only disk access is one `stat` of graph.json, and the file is read again only when its mtime or size changed underneath (a `wye build` from the CLI).
- **the parse cache** — for each document, what it produced last time and what it read from the other documents. A build parses the files whose text changed and replays the rest; the result is the same as a cold parse (decision:wf2.parse-cache, test/parse-cache.js).
- **the last steps** — each graph it has held has a rev and knows what it changed from the one before, which is what a change event tells the open pages (decision:wf2.change-names-what-changed, lib:graph-delta).

Smaller caches of the same kind, each keyed by a file's mtime and size so a change outside the app is always seen: a document's front matter and outline for the rail, and the text of each session file.

### What a save does

1. The editor sends the page's text; the route writes the file atomically.
2. lib:build builds in the same process: the changed document is parsed, the others replayed, graph.json is written whole, the graph in memory is replaced. The check runs on that graph and its errors go back with the reply.
3. After the reply, the change pipeline runs on the difference between the two graphs: block attribution for running sessions, change records (store:changes), impact, hooks, verdicts.
4. lib:watch sees the files change and tells the open pages through the events stream; a `graph` event names the ids that changed, so a card, a view or the node index is fetched again only when it is concerned. A document written outside the app (an agent, an editor, Git) is seen by the same watcher, which builds if the last build did not read that version of the file.

A save of a paragraph on a large product is about 0.3 s on the server: ~90 ms replaying the parse, ~45 ms writing graph.json, ~50 ms the check.

### What a page load reads

A page reads the product and project files (a few small reads), the graph from memory, and its own document from disk. Nothing is queried from a database. A full load of a long page renders its first screen on the server and the editor brings the rest (decision:wf2.first-screen-first); a client navigation renders neither the reader nor the node index, which the page already holds.

### The two engines that look like databases

- **Search** (store:search-index) is an embedded LanceDB database per product, `_build/search.lance`: one row per passage with its vector and a full-text index, for ⌘F and `wye ask`. It is derived — which file each passage came from and that file's mtime are kept beside it, and a refresh re-embeds only what changed. store:embeddings holds the per-node vectors the semantic links use; store:model-cache is the model itself. Nothing leaves the machine.
- **Queries** (decision:wf2.graph-query) run in an in-memory DuckDB that is loaded from the graph already in memory when a table or `wye query` asks, and rebuilt when the graph changes. It stores nothing and cannot read files or the network.

Neither is where the graph lives. A database for nodes and edges was considered twice and rejected (decision:wf2.parse-cache, decision:wf2.change-names-what-changed): the graph fits in memory, and what was slow each time was work repeated — parsing, rendering, requests — not reading.

### Records: what happened, not what is known

Sessions (store:sessions, with their files in store:session-files), change records (store:changes), hook firings (store:hook-firings) and the inbox (store:inbox) are one small file each, written under a per-file lock. They are local to the machine — `_build/`, `_sessions/` and `_changes/` are ignored by Git — and the knowledge does not depend on them.

### This machine only

store:settings is one json file for the app, mode 0600 because it holds keys, read fresh on each use and never sent whole to the browser. A deleted product is moved to store:trash, not unlinked. The browser keeps only conveniences in `localStorage` — the rail's and the panel's width and state, which folders are open, the last command mode — and nothing a product depends on.

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
  path: data/products/<product>/_build/graph.json
  format: json
  purpose: >
    The parsed graph: nodes, edges, modules, kinds, types, inverses, problems. Written whole by every build — in the
    app's process after each write and on watcher changes (lib&#58;build, with the parse cache), or by `wye build` —
    and held in memory by the app, which reads the file again only when it changed underneath. Never edited, not in
    Git. Beside it in _build/, caches of what a model judged, each rebuilt when missing: verdicts.json, impact.json,
    jev.json.
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
- id: store:search-index
  path: data/products/<product>/_build/search.lance/
  format: binary
  purpose: >
    The Ask index: an embedded LanceDB database per product — one row per passage with its vector and a full-text
    index, searched by both and fused. scopes.json beside the rows says which file each passage came from and that
    file's mtime, so a refresh re-embeds only what changed. Derived; its writes are not a change the pages follow.
  part-of: module:stores
- id: store:system-pages
  path: data/products/<product>/projects/<project>/.wye/*.md
  format: markdown
  purpose: >
    The pages the app writes: Goals, Work, Hooks, Skills, the PR pages, comments, runs, and installed packages under
    .wye/packages/ (directory links into the system library). Markdown like the person's documents and built into the
    same graph, read after docs/ so the person's page wins where a node is defined twice; their slugs start with ~.
  part-of: module:stores
- id: store:hook-firings
  path: data/products/<product>/_hooks/<id>.json
  format: json
  purpose: >
    One record per firing of a hook: which hook, on which node, what it did. `once` holds through these records.
  part-of: module:stores
- id: store:settings
  path: data/_settings.json
  format: json
  purpose: >
    The app's settings on this machine: keys, how agents are launched, the timezone, the Quick start's state per
    product. Mode 0600, ignored by Git, read fresh on every use; the browser only sees the public part.
  part-of: module:stores
- id: store:trash
  path: data/_trash/<slug>-<stamp>/
  format: markdown
  purpose: >
    A deleted product's registry folder, moved here instead of unlinked. A product whose folder is beside its code
    (`root:`) keeps that folder where it is.
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
