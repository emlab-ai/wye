---
node: module:app-graph
type: module
title: Graph core and CLI
status: proposed
owner: unassigned
sources:
  - lib/parse.js
  - lib/graph.js
  - bin/ctx.js
part-of: module:app
order: 40
last-verified: 2026-09-20
---

# Graph core and CLI

Graph core and CLI

```yaml
- id: module:app-graph
  purpose: >
    The core that every view and every agent depends on: the parser that turns markdown into a graph (kinds open through the ontology, prose nodes, cards, blocks, generated fields, props and inverses), the query layer (search, neighbours, impact, packets), the lint (ctx check) and the ctx CLI that runs them offline. It has no server dependency and is what CI runs.
```

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf.graph, req:wf.graph.fields, req:wf.graph.stable-ids, req:wf.graph.multi-module, req:wf.graph.stubs-visible, req:wf.query, req:wf.query.packet, req:wf.query.impact, req:wf.lint, req:ontology.types, req:ontology.inverses, req:ontology.check, req:ontology.blocks, req:wf2.cli. Rules the code enforces: rule:node-detection, rule:id-syntax, rule:edge-from-typed-key, rule:explicit-edge-syntax, rule:field-generation, rule:field-mentions-index, rule:stub-nodes, rule:section-headings-drive-grouping, rule:search-scoring, rule:packet-ranking, rule:impact-closure, rule:rule-needs-source, rule:req-needs-satisfied-by, rule:shipped-needs-test, rule:check-exit-code, rule:ontology.open-kinds, rule:ontology.narrow-only, rule:ontology.open-types, rule:ontology.inverse-generated, rule:ontology.block-id, rule:cli-fallback.


## Rules

<!-- list:rule -->

```yaml
- id: rule:node-detection
  statement: A node is created from (a) `id: kind:slug` or `- id: kind:slug` inside a ```yaml block, split on `---` lines; (b) any id in a `### ` heading; (c) a table row whose first cell contains an id, unless the header row matches op|id|test node|enum|#|edge|policy|option|your req|test|tool; (d) a numbered row of a section whose heading contains "drift" or "contradiction".
  source: lib/parse.js:60-70, :118-121, :122-149
  verified-by: [test:smoke#reqs-parsed, test:smoke#rules-parsed]

- id: rule:id-syntax
  statement: An id is kind:slug where kind ∈ value:node-kind and slug matches [A-Za-z0-9_][A-Za-z0-9_./#-]*. Trailing .,;:)] are stripped; a|b keeps a; test ids drop #Method; setting: is aliased to flag:.
  source: lib/parse.js:10, :21-27
  verified-by: []

- id: rule:edge-from-typed-key
  statement: Inside a node body the current yaml key decides the verb — refines, satisfied-by, verified-by, governed-by, gated-by, reads, writes, calls, contradicts, owner→owned-by, owns, embedded-in, set-by, applies-to, governs, see, resolves, submodules→has, depends-on, adds, changes, requires-tests→verified-by; under `actions:` an op becomes calls and a page becomes navigates; any other key yields mentions.
  source: lib/parse.js:11-17, :79-104
  verified-by: [test:smoke#typed-edges]

- id: rule:explicit-edge-syntax
  statement: A line `a -(verb)-> b` anywhere (inside a node body or as a top-level bullet) is an edge with that verb, and is not also scanned for mentions.
  source: lib/parse.js:82-83, :150-151
  verified-by: []

- id: rule:inline-action-definition
  statement: Under a page's `actions:` (or `always:`/`sections:`) key, a line `- action:<slug>: description … -(verb)-> id` defines the action node (title = description, body on:/does:), adds has-action from the page, and one edge per `-(verb)->` in the line.
  source: lib/parse.js:86-96
  verified-by: []
  note: actions written as an inline array `actions: [action:<a>, action:<b>]` are NOT defined — they become stubs (inventory drift: 20 hollow actions)

- id: rule:field-generation
  statement: For every entity: or value: node, each line under fields:, computed…: or shape: becomes field:<entity>.<name>; comma/slash-separated names on one line each become a field; `?` and `= default` are stripped; type is the right-hand side and note the trailing # comment; an id in the type yields typed-as (entity/value/flag/state) or mentions.
  source: lib/parse.js:157-183
  verified-by: [test:smoke#fields-generated]

- id: rule:field-mentions-index
  statement: Every non-field node whose body contains a field name as a whole word, camelCase or PascalCase, gets a mentions edge to that field; names shorter than 5 characters or in value:field-stop-list are never indexed.
  source: lib/parse.js:184-196
  verified-by: [test:smoke#field-mentions]

- id: rule:ambiguous-field-names
  statement: When the same field name exists on several entities, a mention links only to owners the mentioning node already references by id; otherwise nothing is linked. Only unambiguous names enter fieldIndex for the viewer.
  source: lib/parse.js:193, :202
  verified-by: []

- id: rule:drift-table-parsed
  statement: Under a section whose heading contains "drift" or "contradiction", every row with a numeric first cell becomes drift:<module>.<n> (status drift, body a/b/what/where) with contradicts edges to every id in columns a and b.
  source: lib/parse.js:123-130
  verified-by: []

- id: rule:stub-nodes
  statement: Every edge endpoint is materialised; a node never described has defined=false and a title equal to its slug.
  source: lib/parse.js:197-201
  verified-by: []

- id: rule:section-headings-drive-grouping
  statement: The nearest ## heading is a node's section and the nearest ### its subsection; the viewer groups requirements by subsection and the parser detects drift/op/enum/test tables by section or first-cell kind, so the template's heading text is load-bearing.
  source: lib/parse.js:117-118, :123, :132-134; viewer/index.html:262
  verified-by: []
  note: undocumented in schema/kinds.yaml (drift row 6)

- id: rule:inventory-gate-shorthand
  statement: In an op table, the gate cell's words View / Manage / Record map to inventory's permission gate ids (view-inventory, manage-inventory, record-inventory-ops) and ", F" to the module's feature gate, only if those gate ids exist in the graph.
  source: lib/parse.js:141-148
  verified-by: []
  contradicts: [drift:waterfall.4]
- id: rule:structural-vs-mentions
  statement: mentions edges are weak — hidden by default in the viewer (except Everything/focus), excluded from --structural neighbourhoods, from impact and from packet ranking, and omitted from brief renders.
  source: lib/parse.js:18; lib/graph.js:30-31, :60, :72, :87; viewer/index.html:333
  verified-by: []

- id: rule:suffix-resolution
  statement: A command argument resolves to the unique id that equals it, ends with ":<arg>" or ends with ".<arg>" (case-insensitive); zero matches is "unknown node", more than one is "ambiguous" listing them.
  source: lib/graph.js:19-23; bin/ctx.js:33
  verified-by: []

- id: rule:impact-closure
  statement: impact follows incoming structural edges outward for N hops (default 3) and, at hop 1 only, outgoing has/has-action edges so an entity's fields and a page's actions are included; the origin is removed from the result.
  source: lib/graph.js:55-68
  verified-by: [test:smoke#impact]

- id: rule:packet-ranking
  statement: seeds = top N search hits; rank(node) = min over seeds of (hops + seedIndex×0.1); nodes emitted in rank order, reqs first on ties, each rendered brief, stopping when the next block would exceed the character budget; files = union of source: paths of emitted nodes.
  source: lib/graph.js:69-84, :131-137
  verified-by: [test:smoke#packet]

- id: rule:search-scoring
  statement: score = Σ per term (id contains ×5, title contains ×3, body contains 1 + 0.5 per extra occurrence up to 3) × 1.5 for reqs × 0.5 for stubs; zero-score nodes are dropped.
  source: lib/graph.js:38-53
  verified-by: []
- id: rule:rule-needs-source
  statement: A defined rule node whose body has no `source:` line is an error.
  source: lib/graph.js:118
  verified-by: []

- id: rule:req-needs-satisfied-by
  statement: A defined req node with no satisfied-by (and no see) edge is an error unless its status is proposed or question.
  source: lib/graph.js:115
  verified-by: []

- id: rule:shipped-needs-test
  statement: A req with status shipped (or none) and no verified-by edge is a warning, or an error under flag:strict.
  source: lib/graph.js:116
  verified-by: []

- id: rule:source-path-resolves
  statement: Every path-like token in a node's source/sources/file/component/vm/verified-against lines (split on ; or ,) must exist under one of the module's source-roots, relative to --repo; otherwise a warning, or an error under flag:strict. Tokens without a file extension are ignored.
  source: lib/graph.js:119-125, :131-137
  verified-by: []

- id: rule:stub-severity
  statement: Referenced-but-undefined nodes are reported per kind; rule and req stubs are errors, every other kind a warning.
  source: lib/graph.js:106-111
  verified-by: []

- id: rule:check-exit-code
  statement: ctx check exits 0 when there are no errors and 1 otherwise, regardless of warnings.
  source: bin/ctx.js:92-98
  verified-by: []
- id: rule:cards-in-step
  statement: >
    Every `.ts`/`.tsx` file under packages/web/src (tests excluded) is named by a component, lib, op or page card
    — in `file:`, `source:` or `component:`, or through the route an op's `args:` or a page's `route:` maps to — and
    every path such a card names exists; `npm test` fails otherwise until `npm run cards` (lib:cards) or a hand-written
    card puts them back in step. Retired cards are exempt.
  source: scripts/cards.js#check; test/cards.js
  status: shipped
  verified-by: [test:cards]
  part-of: module:app-graph

```

<!-- /list:rule -->

## Libraries

<!-- list:lib -->

```yaml
- id: lib:core.parse
  file: lib/parse.js
  side: server
  purpose: >
    The parser: markdown → graph. Pass 1 reads type: cards (base ontology + product), pass 2 reads yaml cards, prose nodes, tables and blocks into nodes and edges; generates field, prop and block nodes and inverse edges.
  part-of: module:app-graph
- id: lib:core.graph
  file: lib/graph.js
  side: server
  purpose: >
    Query layer over graph.json: get, neighbors, search, impact, packet, render, stats and check (structural lint plus ontology validation).
  part-of: module:app-graph
- id: lib:core.ctx
  file: bin/ctx.js
  side: server
  purpose: >
    The ctx CLI: build, site, get, neighbors, search, impact, packet, check, stats, reqs — the offline way to read and lint a product graph.
  part-of: module:app-graph
- id: lib:cards
  file: scripts/cards.js
  side: server
  status: shipped
  purpose: >
    Keeps the component, lib, op and page cards in step with the files under packages/web/src
    (decision:app.cards-generator, decision:app.cards-file-kinds): `--check` lists the files no card names and the
    cards whose file is gone (exit 1 when either; test/cards.js runs it under npm test); `--write` adds a proposed
    card per uncovered file with the header comment as its purpose, re-points a card whose file moved, retires a
    card whose file was deleted, tightens an op card's `source:` to its route file. Never rewrites an existing
    card's purpose.
  part-of: module:app-graph
```

<!-- /list:lib -->

## Flags and gates

```yaml
- id: flag:verdicts
  scope: product            # `verdicts: on` in <product>/_product.md, or WF_VERDICTS=1 — the write-time verdict pass runs after every rebuild (decision:memory.write-time-verdict); off until decision:memory.benchmark says so
  source: packages/web/src/lib/verdicts.ts#verdictsEnabled
- id: flag:consolidate
  scope: product            # `consolidate: on` in _product.md, or WF_CONSOLIDATE=1 — a done session's transcript is consolidated into proposed blocks on its plan (decision:memory.consolidate-sessions)
  source: packages/web/src/lib/consolidate.ts#consolidateEnabled
- id: flag:judge-model
  scope: env                # WF_JUDGE_MODEL (default claude-haiku-4-5-20251001) — the model the judge and the consolidation call through `claude -p`; WF_JUDGE_CMD replaces the CLI with any command that reads the prompt on stdin
  source: lib/judge.js
- id: flag:strict
  scope: cli            # ctx check --strict
  source: bin/ctx.js:93
  description: turns "shipped requirement has no test" and "source path not found" from warnings into errors
- id: flag:source-roots
  scope: module file    # frontmatter list; source paths are tried under each root in order
  source: lib/parse.js:52-53
- id: gate:none
  statement: Waterfall has no authentication or authorization of its own. Access is file-system access to the repo; the published viewer inherits the Artifact's own sharing controls.
  applies-to: [op:ctx.build, op:ctx.check, page:viewer/reqs]
```
