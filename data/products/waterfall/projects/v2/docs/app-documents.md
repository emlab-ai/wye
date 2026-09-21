---
node: module:app-documents
type: module
title: Documents and editing
status: proposed
owner: unassigned
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
part-of: module:app
order: 41
last-verified: 2026-09-20
---

# Documents and editing

Documents and editing

```yaml
- id: module:app-documents
  purpose: >
    A document is one Notion-style page: prose, typed blocks (cards and prose nodes), [page:tables], drawings and
    images, edited in place and saved back to the same markdown with a hash. This module is the editor, the
    reader, the markdown round trip, and the writers that change one node or one card without touching the rest of
    the file.
  related-to: [req:wf2.ui.node-page.save]
```

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.ui.node-page, req:wf2.ui.node-page.save, req:wf2.write, req:wf2.write.conflict, req:wf2.write.atomic, req:wf2.write.round-trip, req:wf2.write.validated, req:wf2.ui.annotate-images. Rules the code enforces: rule:single-page-editor, rule:node-cards, rule:prose-nodes, rule:prose-round-trip, rule:card-form, rule:segment-write, rule:if-match, rule:atomic-file-write, rule:per-file-queue, rule:validate-before-write, rule:block-links, rule:mention-menu, rule:todo-tasks, rule:blocknote-prose-only, rule:prose-keys, rule:drawings, rule:image-annotations, rule:card-essence. Pages: page:web/node.

React components (`component:` cards). `side` says whether it renders on the server or hydrates in the browser.

A data table in a narrow editor — a small screen, or the context column open — must stay readable: the columns keep their minimum widths and the block scrolls sideways instead of squeezing the name column to a few characters (component:data-table).

A data table that has grown long — the Bugs table, a product's goals — needs filters the way the type page has them (component:instance-table): the person narrows the rows without leaving the document, and the rows stay what they are in the file.

A card in the editor shows what the block is *for* and folds the rest. The question card already does this (the question and the answer on the card; id, links, the yaml behind "details"). The decision card still lists every key — context, choice, alternatives, consequences, date, affects, related-to, session — so a decision reads as a form, not as a decision.

A block that lives on one page can be shown on another. Today a reference to a node anywhere outside its document — the session changes page, a list, a rail — is a short tag (req:wf2.x), and a person has to open the context column to see what it says. The change: a document can hold a line that *embeds* a node, and the embed renders the node's card exactly as the source page renders it — same header, text, essence sections and details — and is editable in place. The card is not copied: there is one store, the node's defining line or yaml card in its source document (op:node.edit writes it), so a change made in an embed lands in the source and every page that embeds the node shows it. The session changes page (component:session-changes) becomes the first user: every added or changed node is shown as its card, not as a tag.

Work, in order:

A document is already a node — `module:<slug>`, from the `node:` line of its frontmatter — but it is a node of one fixed kind. lib/parse.js:209 only accepts `module:` there, the frontmatter `type: module` line is never read, and the header (component:doc-props) shows the same five fields for every page: icon, title, status, owner, last-verified. So a page cannot be a `team:`, a `person:` or a `bug:` the way a card can, its frontmatter cannot carry the properties such a type declares, and a type's instance table never lists a page. The change: the page's node is an instance of whatever type the page chooses, the way a card's kind prefix is its type (decision:ontology.kind-is-type). The `node:` line takes any `kind:slug`; the header is the node's card — a type picker in place of the fixed "document" pill and the type's properties (own and inherited) as the editable fields, empty ones shown as placeholders; the type's `ref`/`list of` properties written in the frontmatter become edges named by the property, like on any card. The document tree, links, sessions and the CLI keep working because every place that spells `module:<slug>` by hand is replaced by "the id of this document's node".

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.

## Rules

<!-- list:rule -->

```yaml
- id: rule:list-view
  statement: >
    A collection block has a `view`: `table` (the default, rows in row mode) or `list` (the same children as
    ordinary node blocks: their `row` prop is empty, so the node block renders its normal form). The marker says
    which: `<!-- list:task status=open -->` … `<!-- /list:task -->` opens a list, `<!-- tasks -->` / `<!--
    table:bug -->` a table; the filters ride on the marker either way (rule:table-filter). settleCollections keeps
    one empty child of the kind at the end and turns a paragraph made by Enter into a node of the kind, in the
    block's view. The header's toggle rewrites every child's `row` prop and the block's view; the type picker and
    the filter toggle are the same as the table's. The slash menu offers "Data list" next to "Data table". Yaml
    cards are rows too: consecutive cards inside a region share one fence on the way out (childrenLines), a card
    with content ends its fence, so a definition page's requirements, rules, decisions or components sit inside a
    `<!-- list:<kind> -->` region — filtered from the top, a new block one of the same kind — which is what a view
    is for: grouping and filtering the page's own blocks and making the next one easy to add (2026-09-20).
  source: packages/web/src/lib/import.ts#COLLECTION_OPEN; packages/web/src/lib/serialize.ts#collectionMarker; packages/web/src/components/DocEditor.tsx#CollectionBlock; packages/web/src/components/DocEditor.tsx#settleCollections
  status: shipped
  verified-by: [test:web-lib#import]
  related-to: [rule:table-filter, rule:goals-and-tasks, rule:type-tables]
- id: rule:table-filter
  statement: >
    A data table's filters live on its opening marker as key=value pairs in the view block's grammar — `<!--
    table:bug status=open priority=high -->`, `<!-- goals owner=alex q="login page" -->` — parsed by
    COLLECTION_OPEN into the collection block's `query` prop and written back by serialize.ts; no query leaves the
    bare marker, and the rows are the same node lines either way (decision:wf2.table-filter-on-marker). The
    header's toolbar (behind a "filter" toggle; open whenever a filter is set) is the type page's: search, status
    chips with counts, a chip row per enum / bool column, a select of the values present per ref column (owner for
    goals and tasks); the rows are matched with lib/instance-table#filterRows over the row blocks' text, status
    and property group. A row that does not match is hidden by a style element the header renders (its
    `.bn-block-outer` by block id: zero height, clipped — not display none, which made a click on the next row map
    to the wrong block), never removed: it stays a child block and is written to the file
    (decision:wf2.table-filter-hides-rows). A row without a slug (the trailing empty row) and the row the editor's
    cursor is in — one being typed, one reached with the arrow keys — are never hidden, so a new row stays until
    the cursor leaves it and the caret is never in an invisible row. The query is written as a setNodeMarkup of
    the header's node (not updateBlock, which would rebuild every row), after a pause for search typing; a text
    click in a row that the editor's selection did not follow puts the selection there, so the row's first
    keystroke is never taken for leaving the previous block (rule:table-rows).
  source: packages/web/src/lib/import.ts#COLLECTION_OPEN; packages/web/src/lib/serialize.ts; packages/web/src/components/DocEditor.tsx#useTableFilter; packages/web/src/components/DocEditor.tsx#setBlockAttr; packages/web/src/components/DocEditor.tsx#selectBlockOnClick; packages/web/src/app/globals.css#.collection-filter
  status: shipped
  related-to: [rule:type-tables, rule:goals-and-tasks, rule:table-rows, rule:view-block]
  verified-by: [ui-test:table-filter, test:web-lib#import]
- id: rule:card-essence
  statement: >
    A question card shows q and its answer; the answer is the question's content (decision:wf2.answer-is-content)
    — in the editor the blocks under the question block render under the card as its "answer" section (never
    folded), an unanswered question shows a placeholder that inserts the first block and puts the caret in it
    (`host.answer.start`), an embedded card shows a chip "n blocks — open" that opens the node instead
    (`host.answer.open`); there is no `answer:` key. A decision card shows context, choice and alternatives (in
    that order, each a section with its key as label, missing keys skipped). Every prose section is a `ProseArea`:
    its text stays local while typed and the stored value replaces it only when the two differ beyond folding
    (`sameProse`), since the yaml round-trip trims and folds and would drop the space just typed. Every other key
    of the card — id, links, dates, tracking fields, undeclared keys — is behind a "details" toggle on the card,
    off by default, together with the raw yaml editor. Any other yaml card keeps showing all its keys as rows
    under the text.
  source: packages/web/src/components/NodeCards.tsx#QuestionCard; packages/web/src/components/NodeCards.tsx#DecisionCard; packages/web/src/components/NodeCards.tsx#ProseArea; packages/web/src/lib/yaml-form.ts#sameProse
  status: shipped
  related-to: [rule:card-form, rule:node-cards]
  verified-by: [ui-test:decision-card]
- id: rule:embed-line
  statement: >
    A paragraph whose whole text is `![[kind:slug]]` is an embed of that node. lib/import lifts it to an `embed`
    block before the markdown parser runs; lib/serialize writes it back as the same line; the graph sees an
    ordinary paragraph that mentions the node. Nothing of the node is stored in the embedding document.
  source: packages/web/src/lib/import.ts#EMBED_LINE; packages/web/src/lib/serialize.ts
  status: shipped
  verified-by: [test:web-lib#import, ui-test:embeds]
- id: rule:page-node-line
  statement: >
    The document's node is the `node: kind:slug` line of its frontmatter; the kind is the node's type; a document
    without a `node:` line has no node and is not in the graph. The frontmatter `type:` key is not read.
    graph.modules lists every document node whatever its kind; nothing in the app tests `kind === 'module'` to
    mean "is a document" — it asks the modules list.
  source: lib/parse.js:212; packages/web/src/lib/doc.ts:168
  status: shipped
  verified-by: [test:page-node]
- id: rule:doc-retype
  statement: >
    Changing a page's type changes its id, and the change rewrites every reference to the old id in the product's
    documents (word-boundary match on the full id) in the same operation, so no link dangles. The rewrite is
    refused when the new id already exists.
  source: packages/web/src/lib/retype.ts:1
  status: shipped
  verified-by: [test:web-lib#retype]
- id: rule:content-lines
  statement: >
    Nesting never relies on the markdown parser's own nesting (BlockNote flattens a nested list that follows a
    paragraph child). `liftContent` walks a markdown segment: after a list item's or a named paragraph's
    continuation text, the lines indented deeper than the line — blank lines and indented fences whole — are its
    content, lifted out de-indented into `contents[n]` and marked `%%CONTENT:n%%` at the end of the block's text;
    the indented lines that open the segment after a yaml fence are the last card's (`%%YAML:i%%%%CONTENT:n%%`).
    `expand` strips the marker and parses the content with `importMarkdown` — prepare, BlockNote, expand — so the
    tree is built the same way at every depth. `contentLines` writes a block's children back by running
    `blocksToMarkdown` on them and indenting the result two spaces: tight under the line when it starts with a
    list item, after a blank line otherwise, a blank line after it when it ends without one; a yaml card with
    children ends its fence (the group is split) and its content follows the fence. A node's content is written
    the same way by op:node.content, so the column and the page produce the same lines.
  source: packages/web/src/lib/import.ts:95 (liftContent, liftLeadingContent), packages/web/src/lib/import.ts:351 (importMarkdown); packages/web/src/lib/serialize.ts:149 (contentLines)
  status: shipped
- id: rule:document-tree
  statement: >
    A document is one markdown file in the project's graph folder. The tree comes from has edges between module
    nodes; a module with no incoming has from another module is a root; the main root (where /p/<project> lands)
    is the root with the most sub-documents, ties broken by title. Linked documents exclude module-to-module
    containment edges.
  source: packages/web/src/lib/doc.ts#documentTree; packages/web/src/lib/doc.ts#linkedDocuments
  status: unverified
  verified-by: [test:web-lib#doc]
- id: rule:smart-tags
  statement: >
    Every kind:slug token in prose, inline code, table cells and card properties renders as a tag (kind dot, slug;
    req tags drop the prefix; dashed when the node is referenced but never defined) whose hover shows title and
    status and whose click opens the peek panel. Trailing punctuation stays text; a test id keeps its #method in
    the label but links to the test node. Text already inside a link is left alone.
  source: packages/web/src/lib/remark-tags.ts; packages/web/src/components/SmartTag.tsx; packages/web/src/components/IdLink.tsx#Linkified
  status: unverified
  verified-by: [test:web-lib#remark-tags]
- id: rule:segment-write
  statement: >
    The web app writes a document by span, never by regenerating it. splitDocument records character offsets for
    every prose segment and yaml chunk; a write re-reads the file, re-splits it, compares the sha256 of the target
    span with ifMatch (409 on mismatch), splices the new text (a chunk keeps its list style by re-indenting under
    "- "), writes <file>.tmp-<pid> and renames it, then runs ctx build and ctx check in the project root and
    returns the new hashes and lint errors.
  source: packages/web/src/lib/write.ts; packages/web/src/app/api/p/[project]/doc/[slug]/route.ts
  status: unverified
  verified-by: [test:web-lib#write]
- id: rule:prose-round-trip
  statement: >
    Every prose section is a live block editor (the text between yaml blocks and --- rules); yaml blocks and rules
    are boundaries outside the editor, so they survive untouched. Hard-wrapped paragraphs are unwrapped before
    import; ids become tag inline content on import and on blur, and export as plain id text. A section saves only
    after the user has focused and changed it (programmatic loads never save), 700 ms after the last change, with
    the section's hash; empty table rows the importer invents are dropped from the export. Every section has a
    raw-markdown mode.
  note: >
    Our own serializer (not BlockNote's) writes the document back: wrapped list-item continuation lines are joined
    on import; list items nested under a task or requirement line stay its children and are written back indented
    (nested ids become nodes too); numbered items and numbered nodes are renumbered in sequence; an escaped pipe on
    a table row survives even inside a code span. Verified on the four consolidated YesSensei pages (import → export
    equal, 2026-09-15).
  source: packages/web/src/lib/import.ts; packages/web/src/lib/serialize.ts; packages/web/src/lib/mdflow.ts
  status: shipped
  requires-tests: [ui-test:edit-node-flow]
- id: rule:card-form
  statement: >
    A card is always editable in place: title, status (select), when/then/unless, prose keys as growing text
    areas, list keys as tag chips with an add box (autocomplete from the node index), nested blocks as raw text,
    and a yaml toggle for the raw chunk. Changes autosave 700 ms after the last keystroke with the chunk's hash;
    the fields serialise back in their original order (lists as flow lists, long prose as > blocks) and the id
    never changes.
  source: packages/web/src/lib/yaml-form.ts; packages/web/src/components/CardEditor.tsx
  status: unverified
  verified-by: [test:web-lib#yaml-form]
- id: rule:new-document
  statement: >
    A new document is created from templates/docs/<template>.md with the title, slug, parent and date filled in;
    its frontmatter declares part-of module:<parent> so the tree picks it up without editing the parent file; the
    slug is derived from the title and an existing file is refused.
  source: packages/web/src/app/api/p/[project]/doc/route.ts; packages/web/src/lib/templates.ts; templates/docs
  status: unverified
  verified-by: [test:web-lib#templates]
- id: rule:prose-nodes
  statement: >
    A paragraph or list item whose first token is an id defines that node (`req:<slug> When a sale …`); the text
    after the id is its `text` (title = first sentence), `#status` sets status, a trailing `(key: value, …)` group
    carries other keys — a comma inside a `[…]` list separates items, never keys, so `related-to: [<id>, <id>]` is
    one value (lesson:wf2.prose-props-id-list). Links `[phrase](kind:slug)` and bare ids in the text become edges
    whose verb is inferred from the words before the id ("satisfied by", "verified by", "refines", "part of", …)
    and is related-to otherwise. Short aliases (et:, rq:, rl:, pg:, st:, dc:, qn:) expand to full kinds. A link in
    plain prose relates the document to its target. Yaml blocks keep defining nodes exactly as before.
  source: lib/parse.js#proseRefs; lib/parse.js#inferVerb; schema/kinds.yaml; packages/web/src/lib/props.ts#EXTRA_SPLIT
  status: unverified
  verified-by: [test:prose, test:web-lib#props]
- id: rule:single-page-editor
  statement: >
    A document is one editor. Prose blocks, headings, lists, tables, code and dividers are ordinary blocks; every
    node (from a yaml block or a prose line) is a typed block with kind, slug and status in its header and its
    text as editable inline content; ids are tag inline content; a phrase can be linked to any node from the
    selection toolbar. Import lifts yaml blocks, rules and id links out of the markdown before the browser parser
    sees them; export is our own serializer, so untouched text round-trips (paragraph wrapping, table alignment
    and block grouping are normalised). A paragraph typed with a leading id becomes a node block when the editor
    loses focus. The whole body autosaves with a hash; a failed import disables editing and shows the reader; a
    save that would drop more than half of the text is refused.
  source: packages/web/src/components/DocEditor.tsx; packages/web/src/lib/import.ts; packages/web/src/lib/serialize.ts
  status: unverified
  verified-by: [test:web-lib#serialize, test:web-lib#import]
- id: rule:process-is-active
  statement: >
    A conversation whose claude or codex process is up is active whatever its recorded status: `wf session done`
    marks the work done while the process stays up to take the next message. The API adds `live` (process up) and
    `busy` (a turn is open) to every chat session from the server's own process table (agent-host#liveState —
    never from disk, so a restarted app shows nothing as live until it starts a process). The Agents page counts
    such sessions as active and shows `working` / `live` pills in place of the status (the title keeps the
    recorded one); the session header does the same; the command box's "to" picker offers exactly these.
  source: packages/web/src/lib/agent-host.ts#liveState; packages/web/src/components/SessionList.tsx#isActive; packages/web/src/app/api/[product]/sessions/route.ts
  status: shipped
  related-to: [rule:agent-sessions, rule:console-flow, rule:idle-stop]
- id: rule:clean-slate
  statement: >
    A request from the command box starts a new conversation by default: the "to" picker opens on "New
    conversation" with the agent and the working folder the person used last (localStorage `wf-agent-<product>` /
    `wf-cwd-<product>`), and the live conversations are an explicit choice. "Clear context first" — a tick in the
    command box when a live conversation is chosen, and in the console's own message box — rides on the queued
    item as `fresh` (with `plan`) and is honoured when the item's turn comes
    (decision:wf2.fresh-is-a-queue-property): the pump, finding a fresh item at the head of the queue with no turn
    open, ends the process, forgets `agentSessionId` (and the Codex thread), emits a `note` divider ("context
    cleared — a fresh agent takes the next message") and hands the item to a new process as a first message built
    like a new session's (instruction, refs, link, images, the plan-first section when asked). An idle agent
    restarts at once; a busy one finishes its open turn first — nothing in progress is cut. When no process is up,
    the message route starts the fresh one directly instead of resuming the old context. The Live entry is reused
    so the console's subscribers keep receiving events, and the replaced process's close handler updates nothing.
    A waiting item's fresh mark can be toggled from the queue list (control `item`). Without the tick the message
    goes into the running agent and its context is kept.
  source: packages/web/src/components/CommandBox.tsx; packages/web/src/components/Console.tsx; packages/web/src/lib/agent-host.ts#pump; packages/web/src/lib/agent-host.ts#restartFresh; packages/web/src/app/api/[product]/sessions/[id]/message/route.ts
  status: shipped
  verified-by: [ui-test:command-palette, ui-test:agents-queue]
  related-to: [rule:agent-sessions, rule:process-is-active, rule:plan-first]
- id: rule:idle-stop
  statement: >
    A claude conversation that is live and idle — no open turn, no queued message — for WF_AGENT_IDLE_MIN minutes
    (default 30; 0 disables) is stopped by the host: stdin is closed so claude exits 0, the session is marked done
    with the line "idle for N min — stopped; Resume or a message continues with the same context", and the console
    shows the exit. Resume and the next message start the process again with `--resume <agentSessionId>`
    (rule:agent-host), so the context survives — only the process goes. Codex has no resident process and needs
    nothing. The timer is armed on every `result` event and cleared when a message is written to the agent. A
    process spawned before this rule shipped keeps its old stdout handler and is never armed: it stops only by
    hand (rule:agent-host).
  source: packages/web/src/lib/agent-host.ts#armIdleStop
  status: shipped
  related-to: [rule:process-is-active, rule:agent-host]
- id: rule:documents-tree
  statement: >
    The rail shows one Documents tree per product: every document with its sub-documents, regardless of the
    project folder it lives in (projects stay folders on disk; a new top-level document picks its folder when
    there are several). Any row has "+" for a sub-document; the section "+" creates a top-level one. Rows drag:
    dropping onto a row nests the document under it (its `part-of` frontmatter), dropping between rows reorders
    siblings (`order:` frontmatter, renumbered in tens), and a drop zone under the tree makes it top level. Moving
    under a document of another project moves the file into that project's docs folder. A document cannot be moved
    under itself. One exception: a project's Plans page and the plan documents under it are not in the tree — they
    are the rail's Plans system folder (rule:prs-folder).
  source: packages/web/src/components/DocTree.tsx; packages/web/src/app/api/[product]/docs/move/route.ts; packages/web/src/lib/doc.ts#documentTree; packages/web/src/app/[product]/layout.tsx#withoutPlans
  status: shipped
- id: rule:tree-menu
  statement: >
    Every row of the Documents tree has a context menu — right-click, or the "⋯" shown on hover — with Duplicate
    and Delete; Escape, a press outside it or a scroll closes it (the close handler checks the event's target:
    React's own listeners sit on `document` in the App Router, so stopPropagation cannot keep a press inside the
    menu from reaching a document listener). Duplicate copies the document next to itself with every id it defines
    re-suffixed (-copy, -copy-2 …) and opens the copy. Delete confirms with the document's title and the number of
    sub-documents, then removes the whole subtree (decision:wf2.tree-delete-subtree); the tree reports dangling
    references and moves a person off a removed page to its parent.
  source: packages/web/src/components/DocTree.tsx#Row; packages/web/src/app/api/[product]/docs/duplicate/route.ts; packages/web/src/app/api/[product]/docs/delete/route.ts; packages/web/src/lib/doc-ops.ts
  status: shipped
- id: rule:doc-gone-in-place
  statement: >
    A document page whose file is not on disk — deleted outside the app while open, or never there — renders a
    "Page not found" notice as its content, not a 404 boundary: the layout around it (URL, top bar, rail, tabs)
    stays, the tab and the crumb keep the title they had (the crumb falls back to the slug when there was no tab),
    and the next live refresh (rule:live-refresh: the watcher's rebuild after the file is written again) renders
    the page back into the editor with no reload. The editor leaving the page clears its pending save.
  source: packages/web/src/app/[product]/[project]/d/[doc]/page.tsx; packages/web/src/components/DocNotFound.tsx; packages/web/src/components/TopBar.tsx#usePageTabs; packages/web/src/components/DocEditor.tsx
  status: shipped
  verified-by: [ui-test:document-not-found]
- id: rule:doc-write-gone
  statement: >
    A write to a document (op:doc.update, every op) whose file is no longer on disk is refused with 404 not_found
    — the graph may still list the document for the 400 ms before the watcher rebuilds — so a pending save never
    recreates a file that was deleted outside the app (decision:wf2.deleted-outside-drops-edits,
    constraint:wf2.text-canonical).
  source: packages/web/src/app/api/[product]/[project]/doc/[slug]/route.ts#PUT
  status: shipped
  verified-by: [ui-test:document-not-found]
- id: rule:block-links
  statement: >
    Every block has a stable link: `<web>/<product>/<project>/d/<doc>#<anchor>` where the anchor is `n-<id>` for a
    node block, the heading slug for a heading, and `b-<8-hex FNV-1a hash of the normalised text>` for any other
    block. "Copy link" is in every block's drag-handle menu, on node headers and table rows. Opening a link
    scrolls to and flashes the block; `GET /api/<product>/resolve?link=` (and `wf resolve`) return the document,
    node, block text or heading section the link points at. A hashed link whose text changed falls back to the
    document.
  source: packages/web/src/lib/anchors.ts; packages/web/src/app/api/[product]/resolve/route.ts; packages/web/src/components/DocEditor.tsx#blockAnchor
  status: shipped
  verified-by: [test:web-lib#anchors]
- id: rule:drawings
  statement: >
    A drawing is an Excalidraw scene stored beside the document (docs/drawings/<slug>.excalidraw) with an SVG
    export next to it; the markdown keeps a plain image link ![Title](drawings/<slug>.excalidraw), so GitHub shows
    nothing broken and the app shows the SVG and opens the full-screen editor on click. A code block (ASCII
    diagram) turns into a drawing from its drag-handle menu.
  source: packages/web/src/components/DrawingBlock.tsx; packages/web/src/app/api/[product]/[project]/drawing/[file]/route.ts; packages/web/src/lib/import.ts
  status: shipped
- id: rule:inline-images
  statement: >
    An image can be part of a node's text. Pasting an image while the cursor is in a node block (a bug, a task, a
    requirement), or "Image in this block" from the slash menu, uploads it to docs/assets and inserts it inline at
    the cursor as a thumbnail (click opens the file); an image pasted in ordinary prose stays an image block. The
    markdown keeps `![alt](assets/x.png)` inside the node's line, so lib/parse.js carries it in the node's `text`
    (the derived title drops it) and the type table row, the peek panel, node cards and the type page show the
    thumbnail. On import an image next to words, or on a line that continues a paragraph, is inline content of
    that paragraph; only an image that is a paragraph of its own is an image block. wf resolve on a node, block,
    section or document lists every image its text embeds with the file path, so an agent can look at a bug's
    screenshot (fixes bug:new-396). The editor's pasteHandler only takes image files in a node block; every other
    paste goes to BlockNote's defaultPasteHandler — BlockNote cancels the browser's paste before asking, so a
    handler that returns undefined silences text paste in the whole document (task:new-286).
  source: packages/web/src/lib/import.ts#liftInlineImages; packages/web/src/lib/serialize.ts#inlineToMarkdown; packages/web/src/components/DocEditor.tsx#InlineImage; packages/web/src/components/IdLink.tsx; packages/web/src/lib/resolve.ts; bin/wf.js#resolve; lib/parse.js
  status: shipped
  verified-by: [test:web-lib#import, test:web-lib#serialize]
  related-to: [rule:image-annotations, store:assets]
- id: rule:image-annotations
  statement: >
    "Annotate image" on an image block (drag-handle menu) turns the image into a drawing whose canvas is the
    image: a locked Excalidraw image element at 0,0 (the file embedded in the scene, its asset path in
    customData), and the person draws shapes, labels and arrows on top. The block's link changes to the drawing;
    the asset stays in docs/assets. Every save exports, beside the scene, the SVG the page shows, a flattened PNG
    (drawings/<slug>.png) and the annotations as text (drawings/<slug>.md): the image and its size, each labelled
    region with its zone and position in percent of the image, each arrow by what it connects (by binding, else by
    end points and the nearest labelled region), free labels with their position, freehand marks counted. The
    description is regenerated on every save and never hand-edited. wf resolve on a block, section or document
    that embeds a drawing appends the description and the PNG path, so an agent reads the annotations and can look
    at the picture.
  source: packages/web/src/lib/annotations.ts; packages/web/src/components/DrawingBlock.tsx#sceneFromImage; packages/web/src/components/DocEditor.tsx#AnnotateItem; packages/web/src/lib/resolve.ts; bin/wf.js#resolve
  status: proposed
  verified-by: [test:annotations-web]
- id: rule:doc-links
  statement: >
    A link whose target is a module id is a document link: clicking it (or the module tag) opens that document.
    The link picker offers "new document" for any typed title: it creates the page from the blank template under
    the current document and links the selection to module:<slug>. Frontmatter keys that name relations (part-of,
    see, …) are edges from the module node, so a document declares its parent in its own header.
  source: packages/web/src/components/DocEditor.tsx#LinkNodePicker; packages/web/src/components/SmartTag.tsx; lib/parse.js
  status: unverified
  verified-by: [test:prose]
- id: rule:node-cards
  statement: >
    A yaml block is split into chunks on id lines exactly as the parser does; a chunk whose id the graph defines
    renders as a card, any other chunk as a code block. A block with no defined ids renders as code.
  source: packages/web/src/lib/doc.ts#splitDocument; packages/web/src/components/Document.tsx
  status: unverified
  verified-by: [test:web-lib#doc]
- id: rule:prose-keys
  statement: >
    A yaml key is prose if it is in value:prose-key or its value is a block scalar (> or |); prose keys get the
    block editor, everything else a form field; edge keys get id lists with typeahead over graph.search.
  source: packages/web/src/lib/graph.ts#parseBody
  status: unverified
  verified-by: [test:web-lib#graph]
  requires-tests: [test:web-components#node-page-properties]
```

<!-- /list:rule -->

## Decisions

<!-- list:decision -->

```yaml
- id: decision:wf2.card-essence
  title: A decision card shows its essence; the rest sits behind "details"
  date: 2026-09-18
  status: proposed
  affects: [component:doc-editor, rule:card-essence, req:wf2.cards.decision-essence]
  related-to: [rule:card-form, rule:node-cards]
  session: 843b0e1f2c
```

  The decision card shows the title, then context, choice and alternatives as prose sections, in that order. Every other key (consequences, date, affects, related-to, session and anything else the card carries) moves behind the same "details" toggle the question card has, together with the id and the yaml editor. The kind pill, slug and status stay in the header. Nothing changes in the markdown: the keys are still written and still edges; only the card folds them.

  **Context** — A decision card in a document lists every key of the yaml block (context, choice, alternatives, consequences, date, affects, related-to, session, …) as label/value rows, so the choice — the one thing a reader wants — drowns in tracking fields. The question card already separates the two: question and answer on the card, id, links and the yaml behind a "details" toggle (DocEditor#QuestionNode).

  **Alternatives** — Fold only date/affects/session and keep consequences on the card — consequences are part of the ADR, but the person asked for them folded; the choice already says what follows. Fold everything but the choice — context and alternatives explain why, a reader loses the reasoning. Generalise to every yaml card with a per-type "essence" list — no type declares one yet; start with the two kinds that need it and extract the rule when a third appears.

  **Consequences** — DocEditor#NodeBlock renders a decision as a DecisionNode (essence sections + details); rule:card-essence replaces the "every other key is shown read-only under the text" behaviour for decisions; the server reader (component:node-card) is unchanged — it is shown only until the editor hydrates.

```yaml
- id: decision:wf2.embed-syntax
  title: An embed is a line `![[kind:slug]]`
  date: 2026-09-18
  status: proposed
  affects: [lib:import, lib:serialize, component:document-reader, component:embed-block]
  related-to: [rule:block-links, req:wf2.instances.view-block]
  session: 7cfac7ea80
```

  An embed is a paragraph of its own whose whole text is `![[kind:slug]]` — the transclusion form Obsidian and Logseq readers know. lib/import lifts it to an `embed` block (props: id) before BlockNote parses the markdown; lib/serialize writes it back unchanged. The graph (ctx) needs no change: the line is a paragraph that mentions the node, so the page gets a `mentions` edge to it and `wf resolve` on the paragraph still works. The slash menu item is "Embed a node" (`/ref`, `/embed`), with the same node picker the link button uses (id or title search).

  **Context** — A document needs a way to say "show that node here" that the graph, the reader, the editor and agents all understand. The editor already has one-line markers: `<!-- view:x -->` for a live table (invisible to the graph) and `![Title](drawings/x.excalidraw)` for a drawing. A node reference must stay a reference — the node keeps its one definition in its source document — and should be visible to the graph as a link from the page to the node.

  **Alternatives** — A comment line `<!-- ref:kind:slug -->` like the view block — invisible to the graph and to any other reader; agents reading the raw markdown would miss it. A prose line `ref:kind:slug` — `ref` would become a kind and the line a node definition. A yaml card `- id: embed:… of: kind:slug` — an anonymous node for a reference is more than it is.

  **Consequences** — lib/import#prepare gains EMBED_LINE next to VIEW_LINE and a %%EMBED:n%% marker; lib/serialize writes `![[id]]`; DocumentReader (the server fallback) renders the line as component:node-card; the anchor of the embed block is the hash of its text like any paragraph.

```yaml
- id: decision:wf2.embed-renders-source-card
  title: An embed renders the source card with the source's own components; edits go through op:node.edit
  date: 2026-09-18
  status: proposed
  affects: [component:doc-editor, component:embed-block, component:session-changes, op:node.edit]
  related-to: [rule:card-form, rule:card-essence, req:wf2.ui.edit-in-context]
  session: 7cfac7ea80
```

  The card bodies move out of DocEditor into a shared module (components/NodeCards.tsx) parameterised by a text slot: inside the editor the slot is BlockNote's inline content (contentRef); in an embed it is a plain growing text area bound to the node's text key. Everything else — header with kind pill, status select, essence sections, details toggle, yaml — is the same code, so the two renderings cannot drift. The embed's `set` writes through PUT /api/<product>/node/<id> (status, text, or the yaml body as props) instead of updateBlock; the watcher rebuilds the graph, the source page's editor reloads its body as it already does for any change on disk, and every embed refetches on the `graph` change event. The slug is read-only in an embed: renaming a node is done on its source page, otherwise the embed line would dangle.

  **Context** — "The same way it looks on the original page" means the card components DocEditor renders inside BlockNote (NodeBlock, QuestionNode, DecisionNode, the task line with its checkbox). They take the block's props and a `contentRef` for the inline text, so they cannot be used outside the editor as they are. The context column has its own form (component:node-editor, label/value rows) which looks different on purpose.

  **Alternatives** — A nested BlockNote editor per embed with the source block — heavy, and two editors of one document would fight over saves. Copying the block into the embedding document — two definitions of one id, which the graph forbids. Read-only embeds — the person asked for editing in place, and the context column already proves op:node.edit is enough.

  **Consequences** — DocEditor shrinks (card bodies move); component:embed-block owns fetching, saving and refetching; a node that is not defined (referenced only) renders as a stub tag with "not defined"; an embed of a node in a goals/tasks table renders as a task/goal card (checkbox, status, tracking fields), not as a table row.

```yaml
- id: decision:wf2.page-node-typed
  title: A page's node is an instance of the type the page chooses; module stays the default
  date: 2026-09-18
  status: proposed
  affects: [component:doc-props, lib:parse, page:web/node, page:web/types]
  related-to: [decision:ontology.kind-is-type, req:ontology.types, task:new-226]
  session: 64813dfdab
```

  The frontmatter `node:` line accepts any `kind:slug` whose kind is a declared type; that node is the page's node — defined, titled, statused, with the frontmatter as its body and validated by ctx check against the type's effective properties like any instance. `module` remains the default type of a new page and of every existing page; nothing changes in existing files. The header becomes the page node's card: a type picker (the product's own types first, then the base types) and the type's effective properties as fields. The frontmatter `type:` line is dropped from the templates (the kind prefix is the type); parse ignores it. graph.modules keeps its name and lists every document node regardless of kind; the web gets one helper (docIdOf(file) / isDocNode(id)) and every hand-built `module:${slug}` goes through it.

  **Context** — task:new-226 asks that each page is a node like any other block and that its type can be set to choose its properties. Today the parser hardcodes the document node's kind to module (lib/parse.js:209), the frontmatter `type:` key is decorative, and the header renders five fixed fields; instancesOf(type) never sees a page.

  **Alternatives** — Keep `module:<slug>` as every page's id and read a free `type:` from the frontmatter — the type and the kind prefix would disagree, typeOf(id) everywhere derives the type from the prefix, and a page would be a module in links and a team on its card. Rejected: two notions of type. A separate "page type" property shown only in the header — same disagreement, less visible. A new `page:` kind for every document — the base type page exists (a screen in the app), and a document is not a screen.

  **Consequences** — Choosing a different type for an existing page changes its id (team:platform instead of module:platform): op:doc.retype rewrites every reference to the old id across the product's documents in one write, the same way a card's slug edit would have to (rule:doc-retype). A page is listed in its type's instance table (req:ontology.type-page) and opens as a document from there. A type may now be the shape of a page, not only of a card; "+ add" on a type page still adds a card (question:wf2.page-instance-add).

```yaml
- id: decision:wf2.clean-slate
  title: A task starts from a clean slate; a chat keeps its context
  date: 2026-09-17
  status: proposed
  affects: [component:command-box, rule:agent-sessions, action:command-palette, rule:process-is-active, req:wf2.sessions.clean-slate, req:wf2.sessions.idle-stop]
  related-to: [decision:wf2.one-command-box, task:idle-agent-timeout]
  session: 64813dfdab
```

  The command box defaults to "New conversation" — a fresh agent in a remembered folder with a remembered agent (localStorage, like the folder today) — and offers the live conversations only as an explicit choice. When a live conversation is chosen, a "clear context first" tick (off by default) restarts its agent from nothing in the same folder before the message: the process is stopped, the agent's own session id is forgotten, the transcript gets a divider note, and the message goes as a first message with the full contract (plan-first when ticked). The console's own message box always keeps the context (no tick there). A live-and-idle conversation is stopped after WF_AGENT_IDLE_MIN minutes without a turn (default 30, 0 disables) with a log line saying so; Resume or the next message brings it back with `--resume`, so nothing is lost — only the process.

  **Context** — Waterfall is the memory of every agent: what a task needs is in the documents and the graph, not in the last conversation's context window. Yet the command box (⌘P, every "Send to agent") sends a request into the most recent live conversation by default, so an unrelated task inherits a context full of the previous one — dearer, slower and distracted — while the process behind each conversation stays up for hours holding that context (task:idle-agent-timeout: six idle claude processes in one afternoon). Chatting in a conversation's console is different: there the person is continuing the same work and wants the context kept.

  **Alternatives** — Default to the latest conversation with the tick on — every task lands in one ever-growing session record and "Produced" / the knowledge strip stop meaning one piece of work; a "Clear context" button in the console — the console is the place where context is wanted, and the tick at send time says what the person means for that request; never stop idle processes — memory and context are held for nothing, since `--resume` restores both.

  **Consequences** — rule:clean-slate and rule:idle-stop; component:command-box (default "new", remembered agent, the tick), op:api.sessions.message takes `fresh`, agent-host#startChat reuses the Live entry so subscribers survive a restart and the old process's close handler no longer touches a replaced process; rule:agent-sessions, action:command-palette and decision:wf2.one-command-box's "defaults to the most recent active conversation" are superseded; ui-test:command-palette extended.

```yaml
- id: decision:wf2.desktop-electron
  title: Waterfall ships as an Electron desktop app that owns the app server and the agent processes
  status: approved
  date: 2026-09-17
```

  packages/desktop — an Electron shell that starts (or attaches to) the Next.js server on port 3456, opens the window on it, keeps a tray item, and kills the server and every agent on quit. The web app stays usable in a browser against the same server.

  **Context** — Running full conversations with Claude Code and Codex means owning long-lived local processes with file-system access; a browser tab cannot do that, and people want one thing to open.

  **Alternatives** — [Tauri — smaller binary but a Rust toolchain and no Node in the main process, a plain browser tab plus a background daemon — two things to start and no window]

  **Consequences** — Electron adds ~250 MB of binary per platform; packaging and auto-update are not set up yet.

```yaml
- id: decision:wf2.local-semantic-search
  title: Relevant-context search runs locally with a small sentence model, not a hosted embedding API
  status: approved
  date: 2026-09-16
```

  transformers.js with all-MiniLM-L6-v2 (q8, ~23 MB, cached under .cache/models) in the Next.js server process; per-product vector cache next to graph.json; keyword blend for ids and code names the model does not know.

  **Context** — The context panel must suggest related requirements, rules and decisions while a person or agent writes; product knowledge is confidential and the tool must work offline.

  **Alternatives** — [hosted embeddings (OpenAI/Voyage) — better quality but sends product text out and needs a key, keyword-only search — misses paraphrases, a vector database — overkill for a few thousand nodes]

  **Consequences** — First query after a cold start pays ~5 s to load the model; quality is adequate for short technical text, and a larger local model can be swapped in by changing one constant.

```yaml
- id: lesson:wf2.prose-props-id-list
  statement: >
    `wf node set <id> --set "related-to=[<id>, <id>]"` on a prose line wrote the list, but the parser split the
    trailing group at every ", word:" — the second id, `kind:slug]`, looked like a key — so the node lost its
    second edge and carried a stray property named after the kind (seen on req:document-opened-in-the,
    2026-09-20). The splitters in lib/parse.js and packages/web/src/lib/props.ts now skip commas inside `[…]`;
    tests cover an id list in both.
  about: [rule:prose-nodes, lib:props]
  status: proposed
  by: agent:claude-code
  evidence: [session:baa6dff786]
  date: 2026-09-20
```

<!-- /list:decision -->

## Libraries

<!-- list:lib -->

```yaml
- id: lib:link-all
  file: packages/web/src/lib/link-all.ts
  side: shared
  purpose: >
    Pure: `linkAll(md, phrase, id)` turns every plain whole-word occurrence of a phrase into a link to the node —
    outside frontmatter, fences, comments, code spans, existing links, urls, ids and dotted names; inside a yaml
    card only the text-bearing values and their folded continuation lines — and `countPlain` counts without
    changing. Tested by test:web-lib. Behind op:api.link-all (req:wf2.editor.entity-from-text).
  part-of: module:app-documents
- id: lib:import
  file: packages/web/src/lib/import.ts
  side: shared
  purpose: >
    Markdown → editor blocks, in two steps: `prepare` (pure) lifts yaml blocks and rules out of the markdown and
    leaves markers; after BlockNote parses the rest in the browser, `expand` (pure) turns markers into divider and
    node blocks, turns id-first paragraphs into prose node blocks, and tags ids. A block's content (the lines
    indented under it) is lifted too and parsed with the same three steps by `importMarkdown`, recursively
    (rule:content-lines).
  part-of: module:app-documents
- id: lib:serialize
  file: packages/web/src/lib/serialize.ts
  side: shared
  purpose: >
    BlockNote blocks → markdown, under our control (BlockNote's own export is lossy). Pure; typed loosely so it
    can run on plain JSON in tests. Node blocks (our custom block) become prose lines or yaml blocks; a block's
    children become its content, written by `contentLines` as a document of their own indented under it
    (rule:content-lines).
  part-of: module:app-documents
- id: lib:node-content
  file: packages/web/src/lib/node-content.ts
  side: shared
  purpose: >
    A node's content in its document: `contentExtent` finds the lines under a prose line, a list item or a yaml
    card, `readContent` returns them de-indented, `writeContent` replaces them re-indented (splitting a fence for
    a card that is not last). Pure; op:node.content does the file.
  part-of: module:app-documents
- id: lib:mdflow
  file: packages/web/src/lib/mdflow.ts
  side: shared
  purpose: >
    Join hard-wrapped paragraph lines so the block editor does not turn them into line breaks. Lists, tables,
    headings, quotes, fenced code and indented code are left alone.
  part-of: module:app-documents
- id: lib:remark-tags
  file: packages/web/src/lib/remark-tags.ts
  side: shared
  purpose: >
    Turns every kind:slug token in text and inline code into a link with href \"#tag:<id>\"; Document.tsx renders
    those links as SmartTag components. Text already inside a link is left alone.
  part-of: module:app-documents
- id: lib:anchors
  file: packages/web/src/lib/anchors.ts
  side: shared
  purpose: >
    Stable addresses for blocks. A node block is addressed by its id (#n-<id>), a heading by its slug, and any
    other block by a short hash of its text (#b-<hash>): the link survives moves and edits elsewhere in the
    document and falls back to the document when the block's own text changes.
  part-of: module:app-documents
- id: lib:node-line
  file: packages/web/src/lib/node-line.ts
  side: shared
  purpose: >
    A prose node line (\"- [ ] task:x Text #status (k: v)\") taken apart and put back together, so a single node
    can be edited in place without touching the rest of its document.
  part-of: module:app-documents
- id: lib:node-edit
  file: packages/web/src/lib/node-edit.ts
  side: server
  purpose: Edit the line that defines a prose node, in place, under the file lock; then rebuild the graph.
  part-of: module:app-documents
- id: lib:props
  file: packages/web/src/lib/props.ts
  side: shared
  purpose: The trailing \"(key: value, key: value)\" group of a prose node as a map, and back.
  part-of: module:app-documents
- id: lib:yaml-form
  file: packages/web/src/lib/yaml-form.ts
  side: shared
  purpose: Form ↔ yaml for one node chunk. Pure; used by the card editor (client) and tested with vitest.
  part-of: module:app-documents
- id: lib:write
  file: packages/web/src/lib/write.ts
  side: server
  purpose: Server-only: pure text operations on a document plus the atomic write and the graph rebuild.
  part-of: module:app-documents
- id: lib:doc
  file: packages/web/src/lib/doc.ts
  side: shared
  purpose: Walk lines keeping absolute character offsets so writers can replace exact spans.
  part-of: module:app-documents
- id: lib:templates
  file: packages/web/src/lib/templates.ts
  side: shared
  purpose: Document templates for new pages (PRD, design, plan, blank).
  part-of: module:app-documents
- id: lib:annotations
  file: packages/web/src/lib/annotations.ts
  side: shared
  purpose: >
    Annotations as text: what an Excalidraw scene says about the image under it, for an agent that reads words —
    labelled regions with their place on the image, arrows by what they connect, free labels. Regenerated on every
    save of a drawing (drawings/<slug>.md), never hand-edited.
  part-of: module:app-documents
- id: lib:instances
  file: packages/web/src/lib/instances.ts
  side: shared
  purpose: New instance cards for a type: the card body, and where it goes in the home document.
  part-of: module:app-documents
- id: lib:type-edit
  file: packages/web/src/lib/type-edit.ts
  side: shared
  purpose: >
    Edit a type: card in its document text: its own props block (name, value type, required, inverse) and scalar
    keys.
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
  purpose: Per-kind skeletons for new cards, from the required/recommended keys in schema/kinds.yaml.
  part-of: module:app-documents
```

<!-- /list:lib -->

```yaml
- id: decision:wf2.deleted-outside-stays-put
  title: A document deleted outside the app keeps its place; only the content becomes "not found"
  affects: [req:document-opened-in-the, rule:live-refresh, component:live-document]
  by: person
  evidence: [session:a148426dd0]
  status: proposed
```

  The person is not moved. The URL, the top bar and the rail stay as they were and the content area alone shows a "page not found" notice. When the watcher sees the file again the document replaces the notice by itself, the way any other change reaches the page under rule:live-refresh.

  **Context** — rule:tree-menu decides what happens when a person deletes a document from inside the app (they land on the parent). Nothing decided what the open editor does when the file disappears from disk by other means — a shell command, a git checkout, an agent rewriting the folder — which rule:live-refresh only reports to the rail.

  **Alternatives** — Move the person to the parent as the in-app Delete does — rejected: an outside deletion is often transient (a checkout, a rebase, an agent mid-rewrite) and bouncing the person loses where they were. Keep the deleted row visible in the Documents tree, marked missing — rejected for now: the tree follows the files, and a phantom row would be the one place the rail disagrees with disk.

  **Consequences** — The document page needs a not-found state that keeps the shell around it, and the live-refresh path must turn a removed document into that state and a reappearing one back into the editor without a reload.

  verdict:00e01bdd5df2 refines rule:live-refresh — B applies the live-refresh mechanism described in A to the specific case of externally deleted documents reappearing. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: rule:live-refresh decision:wf2.deleted-outside-stays-put)

  verdict:f6d9d75af886 duplicate req:document-opened-in-the — A and B express the same behavior: person stays put, content shows 'not found', document replaces notice when file returns, stated at different formality levels. (kind: duplicate, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:document-opened-in-the decision:wf2.deleted-outside-stays-put)

  contradiction:waterfall.f6d9d75af886 decision:wf2.deleted-outside-stays-put duplicates req:document-opened-in-the — A and B express the same behavior: person stays put, content shows 'not found', document replaces notice when file returns, stated at different formality levels. #open (between: decision:wf2.deleted-outside-stays-put req:document-opened-in-the, conflict: static, reason: A and B express the same behavior: person stays put  content shows 'not found'  document replaces notice when file returns  stated at different formality levels.)

  verdict:152ee458ed63 refines decision:wf2.deleted-outside-drops-edits — A refines B by specifying the sub-case: unsaved edits are dropped when a file is deleted externally, narrowing B's main decision. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.deleted-outside-drops-edits decision:wf2.deleted-outside-stays-put)

```yaml
- id: decision:wf2.deleted-outside-drops-edits
  title: Unsaved edits do not bring a deleted file back
  affects: [req:document-opened-in-the, decision:wf2.deleted-outside-stays-put]
  by: person
  evidence: [session:a148426dd0]
  status: proposed
```

  The deletion wins. The "page not found" notice shows regardless of pending edits and those edits are dropped; a pending save never recreates a file that was deleted outside the app.

  **Context** — A document open in the editor may have a save pending (rule:live-refresh holds off reloads while one is) at the moment its file is removed from disk. Either the pending save recreates the file, or the deletion wins.

  **Alternatives** — Let the next save recreate the file — rejected: the file is canonical (constraint:wf2.text-canonical) and a save racing a checkout would resurrect a page the person or git just removed. Keep the last editor content and offer a "restore this page" action on the notice — rejected for now as more than the case warrants; it can be added later without changing this decision.

  **Consequences** — A person can lose a few seconds of typing when a file vanishes under them; the notice is honest about it.

```yaml
- id: decision:wf2.not-found-rendered-not-thrown
  title: A missing document is rendered as a notice by the page, not thrown as a 404 boundary
  affects: [req:document-opened-in-the, decision:wf2.deleted-outside-stays-put, rule:doc-gone-in-place]
  by: agent:claude-code
  evidence: [session:baa6dff786]
  status: proposed
```

  The page renders component:doc-not-found as ordinary content when the document is not in the graph or its file cannot be read; router.refresh() from LiveRefresh then re-renders it into the editor as any other change.

  **Context** — decision:wf2.deleted-outside-stays-put needs the document to come back by itself when the file reappears. The page used to call Next's notFound(): without a segment not-found file the default 404 replaced the whole layout (rail, top bar and LiveRefresh gone, so nothing could bring the page back — seen in the browser on 2026-09-20); with a segment not-found file the layout would stay, but Next's not-found boundary only resets when the pathname changes, so a router.refresh() after the file returned would keep showing the notice.

  **Alternatives** — A not-found.tsx under d/[doc] with a client component that navigates to the same path on a change event — rejected: same-path navigation does not reset the boundary either, and it would be a workaround for a boundary we do not need. Keeping notFound() and reloading the window from the notice — rejected: req:document-opened-in-the says without a reload.

  **Consequences** — A URL for a document that never existed answers 200 with the same notice instead of a 404 status; for a local app that is acceptable. The project-level notFound() (unknown project) is unchanged.

  verdict:65cf07c2a789 refines constraint:wf2.text-canonical — B applies A's canonical-file principle to the deletion scenario: because files are canonical, a pending save cannot recreate a deleted file. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: constraint:wf2.text-canonical decision:wf2.deleted-outside-drops-edits)

  verdict:7fcc365c1e3f refines req:document-opened-in-the — A specifies the full behavior including the unless-clause for unsaved edits; B narrows focus to and details that specific scenario. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:document-opened-in-the decision:wf2.deleted-outside-drops-edits)

  verdict:1b2ca7b6731e refines decision:wf2.deleted-outside-stays-put — A describes UI state preservation during deletion; B details the edge case of unsaved edits and articulates the principle that deletion takes precedence. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.deleted-outside-stays-put decision:wf2.deleted-outside-drops-edits)

```yaml
- id: decision:wf2.block-menu-reuses-actions
  title: The block menu is one entry point over the block's existing actions, not a new form
  status: proposed
  date: 2026-09-20
  by: person
  evidence: [session:3642a65ab6]
  affects: [req:wf2.ui.block-menu, decision:ontology.comments-in-column, rule:tree-menu]
```

  The menu calls the same actions those surfaces call. Comment selects the block as a click does (req:wf2.ui.block-select) and focuses the column's comment box — no comment form in the editor. It opens on every block; on one with no node yet, Open and Comment are greyed until task:ontology.paragraph-select gives a paragraph its node. A right-click over a text selection is left to the browser. Escape, outside press and scroll close it, with the target check rule:tree-menu learned.

  **Context** — req:wf2.ui.block-menu wants Delete, Comment, Copy link, Open, Ask, Duplicate and Turn into on a right-click. Every one of these already exists somewhere on the block — the drag-handle menu (delete, rule:image-annotations), the card header (copy link, open; rule:block-links), the ⌁ picker (turn into; req:wf2.editor.entity-from-text), the formatting toolbar (ask), the column's Comments section (decision:ontology.comments-in-column).

  **Alternatives** — an inline comment popover at the pointer (a second place to write comments, against decision:ontology.comments-in-column); a menu on typed blocks only (prose would keep the browser menu, but Delete, Copy link and Duplicate are as useful on a paragraph); replacing the drag-handle menu (BlockNote's own, keyboard-reachable — keep it).

  **Consequences** — one component for the block menu, shared by cards, rows, embeds and prose blocks; the tree menu's close handler becomes shared code; no new API — delete, duplicate and comment write through op:doc.update and op:api.comments.

  verdict:bf994c8076f6 refines req:wf2.ui.block-menu — B specifies the implementation approach for A's required menu actions: how they reuse existing surfaces, which actions grey out when no node exists, and how Comment integrates with column selection—detailing how A's menu is built and behaves. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:wf2.ui.block-menu decision:wf2.block-menu-reuses-actions)
