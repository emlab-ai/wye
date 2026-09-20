---
node: module:req-knowledge
type: module
title: Requirements — Knowledge and search
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 14
---

# Requirements — Knowledge and search

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Knowledge and search); what a person sees on the Experience pages. Open questions wait at the end.

<!-- view:req -->

## Requirements

```yaml
- id: req:wf2.instances.filter
  title: A type's or kind's instances are one filterable table
  when: >
    a person opens /<product>/types/<slug> or /<product>/knowledge/<kind> (from Types, Knowledge, a type: tag or a link)
  then: >
    the instances show as one table with a toolbar: search over id, title and every property value; status chips
    with counts; one filter per enum, ref or bool property the type declares (a chip row for enums and bools, a
    select of instances for a ref); group by document, status or any enum / ref property; sort by any column;
    a column per declared property and one for the document. The toolbar state is in the URL
    (?q=&status=&group=&sort=&<prop>=) so a filtered list can be pasted as a link. A row opens the node in the
    context column; ↗ opens its definition.
  unless: >
    the kind has no declared type (e.g. lib, op) or the type declares no properties — then the toolbar has search,
    status and document only, and the table shows the node's relations as the last column (what the kind page shows today)
  status: shipped
  satisfied-by: [component:instance-table, page:web/types, page:web/knowledge]
  verified-by: [test:web-lib#instance-table, ui-test:instance-table]
  part-of: req:ontology.type-page
- id: req:wf2.instances.view-block
  title: A document holds a live view of a type's instances
  when: >
    a person types "/view" in a document (slash menu item "Instances view", group Waterfall) and picks a type in the
    block's header, or sets filters on the table inside it
  then: >
    the block shows component:instance-table for that type, live from the graph, read-only; the markdown is one
    HTML-comment line `<!-- view:<slug> status=open group=owner -->` (the toolbar state as key=value), invisible to
    other markdown readers and not a node; a row opens the node in the context column
  unless: >
    the type is no longer declared — the block keeps its line and says "type:<slug> is not declared"
  status: shipped
  satisfied-by: [component:instance-table, component:view-block, rule:view-block]
  verified-by: [test:web-lib#import, ui-test:instance-table]
  related-to: [rule:type-tables, decision:wf2.one-table-block]
- id: req:wf2.ui.graph
  title: The graph is a mind map around a focus
  when: the graph view opens with a focus node
  then: the focus sits in the centre with refines and has edges laid out as a tree and other structural verbs as cross-links; mentions are hidden; presets Requirements, Mechanics, Data, Drift and Everything change the visible set; click opens the node page in a side panel and double-click re-centres
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/graph, rule:mindmap-layout, rule:graph-presets]
  requires-tests: [test:web-components#graph-layout, test:web-components#graph-presets]
  see: req:wf.view.graph
  refines: req:wf2.ui

- id: req:wf2.ui.graph-edit
  title: The mind map is editable
  when: the user drags from one node's handle to another, deletes a selected edge, renames a node inline, or chooses Add child
  then: the change is sent through graph.patch or graph.create (an edge drag asks for the verb) and appears only after the file changes and the SSE event arrives
  status: proposed
  satisfied-by: [page:web/graph, action:drag-edge, action:delete-edge, action:rename-node, action:add-child]
  requires-tests: [test:web-components#graph-edit-calls-api, ui-test:graph-edit]
  refines: req:wf2.ui.graph

```

## Open questions

```yaml
- id: question:wf2.view-block-now
  q: >
    Is the view block (req:wf2.instances.view-block) part of this change, or is the filterable page with a
    shareable URL enough for now and the block a follow-up?
  context: >
    The page (task:instance-table) is the smaller half; the block (task:instance-view-block) adds an editor block
    spec, import/serialize of the `<!-- view:… -->` line and live refresh inside the editor. Both can ship in one
    session; the block roughly doubles the work.
  status: resolved
  related-to: [req:wf2.instances.view-block, task:new-453]
```
