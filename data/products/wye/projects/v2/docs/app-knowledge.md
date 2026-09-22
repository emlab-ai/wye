---
node: module:app-knowledge
type: module
title: Knowledge and search
status: proposed
owner: unassigned
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
part-of: module:app
order: 42
last-verified: 2026-09-20
---

# Knowledge and search

Knowledge and search

```yaml
- id: module:app-knowledge
  purpose: >
    The graph read as views: Knowledge by kind, Types (the ontology), Goals and Tasks as tracking lists, Questions, the Inbox review queue, the Graph mind map, and the Context mode that finds knowledge near what is being written. Nothing here is stored — every view is derived from the documents through graph.json.
```

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.ui.graph, req:wf2.ui.graph-edit, req:wf2.ui.tasks, req:wf2.ui.decisions, req:wf2.store.first-class-questions, req:ontology.type-page, req:wf2.decisions.timeline. Rules the code enforces: rule:goals-and-tasks, rule:questions-view, rule:inbox-review, rule:context-panel, rule:mindmap-layout, rule:graph-presets, rule:question-decision-nodes, rule:ontology.hidden-kinds, rule:task-artifacts. Pages: page:web/knowledge, page:web/types, page:web/goals, page:web/tasks, page:web/questions, page:web/inbox, page:web/graph.

Screens this module adds (the others are described in the dev design and linked above).

React components (`component:` cards). `side` says whether it renders on the server or hydrates in the browser.

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.


## Rules

<!-- list:rule -->

```yaml
- id: rule:view-block
  source: packages/web/src/lib/import.ts#VIEW_LINE; packages/web/src/lib/serialize.ts; packages/web/src/components/ViewBlock.tsx; packages/web/src/lib/instance-table.ts#parseViewQuery
  status: shipped
  verified-by: [test:web-lib#import, test:web-lib#instance-table, ui-test:instance-table]
  related-to: [rule:type-tables, req:wf2.instances.view-block]
  title: A document may hold a view of a type's instances:
```

  - statement:view-block A document may hold a view of a type's instances: one line `<!-- view:<slug> key=value … -->` (an HTML comment, so other readers ignore it; not a node). The editor shows it as a `view` block — the type picker in its header, component:instance-table under it, rows fetched from op:api.view and refetched on every graph change — and writes the toolbar state back to the line as key=value pairs (q, status, group, sort, one key per column; a value with spaces in double quotes); an empty query leaves the line as `<!-- view:<slug> -->`. Changing the type clears the query. A type the product does not declare still lists its kind's nodes (with relations) and the header says so. "Instances view" in the slash menu (group Waterfall) inserts one.

```yaml
- id: rule:context-panel
  source: packages/web/src/lib/semantic.ts; packages/web/src/components/ContextPanel.tsx; packages/web/src/app/api/[product]/context/route.ts
  status: shipped
  verified-by: [test:web-lib#semantic]
  title: >
    While a block is being edited, the right panel's Context mode shows the product knowledge closest to that bloc
```

  - statement:context-panel While a block is being edited, the right panel's Context mode shows the product knowledge closest to that block's text: the text is embedded locally (transformers.js, MiniLM) and ranked against every defined node by cosine similarity blended 70/30 with a keyword score; the node being edited and ids it already links are excluded. "+ link" inserts the node's tag at the cursor (padded with a space when glued to a word); the tag or row opens the node. Embeddings are cached in the product's _build/embeddings.json and refreshed per node when its text changes. Nothing is sent off the machine.

```yaml
- id: rule:inbox-review
  source: packages/web/src/lib/review.ts; packages/web/src/components/ReviewList.tsx; packages/web/src/lib/node-edit.ts
  status: shipped
  title: The Inbox is a review view over the documents, not a store:
```

  - statement:inbox-review The Inbox is a review view over the documents, not a store: it lists the blocks nobody has approved yet — decisions, requirements, rules, goals with `status: proposed` (or draft) and questions still open — grouped by kind with their fields and refs. Approve / Reject / Resolve change the block's status in its document (prose lines and yaml cards alike); "Approve all" takes a group. Raw notes without a document (pasted material) still land in the inbox folder below the queue. The Questions page shows question blocks only.

```yaml
- id: rule:mindmap-layout
  source: packages/web/src/lib/layout.ts#layoutMindMap
  status: unverified
  verified-by: [test:web-lib#layout]
  requires-tests: [test:web-components#graph-layout]
  title: >
    The graph view lays out the focus node's tree (refines and has edges, outgoing from the focus, depth from the
```

  - statement:mindmap-layout The graph view lays out the focus node's tree (refines and has edges, outgoing from the focus, depth from the preset) with dagre left-to-right, draws remaining structural edges among visible nodes as cross-links, and hides mentions unless the preset is Everything.

<!-- /list:rule -->

## Decisions

<!-- list:decision -->

```yaml
- id: decision:wf2.jev-judges-never-finds
  title: Jev judges candidate links; the local search finds them
  affects: [req:wf2.link.jev, lib:links, lib:jev]
  status: approved
  date: 2026-09-20
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
```

  - choice:wf2.jev-judges-never-finds Candidates always come from the local search (top 12–15); Jev gets one noul question per candidate in one call and answers how likely the text is about it. One threshold, 0.85, decides what is linked automatically; below it a candidate stays a suggestion. The same step (lib:links judgeText) serves the inbox, the editor and consolidation.

  - context:wf2.jev-judges-never-finds Jev (TypeSafe AI's System One model) answers typed questions about a text — yes/no, a choice, a score — with calibrated probabilities in one pass, 70–500 ms, for a fraction of a cent; it cannot extract spans or classify words. The product already has a local semantic search (lib:semantic) that finds the closest knowledge but has no notion of "is this actually about X".

  - alternative:wf2.jev-judges-never-finds Ask Jev to find entities — rejected: not what it does. Ask a text model to link — rejected: slower and costlier for a judgement that is a probability, not prose; the judge (lib/judge.js) stays a candidate for the same move later.

  - consequence:wf2.jev-judges-never-finds Nothing links that the search did not surface. The question wording is versioned (promptVersion) and the editor's cache keyed on it, so a rewording re-judges everything once.

```yaml
- id: decision:wf2.jev-key-in-settings
  title: The Jev key lives in the app's settings, never in a product's frontmatter or the environment
  affects: [req:wf2.link.jev, page:web/settings, lib:settings]
  status: approved
  date: 2026-09-20
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
```

  - choice:wf2.jev-key-in-settings A Settings page (rail ⚙, /<product>/settings, app-wide) with the key masked, Save / Test / Remove; stored in data/_settings.json (mode 0600, gitignored) behind lib:settings; the browser only ever sees set + last 4. A stored key is the switch — there is no separate toggle. TYPESAFE_API_KEY in the environment is only the fallback for tests and evals outside the app.

  - context:wf2.jev-key-in-settings Product switches (impact, consolidate, verdicts) are _product.md frontmatter, which is committed — and the repo is public. A key is per machine, not per product.

  - alternative:wf2.jev-key-in-settings packages/web/.env.local — rejected by alex: the key has to be entered in the app's settings.

  - consequence:wf2.jev-key-in-settings Every judging path runs in the app (the inbox add API, the links route, consolidation), so the CLI never needs the key. The first settings page of the app; other app-wide settings go there.

```yaml
- id: decision:wf2.editor-links-on-blur
  title: Automatic links are applied in the editor on leaving it, never by the server behind it
  affects: [req:wf2.link.jev, component:doc-editor, lib:apply-links, op:api.links]
  status: approved
  date: 2026-09-20
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
```

  - choice:wf2.editor-links-on-blur On blur — the hook that already turns typed ids into tags — the blocks whose text changed since they were last judged go to op:api.links; the confident ids come back and lib:apply-links appends them as tags (paragraph, prose node) or merges them into related-to (yaml card); then the normal save runs. Verdicts are cached by text hash in _build/jev.json so an unchanged block is never judged twice.

  - context:wf2.editor-links-on-blur The editor autosaves the whole body with an ifMatch hash (replace-body); a server-side write into an open document would make the next save conflict (409) and reload the page under the cursor.

  - alternative:wf2.editor-links-on-blur The server writing related-to after the save — rejected (conflict). Suggest only, never write — kept as the fallback if 0.85 proves too eager: a one-line change in applyLinks makes paragraphs suggestion-only.

  - consequence:wf2.editor-links-on-blur A tag appended to a person's paragraph is a visible, undoable edit like any other; the Context column shows beforehand what will be linked.

```yaml
- id: decision:wf2.one-instance-table
  title: One instance table for the type page, the kind page and the view block
  status: approved
  date: 2026-09-17
  related-to: [decision:wf2.one-table-block, rule:type-tables, rule:goals-and-tasks]
  session: 53f99bfd98
```

  - choice:wf2.one-instance-table One client component (component:instance-table) with rows computed on the server (lib:instances — pure: rows of a type with their effective properties, filter / group / sort, tested with vitest) and rendered by the type page, the kind page and a read-only `view` block in the editor. The kind page keeps its relations column for kinds without a declared type. Goals and Tasks keep component:track-list (nesting, progress) — the instance table does not replace it. Filters live in the URL, not in saved views.

  - context:wf2.one-instance-table Three places list "all nodes of one type": the kind page (relations, no properties, no filters), the type page (properties, no filters) and TrackList (filters, goals and tasks only). task:new-453 asks for filters on any type.

  - alternative:wf2.one-instance-table Filters on the type page only — the kind page stays a second, poorer list of the same nodes; a query language in the block (`where status = open`) — more to learn than a toolbar, can come later on top of key=value; saved named views — a store for something the URL already carries.

  - consequence:wf2.one-instance-table page:web/types and page:web/knowledge say they render component:instance-table; a `view` block spec next to the collection block in DocEditor; rule:type-tables stays (a table *creates* rows, a view *shows* them).

```yaml
- id: decision:wf2.view-block-now
  title: The view block ships with the filterable page, in one change
  status: approved
  date: 2026-09-17
  resolves: question:wf2.view-block-now
  session: 53f99bfd98
```

  - choice:wf2.view-block-now Both — the person answered Proceed on the plan without narrowing it, so the page and the view block were built together (task:instance-table, task:instance-view-block).

  - context:wf2.view-block-now question:wf2.view-block-now asked whether the block is part of task:new-453 or a follow-up.

  - alternative:wf2.view-block-now Page only, block later.

  - consequence:wf2.view-block-now req:wf2.instances.view-block is shipped with req:wf2.instances.filter; rule:view-block holds the syntax.

<!-- /list:decision -->

## Libraries

<!-- list:lib -->

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
```

<!-- /list:lib -->
