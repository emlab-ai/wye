---
node: module:app-graph
type: module
title: Graph core and CLI
status: proposed
owner: unassigned
sources:
  - lib/parse.js
  - lib/graph.js
  - bin/wye-graph.js
part-of: module:app
order: 40
last-verified: 2026-09-20
---

# Graph core and CLI

Graph core and CLI

```yaml
- id: module:app-graph
  purpose: >
    The core that every view and every agent depends on: the parser that turns markdown into a graph (kinds open through the ontology, prose nodes, cards, blocks, generated fields, props and inverses), the query layer (search, neighbours, impact, packets), the lint (wye check) and the ctx CLI that runs them offline. It has no server dependency and is what CI runs.
```

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf.graph, req:wf.graph.fields, req:wf.graph.stable-ids, req:wf.graph.multi-module, req:wf.graph.stubs-visible, req:wf.query, req:wf.query.packet, req:wf.query.impact, req:wf.lint, req:ontology.types, req:ontology.inverses, req:ontology.check, req:ontology.blocks, req:wf2.cli. Rules the code enforces: rule:node-detection, rule:id-syntax, rule:edge-from-typed-key, rule:explicit-edge-syntax, rule:field-generation, rule:field-mentions-index, rule:stub-nodes, rule:section-headings-drive-grouping, rule:search-scoring, rule:packet-ranking, rule:impact-closure, rule:rule-needs-source, rule:req-needs-satisfied-by, rule:shipped-needs-test, rule:check-exit-code, rule:ontology.open-kinds, rule:ontology.narrow-only, rule:ontology.open-types, rule:ontology.inverse-generated, rule:ontology.block-id, rule:cli-fallback.


## Rules

<!-- list:rule -->

```yaml
- id: rule:init-shallow
  source: lib/init.js#init; lib/init.js#classify; lib/init.js#areasOf; lib/init.js#headerPurpose
  status: shipped
  verified-by: [test:init]
  title: >
    `wye init` is deterministic and shallow:
```

  - statement:init-shallow `wye init` is deterministic and shallow: it walks the repository (skipping node_modules, build output, data, public and docs folders), takes the workspaces (package.json / pnpm) or the top-level code folders as modules, classifies files by path — Next app routes and pages as `page:` cards, `app/api/**/route` and `bin/*` as `op:` cards, `components/*` as `component:` cards, test files as `test:` cards, the rest as `lib:` cards (one per folder when a module has more than sixty) — and uses each file's first comment block as the purpose, with ids inside it neutralised so they make no edges. Every page's source-roots is the repository root; `_product.md` records the repo. It never overwrites a page that exists, and a feature init embeds every id the product already defines.

```yaml
- id: rule:describe-contract
  source: bin/wye.js#deepen; prompts/describe-module.md
  status: shipped
  title: >
    `wye deepen <module>` assigns `task:<project>.describe.<module>` to a worker (op:api.work.assign) with prompts
```

  - statement:describe-contract `wye deepen <module>` assigns `task:<project>.describe.<module>` to a worker (op:api.work.assign) with prompts/describe-module.md as the note: purpose on the module card; requirements as observable behaviours in the person's words on the module's requirements page; each satisfied by the lib / component / op cards that deliver it, whose purpose says what that code does and whose file (with #symbol) is the link; tests as verified-by; rules with `source: file#symbol`; entities and states; questions and drift instead of guesses; no wider than the module; wye check green and the task done before the summary.

```yaml
- id: rule:node-detection
  source: lib/parse.js:60-70, :118-121, :122-149
  verified-by: [test:smoke#reqs-parsed, test:smoke#rules-parsed]
  title: A node is created from (a) `id:

```

  - statement:node-detection A node is created from (a) `id: kind:slug` or `- id: kind:slug` inside a ```yaml block, split on `---` lines; (b) any id in a `### ` heading; (c) a table row whose first cell contains an id, unless the header row matches op|id|test node|enum|#|edge|policy|option|your req|test|tool; (d) a numbered row of a section whose heading contains "drift" or "contradiction".

```yaml
- id: rule:id-syntax
  source: lib/parse.js:10, :21-27
  verified-by: []
  title: An id is kind:slug where kind ∈ value:node-kind and slug matches [A-Za-z0-9_][A-Za-z0-9_./#-]*.

```

  - statement:id-syntax An id is kind:slug where kind ∈ value:node-kind and slug matches [A-Za-z0-9_][A-Za-z0-9_./#-]*. Trailing .,;:)] are stripped; a|b keeps a; test ids drop #Method; setting: is aliased to flag:.

```yaml
- id: rule:edge-from-typed-key
  source: lib/parse.js:11-17, :79-104
  verified-by: [test:smoke#typed-edges]
  title: >
    Inside a node body the current yaml key decides the verb — refines, satisfied-by, verified-by, governed-by, ga

```

  - statement:edge-from-typed-key Inside a node body the current yaml key decides the verb — refines, satisfied-by, verified-by, governed-by, gated-by, reads, writes, calls, contradicts, owner→owned-by, owns, embedded-in, set-by, applies-to, governs, see, resolves, submodules→has, depends-on, adds, changes, requires-tests→verified-by; under `actions:` an op becomes calls and a page becomes navigates; any other key yields mentions.

```yaml
- id: rule:explicit-edge-syntax
  source: lib/parse.js:82-83, :150-151
  verified-by: []
  title: >
    A line `a -(verb)-> b` anywhere (inside a node body or as a top-level bullet) is an edge with that verb, and i

```

  - statement:explicit-edge-syntax A line `a -(verb)-> b` anywhere (inside a node body or as a top-level bullet) is an edge with that verb, and is not also scanned for mentions.

```yaml
- id: rule:inline-action-definition
  source: lib/parse.js:86-96
  verified-by: []
  title: Under a page's `actions:` (or `always:`/`sections:`) key, a line `- action:<slug>:

```

  - statement:inline-action-definition Under a page's `actions:` (or `always:`/`sections:`) key, a line `- action:<slug>: description … -(verb)-> id` defines the action node (title = description, body on:/does:), adds has-action from the page, and one edge per `-(verb)->` in the line.

  - note:inline-action-definition actions written as an inline array `actions: [action:<a>, action:<b>]` are NOT defined — they become stubs (inventory drift: 20 hollow actions)

```yaml
- id: rule:field-generation
  source: lib/parse.js:157-183
  verified-by: [test:smoke#fields-generated]
  title: For every entity:

```

  - statement:field-generation For every entity: or value: node, each line under fields:, computed…: or shape: becomes field:<entity>.<name>; comma/slash-separated names on one line each become a field; `?` and `= default` are stripped; type is the right-hand side and note the trailing # comment; an id in the type yields typed-as (entity/value/flag/state) or mentions.

```yaml
- id: rule:field-mentions-index
  source: lib/parse.js:184-196
  verified-by: [test:smoke#field-mentions]
  title: >
    Every non-field node whose body contains a field name as a whole word, camelCase or PascalCase, gets a mention

```

  - statement:field-mentions-index Every non-field node whose body contains a field name as a whole word, camelCase or PascalCase, gets a mentions edge to that field; names shorter than 5 characters or in value:field-stop-list are never indexed.

```yaml
- id: rule:ambiguous-field-names
  source: lib/parse.js:193, :202
  verified-by: []
  title: >
    When the same field name exists on several entities, a mention links only to owners the mentioning node alread

```

  - statement:ambiguous-field-names When the same field name exists on several entities, a mention links only to owners the mentioning node already references by id; otherwise nothing is linked. Only unambiguous names enter fieldIndex for the viewer.

```yaml
- id: rule:drift-table-parsed
  source: lib/parse.js:123-130
  verified-by: []
  title: >
    Under a section whose heading contains "drift" or "contradiction", every row with a numeric first cell becomes

```

  - statement:drift-table-parsed Under a section whose heading contains "drift" or "contradiction", every row with a numeric first cell becomes drift:<module>.<n> (status drift, body a/b/what/where) with contradicts edges to every id in columns a and b.

```yaml
- id: rule:stub-nodes
  source: lib/parse.js:197-201
  verified-by: []
  title: Every edge endpoint is materialised;

```

  - statement:stub-nodes Every edge endpoint is materialised; a node never described has defined=false and a title equal to its slug.

```yaml
- id: rule:section-headings-drive-grouping
  source: lib/parse.js:117-118, :123, :132-134; viewer/index.html:262
  verified-by: []
  title: The nearest ## heading is a node's section and the nearest ### its subsection;

```

  - statement:section-headings-drive-grouping The nearest ## heading is a node's section and the nearest ### its subsection; the viewer groups requirements by subsection and the parser detects drift/op/enum/test tables by section or first-cell kind, so the template's heading text is load-bearing.

  - note:section-headings-drive-grouping undocumented in schema/kinds.yaml (drift row 6)

```yaml
- id: rule:inventory-gate-shorthand
  source: lib/parse.js:141-148
  verified-by: []
  contradicts: [drift:wye.4]
  title: >
    In an op table, the gate cell's words View / Manage / Record map to inventory's permission gate ids (view-inve
```

  - statement:inventory-gate-shorthand In an op table, the gate cell's words View / Manage / Record map to inventory's permission gate ids (view-inventory, manage-inventory, record-inventory-ops) and ", F" to the module's feature gate, only if those gate ids exist in the graph.

```yaml
- id: rule:structural-vs-mentions
  source: lib/parse.js:18; lib/graph.js:30-31, :60, :72, :87; viewer/index.html:333
  verified-by: []
  title: >
    mentions edges are weak — hidden by default in the viewer (except Everything/focus), excluded from --structura

```

  - statement:structural-vs-mentions mentions edges are weak — hidden by default in the viewer (except Everything/focus), excluded from --structural neighbourhoods, from impact and from packet ranking, and omitted from brief renders.

```yaml
- id: rule:suffix-resolution
  source: lib/graph.js:19-23; bin/wye-graph.js:33
  verified-by: []
  title: >
    A command argument resolves to the unique id that equals it, ends with ":<arg>" or ends with ".<arg>" (case-in

```

  - statement:suffix-resolution A command argument resolves to the unique id that equals it, ends with ":<arg>" or ends with ".<arg>" (case-insensitive); zero matches is "unknown node", more than one is "ambiguous" listing them.

```yaml
- id: rule:impact-closure
  source: lib/graph.js:55-68
  verified-by: [test:smoke#impact]
  title: >
    impact follows incoming structural edges outward for N hops (default 3) and, at hop 1 only, outgoing has/has-a

```

  - statement:impact-closure impact follows incoming structural edges outward for N hops (default 3) and, at hop 1 only, outgoing has/has-action edges so an entity's fields and a page's actions are included; the origin is removed from the result.

```yaml
- id: rule:packet-ranking
  source: lib/graph.js:69-84, :131-137
  verified-by: [test:smoke#packet]
  title: seeds = top N search hits;

```

  - statement:packet-ranking seeds = top N search hits; rank(node) = min over seeds of (hops + seedIndex×0.1); nodes emitted in rank order, reqs first on ties, each rendered brief, stopping when the next block would exceed the character budget; files = union of source: paths of emitted nodes.

```yaml
- id: rule:search-scoring
  source: lib/graph.js:38-53
  verified-by: []
  title: >
    score = Σ per term (id contains ×5, title contains ×3, body contains 1 + 0.5 per extra occurrence up to 3) × 1
```

  - statement:search-scoring score = Σ per term (id contains ×5, title contains ×3, body contains 1 + 0.5 per extra occurrence up to 3) × 1.5 for reqs × 0.5 for stubs; zero-score nodes are dropped.

```yaml
- id: rule:rule-needs-source
  source: lib/graph.js:118
  verified-by: []
  title: A defined rule node whose body has no `source:` line is an error.

```

  - statement:rule-needs-source A defined rule node whose body has no `source:` line is an error.

```yaml
- id: rule:req-needs-satisfied-by
  source: lib/graph.js:115
  verified-by: []
  title: >
    A defined req node with no satisfied-by (and no see) edge is an error unless its status is proposed or questio

```

  - statement:req-needs-satisfied-by A defined req node with no satisfied-by (and no see) edge is an error unless its status is proposed or question.

```yaml
- id: rule:shipped-needs-test
  source: lib/graph.js:116
  verified-by: []
  title: >
    A req with status shipped (or none) and no verified-by edge is a warning, or an error under flag:strict.

```

  - statement:shipped-needs-test A req with status shipped (or none) and no verified-by edge is a warning, or an error under flag:strict.

```yaml
- id: rule:source-path-resolves
  source: lib/graph.js:119-125, :131-137
  verified-by: []
  title: >
    Every path-like token in a node's source/sources/file/component/vm/verified-against lines (split on ;

```

  - statement:source-path-resolves Every path-like token in a node's source/sources/file/component/vm/verified-against lines (split on ; or ,) must exist under one of the module's source-roots, relative to --repo; otherwise a warning, or an error under flag:strict. Tokens without a file extension are ignored.

```yaml
- id: rule:stub-severity
  source: lib/graph.js:106-111
  verified-by: []
  title: Referenced-but-undefined nodes are reported per kind;

```

  - statement:stub-severity Referenced-but-undefined nodes are reported per kind; rule and req stubs are errors, every other kind a warning.

```yaml
- id: rule:check-exit-code
  source: bin/wye-graph.js:92-98
  verified-by: []
  title: wye check exits 0 when there are no errors and 1 otherwise, regardless of warnings.
```

  - statement:check-exit-code wye check exits 0 when there are no errors and 1 otherwise, regardless of warnings.

```yaml
- id: rule:cards-in-step
  source: scripts/cards.js#check; test/cards.js
  status: shipped
  verified-by: [test:cards]
  part-of: module:app-graph
  title: >
    Every `.ts`/`.tsx` file under packages/web/src (tests excluded) is named by a component, lib, op or page card

```

  - statement:cards-in-step Every `.ts`/`.tsx` file under packages/web/src (tests excluded) is named by a component, lib, op or page card — in `file:`, `source:` or `component:`, or through the route an op's `args:` or a page's `route:` maps to — and every path such a card names exists; `npm test` fails otherwise until `npm run cards` (lib:cards) or a hand-written card puts them back in step. Retired cards are exempt.

<!-- /list:rule -->

## Libraries

<!-- list:lib -->

```yaml
- id: lib:init
  file: lib/init.js
  side: server
  purpose: >
    The scan and the writer behind `wye init` (rule:init-shallow): walk, areasOf, classify, headerPurpose, init —
    tested by test:init on this repository.
  part-of: module:app-graph
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
  file: bin/wye-graph.js
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
  scope: cli            # wye check --strict
  source: bin/wye-graph.js:93
  description: turns "shipped requirement has no test" and "source path not found" from warnings into errors
- id: flag:source-roots
  scope: module file    # frontmatter list; source paths are tried under each root in order
  source: lib/parse.js:52-53
- id: gate:none
  statement: Waterfall has no authentication or authorization of its own. Access is file-system access to the repo; the published viewer inherits the Artifact's own sharing controls.
  applies-to: [op:ctx.build, op:ctx.check, page:viewer/reqs]
```

## Operations

<!-- list:op -->

```yaml
- id: op:cli.wye-init
  args: wye init --product <slug> --repo <dir> [--title …] [--project main] [--feature <name> --path <dir>] [--icon] [--description]
  does: a product's or a feature's definition from its code, shallow, with the describe tasks (rule:init-shallow)
  gate: none
  source: bin/wye.js#init
  part-of: module:app-graph
- id: op:cli.wye-deepen
  args: wye deepen <module> --product p [--worker claude-code|codex|runner] [--project main] [--force]
  does: assigns the module's describe task with the describe contract (rule:describe-contract)
  gate: none
  source: bin/wye.js#deepen
  part-of: module:app-graph
```

<!-- /list:op -->


## Decisions

```yaml
- id: decision:map.page-owns-its-nodes
  title: A mind map is a document whose own blocks are its nodes, and the canvas is a second editor for it
  date: 2026-09-24
  status: proposed
  affects: [type:map, lib:map, component:map-canvas, op:api.map]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - context:map.page-owns-its-nodes alex asked for "new type of the page, like mind map — add new nodes, then add child blocks and form graph, click a relationship to set its type, click a node to see its context, hover next to a node for an add-link button". The graph page already draws the product as editable cards (component:graph-view, lib:layout, React Flow) but it is a view over a preset and a focus: it can neither create a node nor draw an edge, and a new node has no home document.

  - choice:map.page-owns-its-nodes A page of type:map. The nodes created on it are blocks in that document — same ids, same cards, same review, same check — so a map says exactly what its markdown says and nothing more, and the same file opens in the ordinary editor. A node defined elsewhere can be shown on the map as a reference: the map keeps its position and never its content, and removing it takes the position, not the node.

  - alternative:map.page-owns-its-nodes A saved view over the product graph (a focus, a filter and an arrangement) — rejected: nothing could be authored on it without first choosing a home document for each node. Making the existing graph page editable — rejected for the same reason, and it has no map of your own to keep. A map as a block inside any document, like a view block — not now, and the natural next step: a canvas inside a text editor fights it for space and drag events.

```yaml
- id: decision:map.children-are-linked-nodes
  title: A child on the map is a linked node of its own, not content inside the card
  date: 2026-09-24
  status: proposed
  affects: [component:map-canvas]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.children-are-linked-nodes The hover affordance beside a node makes another node on the canvas, joined by an edge — the mind-map gesture. In the markdown it is another block in the same document with `part-of` the parent, and the verb can be changed on the edge afterwards. A node's own content (its when / then lines, its prose) is still edited inside the card, which is the EmbeddedCard the graph page already uses.

```yaml
- id: decision:map.verbs-from-the-ontology
  title: An edge's type comes from the verbs the ontology declares for the two kinds, and anything else may still be typed
  date: 2026-09-24
  status: proposed
  affects: [lib:map, component:map-canvas]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.verbs-from-the-ontology Clicking an edge offers the verbs that make sense between those kinds — a req offers satisfied-by, verified-by, refines; a decision offers supersedes, affects — read from the type cards, which already declare every verb and its inverse. Anything else can be typed and becomes an ordinary verb. So a map's links are the product's links: the inverses are generated, and impact and the constraint packets see them as structural.

  - alternative:map.verbs-from-the-ontology Free text only — rejected: satisfies / satisfied by / satisfied-by drift apart and the graph stops treating those links as structural. A fixed mind-map list (part-of, refines, related-to) — rejected: what you draw on a map would be weaker than what the same nodes say in a document.

```yaml
- id: decision:map.layout-is-a-fenced-section
  title: Node positions live in a fenced Layout section of the map, and moving a node writes nothing to the knowledge
  date: 2026-09-24
  status: proposed
  affects: [type:map, lib:map, op:api.map]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.layout-is-a-fenced-section A Layout section holding a fenced block, one line per node — the id, its x and y, and `ref` for a node that lives elsewhere. Fenced, because an id inside a fence creates no node and no edge (measured), so the arrangement is invisible to the graph; and in one place on the map, because a reference's position cannot be written on a card in another document. Dragging never touches the server: the canvas holds positions in memory and writes the whole block once on drop, debounced and coalesced, with the write marked silent (as impact-run and the verdict pass mark theirs) so arranging a map leaves no change record, no attribution and no verdict pass. Rearranging is not knowledge.

  - consequence:map.layout-is-a-fenced-section Measured on this product (7.2k nodes, 114 files) before the design was fixed: a node property write is 10 to 40 ms and a content write with its rebuild and check 30 to 43 ms, so every gesture but the drag can be one server call and still feel instant.

```yaml
- id: decision:map.drawn-before-named
  title: A link drawn between two nodes says related-to until it is named
  date: 2026-09-24
  status: proposed
  affects: [component:map-canvas, op:api.map]
  by: claude
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.drawn-before-named Dragging from one node to another writes the link at once with the verb `related-to`, and the verb popup opens on it straight away. Drawing and naming are one gesture in two beats, so a map can be sketched at the speed of thinking and named afterwards.

  - alternative:map.drawn-before-named Taking the ontology's first verb for that pair — tried and rejected the same hour: a req dragged to a decision came out as `supersedes`, which is a claim nobody made. Asking for the verb before writing anything — rejected: it stops the hand mid-gesture, and a link that is not yet written cannot be seen.

```yaml
- id: decision:map.a-drawn-node-is-proposed
  title: A node drawn on a canvas is proposed knowledge, not settled knowledge
  date: 2026-09-24
  status: proposed
  affects: [op:api.map]
  by: claude
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.a-drawn-node-is-proposed A node the canvas creates is written `status: proposed` when the type's statuses allow it. A sketch on a map is a proposal, whoever draws it, and it reaches the Inbox the way every other proposal does.

  - consequence:map.a-drawn-node-is-proposed It also keeps the check quiet: a req with no status is shipped to the ontology, so three nodes sketched in a minute were three errors ("requirement has no satisfied-by") until this.

```yaml
- id: decision:map.delete-tidies-this-page-only
  title: Deleting a node takes the links this page carries to it, and leaves the rest of the product alone
  date: 2026-09-24
  status: proposed
  affects: [op:api.map, lib:map]
  by: claude
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.delete-tidies-this-page-only Deleting a node on a map removes its card and every `verb: <id>` the same document carried to it, so the page it leaves behind is whole. Links from other pages stay and become references to a node that is gone — exactly what happens when a page is deleted, and what the check reports.

  - alternative:map.delete-tidies-this-page-only Rewriting every reference across the product, the way a retype does — rejected: a retype keeps the knowledge and only renames it, while a delete throws it away, and a gesture on a canvas must not quietly edit pages you are not looking at.

```yaml
- id: decision:map.canvas-is-the-page
  title: A map page is the canvas and nothing else — full frame, no properties, no comments, no page below it
  date: 2026-09-24
  status: proposed
  affects: [page:web/document, component:map-canvas]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - context:map.canvas-is-the-page The first build put the canvas where a document's content goes: under the title, the properties and the Comments box, in the 900-pixel reading column, at a fixed height. Alex, seeing it: "mind map page must be full screen, no comments panel, no page header", and then "remove this fuckin margins, it must be full size central pannel".

  - choice:map.canvas-is-the-page A map page renders the canvas alone, filling the frame under the top bar. Its toolbar carries one toggle, "Page text", which brings the ordinary editor over the canvas when the page's prose or front matter needs editing. The properties, the comments and the links a document shows are all on the node the Context panel holds, which is where a map's knowledge is read anyway.

```yaml
- id: decision:map.selection-goes-to-the-context-panel
  title: Clicking a node on the canvas selects it in the app's Context panel, not in a card of the canvas's own
  date: 2026-09-24
  status: proposed
  affects: [component:map-canvas]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.selection-goes-to-the-context-panel A click on a node is the same selection a click on a block makes (rule:block-select): the right-hand Context panel shows the node's card, its comments, its content and its links. The canvas floats nothing over itself. Alex, on the panel the first build grew: "we already have context panel on right, no need to show this as additional node". Removing a node moved to a right click, where a canvas expects it.

```yaml
- id: decision:map.links-take-the-nearest-sides
  title: A link leaves each card by the side that faces the other, not by a fixed pair of handles
  date: 2026-09-24
  status: proposed
  affects: [lib:floating, component:map-canvas]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.links-take-the-nearest-sides Every edge is a floating edge: the ends are computed from the two boxes — the point where the line joining their centres leaves each — so a child below its parent is joined bottom to top and one to the left, left to right. Each card carries a handle on all four sides for drawing, and the drawn edge ignores which one was used.

  - alternative:map.links-take-the-nearest-sides The one source handle on the right and one target handle on the left that React Flow gives by default — rejected on sight: "make connection going from the closes side to closest side, not shite like now". A node dragged above its parent had its link sweep all the way round the card.

```yaml
- id: decision:map.a-node-opens-into-its-card
  title: A node on the canvas opens into the very card the editor shows, and the map remembers which are open
  date: 2026-09-24
  status: proposed
  affects: [component:map-canvas, lib:map, op:api.map]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.a-node-opens-into-its-card A circle on a node's bottom edge, half out of the card, opens it into the EmbeddedCard the document editor and the graph page already use — every field editable in place, its "from" line the drag grip — and closes it back to the title. Which nodes are open is written beside their positions in the `## Layout` section as an `open` flag, on the same silent write a drag uses, so a map opens as it was left and the graph never sees it.

  - alternative:map.a-node-opens-into-its-card Keeping the card only in the Context panel — rejected by Alex, who asked for it on the node itself: comparing two nodes' contents means seeing both at once, which a single panel cannot do. Holding the open set in the browser — rejected: it is part of how the map reads, so it belongs with the positions, which the page already keeps.

```yaml
- id: decision:map.tidy-arranges-the-whole-map
  title: Tidy re-arranges a map with the graph's own layout, and a whole ranks before its parts
  date: 2026-09-24
  status: proposed
  affects: [component:map-canvas, lib:layout]
  by: alex
  evidence: [session:01CSgdACao6iVNLY8peMSUGK]
  part-of: module:app-graph
```

  - choice:map.tidy-arranges-the-whole-map A Tidy button runs the same dagre pass the graph page uses (lib:layout), at each node's measured size, and writes every position through the ordinary silent layout write — so a map grown by hand can be straightened in one click and nothing but the arrangement changes. For ranking, `part-of` is read backwards, because it points from the part to the whole: the whole sits to the left of what belongs to it, which is how a mind map is read.

  - consequence:map.tidy-arranges-the-whole-map Nodes also grew: 14px text, a 42-pixel-tall card and a rounder frame, and a link now stops seven pixels short of the card it points at, so an arrowhead sits beside the border instead of on it.
