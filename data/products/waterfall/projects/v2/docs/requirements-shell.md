---
node: module:req-shell
type: module
title: Requirements — Shell and navigation
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 20
---

# Requirements — Shell and navigation

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Shell and navigation); what a person sees on the Experience pages. Open questions wait at the end.

<!-- view:req -->

## Requirements

```yaml
- id: req:wf2.ui.tree-menu
  title: A tree row has a menu to duplicate or delete the document
  when: >
    a person right-clicks a row of the Documents tree, or presses the "⋯" that appears on hover
  then: >
    a menu opens at the pointer with Duplicate and Delete. Duplicate makes a copy next to the document — same
    parent, right after it, "<title> (copy)", every node the document defines re-identified so the copy is a valid
    page — and opens it. Delete asks first, naming the document and how many sub-documents go with it, then removes
    the document and everything under it; a person who was on a removed page lands on its parent (else the
    product), and the tree says how many references from other documents now dangle
  unless: the confirm is cancelled — nothing changes
  status: shipped
  refines: [req:wf2.ui.sidebar]
  satisfied-by: [component:doc-tree, lib:doc-ops, op:api.docs.duplicate, op:api.docs.delete, rule:tree-menu]
  verified-by: [ui-test:tree-menu, test:doc-ops]
- id: req:wf2.ui.plans-folder
  title: Plans is a system folder at the top of the rail, not a page in the Documents tree
  when: >
    a product has plan documents (type:plan — one per request that starts work, req:wf2.sessions.plan-doc)
  then: >
    the rail's menu (Overview … Agents) ends with a "Plans" folder: the entry opens the product's Plans page
    (page:web/plans — every plan of every project as a table with status, tasks done, session, started); beneath it
    the plan documents themselves, newest first, each a row with its icon and title that opens the plan page (the
    open one marked), a plan still `proposed` before a done one only by date; the folder collapses and expands with
    a caret and the choice is remembered per browser. The project's Plans page (`plans.md`) and the plans under it
    are not shown in the Documents tree; on disk nothing moves — a plan is still `plan-<slug>.md` in the project's
    docs folder, `part-of` the project's Plans page
  unless: the product has no plan yet — the folder shows "no plans yet" beneath the entry
  refines: [req:wf2.ui.sidebar, req:wf2.sessions.plan-doc]
  satisfied-by: [component:rail, component:plan-folder, page:web/plans, rule:plans-folder]
  verified-by: [ui-test:plans-folder]
  status: shipped
- id: req:wf2.ui.rail-split
  title: The rail's menu and Documents sections share its height through a draggable horizontal splitter
  when: >
    the rail is open
  then: >
    the menu (Overview … Agents, the Plans folder) is one pane and Documents the other, a horizontal splitter
    between them; by default the menu pane takes what its content needs up to 60% of the rail and scrolls beyond
    that, so Documents is always visible; dragging the splitter sets the menu pane's height (each pane keeps at
    least a few rows), the height is remembered per browser, and a double-click on the splitter returns to the
    default
  unless: the phone layout — the rail is a stacked list and the splitter is not shown
  status: shipped
  refines: [req:wf2.ui.sidebar]
  related-to: [req:wf2.ui.plans-folder, rule:app-navigation]
  satisfied-by: [component:rail, rule:rail-split]
  verified-by: [ui-test:rail-split]
- id: req:wf2.ui.sidebar
  title: The rail finds anything
  when: the user types in the rail search or opens the tree
  then: hits list documents, headings and nodes (a node hit opens its definition); the tree shows documents, not nodes; Tasks, Decisions and Contradictions sit above the tree with open counts
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/sidebar, op:graph.search]
  requires-tests: [test:web-components#sidebar-search]
  refines: req:wf2.ui

- id: req:wf2.ui.phone
  title: It still works on a phone
  when: the viewport is 400px wide
  then: the sidebar becomes the first screen and pages and the graph open full screen, as the v0.1 viewer does
  status: proposed
  satisfied-by: [page:web/sidebar, page:web/graph]
  requires-tests: [ui-test:phone-layout]
  see: req:wf.view
  refines: req:wf2.ui
```
