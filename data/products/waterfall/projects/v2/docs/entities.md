---
node: module:entities
type: module
title: Entities and states
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:domain
order: 32
---

# Entities and states

The things Wye keeps and the states they move through.


## Entities

<!-- list:entity -->

entity:product 

```yaml
- id: entity:module-doc
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
- id: entity:node
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
- id: entity:edge
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
- id: entity:graph
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
- id: entity:field
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
- id: entity:drift-row
  storage: the §10 table of a module doc
  source: lib/parse.js:123-130
  description: One disagreement. Becomes drift:<module>.<n> with contradicts edges to every id in columns a and b.
  fields: { n: int, a: string, b: string, what: string, where: string }
  edges:
    - entity:drift-row -(governed-by)-> rule:drift-table-parsed
- id: entity:delta
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
- id: entity:packet
  storage: stdout of ctx packet (ephemeral)
  source: lib/graph.js:69-84
  description: The slice an agent reasons from for one task.
  fields:
    task:    string
    seeds:   List<node id>       # top search hits
    nodes:   ordered, nearest-first, budget-capped, rendered brief (14 body lines, no mentions)
    files:   List<path>          # union of source: paths of included nodes
```

<!-- /list:entity -->

## State machines

<!-- list:state -->

```yaml
- id: state:task-lifecycle
  owner: entity:task
  states: [proposed, approved, in-progress, done, abandoned]
  transitions:
    - proposed -> approved       : a human approves (tasks.update by a human session)      # packages/server/src/services/tasks.ts#approve
    - approved -> in-progress    : the assignee starts (tasks.update)
    - in-progress -> done        : the assignee finishes; graph.check strict must be green for the project   # rule:strict-open-contradiction
    - proposed -> abandoned      : anyone
    - approved -> abandoned      : anyone
    - in-progress -> abandoned   : anyone
  terminal: [done, abandoned]
- id: state:decision-clerk-status
  owner: entity:decision
  states: [pending, done, failed, skipped]
  transitions:
    - pending -> done      : the clerk run finished            # packages/server/src/clerk/runner.ts#finish
    - pending -> failed    : model error, budget, invalid delta
    - failed -> pending    : Retry pressed (action:retry-clerk)
    - pending -> skipped   : the clerk is disabled (phase 1) or the decision affects no nodes
- id: state:contradiction-lifecycle
  owner: entity:contradiction
  states: [open, resolved, dismissed]
  transitions:
    - open -> resolved    : contradictions.resolve with a decision or task
    - open -> dismissed   : contradictions.dismiss with a reason
    - resolved -> open    : a structural row reappears in markdown after being resolved (re-opened on parse)
  terminal: [dismissed]
- id: state:delta-lifecycle
  owner: entity:graph-delta
  states: [proposed, applied, rejected]
  transitions:
    - proposed -> applied    : deltas.apply succeeds for every op (rule:delta-atomic)
    - proposed -> rejected   : deltas.reject with a reason
    - proposed -> proposed   : deltas.apply fails; error recorded, nothing written
  terminal: [applied, rejected]
- id: state:clerk-run-status
  owner: entity:clerk-run
  states: [running, done, failed]
  transitions:
    - running -> done     : output stored
    - running -> failed   : budget (rule:clerk-budget), model error, or delta rejected by the parser (rule:delta-validated)
  terminal: [done, failed]
- id: state:node-lifecycle
  owner: entity:node
  states: [proposed, approved, shipped, deprecated]
  transitions:
    - proposed -> approved   : a human approves the delta PR            # PROPOSED — not enforced
    - approved -> shipped    : implementation PR passes ctx check --strict with real sources and tests   # PROPOSED
    - shipped -> deprecated  : replaced; needs a resolves or see edge    # PROPOSED
  status: proposed
  note: today only req nodes carry a status and only value:req-status is interpreted (viewer, ctx reqs, check)
- id: state:req-verification
  owner: entity:node
  description: how a shipped requirement is displayed, derived not stored
  states: [tested, untested]
  transitions:
    - untested -> tested : a verified-by edge exists     # viewer/index.html:262-270, bin/ctx.js:100-108, lib/graph.js:116
```

<!-- /list:state -->
