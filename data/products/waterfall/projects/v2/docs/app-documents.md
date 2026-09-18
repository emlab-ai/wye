---
node: module:app-documents
type: module
title: Documents and editing
status: proposed
owner: unassigned
last-verified: 2026-09-17
part-of: module:app
sources:
  - packages/web/src/components/DocEditor.tsx
  - packages/web/src/components/DocumentReader.tsx
  - packages/web/src/components/LiveDocument.tsx
  - packages/web/src/components/DocProps.tsx
  - packages/web/src/components/NodeCard.tsx
  - packages/web/src/components/DrawingBlock.tsx
  - packages/web/src/components/AskAgent.tsx
  - packages/web/src/components/NodeCards.tsx
  - packages/web/src/components/EmbedBlock.tsx
  - packages/web/src/lib/embed.ts
  - packages/web/src/lib/import.ts
  - packages/web/src/lib/serialize.ts
  - packages/web/src/lib/mdflow.ts
  - packages/web/src/lib/remark-tags.ts
  - packages/web/src/lib/anchors.ts
---

# App — documents and editing

```yaml
- id: module:app-documents
  purpose: >
    A document is one Notion-style page: prose, typed blocks (cards and prose nodes), tables, drawings and images, edited in place and saved back to the same markdown with a hash. This module is the editor, the reader, the markdown round trip, and the writers that change one node or one card without touching the rest of the file.
```

## Requirements and rules

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.ui.node-page, req:wf2.ui.node-page.save, req:wf2.write, req:wf2.write.conflict, req:wf2.write.atomic, req:wf2.write.round-trip, req:wf2.write.validated, req:wf2.ui.annotate-images. Rules the code enforces: rule:single-page-editor, rule:node-cards, rule:prose-nodes, rule:prose-round-trip, rule:card-form, rule:segment-write, rule:if-match, rule:atomic-file-write, rule:per-file-queue, rule:validate-before-write, rule:block-links, rule:mention-menu, rule:todo-tasks, rule:blocknote-prose-only, rule:prose-keys, rule:drawings, rule:image-annotations, rule:card-essence. Pages: page:web/node.

## Components

React components (`component:` cards). `side` says whether it renders on the server or hydrates in the browser.

```yaml
- id: component:doc-editor
  file: packages/web/src/components/DocEditor.tsx
  side: client
  purpose: >
    kind:slug as inline content: a clickable tag in the editor, plain id text when serialised.
  part-of: module:app-documents
- id: component:document-reader
  file: packages/web/src/components/DocumentReader.tsx
  side: server
  purpose: >
    Read-only rendering of a document (server component). Shown until the editor hydrates, and used by anything that needs the document as text without editing.
  part-of: module:app-documents
- id: component:live-document
  file: packages/web/src/components/LiveDocument.tsx
  side: client
  purpose: >
    Shows the server-rendered reader until the client is ready, then the single-page editor takes over.
  part-of: module:app-documents
- id: component:doc-props
  file: packages/web/src/components/DocProps.tsx
  side: client
  purpose: >
    The document header: title and properties, always editable; a field saves when it loses focus.
  part-of: module:app-documents
- id: component:node-card
  file: packages/web/src/components/NodeCard.tsx
  side: server
  purpose: >
    A yaml flow list \"[a, b, c]\" renders as its items; anything else as linkified text.
  part-of: module:app-documents
- id: component:drawing-block
  file: packages/web/src/components/DrawingBlock.tsx
  side: client
  purpose: >
    An embedded Excalidraw drawing. The markdown keeps a plain image link (![Title](drawings/x.excalidraw)); the scene and an SVG export live under docs/drawings/. The page shows the SVG; clicking it opens the full-screen editor.
  part-of: module:app-documents
- id: component:ask-agent
  file: packages/web/src/components/AskAgent.tsx
  side: client
  purpose: >
    A command box at the selection: what you type goes to an active conversation together with the selected text, the block it sits in, and a link to the page. \"New conversation…\" hands the same payload to the full dialog.
  part-of: module:app-documents
- id: component:node-cards
  file: packages/web/src/components/NodeCards.tsx
  side: client
  purpose: >
    The cards a typed block renders as — the plain node block, the question card, the decision card — as one
    set of components parameterised by a text slot and a host (peek, copy link, send, header click). The document
    editor puts the block's inline content in the slot; an embed (component:embed-block) puts a text area there.
    One code path, so the two renderings cannot drift (decision:wf2.embed-renders-source-card).
  part-of: module:app-documents
```

## Cards

A card in the editor shows what the block is *for* and folds the rest. The question card already does this (the question and the answer on the card; id, links, the yaml behind "details"). The decision card still lists every key — context, choice, alternatives, consequences, date, affects, related-to, session — so a decision reads as a form, not as a decision.

```yaml
- id: decision:wf2.card-essence
  title: A decision card shows its essence; the rest sits behind "details"
  context: >
    A decision card in a document lists every key of the yaml block (context, choice, alternatives, consequences,
    date, affects, related-to, session, …) as label/value rows, so the choice — the one thing a reader wants —
    drowns in tracking fields. The question card already separates the two: question and answer on the card,
    id, links and the yaml behind a "details" toggle (DocEditor#QuestionNode).
  choice: >
    The decision card shows the title, then context, choice and alternatives as prose sections, in that order.
    Every other key (consequences, date, affects, related-to, session and anything else the card carries) moves
    behind the same "details" toggle the question card has, together with the id and the yaml editor. The
    kind pill, slug and status stay in the header. Nothing changes in the markdown: the keys are still written
    and still edges; only the card folds them.
  alternatives: >
    Fold only date/affects/session and keep consequences on the card — consequences are part of the ADR, but
    the person asked for them folded; the choice already says what follows. Fold everything but the choice —
    context and alternatives explain why, a reader loses the reasoning. Generalise to every yaml card with a
    per-type "essence" list — no type declares one yet; start with the two kinds that need it and extract the
    rule when a third appears.
  consequences: >
    DocEditor#NodeBlock renders a decision as a DecisionNode (essence sections + details); rule:card-essence
    replaces the "every other key is shown read-only under the text" behaviour for decisions; the server
    reader (component:node-card) is unchanged — it is shown only until the editor hydrates.
  date: 2026-09-18
  status: proposed
  affects: [component:doc-editor, rule:card-essence, req:wf2.cards.decision-essence]
  related-to: [rule:card-form, rule:node-cards]
  session: 843b0e1f2c
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
  part-of: module:app-documents
- id: rule:card-essence
  statement: >
    A question card shows q and answer; a decision card shows context, choice and alternatives (in that order,
    each a section with its key as label, missing keys skipped). Every other key of the card — id, links, dates,
    tracking fields, undeclared keys — is behind a "details" toggle on the card, off by default, together with
    the raw yaml editor. Any other yaml card keeps showing all its keys as rows under the text.
  source: packages/web/src/components/NodeCards.tsx#QuestionCard; packages/web/src/components/NodeCards.tsx#DecisionCard
  status: shipped
  related-to: [rule:card-form, rule:node-cards]
  verified-by: [ui-test:decision-card]
- id: ui-test:decision-card
  title: Decision card folds its tracking fields
  steps: >
    Open dev-design in Chrome; find the decision:wf2.clean-slate card; it shows the title, context, choice and
    alternatives and no date/affects/consequences/related-to/session rows; click "details"; the rows appear
    with the id and the yaml editor; edit choice on the card and reload — the markdown keeps every key in its
    original order.
  status: passed
  verifies: rule:card-essence
  last-run: 2026-09-18
```

## Embeds

A block that lives on one page can be shown on another. Today a reference to a node anywhere outside its document — the session changes page, a list, a rail — is a short tag (`req:wf2.x`), and a person has to open the context column to see what it says. The change: a document can hold a line that *embeds* a node, and the embed renders the node's card exactly as the source page renders it — same header, text, essence sections and details — and is editable in place. The card is not copied: there is one store, the node's defining line or yaml card in its source document (op:node.edit writes it), so a change made in an embed lands in the source and every page that embeds the node shows it. The session changes page (component:session-changes) becomes the first user: every added or changed node is shown as its card, not as a tag.

```yaml
- id: component:embed-block
  file: packages/web/src/components/EmbedBlock.tsx
  side: client
  purpose: >
    An embedded node inside a document: a block whose markdown is one line, `![[kind:slug]]`, rendered as the
    node's card the way its source page renders it (the same card components as component:doc-editor — prose
    node block, question card, decision card, task with its checkbox). Fetches the node from op:api.node,
    saves a field through op:node.edit 700 ms after the last keystroke, and refetches on every graph change
    (`wf:change`), so the source page and every other embed show the edit. Also usable outside the editor
    (EmbeddedCard) — the session changes page, lists, the context column.
  part-of: module:app-documents
- id: decision:wf2.embed-syntax
  title: An embed is a line `![[kind:slug]]`
  context: >
    A document needs a way to say "show that node here" that the graph, the reader, the editor and agents all
    understand. The editor already has one-line markers: `<!-- view:x -->` for a live table (invisible to the
    graph) and `![Title](drawings/x.excalidraw)` for a drawing. A node reference must stay a reference — the
    node keeps its one definition in its source document — and should be visible to the graph as a link from
    the page to the node.
  choice: >
    An embed is a paragraph of its own whose whole text is `![[kind:slug]]` — the transclusion form Obsidian and
    Logseq readers know. lib/import lifts it to an `embed` block (props: id) before BlockNote parses the
    markdown; lib/serialize writes it back unchanged. The graph (ctx) needs no change: the line is a paragraph
    that mentions the node, so the page gets a `mentions` edge to it and `wf resolve` on the paragraph still
    works. The slash menu item is "Embed a node" (`/ref`, `/embed`), with the same node picker the link button
    uses (id or title search).
  alternatives: >
    A comment line `<!-- ref:kind:slug -->` like the view block — invisible to the graph and to any other
    reader; agents reading the raw markdown would miss it. A prose line `ref:kind:slug` — `ref` would become a
    kind and the line a node definition. A yaml card `- id: embed:… of: kind:slug` — an anonymous node for a
    reference is more than it is.
  consequences: >
    lib/import#prepare gains EMBED_LINE next to VIEW_LINE and a %%EMBED:n%% marker; lib/serialize writes
    `![[id]]`; DocumentReader (the server fallback) renders the line as component:node-card; the anchor of the
    embed block is the hash of its text like any paragraph.
  date: 2026-09-18
  status: proposed
  affects: [lib:import, lib:serialize, component:document-reader, component:embed-block]
  related-to: [rule:block-links, req:wf2.instances.view-block]
  session: 7cfac7ea80
- id: decision:wf2.embed-renders-source-card
  title: An embed renders the source card with the source's own components; edits go through op:node.edit
  context: >
    "The same way it looks on the original page" means the card components DocEditor renders inside BlockNote
    (NodeBlock, QuestionNode, DecisionNode, the task line with its checkbox). They take the block's props and a
    `contentRef` for the inline text, so they cannot be used outside the editor as they are. The context column
    has its own form (component:node-editor, label/value rows) which looks different on purpose.
  choice: >
    The card bodies move out of DocEditor into a shared module (components/NodeCards.tsx) parameterised by a
    text slot: inside the editor the slot is BlockNote's inline content (contentRef); in an embed it is a plain
    growing text area bound to the node's text key. Everything else — header with kind pill, status select,
    essence sections, details toggle, yaml — is the same code, so the two renderings cannot drift. The embed's
    `set` writes through PUT /api/<product>/node/<id> (status, text, or the yaml body as props) instead of
    updateBlock; the watcher rebuilds the graph, the source page's editor reloads its body as it already does for
    any change on disk, and every embed refetches on the `graph` change event. The slug is read-only in an embed:
    renaming a node is done on its source page, otherwise the embed line would dangle.
  alternatives: >
    A nested BlockNote editor per embed with the source block — heavy, and two editors of one document would
    fight over saves. Copying the block into the embedding document — two definitions of one id, which the graph
    forbids. Read-only embeds — the person asked for editing in place, and the context column already proves
    op:node.edit is enough.
  consequences: >
    DocEditor shrinks (card bodies move); component:embed-block owns fetching, saving and refetching; a node
    that is not defined (referenced only) renders as a stub tag with "not defined"; an embed of a node in a
    goals/tasks table renders as a task/goal card (checkbox, status, tracking fields), not as a table row.
  date: 2026-09-18
  status: proposed
  affects: [component:doc-editor, component:embed-block, component:session-changes, op:node.edit]
  related-to: [rule:card-form, rule:card-essence, req:wf2.ui.edit-in-context]
  session: 7cfac7ea80
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
  part-of: module:app-documents
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
  part-of: module:app-documents
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
  part-of: module:app-documents
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
- id: rule:embed-line
  statement: >
    A paragraph whose whole text is `![[kind:slug]]` is an embed of that node. lib/import lifts it to an `embed`
    block before the markdown parser runs; lib/serialize writes it back as the same line; the graph sees an
    ordinary paragraph that mentions the node. Nothing of the node is stored in the embedding document.
  source: packages/web/src/lib/import.ts#EMBED_LINE; packages/web/src/lib/serialize.ts
  status: shipped
  verified-by: [test:web-lib#import, ui-test:embeds]
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
- id: ui-test:embeds
  title: Embed a node, edit it in the embed, see the source change
  steps: >
    1. Open a document, type /ref, pick req:wf2.cards.decision-essence — the card appears with its header, title
    and when/then/unless. 2. Change the status in the embed — the source document (app-documents) shows the new
    status on its card, the context column too. 3. Open the session changes page of a session that changed a
    decision — the decision card is shown with context, choice and alternatives, editable. 4. Reload — the
    markdown of the embedding document holds exactly `![[req:wf2.cards.decision-essence]]`.
  verifies: [req:wf2.embeds.insert, req:wf2.embeds.render, req:wf2.embeds.edit-sync, req:wf2.sessions.changes-cards]
  result: >
    playwright-core with the installed Chrome against a scratch page (embed-probe, removed after): three embeds and
    a stub rendered with their sections and a "from app-documents" line; the task's checkbox flipped the source
    line to [x]; a title typed in the embed reached the yaml card in app-documents and the source page's own
    card, and an API revert came back into the embed; /ref opened the picker, Enter chose the question and the
    markdown held ![[question:wf2.embed-paragraphs]]; the session changes page showed 19 cards.
  status: passed
  last-run: 2026-09-18
```

Work, in order:

- [x] task:embed-syntax EMBED_LINE in lib/import (lift to %%EMBED:n%%, expand to an `embed` block with `id`), the line back in lib/serialize, tests in import.test.ts and serialize.test.ts. Part of rule:embed-line.
- [x] task:node-cards-module Move NodeBlock's card bodies (prose node, QuestionNode, DecisionNode, task checkbox) from DocEditor into components/NodeCards.tsx with a text slot instead of contentRef; DocEditor keeps rendering the same. Part of decision:wf2.embed-renders-source-card.
- [x] task:embed-block components/EmbedBlock.tsx: the BlockNote `embed` block and the standalone EmbeddedCard — fetch op:api.node, render the card with a text area in the slot, save through op:node.edit (debounced), refetch on `wf:change` graph events, "from <document>" line, stub for undefined nodes. Part of req:wf2.embeds.render and req:wf2.embeds.edit-sync.
- [x] task:embed-slash "Embed a node" slash item (`/ref`, `/embed`) with the node picker; inserts the block. Part of req:wf2.embeds.insert.
- [x] task:embed-reader DocumentReader renders an embed line as the same EmbeddedCard the editor uses (component:node-card needs the body, which the reader's index does not carry; the card loads on the client and the editor takes over right after). Part of req:wf2.embeds.render.
- [x] task:session-changes-cards component:session-changes rows become EmbeddedCards (removed rows keep the tag; paragraphs show their text; chips unchanged). Part of req:wf2.sessions.changes-cards.
- [x] task:embeds-ui-test Run ui-test:embeds in Chrome (playwright-core) and record the result. Part of req:wf2.embeds.edit-sync.

## Libraries

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

```yaml
- id: lib:import
  file: packages/web/src/lib/import.ts
  side: shared
  purpose: >
    Markdown → editor blocks, in two steps: `prepare` (pure) lifts yaml blocks and rules out of the markdown and leaves markers; after BlockNote parses the rest in the browser, `expand` (pure) turns markers into divider and node blocks, turns id-first paragraphs into prose node blocks, and tags ids.
  part-of: module:app-documents
- id: lib:serialize
  file: packages/web/src/lib/serialize.ts
  side: shared
  purpose: >
    BlockNote blocks → markdown, under our control (BlockNote's own export is lossy). Pure; typed loosely so it can run on plain JSON in tests. Node blocks (our custom block) become prose lines or yaml blocks.
  part-of: module:app-documents
- id: lib:mdflow
  file: packages/web/src/lib/mdflow.ts
  side: shared
  purpose: >
    Join hard-wrapped paragraph lines so the block editor does not turn them into line breaks. Lists, tables, headings, quotes, fenced code and indented code are left alone.
  part-of: module:app-documents
- id: lib:remark-tags
  file: packages/web/src/lib/remark-tags.ts
  side: shared
  purpose: >
    Turns every kind:slug token in text and inline code into a link with href \"#tag:<id>\"; Document.tsx renders those links as SmartTag components. Text already inside a link is left alone.
  part-of: module:app-documents
- id: lib:anchors
  file: packages/web/src/lib/anchors.ts
  side: shared
  purpose: >
    Stable addresses for blocks. A node block is addressed by its id (#n-<id>), a heading by its slug, and any other block by a short hash of its text (#b-<hash>): the link survives moves and edits elsewhere in the document and falls back to the document when the block's own text changes.
  part-of: module:app-documents
- id: lib:node-line
  file: packages/web/src/lib/node-line.ts
  side: shared
  purpose: >
    A prose node line (\"- [ ] task:x Text #status (k: v)\") taken apart and put back together, so a single node can be edited in place without touching the rest of its document.
  part-of: module:app-documents
- id: lib:node-edit
  file: packages/web/src/lib/node-edit.ts
  side: server
  purpose: >
    Edit the line that defines a prose node, in place, under the file lock; then rebuild the graph.
  part-of: module:app-documents
- id: lib:props
  file: packages/web/src/lib/props.ts
  side: shared
  purpose: >
    The trailing \"(key: value, key: value)\" group of a prose node as a map, and back.
  part-of: module:app-documents
- id: lib:yaml-form
  file: packages/web/src/lib/yaml-form.ts
  side: shared
  purpose: >
    Form ↔ yaml for one node chunk. Pure; used by the card editor (client) and tested with vitest.
  part-of: module:app-documents
- id: lib:write
  file: packages/web/src/lib/write.ts
  side: server
  purpose: >
    Server-only: pure text operations on a document plus the atomic write and the graph rebuild.
  part-of: module:app-documents
- id: lib:doc
  file: packages/web/src/lib/doc.ts
  side: shared
  purpose: >
    Walk lines keeping absolute character offsets so writers can replace exact spans.
  part-of: module:app-documents
- id: lib:templates
  file: packages/web/src/lib/templates.ts
  side: shared
  purpose: >
    Document templates for new pages (PRD, design, plan, blank).
  part-of: module:app-documents
- id: lib:annotations
  file: packages/web/src/lib/annotations.ts
  side: shared
  purpose: >
    Annotations as text: what an Excalidraw scene says about the image under it, for an agent that reads words — labelled regions with their place on the image, arrows by what they connect, free labels. Regenerated on every save of a drawing (drawings/<slug>.md), never hand-edited.
  part-of: module:app-documents
- id: lib:instances
  file: packages/web/src/lib/instances.ts
  side: shared
  purpose: >
    New instance cards for a type: the card body, and where it goes in the home document.
  part-of: module:app-documents
- id: lib:type-edit
  file: packages/web/src/lib/type-edit.ts
  side: shared
  purpose: >
    Edit a type: card in its document text: its own props block (name, value type, required, inverse) and scalar keys.
  part-of: module:app-documents
- id: lib:embed
  file: packages/web/src/lib/embed.ts
  purpose: >
    An embedded node, pure: the node as op:api.node returns it → the card props component:node-cards renders
    (cardFromNode: a prose node's trailing group becomes extra, a task gets its checkbox; a yaml card keeps its
    body and text key), and a card edit → the patch op:node.edit takes (cardPatchToNodePatch: status, the text,
    the body keys that changed — removed keys as null — and the extra group as props; the slug is ignored).
  part-of: module:app-documents
- id: lib:kinds
  file: packages/web/src/lib/kinds.ts
  side: shared
  purpose: >
    Per-kind skeletons for new cards, from the required/recommended keys in schema/kinds.yaml.
  part-of: module:app-documents
```

## API

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.

```yaml
- id: op:api.docs.create
  args: POST /api/<product>/<project>/doc
  does: >
    Create a document from a template: { title, template, parent } → { slug }.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-documents
- id: op:api.docs.read-write
  args: GET | PUT /api/<product>/<project>/doc/<slug>
  does: >
    Read a document (markdown + hash) and write it back whole or by segment with If-Match; rebuilds the graph and lints.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-documents
- id: op:api.assets.upload
  args: POST /api/<product>/<project>/asset
  does: >
    Upload a pasted or dropped image into docs/assets → { url: assets/<name> }.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-documents
- id: op:api.assets.serve
  args: GET /<product>/<project>/d/assets/<file>
  does: >
    Serve an embedded image relative to the document URL so ![](assets/x) renders here and on GitHub.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-documents
- id: op:api.drawings
  args: GET | PUT /api/<product>/<project>/drawing/<file>
  does: >
    An Excalidraw scene and its exports: scene JSON, ?fmt=svg, ?fmt=png, ?fmt=md; PUT { json, svg, png?, description? }.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:app-documents
```
