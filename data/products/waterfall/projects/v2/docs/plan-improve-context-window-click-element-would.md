---
node: plan:plan-improve-context-window-click-element-would
type: plan
title: improve context window, when i click to the element, i would like to be able to add…
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: edd6ae474d
agent: claude-code
started: 2026-09-18T15:19:04.398Z
part-of: module:v2-plans
---

# improve context window, when i click to the element, i would like to be able to add…

## Request

> improve context window, when i click to the element, i would like to be able to add related/linked and child elements - they must be visible in the same way as main cards, currently related elements are visible as smarttags

_from: plan:plan-work-component-data-table-rule-type_

## Context

The context column (component:peek-panel, `packages/web/src/components/PeekPanel.tsx`) shows the open node as its card (component:node-editor, rule:node-page-layout) and, under it, "Connected": every related node grouped by relation, each row a smart tag (rule:smart-tags), a status pill and the title. A goal's Sub-goals / Tasks / Requirements (`Tracking`) are rows of the same shape. The card the person wants for those rows already exists: component:embed-block's `EmbeddedCard` renders any defined node as the source page's card, editable in place (req:wf2.embeds.render, decision:wf2.embed-renders-source-card), and the session changes page already uses it outside the editor (req:wf2.sessions.changes-cards).

## Plan

"Add related/linked and child elements" means expanding them in place, not creating new nodes (the person picked that in chat). Every Connected and tracking row that names a defined node gets an expand toggle; expanded, the row is followed by the node's full card (`EmbeddedCard`), the same card the document shows; every group heading gets a cards / tags toggle for the whole group. The expanded set lives in the node view, so it resets when another node opens and survives the card's own refetch after an edit.

```yaml
- id: decision:wf2.connected-rows-expand-to-cards
  title: A connected row expands in place into the node's embedded card
  context: >
    The context column lists what a node is connected to as smart tags; reading a related node meant opening it,
    which replaced the column's content. The person wants related and child nodes visible like the main card.
  choice: >
    Each Connected / tracking row of a defined node gets an expand toggle that renders the node's card under the
    row with component:embed-block's EmbeddedCard (the source page's card, editable in place); a group heading
    toggles all of its rows. Nothing is created; the tag still opens the node.
  alternatives: >
    Render every connected node as a card always (too long for nodes with dozens of relations); a "+ add" that
    creates a new child or related node (a different request — the person chose expanding); nested expansion of
    a card's own relations (not asked; a card's tags still open the node).
  consequences: >
    component:peek-panel gains the toggles and depends on component:embed-block; the Connected list's rows keep
    their shape when collapsed. req:wf2.ui.connected-cards and rule:connected-cards describe it.
  date: 2026-09-18
  status: proposed
  related-to: [component:peek-panel, component:embed-block, req:wf2.ui.connected-cards]
```

![[req:wf2.ui.connected-cards]]

## Tasks

- [x] task:connected-cards-rows Expand toggle on every Connected and tracking row; the expanded row shows the node's EmbeddedCard part of plan:plan-improve-context-window-click-element-would (session: edd6ae474d)
- [x] task:connected-cards-groups Cards / tags toggle on every group heading part of plan:plan-improve-context-window-click-element-would (session: edd6ae474d)
- [x] task:connected-cards-css The expanded card spans the column under its row part of plan:plan-improve-context-window-click-element-would (session: edd6ae474d)
- [x] task:connected-cards-ui-test Verify in Chrome via playwright-core: expand a row, expand a group, collapse, no toggle on a stub, an edit in the expanded card saves part of plan:plan-improve-context-window-click-element-would (session: edd6ae474d)
- [x] task:connected-cards-knowledge req:wf2.ui.connected-cards and rule:connected-cards shipped, component:peek-panel refined, ui-test recorded part of plan:plan-improve-context-window-click-element-would (session: edd6ae474d)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
