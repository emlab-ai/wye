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
  refines: req:wf2.ui.node-page
  satisfied-by: [rule:card-essence]
  part-of: module:app-documents
- id: rule:card-essence
  statement: >
    A question card shows q and answer; a decision card shows context, choice and alternatives (in that order,
    each a section with its key as label, missing keys skipped). Every other key of the card — id, links, dates,
    tracking fields, undeclared keys — is behind a "details" toggle on the card, off by default, together with
    the raw yaml editor. Any other yaml card keeps showing all its keys as rows under the text.
  source: packages/web/src/components/DocEditor.tsx#QuestionNode; packages/web/src/components/DocEditor.tsx#DecisionNode
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
