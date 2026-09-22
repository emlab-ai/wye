---
node: pr:4
type: pr
title: table should horizontally scrollable , not just take 100% width, in small screens it…
status: done
owner: unassigned
last-verified: 2026-09-18
session: 01b14dc871
agent: claude-code
started: 2026-09-18T13:02:40.466Z
part-of: module:v2-prs
finished: 2026-09-18T13:10:05.623Z
order: 10
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
  affects: [component:data-table, rule:table-scroll, req:wf2.editor.table-scroll]
  status: approved
  date: 2026-09-18
  session: 01b14dc871
```

  - choice:wf2.table-scroll-not-shrink The block scrolls horizontally and every column keeps a minimum (name 200 px). Same behaviour as the app's other tables (component:instance-table), no change to what a row shows, and the person can still reach every cell.

  - context:wf2.table-scroll-not-shrink On a small screen (or with the context column open) the data table's fixed columns win and the name column collapses to a few characters per line (the screenshot on this plan). Something has to give: the columns, the rows' layout, or the block's width.

  - alternative:wf2.table-scroll-not-shrink Hide property columns below a breakpoint — loses cells the person may need and differs per type; wrap each row into two lines (name above, properties below) — a second layout to maintain for every row kind; make the name column's minimum larger than 200 px — pushes the scrollbar onto laptops with the column open.

  - consequence:wf2.table-scroll-not-shrink The scroll container is the collection's `.bn-block`, so BlockNote's side menu and drag handle sit on a scrolling ancestor; verified in the ui test. `min-width: min-content` on `.nrow` means a row's text never widens the row (the name track's minimum is fixed), so long text still wraps.

## Tasks

- [x] task:table-scroll-css `.nrow` name column minimum 200 px (typeGrid and the goals/tasks template), `min-width: min-content` on `.nrow`, `overflow-x: auto` on the collection's `.bn-block`, in globals.css and DocEditor.tsx#typeGrid. Part of pr:4, part of req:wf2.editor.table-scroll. (session: 01b14dc871)
- [x] task:table-scroll-ui-test ui-test:table-scroll in Chrome with playwright-core against the dev server: the Bugs table at a 700 px viewport — name column ≥ 200 px, header and rows one width, the block scrolls sideways, the document does not; at 1400 px — no scrollbar and the rows fill the editor; a goals/tasks table the same. Part of pr:4, part of req:wf2.editor.table-scroll. (session: 01b14dc871)
- [x] task:table-scroll-knowledge req:wf2.editor.table-scroll and rule:table-scroll shipped, ui-test:table-scroll passed on test-design; component:doc-editor's purpose says what the editor is (today it reads as a stray comment about inline tags). Part of pr:4. (session: 01b14dc871)

## Result

A data table narrower than its columns now scrolls sideways as one block instead of squeezing the name column (req:wf2.editor.table-scroll, rule:table-scroll, both shipped): the name column keeps a 200px minimum, header and rows have min-width: min-content so they stay one width, and the collection's .bn-block has overflow-x: auto; a wide editor is unchanged. Goals/tasks tables get the same. Verified in Chrome via playwright-core (ui-test:table-scroll, 14 checks at 700/1400 px on the bug table and a goals/tasks table, passed). Knowledge: component:data-table card on app-documents (the block had no node), component:doc-editor's purpose corrected, decision:wf2.table-scroll-not-shrink proposed on the plan; 3 tasks done. Commit df6fe7a.

Blocks this plan produced:

- added component:data-table — data-table
- added req:wf2.editor.table-scroll — A data table scrolls sideways when the editor is narrower than its columns
- added rule:table-scroll — table-scroll
- added decision:wf2.table-scroll-not-shrink — A narrow data table scrolls sideways; columns keep their minimum widths
- added task:table-scroll-css — `.nrow` name column minimum 200 px (typeGrid and the goals/tasks template), `min-width:
- added task:table-scroll-ui-test — ui-test:table-scroll in Chrome with playwright-core against the dev server:
- added task:table-scroll-knowledge — req:wf2.editor.table-scroll and rule:table-scroll shipped, ui-test:table-scroll passed on test-design;
- added ui-test:table-scroll — table-scroll
- changed component:doc-editor — doc-editor

17 paragraphs added or changed — [per document](/wye/sessions/01b14dc871/changes)
