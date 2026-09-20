---
node: module:req-viewer
type: module
title: Requirements — the static viewer
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 26
---

# Requirements — the static viewer



## Requirements

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
