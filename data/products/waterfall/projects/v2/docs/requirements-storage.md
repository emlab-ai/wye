---
node: module:req-storage
type: module
title: Storage and serving
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 21
---

# Storage and serving

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Storage and serving); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

```yaml
- id: req:wf2.store.products
  title: A product holds projects and goals, each a set of pages
  status: unverified
  note: shipped 2026-09-15 (decision:wf2.product-model); create product, project and page from the UI or the API
  satisfied-by: [entity:product, op:projects.list, op:projects.register]
  requires-tests: [test:server-services#product-groups-projects]
  refines: req:wf2.store

```

  - when:wf2.store.products a product is created in the app

  - then:wf2.store.products it is a folder in Waterfall's data (data/products/<slug>), projects and goals are folders under it with their pages in docs/, an inbox receives dropped notes and files, and one graph per product is the product's knowledge; the rail switches products and lists projects with their pages

```yaml
- id: req:wf2.ui.live
  title: What an agent changes appears while you look
  status: proposed
  satisfied-by: [rule:sse-refresh, op:events.subscribe]
  requires-tests: [ui-test:edit-node-flow]
  refines: req:wf2.ui

```

  - when:wf2.ui.live the server emits graph.changed or a task, decision or contradiction event

  - then:wf2.ui.live the open views refresh the affected node, list or graph without a reload

<!-- /list:req -->
