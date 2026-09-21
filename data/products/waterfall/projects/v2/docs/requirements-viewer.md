---
node: module:req-viewer
type: module
title: The static viewer
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 26
---

# The static viewer



## Requirements

<!-- list:req -->

```yaml
- id: req:wf.view
  title: The whole graph is readable on a phone without a server
  status: unverified          # no automated test; verified by eye on the pilot
  satisfied-by: [op:ctx.site, page:viewer/reqs, page:viewer/graph, page:viewer/read, page:viewer/node-sheet]

```

  - when:wf.view ctx site builds index.html + data.js and the Artifact tool publishes them

  - then:wf.view the page opens on a Reqs tree, offers a force-directed Graph and the rendered Read text, works at 400px width, renders in light and dark, and loads d3 and marked from cdnjs

```yaml
- id: req:wf.view.reqs
  title: Requirements land first, with their status at a glance
  status: unverified
  satisfied-by: [page:viewer/reqs]
  refines: req:wf.view

```

  - when:wf.view.reqs the page opens

  - then:wf.view.reqs six stat tiles (reqs, shipped, unverified/api-only, proposed, questions, drift) sit above the requirement tree grouped by capability; each row has a status dot; tapping opens the node sheet

```yaml
- id: req:wf.view.graph
  title: The graph is explorable, not a hairball
  status: unverified
  satisfied-by: [page:viewer/graph, rule:graph-presets]
  refines: req:wf.view

```

  - when:wf.view.graph the Graph tab opens

  - then:wf.view.graph it starts on the Requirements preset (reqs + refines edges only); presets Mechanics, Data, Drift, Everything and per-kind chips change the visible set; search narrows to matches plus neighbours; hollow nodes are stubs; status rings mark non-shipped nodes; labels appear when zoomed or when fewer than 70 nodes show

```yaml
- id: req:wf.view.sheet
  title: Tapping a node shows everything about it and everything around it
  status: unverified
  satisfied-by: [page:viewer/node-sheet]
  refines: req:wf.view

```

  - when:wf.view.sheet a node is tapped anywhere (tree, graph, text link, neighbour chip)

  - then:wf.view.sheet a bottom sheet shows kind and status pills, title, id, the yaml body with ids and field names linkified, then neighbours grouped by verb in both directions as tappable chips; Focus redraws the graph as the node's two-hop neighbourhood; Show in text scrolls the Read view to the node (or its owner for a field)

```yaml
- id: req:wf.view.deep-link
  title: A node has a URL
  status: unverified
  satisfied-by: [page:viewer/node-sheet]
  refines: req:wf.view

```

  - when:wf.view.deep-link the hash carries view=… and n=<id>

  - then:wf.view.deep-link the page opens on that view with that node's sheet open, and updates the hash as the user navigates

```yaml
- id: req:wf.view.fields
  title: Fields are tappable everywhere
  status: unverified
  satisfied-by: [page:viewer/read, rule:field-mentions-index]
  refines: req:wf.view
```

  - when:wf.view.fields an unambiguous field name appears in the Read text or a node body

  - then:wf.view.fields it is a dashed link that opens the field node, whose sheet lists every node mentioning it

<!-- /list:req -->
