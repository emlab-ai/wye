---
node: module:app-graph
type: module
title: App — graph core (parser, check, ctx)
status: proposed
owner: unassigned
last-verified: 2026-09-17
part-of: module:app
sources:
  - lib/parse.js
  - lib/graph.js
  - bin/ctx.js
---

# App — graph core (parser, check, ctx)

```yaml
- id: module:app-graph
  purpose: >
    The core that every view and every agent depends on: the parser that turns markdown into a graph (kinds open through the ontology, prose nodes, cards, blocks, generated fields, props and inverses), the query layer (search, neighbours, impact, packets), the lint (ctx check) and the ctx CLI that runs them offline. It has no server dependency and is what CI runs.
```

## Requirements and rules

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf.graph, req:wf.graph.fields, req:wf.graph.stable-ids, req:wf.graph.multi-module, req:wf.graph.stubs-visible, req:wf.query, req:wf.query.packet, req:wf.query.impact, req:wf.lint, req:ontology.types, req:ontology.inverses, req:ontology.check, req:ontology.blocks, req:wf2.cli. Rules the code enforces: rule:node-detection, rule:id-syntax, rule:edge-from-typed-key, rule:explicit-edge-syntax, rule:field-generation, rule:field-mentions-index, rule:stub-nodes, rule:section-headings-drive-grouping, rule:search-scoring, rule:packet-ranking, rule:impact-closure, rule:rule-needs-source, rule:req-needs-satisfied-by, rule:shipped-needs-test, rule:check-exit-code, rule:ontology.open-kinds, rule:ontology.narrow-only, rule:ontology.open-types, rule:ontology.inverse-generated, rule:ontology.block-id, rule:cli-fallback.

## Core

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
```
