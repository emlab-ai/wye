---
node: module:req-wye
type: module
title: Requirements — the product itself
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 25
---

# Requirements — the product itself



## Requirements

<!-- list:req -->

```yaml
- id: req:wf2.self
  title: v2 is built through its own graph
  when: a v2 requirement is implemented
  then: it flips from proposed to shipped in this graph with real sources and a verified-by test, and graph.check strict runs in CI on every PR
  status: proposed
  satisfied-by: [entity:module-doc, flag:strict]
  requires-tests: []
  see: req:wf.self

- id: req:wf2.self.phases
  title: Three phases, each with an exit criterion in this PRD
  when: a phase is planned
  then: its plan names the requirement ids it ships (phase 1 store, serve, write, api, tasks, decisions, cli; phase 2 ui and structural contradictions; phase 3 clerk and semantic contradictions) and the phase closes when they are shipped and strict check is green
  status: proposed
  requires-tests: []
  refines: req:wf2.self

- id: req:wf2.self.fixture
  title: A fresh checkout tests something
  when: the test suite runs without the YesSensei repo present
  then: an in-repo fixture (a trimmed copy of the inventory pilot) drives the parser, writer and check tests, so the suite never exits green with zero assertions
  status: proposed
  satisfied-by: [test:core-parser]
  requires-tests: [test:core-parser#fixture-present]
  resolves: [drift:waterfall.7]
  refines: req:wf2.self
- id: req:wf2.definition.one-place-per-kind
  title: A person finds every kind of block in one known place
  when: a person opens the product's Documents tree
  then: >
    they see one tree — Wye, PRD, Design (a module page per area), Tests, Research, Archive, with TODO, Bugs and Plans
    as intake — and every requirement and open question is in the PRD under its area, every rule, decision, component,
    lib and op on its area's Design page, every research essay under Research; no kind is defined in two places
  unless: the block is retired — then it is under Archive
  status: proposed
  part-of: goal:exec.define-first
  satisfied-by: [decision:wf2.definition-shape, rule:documents-tree]
- id: req:wf2.definition.what-wye-is
  title: A person reads what Wye is on one page
  when: a person opens the Wye page
  then: >
    they read, without mechanism, what Wye is for, the goals it pursues, the constitution (the approved constraints)
    and the product-level decisions of record; every area of the product is named there with a link to its PRD
    section and its Design page
  status: proposed
  part-of: goal:exec.define-first
  satisfied-by: [decision:wf2.definition-shape]
- id: req:wf2.definition.links-survive
  title: Every link still works after the move
  when: a block has moved to its new home, or been retired
  then: >
    its id is unchanged, every tag and embed that named it still resolves to it, `ctx check` is green with no dangling
    reference, and the same nodes answer `wf packet` and `wf context` for a text as before — minus the retired ones
  unless: the block was retired — then it still resolves, marked retired, and is hidden from default retrieval
  status: proposed
  part-of: goal:exec.define-first
  satisfied-by: [decision:wf2.superseded-layers, decision:memory.forgetting]
- id: req:wf2.definition.pages-hold-only-definition
  title: A definition page holds only the definition
  when: a person reads the Wye page, the PRD, a Design page or the Tests page
  then: >
    they see only that page's kinds of blocks and the prose that explains them — no session's plan, log or request
    sections, no pasted plan document — and the page's title names Wye, not Waterfall v2
  unless: the page is a plan document under Plans, which holds exactly that
  status: proposed
  part-of: goal:exec.define-first
  satisfied-by: [decision:wf2.definition-leftovers]
```

<!-- /list:req -->

## Open questions

<!-- list:question -->

- question:wf2.tasks-in-markdown Tasks live in documents as task nodes rather than in the database the spec planned; the database can index them later. Is that the final answer? Related to decision:wf2.tasks-replace-delta-files.

```yaml
- id: question:wf2.definition.id-prefixes
  q: >
    Ids carry six prefixes today — `req&#58;wf.*` (v0.1), `req&#58;wf2.*`, `exec.*`, `memory.*`, `ontology.*`, `app.*` and
    none on most rules — which will not match the new areas. Ids are stable under constraint:wf2.one-defining-place, so
    this refactor leaves them. Should a later pass rename ids to the area they live in (`req&#58;documents.*`), with the
    references rewritten, or is the prefix history worth keeping?
  context: decision:wf2.definition-shape, constraint:wf2.one-defining-place
  status: open
- id: question:wf2.definition.constitution-status
  q: >
    Four constraints on the Wye page are still `proposed` — constraint:wf2.person-approves, constraint:wf2.blocks-not-prose,
    constraint:wf2.one-defining-place, constraint:wf2.main-branch — so they are not in the constitution every agent sees.
    Should they be approved as part of defining Wye, or does each need its own review?
  context: decision:memory.constraint-type, decision:wf2.definition-shape
  status: open
- id: question:wf2.per-node-files
  q: >
    One file per node (merge-friendly for many agents) stays deferred. The writer keeps the door open because the
    parser accepts any .md in the graph folder. When does the number of concurrent agents make this worth the
    migration?
  see: question:wf.granularity
- id: question:wf2.section-map
  q: >
    Which section a newly created node is appended to is taken from the template headings today. The map should
    move into schema/kinds.yaml so the writer and the template agree (this also resolves drift:waterfall.6).
- id: question:wf2.static-viewer
  q: >
    Keep `ctx site` and the static phone viewer next to the web app (publishable as an Artifact without a server),
    or retire it after phase 2?
- id: question:wf2.trusted-agent
  q: >
    What makes an agent trusted for deltas.apply — a server config list of agent names, a per-project setting, or
    never (humans only)?
- id: question:wf2.decision-granularity
  q: >
    What counts as a decision an agent must post — anything with a rejected alternative, or only changes to
    requirements and rules? The skill snippet needs a one-line test.
- id: question:wf2.clerk-model
  q: >
    Default model for the clerk — the mid tier for cost, or the top tier for classification quality on
    contradictions? flag:clerk-model makes it configurable; the default is the open choice.
```

<!-- /list:question -->
