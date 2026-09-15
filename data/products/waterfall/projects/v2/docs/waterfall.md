---
node: module:waterfall
type: module
title: Waterfall
status: partial
owner: alex
last-verified: 2026-09-14
verified-against: ~/Projects/waterfall (uncommitted, 0.1.0)
source-roots: [., lib, bin, viewer, skills, test, schema, templates, skills/waterfall-context, skills/waterfall-describe-module]
sources:
  - README.md
  - schema/kinds.yaml
  - the design discussion of 2026-09-13 (read/write contract, delta pipeline, status lifecycle, code markers) — recorded here as proposed requirements
  - docs/context-graph/inventory.md in YesSensei/POS — the pilot that shaped every parser rule
---

# Waterfall — product context graph (self-description)

Waterfall is developed through its own pipeline. This file is the product's memory: what it does today
(`shipped`, with the test that proves it), what it does without proof (`unverified`), and what it is meant to become
(`proposed`). Node kinds, verbs and statuses are in `schema/kinds.yaml`.

---

## 0. module:waterfall

```yaml
id: module:waterfall
purpose: >
  Let a team describe a software product completely without code — requirements, entities, rules, operations,
  screens, gates, tests — as markdown that is also a graph; let coding agents read that graph as external memory
  and write to it before they write code; lint it so it cannot silently drift from the code it describes; and
  let a human browse it from a phone.
submodules:
  - parser        # lib/parse.js — markdown → nodes + typed edges + generated fields
  - query         # lib/graph.js — get / neighbors / search / impact / packet
  - lint          # lib/graph.js#check — the rules that make the graph a contract
  - cli           # bin/ctx.js
  - viewer        # viewer/index.html — Reqs · Graph · Read, node sheet
  - skills        # skills/* — how agents use the system (Claude Code)
  - schema        # schema/kinds.yaml, templates/*
scoping: one graph per repository at docs/context-graph/; one file per module; ids are global within a graph
edges:
  - module:waterfall -(edge-to)-> module:claude-code       # skills, Agent tool for explorers, Artifact tool for publishing
  - module:waterfall -(edge-to)-> module:git               # the graph lives in the repo and is reviewed in PRs
  - module:waterfall -(edge-to)-> module:yessensei-pos     # first consumer; its inventory.md is the pilot and the smoke-test fixture
```

---

## R. Requirements (behaviour)

### Flags referenced by requirements

```yaml
- id: flag:strict
  scope: cli            # ctx check --strict
  source: bin/ctx.js:93
  description: turns "shipped requirement has no test" and "source path not found" from warnings into errors
- id: flag:source-roots
  scope: module file    # frontmatter list; source paths are tried under each root in order
  source: lib/parse.js:52-53
```

### R.1 Describe a module without code

```yaml
- id: req:wf.describe
  title: A module can be described completely without code
  when: someone (usually an agent following skill:waterfall-describe-module) writes docs/context-graph/<module>.md from the template
  then: the file captures requirements, entities with fields, value objects, state machines, operations, pages with actions, rules with sources, gates, tests, drift and open questions, using stable kind:slug ids and typed edges
  status: shipped
  satisfied-by: [entity:module-doc, value:node-kind, value:edge-verb, page:skill/describe-module]
  verified-by: [test:smoke#reqs-parsed, test:smoke#rules-parsed]
  note: the pilot (inventory, YesSensei/POS) is the proof — 60 reqs, 54 rules, 45 ops, 13 pages, 17 drift rows

- id: req:wf.describe.reqs-first
  title: Requirements are the root of everything
  when: a module file is linted
  then: every requirement that is not proposed or a question must point at the mechanism that delivers it (satisfied-by); a requirement with nothing under it is an error
  status: shipped
  satisfied-by: [rule:req-needs-satisfied-by, op:ctx.check]
  verified-by: []          # smoke only checks the ok path
  refines: req:wf.describe

- id: req:wf.describe.sources
  title: A rule without a source is a wish
  when: a rule node has no `source:` line
  then: ctx check reports an error and exits 1
  status: shipped
  satisfied-by: [rule:rule-needs-source, op:ctx.check]
  verified-by: []          # UNVERIFIED — no negative test
  refines: req:wf.describe

- id: req:wf.describe.honest-status
  title: Shipped means proven
  when: a requirement is marked shipped without a verified-by edge
  then: it is a warning by default and an error under flag:strict; the viewer and `ctx reqs` show it as untested (◐)
  status: shipped
  satisfied-by: [rule:shipped-needs-test, op:ctx.check, op:ctx.reqs, page:viewer/reqs]
  verified-by: []
  refines: req:wf.describe

- id: req:wf.describe.drift
  title: Contradictions are recorded, not hidden
  when: the author finds two sources that disagree (PRD vs code, server vs client, doc vs test)
  then: a row in the Drift table becomes a drift node with contradicts edges to both sides; ctx check counts them; the viewer has a Drift preset
  status: shipped
  satisfied-by: [entity:drift-row, rule:drift-table-parsed, page:viewer/graph]
  verified-by: []
  refines: req:wf.describe

- id: req:wf.describe.no-invention
  title: Silence in the code becomes a question, never a guess
  when: the author cannot find a behaviour in code or tests
  then: the requirement gets status proposed or question, and §11 records the question
  status: shipped          # as a rule in the skill; not machine-enforced
  satisfied-by: [page:skill/describe-module, value:req-status]
  verified-by: []
  refines: req:wf.describe
  note: nothing stops an author writing shipped without evidence except flag:strict on the test edge
```

### R.2 Markdown is a graph

```yaml
- id: req:wf.graph
  title: The markdown parses into a graph without a schema step
  when: ctx build runs over docs/context-graph/*.md
  then: every `id: kind:slug` in a yaml block, every `### kind:slug` heading, every table row whose first cell is an id, and every Drift row becomes a node; typed keys and `a -(verb)-> b` lines become edges; the result is _build/graph.json plus data.js for the viewer
  status: shipped
  satisfied-by: [entity:node, entity:edge, entity:graph, op:ctx.build, rule:node-detection, rule:edge-from-typed-key, rule:explicit-edge-syntax]
  verified-by: [test:smoke#typed-edges, test:smoke#req-title-status, test:smoke#refines-edge]

- id: req:wf.graph.fields
  title: Every field is a node and knows where it is mentioned
  when: an entity or value node has a fields/computed/shape block
  then: each field becomes field:<entity>.<name> with a has edge from its owner and a typed-as edge to its type; any other node whose text names the field (camel or Pascal case) gets a mentions edge to it
  unless: the name is shorter than 5 characters or in the stop list, or the same name exists on several entities and the mentioning node does not reference the owner
  status: shipped
  satisfied-by: [rule:field-generation, rule:field-mentions-index, rule:ambiguous-field-names]
  verified-by: [test:smoke#fields-generated, test:smoke#field-mentions]
  refines: req:wf.graph

- id: req:wf.graph.stable-ids
  title: Ids are stable slugs; hierarchy lives in the id
  when: a requirement refines another
  then: its id is a dotted path under the parent (req:<mod>.sale.shortfall.oversell) and a refines edge is written; other kinds use kebab slugs
  status: shipped
  satisfied-by: [value:node-kind, rule:id-syntax]
  verified-by: [test:smoke#refines-edge]
  refines: req:wf.graph

- id: req:wf.graph.multi-module
  title: Several module files form one graph
  when: docs/context-graph contains more than one .md file
  then: they are parsed into one node set; cross-module references resolve; each module's source-roots apply to its own nodes; drift ids are namespaced per module
  status: unverified
  satisfied-by: [op:ctx.build, rule:drift-table-parsed, flag:source-roots]
  refines: req:wf.graph

- id: req:wf.graph.stubs-visible
  title: A referenced-but-undescribed node is visible, not silently created
  when: an edge points at an id that no file describes
  then: the node exists with defined=false, renders hollow in the viewer, prints "(referenced only)" in the CLI, and ctx check lists it (error for rule/req, warning otherwise)
  status: shipped
  satisfied-by: [rule:stub-nodes, page:viewer/graph, op:ctx.check]
  verified-by: []
  refines: req:wf.graph
```

### R.3 Agents query, they do not browse

```yaml
- id: req:wf.query
  title: An agent asks for a slice instead of reading the files
  when: an agent needs product context for a task
  then: it runs ctx get / neighbors / search / impact / packet and receives markdown sized to the question, with node ids it can cite
  status: shipped
  satisfied-by: [op:ctx.get, op:ctx.neighbors, op:ctx.search, op:ctx.impact, op:ctx.packet, page:skill/context]
  verified-by: [test:smoke#impact, test:smoke#packet]

- id: req:wf.query.packet
  title: A packet is working memory for one task, within a budget
  when: ctx packet --task "<sentence>" --budget N
  then: the top search hits seed a two-hop structural neighbourhood; nodes are emitted nearest-first until N characters; requirements sort first at equal distance; the packet ends with the code files those nodes cite
  status: shipped
  satisfied-by: [op:ctx.packet, rule:packet-ranking]
  verified-by: [test:smoke#packet]
  refines: req:wf.query
  note: only nodes with a source: key contribute files, so a packet of requirements alone cites nothing (drift row 9)

- id: req:wf.query.impact
  title: Before changing a node you can see what depends on it
  when: ctx impact <id>
  then: every node reachable by following incoming structural edges up to 3 hops is listed, grouped by kind with hop distance; an entity's fields and a page's actions count as part of it
  status: shipped
  satisfied-by: [op:ctx.impact, rule:impact-closure]
  verified-by: [test:smoke#impact]
  refines: req:wf.query

- id: req:wf.query.suffix
  title: Short names resolve
  when: a command is given a bare slug or suffix (ctx get oversell)
  then: it resolves when exactly one id ends with :suffix or .suffix, and refuses with the candidates when ambiguous
  status: unverified
  satisfied-by: [rule:suffix-resolution]
  refines: req:wf.query

- id: req:wf.query.reqs-tree
  title: The requirement tree is one command away
  when: ctx reqs [--status s]
  then: requirements print as an indented tree with a status glyph — ● shipped and tested, ◐ shipped without test or unverified/api-only, ○ proposed, ? question
  status: unverified
  satisfied-by: [op:ctx.reqs]
  refines: req:wf.query
```

### R.4 The graph is a contract

```yaml
- id: req:wf.lint
  title: The graph cannot silently drift from the code
  when: ctx check runs (locally or in CI)
  then: it reports errors (rule without source, req without satisfied-by, referenced-but-undefined rule/req ids) and warnings (untested shipped reqs, other stubs, unresolvable source paths, contradiction count) and exits 1 on any error
  status: shipped
  satisfied-by: [op:ctx.check, rule:rule-needs-source, rule:req-needs-satisfied-by, rule:shipped-needs-test, rule:source-path-resolves, rule:stub-nodes]
  verified-by: [test:smoke#check-ok]
  note: smoke proves the green path on the pilot only; no test asserts any red path

- id: req:wf.lint.source-roots
  title: Source paths resolve relative to where the module lives
  when: a node cites `source: Items/Queries.cs:47`
  then: the path is tried under each entry of the module's source-roots frontmatter, in order, before being reported missing
  status: shipped
  satisfied-by: [flag:source-roots, rule:source-path-resolves]
  verified-by: []
  refines: req:wf.lint

- id: req:wf.lint.ci
  title: A PR that breaks the graph fails CI
  when: a pull request changes docs/context-graph or code cited by it
  then: ctx build && ctx check --strict runs in CI and blocks the merge on errors
  status: proposed
  refines: req:wf.lint

- id: req:wf.lint.symbols
  title: Sources can point at symbols, not lines
  when: a source is written as path#Symbol
  then: check verifies the symbol still exists in that file (grep), so line-number rot stops mattering
  status: proposed
  refines: req:wf.lint

- id: req:wf.lint.constraints
  title: House rules are graph queries
  when: a constraint is written in _schema/constraints.yaml (e.g. "every op in module X has a gated-by edge", "any node touching money links the money-is-pence rule")
  then: ctx check evaluates it and reports violations like any other rule
  status: proposed
  refines: req:wf.lint

- id: req:wf.lint.semantic-drift
  title: Two rules that say different things about the same behaviour are flagged
  when: a new rule's statement overlaps an existing rule in its two-hop neighbourhood
  then: check asks an LLM pass to classify it as refines / contradicts / duplicate and requires the edge to be written
  status: proposed
  refines: req:wf.lint
```

### R.5 Describe before you build (the control pipeline)

```yaml
- id: req:wf.pipeline
  title: A feature enters the graph before it enters the code
  when: someone wants new behaviour
  then: they write a delta — new or refined req nodes with status proposed plus the ops/rules/actions they intend — and it is reviewed and approved as its own change before implementation starts
  status: proposed
  satisfied-by: [entity:delta, page:skill/context]
  note: templates/delta.yaml and the skill describe the flow; nothing parses _deltas/ or enforces the order (drift row 3)

- id: req:wf.pipeline.status
  title: Node status is the state machine that gates work
  when: a node moves proposed → approved → shipped (or deprecated)
  then: ctx check enforces the transitions — approved needs a reviewer, shipped needs real sources and verified-by, deprecated needs a replacement or a resolves edge
  status: proposed
  satisfied-by: [state:node-lifecycle]
  refines: req:wf.pipeline

- id: req:wf.pipeline.packet-scope
  title: An implementation touches only what its packet cites
  when: an agent implements an approved delta
  then: it starts from ctx packet --delta <id>, edits files cited by the packet plus new files, and a Claude Code hook warns on edits to a described module with no approved delta touching it
  status: proposed
  refines: req:wf.pipeline

- id: req:wf.pipeline.done
  title: Done means the graph agrees with the code
  when: the implementation PR is opened
  then: every touched req is shipped with real file:line or file#Symbol sources and verified-by naming tests that exist and pass; ctx check --strict is green; the PR description lists node ids and resolved drift rows
  status: proposed
  satisfied-by: [page:skill/context, flag:strict]
  refines: req:wf.pipeline

- id: req:wf.pipeline.code-markers
  title: Code points back at the graph
  when: a function or test implements a rule
  then: a `// ctx: rule:<slug>` comment or a test trait names the rule, so check verifies both directions and impact can start from a file path
  status: proposed
  refines: req:wf.pipeline
```

### R.6 Browse from a phone

```yaml
- id: req:wf.view
  title: The whole graph is readable on a phone without a server
  when: ctx site builds index.html + data.js and the Artifact tool publishes them
  then: the page opens on a Reqs tree, offers a force-directed Graph and the rendered Read text, works at 400px width, renders in light and dark, and loads d3 and marked from cdnjs
  status: unverified          # no automated test; verified by eye on the pilot
  satisfied-by: [op:ctx.site, page:viewer/reqs, page:viewer/graph, page:viewer/read, page:viewer/node-sheet]

- id: req:wf.view.reqs
  title: Requirements land first, with their status at a glance
  when: the page opens
  then: six stat tiles (reqs, shipped, unverified/api-only, proposed, questions, drift) sit above the requirement tree grouped by capability; each row has a status dot; tapping opens the node sheet
  status: unverified
  satisfied-by: [page:viewer/reqs]
  refines: req:wf.view

- id: req:wf.view.graph
  title: The graph is explorable, not a hairball
  when: the Graph tab opens
  then: it starts on the Requirements preset (reqs + refines edges only); presets Mechanics, Data, Drift, Everything and per-kind chips change the visible set; search narrows to matches plus neighbours; hollow nodes are stubs; status rings mark non-shipped nodes; labels appear when zoomed or when fewer than 70 nodes show
  status: unverified
  satisfied-by: [page:viewer/graph, rule:graph-presets]
  refines: req:wf.view

- id: req:wf.view.sheet
  title: Tapping a node shows everything about it and everything around it
  when: a node is tapped anywhere (tree, graph, text link, neighbour chip)
  then: a bottom sheet shows kind and status pills, title, id, the yaml body with ids and field names linkified, then neighbours grouped by verb in both directions as tappable chips; Focus redraws the graph as the node's two-hop neighbourhood; Show in text scrolls the Read view to the node (or its owner for a field)
  status: unverified
  satisfied-by: [page:viewer/node-sheet]
  refines: req:wf.view

- id: req:wf.view.deep-link
  title: A node has a URL
  when: the hash carries view=… and n=<id>
  then: the page opens on that view with that node's sheet open, and updates the hash as the user navigates
  status: unverified
  satisfied-by: [page:viewer/node-sheet]
  refines: req:wf.view

- id: req:wf.view.fields
  title: Fields are tappable everywhere
  when: an unambiguous field name appears in the Read text or a node body
  then: it is a dashed link that opens the field node, whose sheet lists every node mentioning it
  status: unverified
  satisfied-by: [page:viewer/read, rule:field-mentions-index]
  refines: req:wf.view
```

### R.7 Repeatable by agents

```yaml
- id: req:wf.skills
  title: The process is a skill, not a memory
  when: a user says "describe module X" or starts feature work in a repo with a graph
  then: Claude Code loads waterfall-describe-module (the authoring process, with explorer prompts) or waterfall-context (the read/write contract) from ~/.claude/skills
  status: shipped
  satisfied-by: [page:skill/describe-module, page:skill/context, op:install]
  verified-by: []

- id: req:wf.skills.explorers
  title: Big modules are mapped by parallel explorers
  when: the describe skill runs on a real codebase
  then: two Explore agents (server, client) run in parallel from the reference prompts and return structured maps with file:line citations; the author spot-checks 3–5 claims before writing
  status: shipped            # process; proven on inventory
  satisfied-by: [page:skill/describe-module]
  verified-by: []
  refines: req:wf.skills

- id: req:wf.skills.mcp
  title: Any agent can query the graph, not only Claude Code
  when: an agent runtime without shell access needs the graph
  then: the same commands are available over MCP
  status: proposed
  refines: req:wf.skills

- id: req:wf.self
  title: Waterfall is developed through its own pipeline
  when: a change to waterfall is proposed
  then: it appears first as a req in this file, is approved, implemented, and flipped to shipped with a test
  status: proposed
  satisfied-by: [entity:module-doc]
  note: this file is the first step; nothing enforces the rest yet (req:wf.pipeline)
```

---

## 1. Entities

### entity:module-doc

```yaml
id: entity:module-doc
storage: docs/context-graph/<module>.md (git)
source: templates/module.md:1
description: The hand-written source of truth for one module. Frontmatter names the module node and its source-roots; the body is sections of yaml node blocks and tables.
fields:
  node:            module:<slug>            # frontmatter; the module node id
  title:           string
  status:          shipped | partial | proposed
  last-verified:   date
  verified-against: string                  # branch @ sha
  source-roots:    List<path>               # flag:source-roots
  sources:         List<string>             # what the author read
  sections:        R, 1..11                 # requirements, entities, values, states, ops, pages, rules, cross-module, gates, verification, drift, questions
edges:
  - entity:module-doc -(has)-> entity:node
  - entity:module-doc -(governed-by)-> rule:node-detection
  - entity:module-doc -(governed-by)-> rule:section-headings-drive-grouping
```

### entity:node

```yaml
id: entity:node
storage: _build/graph.json (generated)
source: lib/parse.js:37-40
description: One thing in the product. Identity is kind:slug. Everything the parser knows about it is here; the body is the node's yaml text verbatim.
fields:
  id:         string        # kind:slug
  kind:       value:node-kind
  title:      string        # title: | statement: | description: | purpose: | when:, first 110 chars
  status:     string        # value:req-status for reqs; drift for drift rows; free otherwise
  section:    string        # the ## heading it was found under
  subsection: string        # the ### heading
  body:       string        # dedented yaml block, or synthesised for table rows and fields
  defined:    bool          # false ⇒ stub (referenced only)
  file:       path          # module file, relative to cwd
  line:       int           # line of the yaml block or table row
  owner:      string?       # fields only: the entity id
edges:
  - entity:node -(governed-by)-> rule:id-syntax
  - entity:node -(governed-by)-> rule:stub-nodes
  - entity:node -(owns)-> state:node-lifecycle
```

### entity:edge

```yaml
id: entity:edge
storage: _build/graph.json (generated)
source: lib/parse.js:41, :199
description: A directed, typed link. Deduplicated on (from, verb, to).
fields:
  from: string
  to:   string
  verb: value:edge-verb
edges:
  - entity:edge -(governed-by)-> rule:edge-from-typed-key
  - entity:edge -(governed-by)-> rule:explicit-edge-syntax
  - entity:edge -(governed-by)-> rule:structural-vs-mentions
```

### entity:graph

```yaml
id: entity:graph
storage: docs/context-graph/_build/graph.json + data.js
source: lib/parse.js:203, bin/ctx.js:35-41
description: The build output every query and the viewer read. data.js is the same graph plus the raw markdown of every module file, as window.GRAPH and window.MD_FILES.
fields:
  generatedAt: ISO date
  modules:     List<{id, title, file, verified, sourceRoots}>
  files:       List<path>
  nodes:       List<entity:node>
  edges:       List<entity:edge>
  fieldIndex:  Map<fieldName, fieldId>     # unambiguous fields only; the viewer linkifies from it
```

### entity:field

```yaml
id: entity:field
storage: generated into entity:graph; never hand-written
source: lib/parse.js:157-183
description: One attribute of an entity or value object, lifted to a node so "where is receivedQuantity used?" is a query.
fields:
  id:      field:<entity-slug>.<name>
  name:    string
  type:    string?      # right-hand side of the field line
  note:    string?      # trailing # comment
  owner:   entity id
edges:
  - entity:field -(governed-by)-> rule:field-generation
  - entity:field -(governed-by)-> rule:field-mentions-index
  - entity:field -(governed-by)-> rule:ambiguous-field-names
```

### entity:drift-row

```yaml
id: entity:drift-row
storage: the §10 table of a module doc
source: lib/parse.js:123-130
description: One disagreement. Becomes drift:<module>.<n> with contradicts edges to every id in columns a and b.
fields: { n: int, a: string, b: string, what: string, where: string }
edges:
  - entity:drift-row -(governed-by)-> rule:drift-table-parsed
```

### entity:delta

```yaml
id: entity:delta
storage: docs/context-graph/_deltas/<date>-<slug>/delta.yaml   (PROPOSED — nothing reads this yet)
source: templates/delta.yaml:1
description: How a feature enters the graph before code. Adds/changes/resolves node ids, names the tests the implementation must make real, and lists the constraints that must hold.
fields:
  id:                  delta:<date>-<slug>
  status:              proposed | approved | shipped
  intent:              string
  module:              module id
  adds:                List<node id>
  changes:             List<node id>
  resolves:            List<question | drift id>
  requires-tests:      List<test id>
  constraints-checked: List<string>
edges:
  - entity:delta -(owns)-> state:node-lifecycle
```

### entity:packet

```yaml
id: entity:packet
storage: stdout of ctx packet (ephemeral)
source: lib/graph.js:69-84
description: The slice an agent reasons from for one task.
fields:
  task:    string
  seeds:   List<node id>       # top search hits
  nodes:   ordered, nearest-first, budget-capped, rendered brief (14 body lines, no mentions)
  files:   List<path>          # union of source: paths of included nodes
```

---

## 2. Value objects and enums

| id | source | values |
|---|---|---|
| value:node-kind | lib/parse.js:9 | req, rule, entity, value, state, op, page, action, gate, flag, test, ui-test, module, tool, setting→flag, field, drift, question, decision |
| value:edge-verb | lib/parse.js:11-18 | refines, satisfied-by, verified-by, governed-by, gated-by, reads, writes, calls, contradicts, owned-by, owns, embedded-in, set-by, applies-to, governs, see, resolves, has, depends-on, adds, changes, has-action, navigates, typed-as, triggers, edge-to, mentions |
| value:structural-verb | lib/parse.js:18 | the subset of edge-verb that neighbors --structural, impact and packet follow; everything except mentions/see/roles |
| value:req-status | schema/kinds.yaml:41 | shipped, api-only, unverified, proposed, question |
| value:check-severity | lib/graph.js:104-128 | error (exit 1), warning |
| value:viewer-preset | viewer/index.html:282-288 | Requirements, Mechanics, Data, Drift, Everything |
| value:field-stop-list | lib/parse.js:19 | name, notes, status, comment, lines, email, phone, street, city, country, aliases, instructions, code, symbol, quantity, fields, values, computed |

---

## 3. State machines

### state:node-lifecycle

```yaml
id: state:node-lifecycle
owner: entity:node
states: [proposed, approved, shipped, deprecated]
transitions:
  - proposed -> approved   : a human approves the delta PR            # PROPOSED — not enforced
  - approved -> shipped    : implementation PR passes ctx check --strict with real sources and tests   # PROPOSED
  - shipped -> deprecated  : replaced; needs a resolves or see edge    # PROPOSED
status: proposed
note: today only req nodes carry a status and only value:req-status is interpreted (viewer, ctx reqs, check)
```

### state:req-verification

```yaml
id: state:req-verification
owner: entity:node
description: how a shipped requirement is displayed, derived not stored
states: [tested, untested]
transitions:
  - untested -> tested : a verified-by edge exists     # viewer/index.html:262-270, bin/ctx.js:100-108, lib/graph.js:116
```

---

## 4. Operations (the ctx CLI)

| op | args | does | gate | source |
|---|---|---|---|---|
| op:ctx.build | [files…] [--root dir] | parse module files → _build/graph.json + data.js; prints counts by kind | – | bin/ctx.js:43-51 |
| op:ctx.site | [files…] [--out dir] | build + copy viewer/index.html into out; prints the Artifact call to make | – | bin/ctx.js:52-60 |
| op:ctx.get | <id or suffix> | render one node: title, file:line, body, edges grouped by verb both ways | – | bin/ctx.js:61-65, lib/graph.js:85-95 |
| op:ctx.neighbors | <id> [-d N] [--kinds a,b] [--structural] | the node plus everything within N hops, indented by distance | – | bin/ctx.js:66-73, lib/graph.js:25-37 |
| op:ctx.search | <terms…> [--limit N] | ranked hits: id ×5, title ×3, body ×1+, reqs ×1.5, stubs ×0.5 | – | bin/ctx.js:74-78, lib/graph.js:38-53 |
| op:ctx.impact | <id> [-d N] | reverse structural closure (default 3 hops), grouped by kind | – | bin/ctx.js:79-86, lib/graph.js:55-68 |
| op:ctx.packet | --task "…" [--budget N] [--seeds N] | entity:packet | – | bin/ctx.js:87-91, lib/graph.js:69-84 |
| op:ctx.check | [--repo dir] [--strict] | lint; prints warn/ERROR lines; exit 1 on errors | – | bin/ctx.js:92-98, lib/graph.js:104-129 |
| op:ctx.stats | | counts by kind, verb, req status, modules (JSON) | – | bin/ctx.js:99, lib/graph.js:96-103 |
| op:ctx.reqs | [--status s] | requirement tree with glyphs | – | bin/ctx.js:100-108 |
| op:install | | symlink bin/ctx.js → ~/.local/bin/ctx and skills/* → ~/.claude/skills/ | – | install.sh:1-20 |

---

## 5. Pages and actions

### page:viewer/reqs

```yaml
id: page:viewer/reqs
route: "#view=reqs (default)"
component: viewer/index.html:245-280
reads: [entity:graph]
actions:
  - action:open-req:        tap a row → page:viewer/node-sheet
display-rules:
  - stat tiles: reqs, shipped, unverified/api-only (+ shipped-without-test), proposed, questions, drift rows   (viewer/index.html:249-258)
  - rows grouped by the ### heading the req was found under; tree built from refines edges              (:262-276)
  - status dot: green shipped+tested, amber unverified/api-only/shipped-without-test, dashed proposed, red question (:264-268)
```

### page:viewer/graph

```yaml
id: page:viewer/graph
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
```

### page:viewer/read

```yaml
id: page:viewer/read
route: "#view=read"
component: viewer/index.html:401-439
reads: [entity:graph, entity:module-doc]   # window.MD_FILES rendered with marked
actions:
  - action:tap-id:          any kind:slug or unambiguous field name in the text → page:viewer/node-sheet (:413-421, :442)
  - action:contents:        floating button opens a TOC drawer of h2/h3 (:431-437)
display-rules:
  - frontmatter shown as a yaml block; tables wrapped for horizontal scroll (:409)
  - anchors n-<id> on `id:` occurrences, first table cell and h3 headings so Show in text can scroll (:417-425)
```

### page:viewer/node-sheet

```yaml
id: page:viewer/node-sheet
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

### page:skill/describe-module and page:skill/context

```yaml
id: page:skill/describe-module
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

---

## 6. Rules

### Parsing

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
```

### Querying

```yaml
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
```

### Linting

```yaml
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
```

### Viewer

```yaml
- id: rule:graph-presets
  statement: Requirements shows req nodes and refines edges only; Mechanics shows req/rule/entity/op/page/action/state/flag/gate with structural verbs; Data shows entity/field/value/flag/state with has/typed-as/refs/owns/embedded-in; Drift shows only nodes touching a drift node with contradicts edges; Everything shows all kinds and verbs. Focus overrides presets with a two-hop neighbourhood of one node.
  source: viewer/index.html:282-288, :319-334
  verified-by: []

- id: rule:viewer-linkify
  statement: One regex (ids ∪ unambiguous field names, longest first) linkifies text nodes in Read and node bodies in the sheet; a field name resolves through fieldIndex, trying the lower-camel form when the text is PascalCase.
  source: viewer/index.html:222-226, :410-421, :442
  verified-by: []

- id: rule:viewer-no-server
  statement: The page is static: data.js carries the graph and the markdown; only marked and d3 load from cdnjs; there is no fetch.
  source: viewer/index.html:203-205
  verified-by: []
```

---

## 7. Cross-module edges

```yaml
- module:claude-code -(triggers)-> page:skill/describe-module
  via: skill listing in ~/.claude/skills (install.sh symlinks); the Agent tool runs the explorer prompts; the Artifact tool publishes ctx site output
- module:claude-code -(triggers)-> page:skill/context
  via: the skill description matches "before implementing a feature in a repo with a context graph"
- module:git -(has)-> entity:module-doc
  contract: the module files are reviewed in PRs; _build/ is generated and gitignored in the consumer repo
- module:yessensei-pos -(has)-> entity:module-doc         # docs/context-graph/inventory.md, the pilot
  contract: test/smoke.js reads it from ~/Projects/yessensei/src and skips silently when absent (drift row 7)
- module:cdnjs -(reads)-> page:viewer/graph                # d3 7.9.0, marked 12.0.2
```

---

## 8. Gates

```yaml
- id: gate:none
  statement: Waterfall has no authentication or authorization of its own. Access is file-system access to the repo; the published viewer inherits the Artifact's own sharing controls.
  applies-to: [op:ctx.build, op:ctx.check, page:viewer/reqs]
```

---

## 9. Verification index

| test node | file | count |
|---|---|---|
| test:smoke | test/smoke.js | 10 assertions: reqs-parsed, rules-parsed, fields-generated, typed-edges, req-title-status, refines-edge, field-mentions, impact, packet, check-ok |

**Untested surfaces:** every red path of `ctx check` (missing source, missing satisfied-by, stub rule, strict mode, exit code), `resolve` ambiguity, `neighbors`, `search` scoring, `reqs` tree, `site` output, multi-module builds, the entire viewer (no story, no DOM test, no screenshot), install.sh, both skills.

---

## 10. Drift and contradictions

| # | a | b | what disagrees | where |
|---|---|---|---|---|
| 1 | design of 2026-09-13: one file per node | implementation: one file per module | the README and skills say per-module; the design argued per-node avoids multi-agent merge conflicts. The parser would accept either (any .md in the root), but the template, viewer grouping and drift namespacing assume a module frontmatter per file | README.md, templates/module.md vs the design discussion |
| 2 | design: sources as `file#Symbol` | rule:source-path-resolves | check verifies only that the path exists; a `#Symbol` suffix is stripped and never grepped | lib/graph.js:120-121 |
| 3 | entity:delta, page:skill/context ("delta before build") | op:ctx.build | build reads only `docs/context-graph/*.md` not starting with `_`; `_deltas/*.yaml` are never parsed, so the delta workflow is documentation only | bin/ctx.js:27-31 vs templates/delta.yaml |
| 4 | rule:inventory-gate-shorthand | module:waterfall purpose ("generic") | the generic parser hardcodes inventory's permission gate ids (view / manage / record-ops) | lib/parse.js:143-146 |
| 5 | schema/kinds.yaml lists `question` and `decision` kinds | templates/module.md §11 writes questions as `- q:` lines; inventory.md has none as nodes | open questions are prose, not nodes, so they cannot be linked, resolved by a delta, or counted | schema/kinds.yaml:33-34 vs templates/module.md:190-200 |
| 6 | rule:section-headings-drive-grouping | schema/kinds.yaml conventions | the heading text is load-bearing for parsing and viewer grouping but the schema does not say so | lib/parse.js:123-134, viewer/index.html:262 |
| 7 | test:smoke | module:yessensei-pos | the only test reads a fixture from another repository and exits 0 with zero assertions when it is missing; a fresh checkout of waterfall is "green" without testing anything | test/smoke.js:10 |
| 8 | action:search-graph (viewer) | op:ctx.search (CLI) | the viewer matches id/title only; the CLI also scores body text; the same query returns different sets | viewer/index.html:327 vs lib/graph.js:38-53 |
| 9 | req:wf.query.packet ("ends with the code files those nodes cite") | rule:packet-ranking | only `source:`-style keys feed the file list; requirements rarely have one, so a requirements-heavy packet cites no files | lib/graph.js:131-137 |
| 10 | rule:inline-action-definition | templates/module.md §5 (an inline `actions: [...]` array shown as valid) | inline-array actions are never defined and appear as stubs | lib/parse.js:86-96 vs templates/module.md:130-131 |
| 11 | README ("`ctx site` … ready for the Artifact tool") | op:ctx.site | site also copies graph.json, which the page never loads; harmless but misleading about what must be published | bin/ctx.js:52-60 |
| 12 | schema/kinds.yaml `statuses.node: [proposed, approved, shipped, deprecated]` | state:node-lifecycle | no code reads approved or deprecated; only req statuses are interpreted | lib/graph.js:115-116, viewer/index.html:264-268 |
| 13 | rule:id-syntax | rule:node-detection | any id-shaped token in prose becomes an edge, so an example like "e.g. req:inv.sale…" in a statement created a stub and failed this file's own check. Examples must be written as req:<mod>… or in words; the parser should skip backticked/quoted tokens or accept an explicit `example:` key | lib/parse.js:28-32 (found while linting this file) |

---

## 11. Open questions

```yaml
- id: question:wf.granularity
  q: Per-module files (today) or per-node files (design)? Multi-agent parallel authoring is the argument for per-node; readability and the viewer's Read tab are the argument for per-module. A per-module file with a generated per-node index may satisfy both.
- id: question:wf.questions-as-nodes
  q: Should §11 entries be `question:` nodes (this file tries it) so deltas can `resolves:` them? If yes, the template and the inventory pilot need converting.
- id: question:wf.commit-generated
  q: Should _build/graph.json be committed (diffable graph in PRs) or ignored (today)?
- id: question:wf.approval
  q: Who approves a delta and how is approval recorded — a status flip in the file by the reviewer, a PR label, or a signed line?
- id: question:wf.mentions-noise
  q: Is the 5-character / stop-list / owner-reference heuristic for field mentions the right trade-off, or should mentions be opt-in per field?
- id: question:wf.cross-repo
  q: Waterfall's own graph lives in its repo and YesSensei's in its repo. Should a graph be able to reference nodes in another repo's graph (module:yessensei-pos here is a stub)?
```
