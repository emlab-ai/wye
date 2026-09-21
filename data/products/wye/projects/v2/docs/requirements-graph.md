---
node: module:req-graph
type: module
title: Graph core and CLI
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 22
---

# Graph core and CLI

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Graph core and CLI); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

```yaml
- id: req:wf2.cli.init
  title: A product's definition starts from its code in one command, shallow, with the way deeper laid out
  status: shipped
  satisfied-by: [op:cli.wye-init, lib:init, rule:init-shallow]
  verified-by: [test:init]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-graph
```

  - when:wf2.cli.init the person runs `wye init --product <slug> --repo <dir>` (or `--feature "<name>" --path <dir>` inside a product)

  - then:wf2.cli.init the product (or feature project) exists with the layered tree — the product page with its modules and a goal, Product with a requirements page per module and the constitution, Experience with every page and component the code declares, Domain, Systems with a page per module listing its libraries and operations, Quality with the tests, Decisions, Research, Archive, a Backlog — every card with its file and the file's header comment as its purpose, ids stable, nothing the code does not show; one `#ready` describe task per module; a feature embeds the blocks the product already defines instead of defining them again; a second run overwrites nothing

  - unless:wf2.cli.init the repository has no code the scan recognises, in which case the tree is written with one Root module

```yaml
- id: req:wf2.cli.deepen
  title: A module is deepened by a worker that reads its code and maps every requirement to the file that delivers it
  status: shipped
  refines: req:wf2.cli.init
  satisfied-by: [op:cli.wye-deepen, rule:describe-contract, req:exec.dispatch]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-graph
```

  - when:wf2.cli.deepen the person runs `wye deepen <module>`, assigns the module's describe task, or a runner takes it

  - then:wf2.cli.deepen a worker reads the code under the module, writes its requirements on the module's requirements page in the person's words (when / then / unless), maps each one by `satisfied-by` to the library, component and operation cards that deliver it — each with its file (and symbol) and a paragraph on what that code does — and by `verified-by` to its tests, writes the rules the code enforces with their source, the entities and states, and a question where the code is unclear; `wye check` is green and the describe task is done

```yaml
- id: req:wf.describe
  title: A module can be described completely without code
  status: shipped
  satisfied-by: [entity:module-doc, value:node-kind, value:edge-verb, page:skill/describe-module]
  verified-by: [test:smoke#reqs-parsed, test:smoke#rules-parsed]
  note: the pilot (inventory, YesSensei/POS) is the proof — 60 reqs, 54 rules, 45 ops, 13 pages, 17 drift rows

```

  - when:wf.describe someone (usually an agent following skill:wye-describe-module) writes docs/context-graph/<module>.md from the template

  - then:wf.describe the file captures requirements, entities with fields, value objects, state machines, operations, pages with actions, rules with sources, gates, tests, drift and open questions, using stable kind:slug ids and typed edges

```yaml
- id: req:wf.describe.reqs-first
  title: Requirements are the root of everything
  status: shipped
  satisfied-by: [rule:req-needs-satisfied-by, op:ctx.check]
  verified-by: []          # smoke only checks the ok path
  refines: req:wf.describe

```

  - when:wf.describe.reqs-first a module file is linted

  - then:wf.describe.reqs-first every requirement that is not proposed or a question must point at the mechanism that delivers it (satisfied-by); a requirement with nothing under it is an error

```yaml
- id: req:wf.describe.sources
  title: A rule without a source is a wish
  status: shipped
  satisfied-by: [rule:rule-needs-source, op:ctx.check]
  verified-by: []          # UNVERIFIED — no negative test
  refines: req:wf.describe

```

  - when:wf.describe.sources a rule node has no `source:` line

  - then:wf.describe.sources wye check reports an error and exits 1

```yaml
- id: req:wf.describe.honest-status
  title: Shipped means proven
  status: shipped
  satisfied-by: [rule:shipped-needs-test, op:ctx.check, op:ctx.reqs, page:viewer/reqs]
  verified-by: []
  refines: req:wf.describe

```

  - when:wf.describe.honest-status a requirement is marked shipped without a verified-by edge

  - then:wf.describe.honest-status it is a warning by default and an error under flag:strict; the viewer and `wye reqs` show it as untested (◐)

```yaml
- id: req:wf.describe.drift
  title: Contradictions are recorded, not hidden
  status: shipped
  satisfied-by: [entity:drift-row, rule:drift-table-parsed, page:viewer/graph]
  verified-by: []
  refines: req:wf.describe

```

  - when:wf.describe.drift the author finds two sources that disagree (PRD vs code, server vs client, doc vs test)

  - then:wf.describe.drift a row in the Drift table becomes a drift node with contradicts edges to both sides; wye check counts them; the viewer has a Drift preset

```yaml
- id: req:wf.describe.no-invention
  title: Silence in the code becomes a question, never a guess
  status: shipped          # as a rule in the skill; not machine-enforced
  satisfied-by: [page:skill/describe-module, value:req-status]
  verified-by: []
  refines: req:wf.describe
  note: nothing stops an author writing shipped without evidence except flag:strict on the test edge
```

  - when:wf.describe.no-invention the author cannot find a behaviour in code or tests

  - then:wf.describe.no-invention the requirement gets status proposed or question, and §11 records the question

```yaml
- id: req:wf.graph
  title: The markdown parses into a graph without a schema step
  status: shipped
  satisfied-by: [entity:node, entity:edge, entity:graph, op:ctx.build, rule:node-detection, rule:edge-from-typed-key, rule:explicit-edge-syntax]
  verified-by: [test:smoke#typed-edges, test:smoke#req-title-status, test:smoke#refines-edge]

```

  - when:wf.graph wye build runs over docs/context-graph/*.md

  - then:wf.graph every `id: kind:slug` in a yaml block, every `### kind:slug` heading, every table row whose first cell is an id, and every Drift row becomes a node; typed keys and `a -(verb)-> b` lines become edges; the result is _build/graph.json plus data.js for the viewer

```yaml
- id: req:wf.graph.fields
  title: Every field is a node and knows where it is mentioned
  status: shipped
  satisfied-by: [rule:field-generation, rule:field-mentions-index, rule:ambiguous-field-names]
  verified-by: [test:smoke#fields-generated, test:smoke#field-mentions]
  refines: req:wf.graph

```

  - when:wf.graph.fields an entity or value node has a fields/computed/shape block

  - then:wf.graph.fields each field becomes field:<entity>.<name> with a has edge from its owner and a typed-as edge to its type; any other node whose text names the field (camel or Pascal case) gets a mentions edge to it

  - unless:wf.graph.fields the name is shorter than 5 characters or in the stop list, or the same name exists on several entities and the mentioning node does not reference the owner

```yaml
- id: req:wf.graph.stable-ids
  title: Ids are stable slugs; hierarchy lives in the id
  status: shipped
  satisfied-by: [value:node-kind, rule:id-syntax]
  verified-by: [test:smoke#refines-edge]
  refines: req:wf.graph

```

  - when:wf.graph.stable-ids a requirement refines another

  - then:wf.graph.stable-ids its id is a dotted path under the parent (req:<mod>.sale.shortfall.oversell) and a refines edge is written; other kinds use kebab slugs

```yaml
- id: req:wf.graph.multi-module
  title: Several module files form one graph
  status: unverified
  satisfied-by: [op:ctx.build, rule:drift-table-parsed, flag:source-roots]
  refines: req:wf.graph

```

  - when:wf.graph.multi-module docs/context-graph contains more than one .md file

  - then:wf.graph.multi-module they are parsed into one node set; cross-module references resolve; each module's source-roots apply to its own nodes; drift ids are namespaced per module

```yaml
- id: req:wf.graph.stubs-visible
  title: A referenced-but-undescribed node is visible, not silently created
  status: shipped
  satisfied-by: [rule:stub-nodes, page:viewer/graph, op:ctx.check]
  verified-by: []
  refines: req:wf.graph
```

  - when:wf.graph.stubs-visible an edge points at an id that no file describes

  - then:wf.graph.stubs-visible the node exists with defined=false, renders hollow in the viewer, prints "(referenced only)" in the CLI, and wye check lists it (error for rule/req, warning otherwise)

```yaml
- id: req:wf.query
  title: An agent asks for a slice instead of reading the files
  status: shipped
  satisfied-by: [op:ctx.get, op:ctx.neighbors, op:ctx.search, op:ctx.impact, op:ctx.packet, page:skill/context]
  verified-by: [test:smoke#impact, test:smoke#packet]

```

  - when:wf.query an agent needs product context for a task

  - then:wf.query it runs wye get / neighbors / search / impact / packet and receives markdown sized to the question, with node ids it can cite

```yaml
- id: req:wf.query.packet
  title: A packet is working memory for one task, within a budget
  status: shipped
  satisfied-by: [op:ctx.packet, rule:packet-ranking]
  verified-by: [test:smoke#packet]
  refines: req:wf.query
  note: only nodes with a source: key contribute files, so a packet of requirements alone cites nothing (drift row 9)

```

  - when:wf.query.packet wye graph packet --task "<sentence>" --budget N

  - then:wf.query.packet the top search hits seed a two-hop structural neighbourhood; nodes are emitted nearest-first until N characters; requirements sort first at equal distance; the packet ends with the code files those nodes cite

```yaml
- id: req:wf.query.impact
  title: Before changing a node you can see what depends on it
  status: shipped
  satisfied-by: [op:ctx.impact, rule:impact-closure]
  verified-by: [test:smoke#impact]
  refines: req:wf.query

```

  - when:wf.query.impact wye graph impact <id>

  - then:wf.query.impact every node reachable by following incoming structural edges up to 3 hops is listed, grouped by kind with hop distance; an entity's fields and a page's actions count as part of it

```yaml
- id: req:wf.query.suffix
  title: Short names resolve
  status: unverified
  satisfied-by: [rule:suffix-resolution]
  refines: req:wf.query

```

  - when:wf.query.suffix a command is given a bare slug or suffix (wye get oversell)

  - then:wf.query.suffix it resolves when exactly one id ends with :suffix or .suffix, and refuses with the candidates when ambiguous

```yaml
- id: req:wf.query.reqs-tree
  title: The requirement tree is one command away
  status: unverified
  satisfied-by: [op:ctx.reqs]
  refines: req:wf.query
```

  - when:wf.query.reqs-tree wye reqs [--status s]

  - then:wf.query.reqs-tree requirements print as an indented tree with a status glyph — ● shipped and tested, ◐ shipped without test or unverified/api-only, ○ proposed, ? question

<!-- /list:req -->

## Open questions

<!-- list:question -->

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

<!-- /list:question -->
