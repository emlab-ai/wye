---
node: module:req-documents
type: module
title: Requirements — Documents and editing
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 13
---

# Requirements — Documents and editing

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Documents and editing); what a person sees on the Experience pages. Open questions wait at the end.

<!-- view:req -->

## Requirements

```yaml
- id: req:wf2.editor.table-scroll
  title: A data table scrolls sideways when the editor is narrower than its columns
  when: >
    a document shows a data table (goals, tasks or a type's) and the editor is narrower than the sum of the table's
    column widths — a small screen, or the context column open beside the document
  then: >
    the name column keeps a readable minimum width, every other column its minimum, and the table block scrolls
    horizontally as one — header and rows together, the rest of the document unchanged
  unless: the editor is wide enough — the table fills its width as today, no scrollbar
  status: shipped
  refines: [req:wf2.ui.node-page]
  satisfied-by: [rule:table-scroll]
  verified-by: [ui-test:table-scroll]
  part-of: module:req-documents
- id: req:wf2.editor.table-filter
  title: A data table can be filtered by the person reading it
  when: >
    a document shows a data table (goals, tasks or a type's) and the person adds a filter from its header —
    a search over the rows' text and property values, a status, one value per enum / bool / ref column the
    type declares (owner for goals and tasks)
  then: >
    only the rows that match stay visible, the header says how many of the rows match and offers to clear
    the filters, the trailing empty row stays so a row can still be added, and the filters are kept with the
    table (the same person and anyone else opening the document see the filtered table until the filters are
    cleared); the hidden rows are still rows of the table — nothing is removed from the file
  unless: no filter is set — the table shows every row as today, with no toolbar in the way
  status: shipped
  refines: [req:wf2.ui.node-page]
  related-to: [req:wf2.instances.filter, rule:type-tables, rule:goals-and-tasks]
  satisfied-by: [rule:table-filter]
  verified-by: [ui-test:table-filter, test:web-lib#import]
  part-of: module:req-documents
- id: req:wf2.editor.list-block
  title: A data list shows one kind of block as ordinary blocks, filtered from the top, and a new block is one of the same kind
  when: >
    the person inserts a Data list (slash menu) or switches a data table to its list view, picks the kind (tasks,
    goals, or a type the product declares) and reads or writes in it
  then: >
    the blocks of that kind show as they do anywhere in the document — checkbox, kind, id, status, properties,
    their content folded — under the same filter bar the data table has (search, status, enum / bool / ref
    values), the hidden ones stay in the file; Enter after a block, or typing into the trailing empty block,
    adds a block of the same kind with an id; the header switches between list and table without changing the
    blocks; the region is written as `<!-- list:<kind> [filters] --> … <!-- /list:<kind> -->`
  unless: the region is a table — then it renders as rows as today (`<!-- tasks -->`, `<!-- table:bug -->`)
  status: shipped
  refines: [req:wf2.editor.table-filter]
  related-to: [req:wf2.instances.view-block, rule:goals-and-tasks, rule:type-tables]
  satisfied-by: [rule:list-view]
  verified-by: [test:web-lib#import]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
- id: req:wf2.cards.decision-essence
  title: A decision card reads as a decision
  when: a document shows a decision yaml card in the editor
  then: >
    the card shows the header (kind, slug, status), the title, and context, choice and alternatives as prose
    sections; consequences, date, affects, related-to, session and every other key are hidden until "details"
    is toggled, where they appear as label/value rows above the id and the yaml editor
  unless: the yaml toggle is open, which replaces the whole body with the raw chunk
  status: shipped
  refines: >
    [req:wf2.ui.node-page]
  satisfied-by: [rule:card-essence]
  part-of: module:req-documents
- id: req:wf2.embeds.insert
  title: A person embeds a node from the slash menu
  when: a person types `/ref` or `/embed` in a document and picks a node by id or title
  then: >
    a line `![[kind:slug]]` is inserted at the cursor and rendered as the node's card at once; the document is
    saved like any other edit
  unless: the picker is dismissed — nothing is inserted
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:embed-block, decision:wf2.embed-syntax]
  verified-by: [ui-test:embeds]
  part-of: module:req-documents
- id: req:wf2.embeds.render
  title: An embed shows the node's card as the source page shows it
  when: a document (in the editor, in the server reader, or any list that embeds nodes) contains `![[kind:slug]]`
  then: >
    the node's card is rendered with the same components and layout the source page uses — header (kind pill,
    slug, status), the text, the question or decision essence sections, details on toggle — with a small
    "from <document>" line that opens the source block
  unless: the node is referenced only (not defined) — then a stub tag and "not defined" are shown
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:embed-block, decision:wf2.embed-renders-source-card]
  verified-by: [ui-test:embeds]
  part-of: module:req-documents
- id: req:wf2.embeds.edit-sync
  title: Editing an embed edits the source, and every view follows
  when: a person changes the text, the status, a checkbox or an essence field of an embedded card
  then: >
    the change is written to the node's defining line or yaml card in its source document 700 ms after the last
    keystroke (op:node.edit), the graph is rebuilt, and the source page, every other embed of the node and the
    context column show the new value without a reload
  unless: the field is the slug — it is read-only in an embed
  status: shipped
  refines: req:wf2.ui.edit-in-context
  satisfied-by: [component:embed-block, op:node.edit]
  verified-by: [ui-test:embeds, test:web-lib#embed]
  part-of: module:req-documents
- id: req:wf2.sessions.changes-cards
  title: The session changes page shows cards, not tags
  when: a person opens a session's changes (the fold on the session page or /<product>/sessions/<id>/changes)
  then: >
    every added or changed node is shown as its full card (component:embed-block, editable), under its
    document with the +/~ badge; paragraphs show their text; the change and kind chips still filter
  unless: the node was removed — it no longer exists, so its row keeps the tag and the title it had
  status: shipped
  refines: req:wf2.sessions.changes-page
  satisfied-by: [component:session-changes, component:embed-block]
  verified-by: [ui-test:embeds]
  part-of: module:app-agents
- id: req:wf2.page.node
  title: Every page is a node of the type it declares
  when: a document's frontmatter has `node: <kind>:<slug>` and `kind` is a declared type (base or the product's own)
  then: >
    the graph has that node as the document's node — defined at line 1, title and status from the frontmatter,
    the frontmatter as its body; frontmatter keys that are ref/list properties of the type (or base edge keys)
    are edges from the node named by the property; the document tree, hrefFor, the peek panel, sessions and
    `wf doc` treat it as the document whatever its kind; ctx check validates the frontmatter against the type
    (required, undeclared and mistyped properties) ignoring the page bookkeeping keys (node, title, icon,
    order, last-verified, sources, source-roots)
  unless: >
    the kind is not a declared type — ctx check reports an error and the page is not part of the graph
  status: shipped
  refines: req:ontology.types
  satisfied-by: [lib:parse, decision:wf2.page-node-typed]
  verified-by: [test:page-node]
  part-of: module:req-documents
- id: req:wf2.page.header-card
  title: The page header is the page node's card with the type's properties
  when: a person opens a document
  then: >
    the header shows the page node's type as a pill that opens a type picker, the id, the status, the icon and
    the title, then the type's effective properties (own and inherited; the root type's folded unless filled)
    as editable fields with the value type as placeholder; a field saves to the frontmatter when it loses
    focus (op:doc.frontmatter), and a ref/list field offers the link picker
  unless: the page node's type is unknown — the header shows the plain five fields and a warning
  status: shipped
  refines: req:wf2.ui.edit-in-context
  satisfied-by: [component:doc-props, op:doc.frontmatter]
  verified-by: [ui-test:page-node]
  part-of: module:req-documents
- id: req:wf2.page.retype
  title: Choosing another type for a page moves its node and every link to it
  when: a person picks a different type in the page header (or runs `wf doc retype <product/project/doc> --type <slug>`)
  then: >
    the frontmatter `node:` line becomes `<type>:<slug>`, every reference to the old id in the product's
    documents (frontmatter keys, yaml values, prose ids, embeds, part-of lines of child pages) is rewritten
    to the new id in one write per file, the graph rebuilds, and the header shows the new type's properties;
    values of properties the new type does not declare stay in the frontmatter (ctx check warns when the type
    is not open)
  unless: >
    a node with the new id already exists — the change is refused with the conflict shown in the header
  status: shipped
  refines: req:wf2.page.node
  satisfied-by: [op:doc.retype, component:doc-props]
  verified-by: [test:retype, ui-test:page-node]
  part-of: module:req-documents
- id: req:wf2.page.create-typed
  title: A new page can be created as an instance of a type
  when: a person creates a page (component:new-doc, `wf doc create … --type <slug>`) and picks a type
  then: >
    the page's `node:` line is `<type>:<slug>`, the frontmatter carries the type's required properties as empty
    keys, and the page appears in the type's instance table
  unless: no type is picked — the page is a module, as today
  status: shipped
  refines: req:wf2.page.node
  satisfied-by: [op:doc.create, component:new-doc]
  verified-by: [ui-test:page-node]
  part-of: module:req-documents
- id: req:wf2.write
  title: A node can be edited in place
  when: graph.patch is called with a new body, status or edges and the caller's last-seen hash
  then: only that node's yaml block is rewritten; surrounding text, comments and other nodes are byte-identical; the new hash is returned
  status: proposed
  satisfied-by: [op:graph.patch, rule:patch-in-place, rule:edge-serialisation]
  requires-tests: [test:core-writer#patch-body, test:core-writer#patch-preserves-neighbours]

- id: req:wf2.write.create
  title: A new node lands in the right section
  when: graph.create is called with a module, kind, slug and body
  then: a yaml block is appended under the section the schema maps that kind to, creating the heading if the file lacks it, and the id and hash are returned
  status: proposed
  satisfied-by: [op:graph.create, rule:section-map]
  requires-tests: [test:core-writer#create-in-section, test:core-writer#create-adds-heading]
  refines: req:wf2.write

- id: req:wf2.write.conflict
  title: A stale write is refused
  when: the ifMatch hash differs from the node's current body hash
  then: nothing is written and the caller receives a conflict error with the current body and hash
  status: proposed
  satisfied-by: [rule:if-match, value:error-code]
  requires-tests: [test:core-writer#conflict]
  refines: req:wf2.write

- id: req:wf2.write.validated
  title: A write that would break the graph never reaches disk
  when: the patched file is re-parsed in memory before writing
  then: a parse error or a lint error rejects the write with the lint output; edges to ids nobody describes yet are allowed and returned as warnings
  status: proposed
  satisfied-by: [rule:validate-before-write, rule:stub-targets-warn]
  requires-tests: [test:core-writer#reject-parse-error, test:core-writer#reject-lint-error, test:core-writer#stub-target-warns]
  refines: req:wf2.write

- id: req:wf2.write.atomic
  title: Files are never half-written and writes never race
  when: two writes target the same file
  then: they are serialised through a per-file queue and each is written to a temp file and renamed, so a reader sees either the old or the new file
  status: proposed
  satisfied-by: [rule:atomic-file-write, rule:per-file-queue]
  requires-tests: [test:core-writer#concurrent-writes-serialised]
  refines: req:wf2.write

- id: req:wf2.write.single-path
  title: The file is the only way into the graph
  when: the UI, an agent, or a delta changes a node
  then: it goes through the writer and the file; the in-memory graph updates only via the watcher, so there is one write path and no private view model
  status: proposed
  satisfied-by: [rule:markdown-canonical]
  requires-tests: [test:server-services#ui-write-is-file-write]
  refines: req:wf2.write

- id: req:wf2.write.round-trip
  title: A write changes nothing but what it says
  when: a file is parsed, patched and parsed again
  then: the second graph equals the first plus exactly the requested change
  status: proposed
  satisfied-by: [rule:patch-in-place]
  requires-tests: [test:core-writer#round-trip-stability]
  refines: req:wf2.write
- id: req:wf2.ui
  title: The product opens on its documents
  when: the web app opens a project
  then: it lands on the project's main document; the left rail lists the documents as a tree with the open document's outline; every view has a URL (/p/<project>/d/<doc>#n-<id>, /p/<project>/graph?focus=<id>) that reopens it
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/sidebar, page:web/node, rule:deep-links]
  requires-tests: [test:web-components#sidebar-tree, ui-test:deep-link]
  see: req:wf.view

- id: req:wf2.ui.node-page
  title: A document is one editable page where any block can be a typed node and any word can link to anything
  when: a document is opened
  then: it is a single editor; prose, headings, lists, tables and code are ordinary blocks; each node is a typed block with kind, slug and status; a paragraph that starts with an id (`req:<slug> When …`) becomes a requirement; any phrase can be linked to any node and the graph records the relation (verb inferred from the words before it, else related-to); every id is a tag whose click opens a peek panel with the node's card, relations and Go to definition
  status: unverified
  note: single-page editor shipped 2026-09-14 (packages/web); pure modules tested, pages verified in the browser; server-backed data pending
  satisfied-by: [page:web/node, rule:single-page-editor, rule:prose-nodes, rule:todo-tasks, rule:doc-links, rule:mention-menu, rule:smart-tags, rule:node-cards]
  requires-tests: [test:web-components#node-page-properties, test:web-components#node-page-prose-editor]
  see: req:wf.view.sheet
  refines: req:wf2.ui

- id: req:wf2.ui.edit-in-context
  title: A node's text and properties are edited on its card in the context column
  when: a node of any kind is open in the context column — from a table row, a block, a tag, or search
  then: >
    the card is editable like in Asana: the text, the status and every property of the node's type (and the keys its
    card carries) are fields; a change saves to the node's defining line or yaml card as soon as the field is left
    and the graph is rebuilt, so the document, the table and the type page show it without a reload
  unless: the node is only referenced, never defined — then the card stays read-only
  status: proposed
  refines: req:wf2.ui.node-page
  satisfied-by: [component:node-editor, rule:node-page-layout, op:node.edit]
  verified-by: [test:node-edit-web, ui-test:table-rows]
  resolves: bug:properties-need-to-be
- id: req:wf2.ui.node-page.save
  title: Editing happens in place and saves with a hash
  when: the user types in a prose section, a card field or a document property, or adds a card or a document from a template
  then: there is no edit mode or save button; the change is written shortly after typing stops to exactly that span of the markdown file with the span's hash as ifMatch; a stale hash is refused and the user is told to reload; after every save the graph is rebuilt and the page, outline and search reflect it
  status: unverified
  note: shipped 2026-09-14 in packages/web through the doc API (rule:segment-write); agents will use graph.patch on the server instead
  satisfied-by: [page:web/node, rule:segment-write, rule:prose-round-trip, op:graph.patch, rule:if-match]
  requires-tests: [ui-test:edit-node-flow, test:web-components#conflict-diff]
  refines: req:wf2.ui.node-page

- id: req:wf2.ui.image-in-block
  title: A screenshot is part of the bug it belongs to
  when: a person pastes an image (or picks "Image in this block") while writing a bug, task or any node block
  then: >
    the image appears inside that block's text as a thumbnail and travels with the node: its table row, its card in
    the context column and the type page show it, and an agent that resolves the node gets the file path to look at
  unless: the cursor is in ordinary prose — then the image is a block of its own as before
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:inline-images]
  verified-by: [test:web-lib#import]
  resolves: bug:new-396
- id: req:wf2.ui.annotate-images
  title: A person annotates an image and an agent understands the annotation
  when: a person chooses Annotate image on an image in a document, draws boxes, labels and arrows over it and saves
  then: >
    the document shows the annotated image; an agent that receives the block (wf resolve, ⇢ send, ask) gets the
    annotations as text — labelled regions with their position on the image, arrows from one region to another, free
    labels — and the path of a rendered PNG it can look at
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:image-annotations, rule:drawings]
  verified-by: [test:annotations-web]
- id: req:wf2.ui.command-palette
  title: A request typed anywhere becomes a planned agent session
  when: a person presses ⌘P (Ctrl+P) on any page, types what to fix, build or change, and presses Enter
  then: >
    a command box opens in the middle of the screen; the request starts a chat session with the chosen agent in
    the product's working folder, taking the node under the cursor and the document as context; the session opens
    in the context column, where the agent first names the entity the request is about (creating its type and its
    card when they do not exist yet), writes what it understood — requirements, decisions, questions, tasks — as
    proposed blocks on that entity's page (an existing document when one fits, a new one otherwise), navigates the
    person to that page so they can add, comment and change it, asks the person to confirm (Proceed / Adjust /
    Cancel), and builds what the page says only after Proceed
  unless: the person unticks "plan first" in the box — then the agent starts building at once
  status: proposed
  refines: req:wf2.ui.live
  satisfied-by: [action:command-palette, rule:plan-first, op:session.open]
  verified-by: [ui-test:command-palette]
```

## Open questions

```yaml
- id: question:wf2.embed-paragraphs
  q: >
    Should a plain paragraph (a `block:<doc>.<hash>` node, addressed by its `#b-` anchor) be embeddable too, or
    only typed nodes? A paragraph's id changes with its text, so an embed of one would break on the first edit
    unless the anchor becomes stable.
  context: >
    The session changes page lists paragraphs a session added or changed; showing them as text is enough there.
    Typed nodes are the case the request is about.
  related-to: [decision:wf2.embed-syntax, rule:block-links]
  status: open
- id: question:wf2.page-instance-add
  q: >
    Should "+ add" on a type page (and the "<Type>s table" block) be able to create an instance as a page — a
    document of that type — instead of a card in the type's home document? A person page or a team page reads
    better as a page; a bug reads better as a card.
  context: >
    decision:wf2.page-node-typed makes a page a valid instance; today op:types.add only appends a card.
    Touches page:web/types, component:add-instance, rule:type-tables.
  status: open
  related-to: [decision:wf2.page-node-typed, req:ontology.type-page]
```
