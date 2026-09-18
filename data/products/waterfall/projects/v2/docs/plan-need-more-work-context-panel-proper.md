---
node: plan:plan-need-more-work-context-panel-proper
type: plan
title: need more work on context panel and proper graph nodes
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: ffab751604
agent: claude-code
started: 2026-09-18T21:04:02.383Z
part-of: module:v2-plans
---

# need more work on context panel and proper graph nodes

## Request

> need more work on context panel and proper graph nodes
> 
> each node may have sub-nodes, in ui it should be done as this:
> 1. each node details has content, and properties, 
> 2. content property must use the same editor as page content, so we should be able to add /blocks with different types inside, that will make new nodes, and in therory that can be done recursevly to unlimited number of times
> think how we go deeper,
> 
> also if content has blocks, we need to think how we build card and show it, maybe we jsut show first part / block and too see entire content need to click to it and see details
> 
> also context - rag shown items make not visible by default, user will have to click a button to show it

_from: module:todo · refs: task:new-917_

## Context

The request continues goal:ontology.graph-editor — the document is a graph editor, every block a node — where decision:ontology.uniform-content already fixed the model: every node has one `content` field, a list of child blocks (inverse `parent`), and everything else is a ref. Two of its steps are this request: task:ontology.child-nodes-design (the markdown form of content, the parser) and task:ontology.children-in-column (content shown and written from the column). Not in it: type:comment, which that design task also names — nothing in the request needs it.

![[goal:ontology.graph-editor]]

![[decision:ontology.uniform-content]]

What the app has today, and where the change lands:

- **The column** — page:web/context-column, component:peek-panel (`PeekPanel.tsx#NodeView`): a defined node shows component:node-editor (title, status, every property as a row), then Properties/inverses, then Connected. There is no content: a node's child blocks appear only as `Has` rows in Connected, as tags. The Context root renders the selected block's node (rule:block-select) followed by Related — component:context-panel (`ContextPanel.tsx`), which runs the semantic search (rule:context-panel) on every caret move and lists the hits at once.
- **The cards** — component:node-cards (`NodeCards.tsx`: ProseCard, QuestionCard, DecisionCard) render a node's head, text and properties; component:embed-block puts the same card on another page and under an expanded Connected row (rule:connected-cards). None of them knows about content.
- **The editor** — component:doc-editor (`DocEditor.tsx`): a `node` block already accepts nested children (BlockNote nests any block with Tab), `serialize.ts#childrenLines` writes them indented under the node's line, and `import.ts` keeps nested list items as children of a node line. It loads a whole document and saves it whole with an if-match hash (rule:if-match, rule:validate-before-write).
- **The parser** — `lib/parse.js`: a list item `has` its nested items (req:ontology.blocks); an indented list under a *paragraph-form* prose node attaches to the heading, not the node; a yaml card has no content form; indented lines right after a prose line are its continuation text (rule:prose-round-trip). `continuationEnd` in `packages/web/src/lib/node-edit.ts` follows the same rule for op:node.edit.
- **The API** — `app/api/[product]/node/[id]/route.ts`: GET returns the node, its relations and type; PUT patches its defining line (op:node.edit). Nothing reads or writes a node's nested lines as a unit.

## Plan

**The model.** Content is what sits indented under a node's defining line, two spaces per level, parsed with the same rules as a document body — recursively, so a child can have children without limit. A prose node (paragraph or list item) has nested list items and, after a blank line, indented paragraphs and fences; a yaml card has its content indented after its closing fence and is then alone in its fence. Children keep their own ids, so a parent's text can change without losing them. This is req:ontology.content and decision:ontology.content-markdown on ontology-design; it delivers task:ontology.child-nodes-design (minus type:comment).

![[req:ontology.content]]

![[decision:ontology.content-markdown]]

**Going deeper.** The column shows one node at a time — its properties, then its content in one editor whose blocks are the node's direct children. A child's card in that editor is folded to its head and first block; clicking it opens the child (a chip; ← returns), which has its own properties and content editor. Depth is one click per level, the chips are the path back, and the column never nests editors inside editors. This is decision:ontology.depth-by-navigation.

![[decision:ontology.depth-by-navigation]]

**The content editor** is the document editor, scoped to one node: the same schema, slash menu, import and serializer, fed by a new GET of the node's content and saved by a new PUT that replaces the node's nested lines in its source document under the document's if-match hash and the ctx check gate. One store, one code path — a block typed in the column and a block typed on the page are the same markdown. When the document page and the column both show the same content, the write that lands second is rejected by if-match and that editor reloads from the graph event, as the document editor does today for an outside change. This is req:wf2.ui.node-content on page:web/context-column.

![[req:wf2.ui.node-content]]

**Cards** keep their head, text and properties and add the first block of the content with a "▸ n more blocks" fold; the toggle unfolds in place, a click on the card opens the details where everything is editable. On the document page the nested blocks are the page's own blocks, so the fold hides them there too (a class on the node block's children group — UI state, never written to the file). This is req:wf2.ui.card-preview.

![[req:wf2.ui.card-preview]]

**Related** (the RAG hits) is collapsed behind a "show" button; no search runs while it is closed; the choice is remembered per browser. This is req:wf2.ui.related-collapsed.

![[req:wf2.ui.related-collapsed]]

Decisions this plan makes on its own, and what it cannot decide:

```yaml
- id: decision:wf2.content-editor-scoped
  title: The column's content editor is the document editor scoped to one node, over one store
  context: >
    req:wf2.ui.node-content wants the page's editor inside the column, for any node, recursively. DocEditor loads a
    whole document and saves it whole; the column shows one node whose content is a slice of a document.
  choice: >
    DocEditor gains a scope: given a node id it loads the node's content markdown (GET /api/<product>/node/<id>/content:
    the nested lines de-indented, the document's hash) into the same schema and saves it back with
    PUT …/node/<id>/content (if-match on the document, the ctx check gate) which re-indents the markdown under the
    defining line and rebuilds the graph. Same slash menu, same import/serialize, same slug assignment for new typed
    blocks; the only differences are the load and save paths and that its root is a node, not a document.
  alternatives: >
    A separate lighter editor for content (two editors that drift); writing children as op:node.edit patches one
    block at a time (loses ordering and nested structure); editing content only on the document page (the column
    stays read-only — not what was asked).
  consequences: >
    two new routes under api/[product]/node/[id]/content; DocEditor's load/save are parameterised (a `scope` prop);
    a node open in the column and its document open behind it can both edit the same lines — the second write
    fails if-match and that editor reloads on the next graph event, as today for an outside change.
  date: 2026-09-18
  status: proposed
  affects: [req:wf2.ui.node-content, component:doc-editor, component:peek-panel, op:node.edit]
  session: ffab751604
- id: decision:wf2.related-collapsed-default
  title: Related is closed by default, runs no search while closed, and remembers the choice per browser
  context: >
    The Related list (rule:context-panel) shows up under every selected block and searches on every caret move;
    the person asked for it hidden behind a button.
  choice: >
    A "Related" heading with a show/hide button; collapsed by default; ContextPanel does not mount (so no request
    goes out) until it is shown; the state lives in PeekProvider and in localStorage (`wf-related`), so it holds
    across blocks, pages and reloads until the person closes it again.
  alternatives: >
    Collapsed every time the block changes (a click per block, tiring for someone who wants it); still searching
    while hidden (wasted requests); removing Related (it is what "+ link" is for).
  consequences: fewer context requests; ui-test:block-select's Related checks open it first
  date: 2026-09-18
  status: proposed
  affects: [req:wf2.ui.related-collapsed, component:context-panel, component:peek-panel]
  session: ffab751604
- id: question:wf2.content-of-block-nodes
  title: Does a plain paragraph — a block:<doc>.<hash> node — get a content editor too?
  q: >
    A plain paragraph is a node (req:ontology.blocks) whose id is the hash of its text. The column can show it
    once task:ontology.paragraph-select ships; should it also get properties and a content editor there, given
    that editing the paragraph's text changes its id and so the chip and every link to it?
  context: >
    req:wf2.ui.node-content covers defined typed nodes and documents. Including block nodes now means the same
    editor for every block on a page; the cost is unstable ids under edit. Recommendation: not in this plan —
    do it with task:ontology.paragraph-select, once a block node can be opened at all.
  status: open
  related-to: [req:wf2.ui.node-content, task:ontology.paragraph-select, req:ontology.blocks]
```

## Tasks

- [x] task:wf2.content-parse `lib/parse.js` reads content by decision:ontology.content-markdown: an indented list or, after a blank line, indented paragraphs and fences under a prose node (paragraph or list form) are its children, not the heading's; the indented blocks after a yaml fence are the last card's; the rules apply recursively; type:node declares `content` as a list of block with the inverse `parent`, `has` staying its alias; tests in test/blocks.js for each form and for depth 3. Implements req:ontology.content; delivers task:ontology.child-nodes-design; part of plan:plan-need-more-work-context-panel-proper and goal:ontology.graph-editor. (session: ffab751604)
- [x] task:wf2.content-roundtrip The editor's `import.ts` keeps a node block's nested blocks as its children in every form the parser reads (nested list, blank line + indented paragraph or fence, a card's trailing content), `serialize.ts` writes them back at the right depth and splits a yaml group so a card with children is alone in its fence; unit tests in serialize.test.ts and import.test.ts round-trip three levels. Part of plan:plan-need-more-work-context-panel-proper; depends on task:wf2.content-parse. (session: ffab751604)
- [x] task:wf2.content-api `GET /api/<product>/node/<id>/content` returns the node's content markdown (de-indented), its child ids in order and the document's hash; `PUT` replaces the nested lines under the defining line (re-indented, if-match on the document, ctx check gate, rebuild) and records the session's artifact; `wf node content <id>` / `wf node content <id> --file f` for agents; tests in node-edit.test.ts for the extent (prose line, list item, card) and the splice. Part of plan:plan-need-more-work-context-panel-proper; depends on task:wf2.content-parse. (session: ffab751604)
- [x] task:wf2.content-editor DocEditor takes a `scope` (a node id) that swaps its load and save for the content routes (decision:wf2.content-editor-scoped); PeekPanel's NodeView shows a Content heading and the scoped editor under the properties for every defined node and document; a typed block inserted there gets its slug and becomes the node's child; a child's card selects/opens the child on click (decision:ontology.depth-by-navigation); an outside change (graph event) reloads an untouched content editor. Implements req:wf2.ui.node-content; delivers task:ontology.children-in-column; part of plan:plan-need-more-work-context-panel-proper; depends on task:wf2.content-api and task:wf2.content-roundtrip. (session: ffab751604)
- [x] task:wf2.card-preview NodeCards (ProseCard, QuestionCard, DecisionCard) show the first content block and a "▸ n more blocks" fold; in the document editor the fold hides the node block's children group beyond the first (a class, not a prop); EmbeddedCard and expanded Connected rows get the preview from the content route. Implements req:wf2.ui.card-preview; part of plan:plan-need-more-work-context-panel-proper; depends on task:wf2.content-api. (session: ffab751604)
- [x] task:wf2.related-collapsed Related in the Context root is a heading with a show/hide button, collapsed by default, remembered in localStorage, ContextPanel unmounted while collapsed (decision:wf2.related-collapsed-default); ui-test:block-select opens it before its Related checks. Implements req:wf2.ui.related-collapsed; part of plan:plan-need-more-work-context-panel-proper. (session: ffab751604)
- [x] task:wf2.content-ui-test ui-test:node-content in Chrome via playwright-core on a scratch product: open a task, type a paragraph and a `/req` block in its Content, see the nested lines in the file, click the child card, see its own Content, add a block two levels down, go back with ←, see the fold on the parent's card, Related collapsed and opened; then knowledge: rules with sources for the parser, the content routes, the scoped editor, the fold and the collapsed Related on their pages, reqs shipped, test-design entry. Part of plan:plan-need-more-work-context-panel-proper; depends on every task above. (session: ffab751604)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
