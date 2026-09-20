---
node: pr:5
type: pr
title: Work on component:data-table, rule:type-tables, rule:goals-and-tasks.
status: done
owner: unassigned
last-verified: 2026-09-18
session: bd2ece3698
agent: claude-code
started: 2026-09-18T15:13:58.067Z
part-of: module:v2-prs
finished: 2026-09-18T17:17:57.569Z
---

# Work on component:data-table, rule:type-tables, rule:goals-and-tasks.

## Request

> Work on component:data-table, rule:type-tables, rule:goals-and-tasks.
> 
> The "Data table" block of the editor (CollectionBlock, RowNode, TypeRow): a header with the type picker and one grid row per child node block — name, status, then target/due, progress and owner for goals and tasks, or one column per declared property for a product's own type (rule:type-tables, rule:goals-and-tasks). The header and every row are separate blocks that share one column template (`typeGrid`), so they line up without a <table>.
> 
> 
> 
> add new requirement that datatable must be filterable (let user to add filters)

_from: module:app-documents · refs: component:data-table, rule:type-tables, rule:goals-and-tasks_

## Context

The subject is component:data-table in module:app-documents — the editor's "Data table" block (`CollectionBlock`
header, one `RowNode` / `TypeRow` per child node block, one column template `typeGrid`), written to the file as
node lines between `<!-- goals -->`, `<!-- tasks -->` or `<!-- table:<slug> -->` markers (rule:type-tables,
rule:goals-and-tasks, rule:table-rows, rule:table-scroll). Today the block has no filter: every row is a child
block and all of them are shown.

The app already has a filterable table: component:instance-table on the type and kind pages
(req:wf2.instances.filter) and inside the view block (component:view-block, rule:view-block). Its filter model is
lib:instance-table — `Filters { q, status, group, sort, props }`, `filterRows`, and the round-trip to a view
line's key=value pairs (`parseViewQuery` / `viewQuery`, `<!-- view:bug status=open q="login page" -->`).

Code: `packages/web/src/components/DocEditor.tsx` (`CollectionBlock`, `RowNode`, `TypeRow`, `typeGrid`),
`packages/web/src/lib/import.ts` (`COLLECTION_OPEN`, the marker is matched with nothing after the kind),
`packages/web/src/lib/serialize.ts` (`collectionMarker`, writes `<!-- table:bug -->`),
`packages/web/src/lib/instance-table.ts` (the filter functions to reuse), `packages/web/src/components/InstanceTable.tsx`
(the toolbar to borrow from), `packages/web/src/app/globals.css` (`.collection`, `.nrow`).

![[component:data-table]]

![[rule:type-tables]]

## Plan

The request is a requirement: the data table must be filterable — the person adds filters and the table shows
only the rows that match. It is written on the subject's page (app-documents, section Tables, next to
req:wf2.editor.table-scroll) as req:wf2.editor.table-filter, status proposed:

![[req:wf2.editor.table-filter]]

How it would be built, so the requirement is buildable and the two proposed decisions can be reviewed now:

- The header gets a filter toolbar — the same pieces as component:instance-table (a search box, status chips with
  counts, a chip row per enum / bool column, a select per ref column; owner as a select of the owners present for
  goals and tasks) — shown behind a "filter" toggle in the header so an unfiltered table looks as today.
- Filtering hides rows, it never removes them: a row that does not match gets a `hidden` class on its `.nrow`
  (the row block stays a child, serialize.ts writes it unchanged); the trailing empty row is always visible; the
  header shows "n of m" and "clear filters" when a filter is set. The rows are filtered with lib:instance-table's
  `filterRows` over the row blocks' props (kind, slug, status, text, extra), so search and property matching are the
  ones the type page has.
- The filter state is kept on the table's opening marker as key=value pairs, the way the view block keeps its
  query (rule:view-block): `<!-- table:bug status=open priority=high -->`, `<!-- goals owner=alex -->`.
  `COLLECTION_OPEN` accepts a trailing query, the block gets a `query` prop, `collectionMarker` writes it back.
  The parser (lib/parse.js, ctx) ignores the comment either way, so the rows stay the same instances.
- A rule for the code (rule:table-filter, source the import regex, the block and the row class) and a ui test
  (ui-test:table-filter) come with the build, next to rule:table-scroll under Tables.

Built as planned, with three things the build found (all in rule:table-filter):

- Hiding a row with `display: none` made ProseMirror map a click on the row after it to the wrong block; the
  hidden rows are zero-height and clipped instead, through a style element the header renders (an attribute set
  on the row's wrapper did not survive BlockNote rebuilding it).
- A row gets its slug at its first keystroke, so "no slug yet" could not keep a row being typed visible: the row
  the editor's cursor is in is never hidden — a new row stays until the cursor leaves it, and a hidden row reached
  with the arrow keys shows while the caret is there.
- Writing the query with `editor.updateBlock` rebuilt every row's node view; the query is a `setNodeMarkup` of
  the header's node. Even so, a transaction dispatched while a toolbar control had the focus now and then left
  the editor's selection behind the next click in a row (the first keystroke then counted as leaving the previous
  block and the row got its slug at once, one row per letter); a text click in a row whose block is not the
  editor's cursor block now puts the selection there (selectBlockOnClick).

![[rule:table-filter]]

![[ui-test:table-filter]]

```yaml
- id: decision:wf2.table-filter-on-marker
  title: A data table keeps its filters on its marker line, like a view block
  context: >
    Filters on a data table have to live somewhere between one visit and the next. The view block already writes
    its toolbar state to its `<!-- view:<slug> key=value -->` line (rule:view-block), and the table's marker
    `<!-- table:<slug> -->` is the same kind of line.
  choice: >
    The table's opening marker carries the filters as key=value pairs — `<!-- table:bug status=open
    priority=high -->`, `<!-- goals owner=alex -->` — parsed and written with the view block's grammar
    (parseViewQuery / viewQuery). Clearing the filters leaves the bare marker. So a filtered table is what the
    file says, everyone opening the document sees the same rows, and a Send to agent or a link carries it.
  alternatives: >
    Per browser (localStorage keyed by document and table) — invisible to others and to agents, lost across
    machines; in the page URL — a table is not a page, and a document with two tables has two states; not kept
    at all (filters reset on reload) — the cheapest, and the person redoes the same filter every visit.
  consequences: >
    A filter is an edit of the document (the marker line changes), so it goes through save and shows up as a
    change; the requirement's "kept with the table" means kept in the file. COLLECTION_OPEN and collectionMarker
    change; a marker with a query is still a comment to every other reader.
  affects: [req:wf2.editor.table-filter, component:data-table, rule:type-tables, rule:goals-and-tasks]
  status: proposed
  date: 2026-09-18
  session: bd2ece3698
- id: decision:wf2.table-filter-hides-rows
  title: A filter hides rows in the editor; the rows stay children of the table and stay in the file
  context: >
    The table's rows are editor blocks and node lines in the file. A filter could remove the blocks that do not
    match (and put them back on clear) or leave them in place and not show them.
  choice: >
    The rows that do not match are hidden (a class on the row, display none); they remain children of the
    collection block and serialize.ts writes them as before. The trailing empty row is never hidden, so "+ add"
    keeps working; a new row typed under a filter is shown until the cursor leaves it.
  alternatives: >
    Remove and restore blocks — every filter change would be a document change with undo history, and a save
    between filter and clear would drop rows from the file.
  consequences: >
    Row settling (rule:table-rows) and drag handles work on hidden rows as on any block; keyboard navigation with
    the arrow keys can land in a hidden row — the build has to skip hidden rows or accept the caret being
    invisible for one keystroke (the ui test checks this).
  affects: [req:wf2.editor.table-filter, rule:table-rows, component:data-table]
  status: proposed
  date: 2026-09-18
  session: bd2ece3698
- id: question:wf2.table-filter-sort
  q: >
    Should the data table also sort and group like component:instance-table does (sort by a column, group by a
    property), or is filtering enough for now?
  context: >
    Sorting or grouping the rows in the editor means showing the child blocks in a different order than the file
    has them (or reordering the blocks, which changes the file). req:wf2.editor.table-filter asks for filters
    only; sort and group are a separate requirement if wanted.
  affects: [req:wf2.editor.table-filter, component:data-table]
  status: open
  date: 2026-09-18
  session: bd2ece3698
```

## Tasks

- [x] task:table-filter-req Write req:wf2.editor.table-filter under Tables on app-documents, proposed; the two decisions and the open question on this plan — part of pr:5
- [x] task:table-filter-marker `COLLECTION_OPEN` accepts a trailing key=value query, the collection block gets a `query` prop, `collectionMarker` / serialize.ts write it back; test:web-lib#import covers a marker with and without a query — part of pr:5 (session: bd2ece3698)
- [x] task:table-filter-toolbar The Data table header gets a filter toggle and toolbar (search, status chips with counts, a chip row per enum / bool column, a select per ref column, owner for goals and tasks), "n of m" and "clear filters"; rows that do not match get a hidden class, the trailing empty row stays; filtering uses lib:instance-table's filterRows — part of pr:5 (session: bd2ece3698)
- [x] task:table-filter-rule rule:table-filter shipped under Tables on app-documents (source: import.ts#COLLECTION_OPEN, DocEditor.tsx#CollectionBlock, globals.css), req:wf2.editor.table-filter shipped, component:data-table's purpose names the filter — part of pr:5
- [x] task:table-filter-ui-test ui-test:table-filter in test-design: a filter hides rows and keeps the file's rows, the marker carries the query, reload keeps the filter, clear restores the bare marker — part of pr:5

## Result

Data table filters shipped (req:wf2.editor.table-filter, rule:table-filter): the table header has a filter toggle and toolbar — search, status chips with counts, a chip row per enum / bool column, a select per ref column (owner for goals and tasks), n of m, clear — matched with lib/instance-table#filterRows; the filters live on the marker line (<!-- table:bug status=open priority=high -->, decision:wf2.table-filter-on-marker) via COLLECTION_OPEN / serialize.ts; rows that do not match are hidden by a style element the header renders, never removed (decision:wf2.table-filter-hides-rows); the trailing empty row and the row the cursor is in are never hidden; the query is written with setNodeMarkup; a row text click whose block is not the cursor block brings the selection along (fixes one-row-per-letter after a toolbar transaction). ui-test:table-filter 25/25 in Chrome (self-contained scratch product), table-scroll 14/14, 191 unit tests, tsc clean; committed b7ff5d5. Open: question:wf2.table-filter-sort (sort / group in the editor table). Sent to the inbox: req shipped, rule shipped, 2 decisions proposed, 1 question open.

Blocks this plan produced:

- added req:wf2.editor.table-filter — A data table can be filtered by the person reading it
- added decision:wf2.table-filter-on-marker — A data table keeps its filters on its marker line, like a view block
- added decision:wf2.table-filter-hides-rows — A filter hides rows in the editor; the rows stay children of the table and stay in the file
- added question:wf2.table-filter-sort — wf2.table-filter-sort
- added task:table-filter-req — Write req:wf2.editor.table-filter under Tables on app-documents, proposed;
- added task:table-filter-marker — `COLLECTION_OPEN` accepts a trailing key=value query, the collection block gets a `query` prop, `collectionMar
- added task:table-filter-toolbar — The Data table header gets a filter toggle and toolbar (search, status chips with counts, a chip row per enum 
- added task:table-filter-rule — rule:table-filter shipped under Tables on app-documents (source:
- added task:table-filter-ui-test — ui-test:table-filter in test-design:
- added pr:6 — improve context window, when i click to the element, i would like to be able to add…
- added decision:wf2.connected-rows-expand-to-cards — A connected row expands in place into the node's embedded card
- added task:connected-cards-rows — Expand toggle on every Connected and tracking row;
- added task:connected-cards-groups — Cards / tags toggle on every group heading part of pr:6
- added task:connected-cards-css — The expanded card spans the column under its row part of pr:6
- added task:connected-cards-ui-test — Verify in Chrome via playwright-core:
- added task:connected-cards-knowledge — req:wf2.ui.connected-cards and rule:connected-cards shipped, component:peek-panel refined, ui-test recorded pa
- changed component:peek-panel — peek-panel
- changed page:web/context-column — web/context-column
- added req:wf2.ui.connected-cards — A connected node opens as its card under its row in the context column
- added rule:connected-cards — connected-cards
- added ui-test:connected-cards — connected-cards
- added pr:7 — still bad!
- added action:select-block — a click anywhere on a typed block of the document selects it: the Context root shows the node (rule:block-sele
- added req:wf2.ui.block-select — A click anywhere on a block shows its node in the context column
- added rule:block-select — block-select
- added goal:ontology.graph-editor — The document is a graph editor
- added question:ontology.child-nodes — How is a child node — a comment on a block — written in the markdown?
- added task:ontology.block-select — A click anywhere on a typed block — card, row, embed, text included — selects it and the context column shows 
- added task:ontology.paragraph-select — A click in a plain paragraph selects its block node:
- added task:ontology.children-in-column — The context column shows a node's `content` — its child blocks:
- added decision:wf2.block-click-selects — A click anywhere on a block selects it; the column's Context root shows the node
- added decision:wf2.graph-editor-is-a-goal — The graph-editor vision is a goal on the ontology design, built in steps
- added task:block-select-provider — `select(id)` and `focused` on PeekProvider;
- added task:block-select-blocks — `onSelect` on CardHost, attached to the outermost element of ProseCard, QuestionCard and DecisionCard (clicks 
- added task:block-select-ui-test — ui-test:block-select in Chrome via playwright-core on a scratch product:
- added task:block-select-knowledge — req:wf2.ui.block-select and rule:block-select shipped on dev-design;
- added task:ontology.child-nodes-design — The uniform content model (decision:ontology.uniform-content):
- added ui-test:block-select — block-select
- added decision:ontology.uniform-content — Every node has the same `content` field — a list of child blocks — and everything else related is a ref
- changed component:data-table — data-table
- added rule:table-filter — table-filter
- added ui-test:table-filter — table-filter

99 paragraphs added or changed — [per document](/waterfall/sessions/bd2ece3698/changes)
