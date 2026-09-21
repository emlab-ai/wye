---
node: module:req-documents
type: module
title: Documents and editing
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 13
---

# Documents and editing

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Documents and editing); what a person sees on the Experience pages. Open questions wait at the end.

## Requirements

<!-- list:req -->

```yaml
- id: req:wf2.editor.entity-from-text
  title: A word in the text becomes a node of any type in one gesture, and every other place that says it can follow
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:doc-editor, op:api.link-all, op:api.types.add, lib:link-all]
  verified-by: [test:web-lib#link-all]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
```

  - when:wf2.editor.entity-from-text the person selects a word or phrase in a document (or in a node's content in the column) and presses ⌁ node

  - then:wf2.editor.entity-from-text the picker offers, besides the existing nodes that match and a new document, a NEW NODE of a chosen type — the product's own types first, then entity, value, person, team, goal, requirement, decision, question, task — made from the selection: its card lands on the type's home page (or on this page for a base kind), the selection becomes its tag, and the picker then says where else the same words are still plain in the product — per document, with counts — and offers to link them all; Link them all rewrites every plain occurrence into the tag (never inside code, comments, existing links, ids, frontmatter or a card's keys), this document included, and the documents rebuild; typing `@city:London` in the text with no such node offers a Create row — the instance in the type's home document, and the type itself first (declared in the ontology) when the product has no `city` — and tags the new node in place

  - unless:wf2.editor.entity-from-text the phrase is a single character, or it appears nowhere else — then the picker just closes

```yaml
- id: req:wf2.link.jev
  title: What is written is linked to the knowledge it is about, automatically, when a Jev key is stored
  status: shipped
  refines: req:wf2.editor.entity-from-text
  satisfied-by: [page:web/settings, component:settings-jev, lib:settings, lib:jev, lib:links, lib:apply-links, op:api.settings, op:api.settings.jev.test, op:api.links, component:doc-editor, component:context-panel, lib:inbox, lib:consolidate]
  verified-by: [test:jev, test:web-lib#settings, test:web-lib#links, test:web-lib#apply-links, test:web-lib#inbox-jev, test:web-lib#consolidate]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
```

  - when:wf2.link.jev a Jev (TypeSafe AI) API key is stored on the app's Settings page and (a) an inbox item arrives, (b) the person leaves the editor after changing a block's text, or (c) a session's consolidation writes a candidate card

  - then:wf2.link.jev the local search's closest nodes are judged by Jev, one yes/no question per candidate ("is the text specifically about, or does it directly depend on, this knowledge?"), and every candidate at 85 % or above is linked: an inbox item gets it in refs (linked-by: jev) and, when untyped, the kind Jev is sure of; a paragraph or prose node gets it as a tag at its end and a yaml card in related-to, applied in the editor before the save; a consolidation card gets it in related-to. The Context column shows Jev's percentage on each hit and marks what will be linked; the Inbox's filing view shows the same percentage

  - unless:wf2.link.jev no key is stored — then nothing changes, no call is made; or the call fails — then the un-judged result stands

```yaml
- id: req:wf2.editor.table-scroll
  title: A data table scrolls sideways when the editor is narrower than its columns
  status: shipped
  refines: [req:wf2.ui.node-page]
  satisfied-by: [rule:table-scroll]
  verified-by: [ui-test:table-scroll]
  part-of: module:req-documents
```

  - when:wf2.editor.table-scroll a document shows a data table (goals, tasks or a type's) and the editor is narrower than the sum of the table's column widths — a small screen, or the context column open beside the document

  - then:wf2.editor.table-scroll the name column keeps a readable minimum width, every other column its minimum, and the table block scrolls horizontally as one — header and rows together, the rest of the document unchanged

  - unless:wf2.editor.table-scroll the editor is wide enough — the table fills its width as today, no scrollbar

```yaml
- id: req:wf2.editor.table-filter
  title: A data table can be filtered by the person reading it
  status: shipped
  refines: [req:wf2.ui.node-page]
  related-to: [req:wf2.instances.filter, rule:type-tables, rule:goals-and-tasks]
  satisfied-by: [rule:table-filter]
  verified-by: [ui-test:table-filter, test:web-lib#import]
  part-of: module:req-documents
```

  - when:wf2.editor.table-filter a document shows a data table (goals, tasks or a type's) and the person adds a filter from its header — a search over the rows' text and property values, a status, one value per enum / bool / ref column the type declares (owner for goals and tasks)

  - then:wf2.editor.table-filter only the rows that match stay visible, the header says how many of the rows match and offers to clear the filters, the trailing empty row stays so a row can still be added, and the filters are kept with the table (the same person and anyone else opening the document see the filtered table until the filters are cleared); the hidden rows are still rows of the table — nothing is removed from the file

  - unless:wf2.editor.table-filter no filter is set — the table shows every row as today, with no toolbar in the way

```yaml
- id: req:wf2.editor.list-block
  title: >
    A data list shows one kind of block as ordinary blocks, filtered from the top, and a new block is one of the
    same kind
  status: shipped
  refines: [req:wf2.editor.table-filter]
  related-to: [req:wf2.instances.view-block, rule:goals-and-tasks, rule:type-tables]
  satisfied-by: [rule:list-view]
  verified-by: [test:web-lib#import]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
```

  - when:wf2.editor.list-block the person inserts a Data list (slash menu) or switches a data table to its list view, picks the kind (tasks, goals, or a type the product declares) and reads or writes in it

  - then:wf2.editor.list-block the blocks of that kind show as they do anywhere in the document — checkbox, kind, id, status, properties, their content folded — under the same filter bar the data table has (search, status, enum / bool / ref values), the hidden ones stay in the file; Enter after a block, or typing into the trailing empty block, adds a block of the same kind with an id; the header switches between list and table without changing the blocks; the region is written as `<!-- list:<kind> [filters] --> … <!-- /list:<kind> -->`

  - unless:wf2.editor.list-block the region is a table — then it renders as rows as today (`<!-- tasks -->`, `<!-- table:bug -->`)

```yaml
- id: req:wf2.cards.decision-essence
  title: A decision card reads as a decision
  status: shipped
  refines: >
    [req:wf2.ui.node-page]
  satisfied-by: [rule:card-essence]
  part-of: module:req-documents
```

  - when:wf2.cards.decision-essence a document shows a decision yaml card in the editor

  - then:wf2.cards.decision-essence the card shows the header (kind, slug, status), the title, and context, choice and alternatives as prose sections; consequences, date, affects, related-to, session and every other key are hidden until "details" is toggled, where they appear as label/value rows above the id and the yaml editor

  - unless:wf2.cards.decision-essence the yaml toggle is open, which replaces the whole body with the raw chunk

```yaml
- id: req:wf2.embeds.insert
  title: A person embeds a node from the slash menu
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:embed-block, decision:wf2.embed-syntax]
  verified-by: [ui-test:embeds]
  part-of: module:req-documents
```

  - when:wf2.embeds.insert a person types `/ref` or `/embed` in a document and picks a node by id or title

  - then:wf2.embeds.insert a line `![[kind:slug]]` is inserted at the cursor and rendered as the node's card at once; the document is saved like any other edit

  - unless:wf2.embeds.insert the picker is dismissed — nothing is inserted

```yaml
- id: req:wf2.embeds.render
  title: An embed shows the node's card as the source page shows it
  status: shipped
  refines: req:wf2.ui.node-page
  satisfied-by: [component:embed-block, decision:wf2.embed-renders-source-card]
  verified-by: [ui-test:embeds]
  part-of: module:req-documents
```

  - when:wf2.embeds.render a document (in the editor, in the server reader, or any list that embeds nodes) contains `![[kind:slug]]`

  - then:wf2.embeds.render the node's card is rendered with the same components and layout the source page uses — header (kind pill, slug, status), the text, the question or decision essence sections, details on toggle — with a small "from <document>" line that opens the source block

  - unless:wf2.embeds.render the node is referenced only (not defined) — then a stub tag and "not defined" are shown

```yaml
- id: req:wf2.embeds.edit-sync
  title: Editing an embed edits the source, and every view follows
  status: shipped
  refines: req:wf2.ui.edit-in-context
  satisfied-by: [component:embed-block, op:node.edit]
  verified-by: [ui-test:embeds, test:web-lib#embed]
  part-of: module:req-documents
```

  - when:wf2.embeds.edit-sync a person changes the text, the status, a checkbox or an essence field of an embedded card

  - then:wf2.embeds.edit-sync the change is written to the node's defining line or yaml card in its source document 700 ms after the last keystroke (op:node.edit), the graph is rebuilt, and the source page, every other embed of the node and the context column show the new value without a reload

  - unless:wf2.embeds.edit-sync the field is the slug — it is read-only in an embed

```yaml
- id: req:wf2.sessions.changes-cards
  title: The session changes page shows cards, not tags
  status: shipped
  refines: req:wf2.sessions.changes-page
  satisfied-by: [component:session-changes, component:embed-block]
  verified-by: [ui-test:embeds]
  part-of: module:app-agents
```

  - when:wf2.sessions.changes-cards a person opens a session's changes (the fold on the session page or /<product>/sessions/<id>/changes)

  - then:wf2.sessions.changes-cards every added or changed node is shown as its full card (component:embed-block, editable), under its document with the +/~ badge; paragraphs show their text; the change and kind chips still filter

  - unless:wf2.sessions.changes-cards the node was removed — it no longer exists, so its row keeps the tag and the title it had

```yaml
- id: req:wf2.page.node
  title: Every page is a node of the type it declares
  status: shipped
  refines: req:ontology.types
  satisfied-by: [lib:parse, decision:wf2.page-node-typed]
  verified-by: [test:page-node]
  part-of: module:req-documents
```

  - when:wf2.page.node a document's frontmatter has `node: <kind>:<slug>` and `kind` is a declared type (base or the product's own)

  - then:wf2.page.node the graph has that node as the document's node — defined at line 1, title and status from the frontmatter, the frontmatter as its body; frontmatter keys that are ref/list properties of the type (or base edge keys) are edges from the node named by the property; the document tree, hrefFor, the peek panel, sessions and `wye doc` treat it as the document whatever its kind; wye check validates the frontmatter against the type (required, undeclared and mistyped properties) ignoring the page bookkeeping keys (node, title, icon, order, last-verified, sources, source-roots)

  - unless:wf2.page.node the kind is not a declared type — wye check reports an error and the page is not part of the graph

```yaml
- id: req:wf2.page.header-card
  title: The page header is the page node's card with the type's properties
  status: shipped
  refines: req:wf2.ui.edit-in-context
  satisfied-by: [component:doc-props, op:doc.frontmatter]
  verified-by: [ui-test:page-node]
  part-of: module:req-documents
```

  - when:wf2.page.header-card a person opens a document

  - then:wf2.page.header-card the header shows the page node's type as a pill that opens a type picker, the id, the status, the icon and the title, then the type's effective properties (own and inherited; the root type's folded unless filled) as editable fields with the value type as placeholder; a field saves to the frontmatter when it loses focus (op:doc.frontmatter), and a ref/list field offers the link picker

  - unless:wf2.page.header-card the page node's type is unknown — the header shows the plain five fields and a warning

```yaml
- id: req:wf2.page.retype
  title: Choosing another type for a page moves its node and every link to it
  status: shipped
  refines: req:wf2.page.node
  satisfied-by: [op:doc.retype, component:doc-props]
  verified-by: [test:retype, ui-test:page-node]
  part-of: module:req-documents
```

  - when:wf2.page.retype a person picks a different type in the page header (or runs `wye doc retype <product/project/doc> --type <slug>`)

  - then:wf2.page.retype the frontmatter `node:` line becomes `<type>:<slug>`, every reference to the old id in the product's documents (frontmatter keys, yaml values, prose ids, embeds, part-of lines of child pages) is rewritten to the new id in one write per file, the graph rebuilds, and the header shows the new type's properties; values of properties the new type does not declare stay in the frontmatter (wye check warns when the type is not open)

  - unless:wf2.page.retype a node with the new id already exists — the change is refused with the conflict shown in the header

```yaml
- id: req:wf2.page.create-typed
  title: A new page can be created as an instance of a type
  status: shipped
  refines: req:wf2.page.node
  satisfied-by: [op:doc.create, component:new-doc]
  verified-by: [ui-test:page-node]
  part-of: module:req-documents
```

  - when:wf2.page.create-typed a person creates a page (component:new-doc, `wye doc create … --type <slug>`) and picks a type

  - then:wf2.page.create-typed the page's `node:` line is `<type>:<slug>`, the frontmatter carries the type's required properties as empty keys, and the page appears in the type's instance table

  - unless:wf2.page.create-typed no type is picked — the page is a module, as today

```yaml
- id: req:wf2.write
  title: A node can be edited in place
  status: proposed
  satisfied-by: [op:graph.patch, rule:patch-in-place, rule:edge-serialisation]
  requires-tests: [test:core-writer#patch-body, test:core-writer#patch-preserves-neighbours]
```

  - when:wf2.write graph.patch is called with a new body, status or edges and the caller's last-seen hash

  - then:wf2.write only that node's yaml block is rewritten; surrounding text, comments and other nodes are byte-identical; the new hash is returned

```yaml
- id: req:wf2.write.create
  title: A new node lands in the right section
  status: proposed
  satisfied-by: [op:graph.create, rule:section-map]
  requires-tests: [test:core-writer#create-in-section, test:core-writer#create-adds-heading]
  refines: req:wf2.write
```

  - when:wf2.write.create graph.create is called with a module, kind, slug and body

  - then:wf2.write.create a yaml block is appended under the section the schema maps that kind to, creating the heading if the file lacks it, and the id and hash are returned

```yaml
- id: req:wf2.write.conflict
  title: A stale write is refused
  status: proposed
  satisfied-by: [rule:if-match, value:error-code]
  requires-tests: [test:core-writer#conflict]
  refines: req:wf2.write
```

  - when:wf2.write.conflict the ifMatch hash differs from the node's current body hash

  - then:wf2.write.conflict nothing is written and the caller receives a conflict error with the current body and hash

```yaml
- id: req:wf2.write.validated
  title: A write that would break the graph never reaches disk
  status: proposed
  satisfied-by: [rule:validate-before-write, rule:stub-targets-warn]
  requires-tests: [test:core-writer#reject-parse-error, test:core-writer#reject-lint-error, test:core-writer#stub-target-warns]
  refines: req:wf2.write
```

  - when:wf2.write.validated the patched file is re-parsed in memory before writing

  - then:wf2.write.validated a parse error or a lint error rejects the write with the lint output; edges to ids nobody describes yet are allowed and returned as warnings

```yaml
- id: req:wf2.write.atomic
  title: Files are never half-written and writes never race
  status: proposed
  satisfied-by: [rule:atomic-file-write, rule:per-file-queue]
  requires-tests: [test:core-writer#concurrent-writes-serialised]
  refines: req:wf2.write
```

  - when:wf2.write.atomic two writes target the same file

  - then:wf2.write.atomic they are serialised through a per-file queue and each is written to a temp file and renamed, so a reader sees either the old or the new file

```yaml
- id: req:wf2.write.single-path
  title: The file is the only way into the graph
  status: proposed
  satisfied-by: [rule:markdown-canonical]
  requires-tests: [test:server-services#ui-write-is-file-write]
  refines: req:wf2.write
```

  - when:wf2.write.single-path the UI, an agent, or a delta changes a node

  - then:wf2.write.single-path it goes through the writer and the file; the in-memory graph updates only via the watcher, so there is one write path and no private view model

```yaml
- id: req:wf2.write.round-trip
  title: A write changes nothing but what it says
  status: proposed
  satisfied-by: [rule:patch-in-place]
  requires-tests: [test:core-writer#round-trip-stability]
  refines: req:wf2.write
```

  - when:wf2.write.round-trip a file is parsed, patched and parsed again

  - then:wf2.write.round-trip the second graph equals the first plus exactly the requested change

```yaml
- id: req:wf2.ui
  title: The product opens on its documents
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/sidebar, page:web/node, rule:deep-links]
  requires-tests: [test:web-components#sidebar-tree, ui-test:deep-link]
  see: req:wf.view
```

  - when:wf2.ui the web app opens a project

  - then:wf2.ui it lands on the project's main document; the left rail lists the documents as a tree with the open document's outline; every view has a URL (/p/<project>/d/<doc>#n-<id>, /p/<project>/graph?focus=<id>) that reopens it

```yaml
- id: req:wf2.ui.node-page
  title: >
    A document is one editable page where any block can be a typed node and any word can link to anything
  status: unverified
  note: single-page editor shipped 2026-09-14 (packages/web); pure modules tested, pages verified in the browser; server-backed data pending
  satisfied-by: [page:web/node, rule:single-page-editor, rule:prose-nodes, rule:todo-tasks, rule:doc-links, rule:mention-menu, rule:smart-tags, rule:node-cards]
  requires-tests: [test:web-components#node-page-properties, test:web-components#node-page-prose-editor]
  see: req:wf.view.sheet
  refines: req:wf2.ui
```

  - when:wf2.ui.node-page a document is opened

  - then:wf2.ui.node-page it is a single editor; prose, headings, lists, tables and code are ordinary blocks; each node is a typed block with kind, slug and status; a paragraph that starts with an id (`req:<slug> When …`) becomes a requirement; any phrase can be linked to any node and the graph records the relation (verb inferred from the words before it, else related-to); every id is a tag whose click opens a peek panel with the node's card, relations and Go to definition

```yaml
- id: req:wf2.ui.edit-in-context
  title: A node's text and properties are edited on its card in the context column
  status: proposed
  refines: req:wf2.ui.node-page
  satisfied-by: [component:node-editor, rule:node-page-layout, op:node.edit]
  verified-by: [test:node-edit-web, ui-test:table-rows]
  resolves: bug:properties-need-to-be
```

  - when:wf2.ui.edit-in-context a node of any kind is open in the context column — from a table row, a block, a tag, or search

  - then:wf2.ui.edit-in-context the card is editable like in Asana: the text, the status and every property of the node's type (and the keys its card carries) are fields; a change saves to the node's defining line or yaml card as soon as the field is left and the graph is rebuilt, so the document, the table and the type page show it without a reload

  - unless:wf2.ui.edit-in-context the node is only referenced, never defined — then the card stays read-only

```yaml
- id: req:wf2.ui.node-page.save
  title: Editing happens in place and saves with a hash
  status: unverified
  note: shipped 2026-09-14 in packages/web through the doc API (rule:segment-write); agents will use graph.patch on the server instead
  satisfied-by: [page:web/node, rule:segment-write, rule:prose-round-trip, op:graph.patch, rule:if-match]
  requires-tests: [ui-test:edit-node-flow, test:web-components#conflict-diff]
  refines: req:wf2.ui.node-page
```

  - when:wf2.ui.node-page.save the user types in a prose section, a card field or a document property, or adds a card or a document from a template

  - then:wf2.ui.node-page.save there is no edit mode or save button; the change is written shortly after typing stops to exactly that span of the markdown file with the span's hash as ifMatch; a stale hash is refused and the user is told to reload; after every save the graph is rebuilt and the page, outline and search reflect it

```yaml
- id: req:wf2.ui.image-in-block
  title: A screenshot is part of the bug it belongs to
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:inline-images]
  verified-by: [test:web-lib#import]
  resolves: bug:new-396
```

  - when:wf2.ui.image-in-block a person pastes an image (or picks "Image in this block") while writing a bug, task or any node block

  - then:wf2.ui.image-in-block the image appears inside that block's text as a thumbnail and travels with the node: its table row, its card in the context column and the type page show it, and an agent that resolves the node gets the file path to look at

  - unless:wf2.ui.image-in-block the cursor is in ordinary prose — then the image is a block of its own as before

```yaml
- id: req:wf2.ui.annotate-images
  title: A person annotates an image and an agent understands the annotation
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:image-annotations, rule:drawings]
  verified-by: [test:annotations-web]
```

  - when:wf2.ui.annotate-images a person chooses Annotate image on an image in a document, draws boxes, labels and arrows over it and saves

  - then:wf2.ui.annotate-images the document shows the annotated image; an agent that receives the block (wye resolve, ⇢ send, ask) gets the annotations as text — labelled regions with their position on the image, arrows from one region to another, free labels — and the path of a rendered PNG it can look at

```yaml
- id: req:wf2.ui.command-palette
  title: A request typed anywhere becomes a planned agent session
  status: proposed
  refines: req:wf2.ui.live
  satisfied-by: [action:command-palette, rule:plan-first, op:session.open]
  verified-by: [ui-test:command-palette]
```

  - when:wf2.ui.command-palette a person presses ⌘P (Ctrl+P) on any page, types what to fix, build or change, and presses Enter

  - then:wf2.ui.command-palette a command box opens in the middle of the screen; the request starts a chat session with the chosen agent in the product's working folder, taking the node under the cursor and the document as context; the session opens in the context column, where the agent first names the entity the request is about (creating its type and its card when they do not exist yet), writes what it understood — requirements, decisions, questions, tasks — as proposed blocks on that entity's page (an existing document when one fits, a new one otherwise), navigates the person to that page so they can add, comment and change it, asks the person to confirm (Proceed / Adjust / Cancel), and builds what the page says only after Proceed

  - unless:wf2.ui.command-palette the person unticks "plan first" in the box — then the agent starts building at once

- req:document-opened-in-the Document opened in the editor, but deleted outside, must show tab, with content showing page not found #shipped (title: A document deleted outside the app stays open as a page that says it is gone, when: a document a person has open in the editor is removed from disk by something other than the app's own Delete — a shell command, a git checkout, an agent rewriting the folder, then: the person stays where they are: the URL, the top bar and the rail do not change and nobody is moved to another page; only the content area is replaced by a notice that the page was not found. If the file comes back — a checkout, an undo, an agent writing it again — the document takes the notice's place by itself, without a reload, unless: the person had edits not yet saved when the file vanished: the notice still shows and those edits are dropped — a pending save never recreates a file that was deleted, because the file is canonical, refines: [req:wf2.ui.node-page], related-to: [req:wf2.ui.tree-menu, rule:live-refresh], rule: live-refresh], verified-by: [ui-test:document-not-found], satisfied-by: [rule:doc-gone-in-place, rule:doc-write-gone])

  verdict:d4e781fe65cb refines decision:wf2.deleted-outside-stays-put — A states the design decision that external deletion keeps the person in place; B details that same decision as a full requirement with conditions (file return, unsaved edits). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.deleted-outside-stays-put req:document-opened-in-the)

  verdict:77eb2be3e95e refines decision:wf2.deleted-outside-drops-edits — A isolates the decision that unsaved edits do not recreate a deleted file; B incorporates that decision as part of the larger 'unless' clause of the external deletion requirement. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.deleted-outside-drops-edits req:document-opened-in-the)

<!-- /list:req -->

```yaml
- id: req:wf2.import.markdown
  title: Markdown files and folders become documents of a project, unchanged, in one gesture
  status: proposed
  refines: req:wf2.ui.node-page
  satisfied-by: [lib:import-docs, op:api.import, component:import-docs]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC, pr:30]
  part-of: module:req-documents
```

  - when:wf2.import.markdown the person picks Import… on the Documents +, drops .md files or a folder on the rail, or runs `wye import <file|dir>`

  - then:wf2.import.markdown each .md file becomes a document of the chosen project — the original text untouched, front matter added (node, type module, title from the first heading or the file name, status imported, source: the original path, part-of for a folder's tree); a folder's subfolders become parent documents so the tree survives; images the files reference are copied into the project's assets; a slug that exists gets a numeric suffix; the graph rebuilds and the files are readable, editable and linkable at once

  - unless:wf2.import.markdown a file is not markdown or is larger than 1 MB — then it is skipped and named in the result; existing front matter is merged, never replaced

```yaml
- id: req:wf2.import.analyse
  title: An imported document is read by an agent and rewritten in place into typed blocks, all proposed
  status: proposed
  refines: req:wf2.import.markdown
  satisfied-by: [skill:import, hook:import-analyse]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC, pr:30]
  part-of: module:req-documents
```

  - when:wf2.import.analyse a document lands with status imported and "Analyse with agent" was left on (the default)

  - then:wf2.import.analyse a hook starts one worker session per document with the Import skill: the agent reads the document, the product's types and the knowledge nearest to it, decides the kind of each thing the text states (a behaviour → req, a choice → decision, a rule no code enforces → constraint, a persisted thing → entity, a domain statement → fact, work → task, open → question), proposes type: cards on the Ontology page when the text needs a kind the product lacks and instances in the type's collection document, and rewrites the document in place — prose kept, the extracted things typed blocks where they stood, status proposed, by agent, evidence the session, linked to the existing nodes rather than duplicated; the document's status becomes analysed and every block waits in the Inbox

  - unless:wf2.import.analyse "Analyse with agent" was unticked (the document lands with status raw and nothing runs), the hook is paused, or no agent is configured — then the document stays as imported and "Analyse" on the page or the hook's Run now does it later; an agent that fails leaves the document as imported with its session linked

```yaml
- id: req:wf2.import.code
  title: A folder of source becomes a feature's definition, and an agent maps each module to requirements
  status: proposed
  refines: req:wf2.import.markdown
  satisfied-by: [op:api.import-code, component:import-docs, lib:init, skill:describe-module]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC, pr:30]
  part-of: module:req-documents
```

  - when:wf2.import.code the person picks From code in Import…, names the feature and points at a folder (relative to the product's repo or absolute), or runs `wye import --code <dir> --name "…"`

  - then:wf2.import.code the feature's definition is read from the code without a model — a project named after it with the layered tree, every module, page, component, library, operation and test the folder shows, shallow, and a describe task per module — and, with "Describe with agent" on, each describe task goes to the default agent with the Describe-module skill: the requirements in the person's words, each mapped to the code that delivers it and its tests (reverse engineering)

  - unless:wf2.import.code the folder does not exist — then nothing is written; pages that exist already are kept, never overwritten

```yaml
- id: req:wf2.page.head-notion
  title: A page's head has a cover, a big icon, tags and comments, the way a Notion page does
  status: shipped
  refines: req:wf2.page.header-card
  satisfied-by: [component:page-head, component:doc-props, op:api.comments, op:doc.frontmatter]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
```

  - when:wf2.page.head-notion a person opens any page

  - then:wf2.page.head-notion above the title: the cover image when the page has one (a band; Change / Remove on hover), the icon large (click: an emoji grid, any text, Remove); without them, Add icon and Add cover appear on hover; under the title the properties as rows — owner, tags as coloured chips with an input to add (Enter or comma; the type's `tags: manyOf[…]` values suggested, and a new value written to a product type first so the tag is defined on the page's type), verified, then the type's own properties and "n more properties"; then Comments: the comments on the page's node, oldest first, and "Add a comment…" that writes to the project's Comments document; icon, cover and tags are front-matter keys (`icon`, `cover`, `tags` on type:node)

  - unless:wf2.page.head-notion the page's type is a base type — then a new tag is a free label on the page, not a value on the type

```yaml
- id: req:wf2.editor.selection-menu
  title: Selected text gets one compact menu — block type, styles, links, Comment, Ask an agent
  status: shipped
  refines: req:wf2.editor.entity-from-text
  satisfied-by: [component:selection-menu, component:doc-editor]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
```

  - when:wf2.editor.selection-menu text is selected in the editor

  - then:wf2.editor.selection-menu a popover shows the block's type on top (Normal text › heading 1–3, bullet / numbered / check list, quote, code block; a typed block keeps its shape), the text styles (bold, italic, underline, strike, code, clear), a URL link, ⌁ node and ▣ block, Comment on the block, and Ask an agent — in place of a row of toolbar buttons

```yaml
- id: req:wf2.page.new-dialog
  title: New page opens as a sheet — Add to a parent, the title, and Get started with a template, a typed page, an import or an agent
  status: shipped
  refines: req:wf2.page.create-typed
  satisfied-by: [component:new-page, component:import-docs, op:doc.create, op:api.import]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
```

  - when:wf2.page.new-dialog the person presses + on Documents, ↥, or drops files on the rail

  - then:wf2.page.new-dialog a sheet opens over the app: "Add to" with the parent page (and the folder when the product has several), the title as a large placeholder (Enter makes a blank page), and "Get started with": Ask an agent (the page is made and attached to the command box), Import… (the markdown / folder / code import inside the sheet), Template (prd, dev design, test design, plan), Typed page (the product's own types), Blank

```yaml
- id: req:wf2.editor.code-monaco
  title: A code block is the same editor the column shows files in
  status: shipped
  refines: req:wf2.editor.entity-from-text
  satisfied-by: [component:code-block, component:code-view, lib:serialize, lib:import]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-documents
```

  - when:wf2.editor.code-monaco a document has a ``` fence, or a block is turned into a code block

  - then:wf2.editor.code-monaco it renders as Monaco with the fence's language (a picker on hover), editable, its height following the lines; the code is the block's `code` property and the markdown stays the same fence — links, angle brackets and pipes verbatim

## Open questions

<!-- list:question -->

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

<!-- /list:question -->

```yaml
- id: req:wf2.ui.block-menu
  title: A person acts on a block from a menu at the pointer
  status: proposed
  refines: [req:wf2.ui.block-select]
  related-to: [req:wf2.ui.tree-menu, req:ontology.comment-home, decision:ontology.comments-in-column, rule:block-links]
```

  - when:wf2.ui.block-menu a person right-clicks anywhere on a block of a document — a card, a table row, an embed, a heading, a plain paragraph

  - then:wf2.ui.block-menu a menu opens at the pointer with the actions the block has: Open (the node in the column), Comment (the node in the column with the comment box ready to type), Copy link (the block's stable link), Ask Wye (about this block), Duplicate (a copy right under it; a card copy gets a fresh id), Turn into (another type, or a node for a paragraph), Delete (a card or row asks first, naming the node). Escape, a press outside it or a scroll closes it

  - unless:wf2.ui.block-menu the block has no node yet (a plain paragraph, a heading) — Open and Comment are shown greyed and the rest work; or text is selected inside the block — the browser's own menu stays, so copy and spellcheck are not lost

  verdict:af053342d760 refines decision:ontology.comments-in-column — B specifies a concrete implementation of A's design principle of consolidating comments into the context column (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:ontology.comments-in-column req:wf2.ui.block-menu)

  verdict:9d3382ebeea0 refines decision:wf2.block-menu-reuses-actions — B details which specific existing actions implement A's design principle of menu reusing actions rather than creating new forms (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.block-menu-reuses-actions req:wf2.ui.block-menu)
