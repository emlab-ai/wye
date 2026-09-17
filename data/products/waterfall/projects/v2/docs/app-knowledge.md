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
    Everything the graph knows, by kind; a kind page lists title, status, where defined and relations.
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
    title first, then every property as a label/value row — status, the text, the ones its type declares (enum →
    select, bool → checkbox, ref → a select of that type's instances or ids with tags), the keys the card carries,
    and for goals and tasks their tracking fields (due/target, owner, progress, part-of goal — the former
    TrackEditor, folded in here); empty optional ones under "n more properties". Images in a prose node's text show
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
- id: op:api.context
  args: POST /api/<product>/context
  does: >
    Knowledge closest to a piece of text: local semantic + keyword ranking → hits with scores and snippets.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-knowledge
- id: op:api.inbox
  args: GET | POST /api/<product>/inbox and /inbox/<name>
  does: >
    Inbox items: list, add (agents: wf inbox add), file into a document as a node, dismiss.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-knowledge
```
