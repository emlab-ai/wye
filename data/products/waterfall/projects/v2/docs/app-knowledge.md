---
node: module:app-knowledge
type: module
title: Knowledge views
status: proposed
owner: unassigned
last-verified: 2026-09-17
part-of: module:app
sources:
  - packages/web/src/components/TrackList.tsx
  - packages/web/src/components/NodeEditor.tsx
  - packages/web/src/components/QuestionList.tsx
  - packages/web/src/components/InboxList.tsx
  - packages/web/src/components/InboxNote.tsx
  - packages/web/src/components/ReviewList.tsx
  - packages/web/src/components/GraphView.tsx
  - packages/web/src/components/ContextPanel.tsx
  - packages/web/src/components/TypeRows.tsx
  - packages/web/src/components/TypeView.tsx
  - packages/web/src/components/AddInstance.tsx
  - packages/web/src/components/AddType.tsx
---

# App — knowledge views

```yaml
- id: module:app-knowledge
  purpose: >
    The graph read as views: Knowledge by kind, Types (the ontology), Goals and Tasks as tracking lists, Questions, the Inbox review queue, the Graph mind map, and the Context mode that finds knowledge near what is being written. Nothing here is stored — every view is derived from the documents through graph.json.
```

## Requirements and rules

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.ui.graph, req:wf2.ui.graph-edit, req:wf2.ui.tasks, req:wf2.ui.decisions, req:wf2.store.first-class-questions, req:ontology.type-page, req:wf2.decisions.timeline. Rules the code enforces: rule:goals-and-tasks, rule:questions-view, rule:inbox-review, rule:context-panel, rule:mindmap-layout, rule:graph-presets, rule:question-decision-nodes, rule:ontology.hidden-kinds, rule:task-artifacts. Pages: page:web/knowledge, page:web/types, page:web/goals, page:web/tasks, page:web/questions, page:web/inbox, page:web/graph.

## Pages

Screens this module adds (the others are described in the dev design and linked above).

```yaml
- id: page:web/goals
  route: /<product>/goals
  component: app/[product]/goals/page.tsx
  purpose: >
    Every goal as a tracking list (search, status chips, sub-goals, progress); a row opens the goal in the context column.
  part-of: module:app-knowledge
- id: page:web/knowledge
  route: /<product>/knowledge and /knowledge/<kind>
  component: app/[product]/knowledge/page.tsx; app/[product]/knowledge/[kind]/page.tsx
  purpose: >
    Everything the graph knows, by kind; a kind page is component:instance-table over that kind — a declared type
    gets a column per property, a bare kind its relations — with search, status, group by and sort in the URL.
  part-of: module:app-knowledge
- id: page:web/questions
  route: /<product>/questions
  component: app/[product]/questions/page.tsx
  purpose: >
    Open question blocks (and inbox questions) first, resolved after; each can be sent to an agent.
  part-of: module:app-knowledge
- id: page:web/inbox
  route: /<product>/inbox
  component: app/[product]/inbox/page.tsx
  purpose: >
    Review queue: proposed decisions, requirements, rules and goals and open questions written in the documents — approve, reject, resolve in place; raw notes below to file or dismiss.
  part-of: module:app-knowledge
```

## Components

React components (`component:` cards). `side` says whether it renders on the server or hydrates in the browser.

```yaml
- id: component:track-list
  file: packages/web/src/components/TrackList.tsx
  side: client
  purpose: >
    Goals or tasks as a tracking list: search, status filter, nested sub-items; a row opens the item in the right column.
  part-of: module:app-knowledge
- id: component:node-editor
  file: packages/web/src/components/NodeEditor.tsx
  side: client
  purpose: >
    A node's page in the right column, laid out like a Notion task (task:new-826, bug:properties-need-to-be): the
    kind and id, then every property as a label/value row — status, the ones its type declares (enum →
    select, bool → checkbox, ref → a select of that type's instances or ids with tags), the keys the card carries,
    and for goals and tasks their tracking fields (due/target, owner, progress, part-of goal — the former
    TrackEditor, folded in here); the node's text is not a field here but the first block of the Content editor
    under the properties (decision:wf2.text-is-first-block); empty optional ones under "n more properties". Images in a prose node's text show
    under the title and stay in the line. Every change writes back to the defining line (prose) or the yaml card
    (patchYamlCard) and rebuilds the graph.
  part-of: module:app-knowledge
- id: component:question-list
  file: packages/web/src/components/QuestionList.tsx
  side: client
  purpose: >
    Question blocks and inbox questions as one list, open first; each row sends the question to an agent or opens it.
  part-of: module:app-knowledge
- id: component:inbox-list
  file: packages/web/src/components/InboxList.tsx
  side: client
  purpose: >
    Inbox items to review: each one can be filed into a document as a node (with a suggested document and id) or dismissed. Filed and dismissed items stay for the record.
  part-of: module:app-knowledge
- id: component:inbox-note
  file: packages/web/src/components/InboxNote.tsx
  side: client
  purpose: >
    Add a text note (or a pasted conversation) to the product inbox.
  part-of: module:app-knowledge
- id: component:review-list
  file: packages/web/src/components/ReviewList.tsx
  side: client
  purpose: >
    Review what agents wrote into the documents: approve, reject or resolve in place; open the node or its document.
  part-of: module:app-knowledge
- id: component:graph-view
  file: packages/web/src/components/GraphView.tsx
  side: client
  purpose: >
    React Flow needs to own node state to record measured sizes; re-seed it whenever the computed graph changes.
  part-of: module:app-knowledge
- id: component:context-panel
  file: packages/web/src/components/ContextPanel.tsx
  side: client
  purpose: >
    Context for what is being written: the current block's text goes to the product's local semantic search and the closest knowledge comes back; \"+ link\" inserts a smart tag at the cursor, the tag opens the node.
  part-of: module:app-knowledge
- id: component:type-rows
  file: packages/web/src/components/TypeRows.tsx
  side: client
  purpose: >
    Rows of the Types page: the whole row opens the type in the context column; the ↗ and the parent tag are their own links.
  part-of: module:app-knowledge
- id: component:instance-table
  file: packages/web/src/components/InstanceTable.tsx
  side: client
  purpose: >
    Every instance of one type (or every node of one kind) as a filterable table: search, status chips with counts,
    one filter per enum / ref / bool property, group by, sort by column, a column per declared property; the filters
    live in the URL so a filtered list is a link. Rendered by the type page, the kind page and the view block.
  part-of: module:app-knowledge
- id: component:view-block
  file: packages/web/src/components/ViewBlock.tsx
  side: client
  purpose: >
    The `view` block of the editor: a live, read-only component:instance-table of one type inside a document. Its
    header picks the type; the rows come from op:api.view (refetched on every graph change); the filters are the
    block's `query` prop and are written back to its `<!-- view:<slug> key=value -->` line (rule:view-block).
  part-of: module:app-knowledge
- id: component:type-view
  file: packages/web/src/components/TypeView.tsx
  side: client
  purpose: >
    A type in the context column: its card (purpose, extends, open), its own properties as an editable table, the inherited ones greyed with their declaring type, then every instance — the \"connected\" list of a type.
  part-of: module:app-knowledge
- id: component:add-instance
  file: packages/web/src/components/AddInstance.tsx
  side: client
  purpose: >
    \"+ add\" on a type page: writes a `<type>:<slug>` card with the type's required properties into the type's home document.
  part-of: module:app-knowledge
- id: component:add-type
  file: packages/web/src/components/AddType.tsx
  side: client
  purpose: >
    \"+ add type\" on the Types index: writes a `type:<slug>` card (extends, purpose) into the product's ontology document and opens the new type in the context column, where its properties are added.
  part-of: module:app-knowledge
```

## Libraries

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

```yaml
- id: lib:graph
  file: packages/web/src/lib/graph.ts
  side: shared
  purpose: >
    ontology (lib/parse.js pass 1): a property of a type, effective on the type (own or inherited from `from`)
  part-of: module:app-knowledge
- id: lib:types
  file: packages/web/src/lib/types.ts
  side: shared
  purpose: >
    Ontology helpers over graph.json: a node's type (its kind prefix), the extends chain, instances of a type and the properties a node has — declared on its type or inherited — with the values it fills in.
  part-of: module:app-knowledge
- id: lib:instance-table
  file: packages/web/src/lib/instance-table.ts
  side: shared
  purpose: >
    Every instance of one type (or every node of one kind) as table rows with a column per declared property, and
    the pure filter / group / sort a person applies (search over id, title and values; status; one value per column,
    a list cell matching any item; group by document, status or a column; sort by a column, `-col` descending).
    The state round-trips to a URL query (parseFilters / filtersToQuery) and to a view line's key=value pairs
    (parseViewQuery / viewQuery). Tested by test:web-lib#instance-table.
  part-of: module:app-knowledge
- id: lib:track
  file: packages/web/src/lib/track.ts
  side: shared
  purpose: >
    Goals (or tasks) of a product as a tree: an item nests under the goal it is part of when that goal is of the same kind; everything else is a root, ordered by id.
  part-of: module:app-knowledge
- id: lib:review
  file: packages/web/src/lib/review.ts
  side: shared
  purpose: >
    The review queue is a view over the documents: nodes agents (or people) wrote that nobody has approved yet. Decisions, requirements, rules, goals and entities carry `proposed` until approved; questions stay open until resolved. Nothing here is stored separately — approving edits the node's status in its document.
  part-of: module:app-knowledge
- id: lib:inbox
  file: packages/web/src/lib/inbox.ts
  side: server
  purpose: >
    The inbox: knowledge candidates (decisions, requirements, rules, questions, notes) that agents and people drop in. Nothing enters the documents from here without a review: an item is filed into a document as a node, or dismissed.
  part-of: module:app-knowledge
- id: lib:semantic
  file: packages/web/src/lib/semantic.ts
  side: server
  purpose: >
    Local semantic search over a product's knowledge: every defined node (title + text) is embedded once with a small sentence model that runs in-process (transformers.js, MiniLM, ~23 MB, cached under .cache/models); vectors are cached in the product's _build/embeddings.json and refreshed when graph.json is newer. Queries 
  part-of: module:app-knowledge
```

## API

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.

```yaml
- id: op:api.node
  args: GET | PUT /api/<product>/node/<id>
  does: >
    A node with its relations, neighbourhood, type and effective properties; PUT edits status, text or props of its defining line (records the session's artifact).
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-knowledge
- id: op:api.types.add
  args: POST /api/<product>/types
  does: >
    Add a type: card (extends, purpose) to the product's ontology document.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-knowledge
- id: op:api.view
  args: GET /api/<product>/view/<slug>
  does: >
    A type's (or kind's) instances as component:instance-table rows — columns, rows with their property values
    (relations for a bare kind), status counts — for the view block; filters are applied in the browser.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/view/[slug]/route.ts
  part-of: module:app-knowledge
- id: op:api.context
  args: POST /api/<product>/context { text, limit?, all?, asOf? }
  does: >
    Knowledge closest to a piece of text: local semantic + keyword ranking → hits with scores and snippets. Superseded,
    rejected and retired nodes leave the ranking by construction and are counted in `hidden` unless `all` or `asOf`
    (req:memory.current-by-construction).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/context/route.ts; packages/web/src/lib/semantic.ts#search
  part-of: module:app-knowledge
- id: op:api.packet
  args: POST /api/<product>/packet { text?, refs?, budget?, all?, asOf? }
  does: >
    The constraint packet (decision:memory.constraint-packet, req:memory.intake-packet): what governs a request. Seeds
    are the refs (ids or links) plus the semantic hits for the text; from them every rule, constraint, gate, lesson,
    goal and approved decision within two hops over governs, gated-by, affects, refines, part-of, depends-on and
    scope, plus every open question on those nodes — complete, ended nodes out by construction; rendered as markdown
    with the budget shared across kinds. `wf packet --for "<text>" [--ref id]` calls it; buildPrompt puts it in every
    first message under "Constraints in force"; `ctx constraints --task` is the offline twin.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/packet/route.ts; packages/web/src/lib/packet.ts; lib/graph.js#constraints; bin/wf.js
  status: shipped
  part-of: module:app-knowledge
- id: op:api.verdicts
  args: GET | POST /api/<product>/verdicts { ids, budget? }
  does: >
    The verdict pass (decision:memory.write-time-verdict, req:memory.verdicts): GET the judge log; POST classifies the
    given decision / req / rule / constraint nodes against their neighbours now — the same pass the watcher runs after
    a rebuild when `verdicts: on` is set in _product.md. Verdicts that are not "consistent" are written under the node as
    verdict: lines and, for contradicts / duplicate, an open contradiction: line; consistent ones stay in the log
    (_build/verdicts.json, keyed by pair, with model and prompt hash). `wf verdicts <id>` calls it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/verdicts/route.ts; packages/web/src/lib/verdicts.ts; lib/judge.js; lib/graph.js#verdictPairs; packages/web/src/lib/watch.ts
  status: shipped
  part-of: module:app-knowledge
- id: lib:consolidate
  purpose: >
    Consolidation at session end (decision:memory.consolidate-sessions): on a done session the transcript (the person's
    and the agent's words, numbered) goes to the model once with the blocks the session wrote; what was decided,
    constrained, asked or learned and not written comes back as candidates and is filed under the plan document's Plan
    section as proposed decision: / constraint: / lesson: cards and open question: cards, each with `by:` and
    `evidence: [session:<id>#<n>]`. Behind flag:consolidate; the session log says what was filed.
  file: packages/web/src/lib/consolidate.ts
  side: server
  status: shipped
  part-of: module:app-knowledge
- id: op:api.inbox
  args: GET | POST /api/<product>/inbox and /inbox/<name>
  does: >
    Inbox items: list, add (agents: wf inbox add), file into a document as a node, dismiss.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-knowledge
```

## Plan: all instances of a type, with filters (task:new-453)

Today a type's instances are a plain table on `/types/<slug>` (page:web/types) and a kind's nodes a plain list on
`/knowledge/<kind>` (page:web/knowledge); only Goals and Tasks (component:track-list) have search, status chips and
group by. task:new-453 asks for one place to see *all* cards of a type — pages, managers, tasks — and narrow them.
The plan: one client component, component:instance-table, that both pages render, then the same table as a block
inside a document (a Notion "linked database": a live view, nothing stored).

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
- id: decision:wf2.one-instance-table
  title: One instance table for the type page, the kind page and the view block
  context: >
    Three places list "all nodes of one type": the kind page (relations, no properties, no filters), the type page
    (properties, no filters) and TrackList (filters, goals and tasks only). task:new-453 asks for filters on any type.
  choice: >
    One client component (component:instance-table) with rows computed on the server (lib:instances — pure: rows of
    a type with their effective properties, filter / group / sort, tested with vitest) and rendered by the type page,
    the kind page and a read-only `view` block in the editor. The kind page keeps its relations column for kinds
    without a declared type. Goals and Tasks keep component:track-list (nesting, progress) — the instance table does
    not replace it. Filters live in the URL, not in saved views.
  alternatives: >
    Filters on the type page only — the kind page stays a second, poorer list of the same nodes; a query language
    in the block (`where status = open`) — more to learn than a toolbar, can come later on top of key=value; saved
    named views — a store for something the URL already carries.
  consequences: >
    page:web/types and page:web/knowledge say they render component:instance-table; a `view` block spec next to
    the collection block in DocEditor; rule:type-tables stays (a table *creates* rows, a view *shows* them).
  status: proposed
  date: 2026-09-17
  related-to: [decision:wf2.one-table-block, rule:type-tables, rule:goals-and-tasks]
  session: 53f99bfd98
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
- id: decision:wf2.view-block-now
  title: The view block ships with the filterable page, in one change
  context: >
    question:wf2.view-block-now asked whether the block is part of task:new-453 or a follow-up.
  choice: >
    Both — the person answered Proceed on the plan without narrowing it, so the page and the view block were built
    together (task:instance-table, task:instance-view-block).
  alternatives: >
    Page only, block later.
  consequences: >
    req:wf2.instances.view-block is shipped with req:wf2.instances.filter; rule:view-block holds the syntax.
  status: proposed
  date: 2026-09-17
  resolves: question:wf2.view-block-now
  session: 53f99bfd98
- id: rule:view-block
  statement: >
    A document may hold a view of a type's instances: one line `<!-- view:<slug> key=value … -->` (an HTML comment,
    so other readers ignore it; not a node). The editor shows it as a `view` block — the type picker in its header,
    component:instance-table under it, rows fetched from op:api.view and refetched on every graph change — and
    writes the toolbar state back to the line as key=value pairs (q, status, group, sort, one key per column; a
    value with spaces in double quotes); an empty query leaves the line as `<!-- view:<slug> -->`. Changing the
    type clears the query. A type the product does not declare still lists its kind's nodes (with relations) and
    the header says so. "Instances view" in the slash menu (group Waterfall) inserts one.
  source: packages/web/src/lib/import.ts#VIEW_LINE; packages/web/src/lib/serialize.ts; packages/web/src/components/ViewBlock.tsx; packages/web/src/lib/instance-table.ts#parseViewQuery
  status: shipped
  verified-by: [test:web-lib#import, test:web-lib#instance-table, ui-test:instance-table]
  related-to: [rule:type-tables, req:wf2.instances.view-block]
```

Work, in order:

- [x] task:instance-table lib:instance-table (rows, filter, group, sort — vitest) and component:instance-table; the type page and the kind page render it with the toolbar and URL state; part of req:wf2.instances.filter, part of task:new-453. (session: 53f99bfd98)
- [x] task:instance-view-block The `view` block in DocEditor: slash item "Instances view", `<!-- view:<slug> key=value -->` in import.ts / serialize.ts, type picker in the header, component:instance-table inside, read-only; part of req:wf2.instances.view-block, part of task:new-453. (session: 53f99bfd98)
- [x] task:instance-table-ui-test ui-test:instance-table — open /types/bug, filter by status and an enum property, group by, copy the URL and reopen it; a view block in a document shows the same rows; part of req:wf2.instances.filter. (run by hand with playwright-core, 2026-09-17; in CI when task:ui-tests-in-ci lands)
