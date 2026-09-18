---
node: plan:plan-told-show-card-additional-blocks-only
type: plan
title: i told you not to show in the card, additional blocks only first one, the reset is in…
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: a4dbc39398
agent: claude-code
started: 2026-09-18T22:07:03.152Z
part-of: module:v2-plans
---

# i told you not to show in the card, additional blocks only first one, the reset is in…

## Request

> i told you not to show in the card, additional blocks only first one, the reset is in details

_from: module:todo · refs: task:new-226_

## Context

The card fold shipped in commit e3e6a3d (plan:plan-need-more-work-context-panel-proper, task:wf2.card-preview) read the original request — "maybe we just show first part / block and to see entire content need to click to it and see details" — as "show the first *content* block": req:wf2.ui.card-preview said the card shows the first block of the content and folds the rest, with an "unless the content is one block — shown whole". The screenshot is that unless: task:new-226 has one child (task:new-428), so the card showed it in full under "▸ 1 block". The first block is the node's own text (decision:wf2.text-is-first-block); the content belongs in the details (req:wf2.ui.node-content, rule:content-editor).

Code: component:node-cards (`FoldToggle`, `CardHost.fold`), `EditorCard` in DocEditor.tsx (the style element, rule:card-fold), component:embed-block (`ContentPreview` under the card).

![[req:wf2.ui.card-preview]]

![[rule:card-fold]]

## Plan

```yaml
- id: decision:wf2.card-shows-no-content
  title: A card shows none of its content; the count chip opens the details
  context: >
    req:wf2.ui.card-preview had the card show the first content block and fold the rest, and a single block whole.
    The person's intent was the card = the node's own first block (its text) and nothing under it; the content is
    read and edited in the details (rule:content-editor).
  choice: >
    The card shows head, text and properties only. Every block under the node is hidden on the page (zero height,
    still a block and in the file); the header chip "▸ n blocks" opens the node's details instead of unfolding in
    place; an embed shows no ContentPreview, only the chip. The one escape hatch: the editor's caret inside a hidden
    block shows the blocks while it is there, so nothing is typed blind.
  alternatives: >
    Keep the first content block in the card (what shipped — the person rejected it); unfold in place on the chip
    (a second way to see the content, competing with the details; dropped).
  consequences: >
    Content is edited in the column only, on the page the arrow keys skip a node's blocks. ContentPreview and
    .nblock-preview are gone. ui-test:node-content covers the new behaviour (28 checks).
  date: 2026-09-18
  status: proposed
  affects: [req:wf2.ui.card-preview, rule:card-fold, component:node-cards, component:embed-block]
  part-of: plan:plan-told-show-card-additional-blocks-only
```

## Tasks

- [x] task:wf2.card-no-content EditorCard hides every child block (not only beyond the first), the chip opens the details (wf:select / the peek's select), the caret-inside unfold reads the editor's selection; FoldToggle's click is `open`; EmbedBlock drops ContentPreview and its folded state; `.nblock-preview` CSS removed. Implements decision:wf2.card-shows-no-content; part of plan:plan-told-show-card-additional-blocks-only. (session: a4dbc39398)
- [x] task:wf2.card-no-content-verify ui-test:node-content rewritten for the new fold (none of the children has a height, the chip opens the details, a caret inside shows them and leaving folds, the embed has no preview) — 28/28; block-select 15/15, table-filter 25/25, 203 unit tests, tsc clean; req:wf2.ui.card-preview, rule:card-fold, component:node-cards and the test-design entry updated. Part of plan:plan-told-show-card-additional-blocks-only. (session: a4dbc39398)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
