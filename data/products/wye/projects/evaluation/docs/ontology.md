---
node: module:eval-ontology
type: module
title: Evaluation — types
status: proposed
owner: alex
last-verified: 2026-09-20
order: 5
---

# Evaluation — types

The kinds of data the benchmarks produce, as types (module:ontology-design): a run, its scores, a with-and-without
pair, a public benchmark row. The harness writes instances as cards; the Results page shows them with the existing
table and view blocks.

```yaml
- id: type:eval-run
  extends: type:node
  purpose: one run of one suite — what was measured, on which graph, with which model and judge
  home: module:eval-runs
  props:
    suite: enum [own, compare, public, judge]
    date: date
    graph-sha: string?
    git: string?
    model: string?
    judge: string?
    prompts: string?
    gate: enum [passed, failed, not-gated]?
    truth: string?
- id: type:eval-score
  extends: type:node
  purpose: one number of a run, with what it means and what it is gated against
  props:
    run: ref eval-run -(inverse)-> scores
    name: string
    value: string
    n: number?
    previous: string?
    delta: string?
    tolerance: number?
    kappa: string?
    what: text?
- id: type:eval-pair
  extends: type:node
  purpose: the same request run with and without the memory — the two arms' scores and the blind mark
  props:
    run: ref eval-run -(inverse)-> pairs
    request: text
    agent: string?
    runs: number?
    with: text?
    without: text?
    mark: string?
- id: type:eval-public
  extends: type:node
  purpose: a public benchmark row — Wye's number beside the published ones, with their source
  props:
    run: ref eval-run -(inverse)-> public-rows
    benchmark: string
    task: string?
    ours: string?
    published: text?
    source: string?
```

```yaml
- id: constraint:wf2.no-custom-pages
  statement: >
    Nothing in the app is a page of its own: every screen is a document made of the existing blocks, and a new kind
    of data is a new type whose instances the data table and the instances view show. A view that needs a
    component that does not exist is a reason to extend a block, never to add a page.
  scope: [module:app, module:app-knowledge, module:memory-review]
  status: proposed
  by: alex
  date: 2026-09-20
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
```
