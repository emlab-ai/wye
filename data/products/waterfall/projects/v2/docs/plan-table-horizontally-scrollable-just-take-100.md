---
node: plan:plan-table-horizontally-scrollable-just-take-100
type: plan
title: table should horizontally scrollable , not just take 100% width, in small screens it…
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: 01b14dc871
agent: claude-code
started: 2026-09-18T13:02:40.466Z
part-of: module:v2-plans
---

# table should horizontally scrollable , not just take 100% width, in small screens it…

## Request

> table should horizontally scrollable , not just take 100% width, in small screens it have this issue, when columsna are too small

_from: module:bugs_

## Context

The table in the screenshot is the editor's "Data table" block — component:data-table in module:app-documents:
`<!-- table:bug -->` in the Bugs document (module:bugs), rendered by CollectionBlock (the header with the type
picker) and one TypeRow / RowNode per child node block, each a CSS grid with the same column template
(`typeGrid`: `minmax(0, 1fr) 100px` then `minmax(72px, 120px)` per property; goals and tasks use
`minmax(0, 1fr) 100px 72px 104px 74px`). The name column is the only flexible one and its minimum is 0, so when
the editor is narrow — the screenshot's column is 318 px wide at a 700 px viewport with the context column open —
the fixed columns keep their width and the name column shrinks to a few characters per line. The rows are not a
`<table>`: header and rows are separate BlockNote blocks under one `.bn-block`, which is why nothing scrolls
today. The other tables of the app (component:instance-table, the type page) already scroll sideways
(`.ttable { overflow-x: auto }`).

Code: `packages/web/src/components/DocEditor.tsx` (`typeGrid`, `CollectionBlock`, `TypeRow`, `RowNode`) and
`packages/web/src/app/globals.css` (`.nrow`, `.collection`, the `.bn-block:has(> .react-renderer.node-collection)`
rules). Knowledge: rule:type-tables, rule:goals-and-tasks, rule:table-rows, req:wf2.ui.node-page.

![[component:data-table]]

## Plan

The table keeps its columns and scrolls sideways instead of squeezing: the name column gets a minimum width
(200 px), the `.bn-block` that holds the header and the rows becomes the horizontal scroll container
(`overflow-x: auto`), and header and rows get `min-width: min-content` so they are never narrower than the sum of
their column minima — all of them the same width, because they share one template with fixed minima. A wide
editor looks exactly as today (the rows fill it, no scrollbar); a narrow one shows a scrollbar under the table
and the rest of the document does not move. No markup or data change; goals/tasks tables get the same fix.

![[req:wf2.editor.table-scroll]]

![[rule:table-scroll]]

```yaml
- id: decision:wf2.table-scroll-not-shrink
  title: A narrow data table scrolls sideways; columns keep their minimum widths
  context: >
    On a small screen (or with the context column open) the data table's fixed columns win and the name column
    collapses to a few characters per line (the screenshot on this plan). Something has to give: the columns,
    the rows' layout, or the block's width.
  choice: >
    The block scrolls horizontally and every column keeps a minimum (name 200 px). Same behaviour as the app's
    other tables (component:instance-table), no change to what a row shows, and the person can still reach every
    cell.
  alternatives: >
    Hide property columns below a breakpoint — loses cells the person may need and differs per type; wrap each row
    into two lines (name above, properties below) — a second layout to maintain for every row kind; make the name
    column's minimum larger than 200 px — pushes the scrollbar onto laptops with the column open.
  consequences: >
    The scroll container is the collection's `.bn-block`, so BlockNote's side menu and drag handle sit on a
    scrolling ancestor; verified in the ui test. `min-width: min-content` on `.nrow` means a row's text never
    widens the row (the name track's minimum is fixed), so long text still wraps.
  affects: [component:data-table, rule:table-scroll, req:wf2.editor.table-scroll]
  status: proposed
  date: 2026-09-18
  session: 01b14dc871
```

## Tasks

- [x] task:table-scroll-css `.nrow` name column minimum 200 px (typeGrid and the goals/tasks template), `min-width: min-content` on `.nrow`, `overflow-x: auto` on the collection's `.bn-block`, in globals.css and DocEditor.tsx#typeGrid. Part of plan:plan-table-horizontally-scrollable-just-take-100, part of req:wf2.editor.table-scroll. (session: 01b14dc871)
- [x] task:table-scroll-ui-test ui-test:table-scroll in Chrome with playwright-core against the dev server: the Bugs table at a 700 px viewport — name column ≥ 200 px, header and rows one width, the block scrolls sideways, the document does not; at 1400 px — no scrollbar and the rows fill the editor; a goals/tasks table the same. Part of plan:plan-table-horizontally-scrollable-just-take-100, part of req:wf2.editor.table-scroll. (session: 01b14dc871)
- [x] task:table-scroll-knowledge req:wf2.editor.table-scroll and rule:table-scroll shipped, ui-test:table-scroll passed on test-design; component:doc-editor's purpose says what the editor is (today it reads as a stray comment about inline tags). Part of plan:plan-table-horizontally-scrollable-just-take-100. (session: 01b14dc871)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
