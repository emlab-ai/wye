---
node: pr:pr-still-bad-now-need-click-tag
type: pr
title: still bad!
status: done
owner: unassigned
last-verified: 2026-09-18
session: 367dedec3c
agent: claude-code
started: 2026-09-18T15:43:11.976Z
part-of: module:v2-prs
finished: 2026-09-18T16:52:11.386Z
---

# still bad!

## Request

> still bad!
> 
> now i need to click to tag i.e (rule) to show detais, it must be done by clickcing to any part of the blcok, including text part
> 
> what we need to have is true graph editor
> 
> document is node, blocks inside are node, any node can have child nodes, like comments, or any other types of nodes linked

_from: plan:plan-table-horizontally-scrollable-just-take-100_

## Context

The complaint is about page:web/context-column on a document page (page:web/node). Today only the kind pill of a block (`host.peek` in component:node-cards, the `nrow-open` dot on a table row) opens the block's node in the column; a tag in the text (component:smart-tag) pushes what it names. The Context root of the column already follows the block the caret is in — `editing.nodeId`, published by DocEditor's `publishContext` (rule:context-panel) — and bug:when-i-select-a made a click on a row's cells put the caret there for that reason. Two gaps make the person click the pill anyway:

- the root only shows while the column is *at* the root; when a session or another node is open (the case in the screenshot: this conversation in the column), a click in a block's text changes nothing visible;
- an embedded card (component:embed-block, `![[rule:table-scroll]]` on the plan page) keeps its text in a text area with the editor's mouse events stopped, so clicking it moves no caret and publishes nothing.

Code: packages/web/src/components/PeekProvider.tsx (the chip stack, `open`, `editing`), PeekPanel.tsx (the root renders `editing.nodeId`), NodeCards.tsx (`CardHost.peek`, the pill), DocEditor.tsx (`EditorCard`, `RowNode`, `TypeRowFor`, `selectBlockOnClick`, `publishContext`), EmbedBlock.tsx (`EmbeddedCard`, used in the editor, in the column's connected cards and in a session's changes).

The second half of the request — a true graph editor: document is a node, blocks are nodes, any node can have child nodes such as comments — is what module:ontology and module:ontology-design already say and the parser already builds (req:ontology.blocks: every block is a `block:` node, the document `has` its blocks, a heading its blocks, a list item its nested items). The UI is what lags: task:ontology.block-peek (open a paragraph's block node) is still open and no comment type exists. That destination is now a goal on the ontology design with its steps:

![[goal:ontology.graph-editor]]

![[req:wf2.ui.block-select]]

![[rule:block-select]]

## Plan

**What changes now (this plan).** One behaviour for every part of a typed block in a document: a click selects it and the column shows the node. Concretely — `select(id)` on the peek provider keeps a `focused` id, jumps the column to its Context root and shows the column; the root renders `focused ?? editing.nodeId`; cards (`.nblock`), rows (`.nrow`) and embeds (`.embed`) call it from a click handler on their outermost element, skipping clicks on `a` (tags and links keep pushing); the pill in a document calls it too, so the pill and the text agree; `publishContext` clears `focused` when the caret moves to another block, so arrow keys take over after a click. The chips stay in the bar: the session the person was reading is one click away, and Escape / ← still walk back. Related knowledge under the node shows when the caret is in the block (an embed has no caret: the node alone).

What does *not* change: an embedded card inside the column (a connected row opened as a card, a session's changes) never selects on click — a click in its text area is an edit; its pill and tags push as before. A plain paragraph still puts the root in "knowledge nearest to the text" mode; making a paragraph openable as its `block:` node is task:ontology.paragraph-select under the goal.

```yaml
- id: decision:wf2.block-click-selects
  title: A click anywhere on a block selects it; the column's Context root shows the node
  context: >
    Only the pill opened a block's node; the Context root followed the caret but was hidden whenever a session or
    node was open in the column, and an embed's text area moved no caret. The person expects a block to behave
    as one node: click it, see it.
  choice: >
    Click = select. Every typed block in a document (card, row, embed) selects on a click anywhere in it, tags
    and links excepted; selecting brings the column to its Context root, which shows the selected node. The chip
    stack stays for navigation (tags, rows, graph nodes push); the pill in a document selects like the rest of the
    block.
  alternatives: >
    (a) Push the node on the chip stack on every block click — every block touched while editing becomes a chip
    and the bar fills up; the root already exists for "the node under the cursor". (b) Only change the pill's
    hit area to the whole header — still not the text, which is what the person clicks. (c) Follow keyboard caret
    moves too, pulling the column off a session while typing — too eager; a click is a deliberate pointing act.
  consequences: >
    req:wf2.ui.block-select and rule:block-select on page:web/context-column; `focused` state on PeekProvider;
    the column leaves a session view on a block click (the session's chip stays); an embed in the column keeps
    its edit-in-place behaviour.
  date: 2026-09-18
  status: proposed
  affects: [req:wf2.ui.block-select, rule:block-select, component:peek-panel, component:node-cards, component:embed-block, component:doc-editor]
  session: 367dedec3c
- id: decision:wf2.graph-editor-is-a-goal
  title: The graph-editor vision is a goal on the ontology design, built in steps
  context: >
    "Document is node, blocks are nodes, any node can have child nodes like comments" is already the model
    (req:ontology.blocks shipped 2026-09-17). What is missing is UI — block selection, opening a paragraph's block
    node, children under a node — and one piece of ontology: a comment type and the markdown form of a child.
  choice: >
    Record it as goal:ontology.graph-editor on the ontology design with four task lines (block-select now,
    paragraph-select, child-nodes-design, children-in-column) and one open question on the markdown form of a
    child node (question:ontology.child-nodes). This plan ships the first step only.
  alternatives: >
    Build comments in this session too — no decided markdown form for a child node, so it would be guessed;
    or leave the vision in chat — lost.
  consequences: >
    The goal's tasks carry the follow-ups; question:ontology.child-nodes waits for a decision before
    task:ontology.child-nodes-design starts.
  date: 2026-09-18
  status: proposed
  affects: [goal:ontology.graph-editor, question:ontology.child-nodes, module:ontology-design]
  session: 367dedec3c
```

![[question:ontology.child-nodes]]

## Tasks

- [x] task:block-select-provider `select(id)` and `focused` on PeekProvider; the Context root of PeekPanel renders `focused ?? editing.nodeId` (Related only when the caret's block is the focused one); `publishContext` clears `focused` when the caret moves to another block. Part of pr:pr-still-bad-now-need-click-tag. (session: 367dedec3c)
- [x] task:block-select-blocks `onSelect` on CardHost, attached to the outermost element of ProseCard, QuestionCard and DecisionCard (clicks inside an `a` skipped); EditorCard, RowNode and TypeRowFor call `select` on click and from the pill; EmbeddedCard selects when `inEditor`, never in the column. Part of pr:pr-still-bad-now-need-click-tag. (session: 367dedec3c)
- [x] task:block-select-ui-test ui-test:block-select in Chrome via playwright-core on a scratch product: a session open in the column, click a card's text → the column shows the node at the root and the session chip stays; click an embed's text area → its node; click a table row's cell → the row's node; a tag inside a card's text still pushes; a connected card's text area in the column does not navigate; tsc and the unit tests pass. Part of pr:pr-still-bad-now-need-click-tag. (session: 367dedec3c)
- [x] task:block-select-knowledge req:wf2.ui.block-select and rule:block-select shipped on dev-design; ui-test:block-select on test-design; task:ontology.block-select done under goal:ontology.graph-editor. Part of pr:pr-still-bad-now-need-click-tag. (session: 367dedec3c)

## Result

Click anywhere on a block shows its node (req:wf2.ui.block-select, rule:block-select, decision:wf2.block-click-selects): a click on any part of a typed block in a document — a card's text or properties, a table row's cell, an embed's text area, the pill — selects it: the context column comes to its Context root and shows the node, whatever it showed before (a session, another node); the chips stay in the bar, and a push from the root now keeps them, so the session is one click away; tags and links inside a block still push; arrow keys take over after a click; an embedded card inside the column never navigates on click. The graph-editor vision (document is a node, blocks are nodes, child nodes such as comments) is goal:ontology.graph-editor on the ontology design with its steps — task:ontology.paragraph-select, task:ontology.child-nodes-design, task:ontology.children-in-column — and question:ontology.child-nodes on the markdown form of a child node (decision:wf2.graph-editor-is-a-goal). Verified: ui-test:block-select (/tmp/wfpw/block-select.mjs, 15 checks in Chrome), 190 unit tests, tsc clean.

Blocks this plan produced:

- changed page:web/context-column — web/context-column
- added action:select-block — a click anywhere on a typed block of the document selects it: the Context root shows the node (rule:block-sele
- added req:wf2.ui.block-select — A click anywhere on a block shows its node in the context column
- added rule:block-select — block-select
- added goal:ontology.graph-editor — The document is a graph editor
- added question:ontology.child-nodes — How is a child node — a comment on a block — written in the markdown?
- added task:ontology.block-select — A click anywhere on a typed block — card, row, embed, text included — selects it and the context column shows 
- added task:ontology.paragraph-select — A click in a plain paragraph selects its block node:
- added task:ontology.children-in-column — The context column shows what a node `has` — its child nodes:
- added decision:wf2.block-click-selects — A click anywhere on a block selects it; the column's Context root shows the node
- added decision:wf2.graph-editor-is-a-goal — The graph-editor vision is a goal on the ontology design, built in steps
- added task:block-select-provider — `select(id)` and `focused` on PeekProvider;
- added task:block-select-blocks — `onSelect` on CardHost, attached to the outermost element of ProseCard, QuestionCard and DecisionCard (clicks 
- added task:block-select-ui-test — ui-test:block-select in Chrome via playwright-core on a scratch product:
- added task:block-select-knowledge — req:wf2.ui.block-select and rule:block-select shipped on dev-design;
- added task:ontology.child-nodes-design — Decide the markdown form of a child node (question:ontology.child-nodes), declare type:comment in the base ont
- added ui-test:block-select — block-select
- changed task:table-filter-marker — `COLLECTION_OPEN` accepts a trailing key=value query, the collection block gets a `query` prop, `collectionMar

23 paragraphs added or changed — [per document](/waterfall/sessions/367dedec3c/changes)
