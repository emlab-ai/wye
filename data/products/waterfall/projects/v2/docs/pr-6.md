---
node: pr:6
type: pr
title: improve context window, when i click to the element, i would like to be able to add…
status: done
owner: unassigned
last-verified: 2026-09-18
session: edd6ae474d
agent: claude-code
started: 2026-09-18T15:19:04.398Z
part-of: module:v2-prs
finished: 2026-09-18T15:32:45.684Z
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
  date: 2026-09-18
  status: proposed
  related-to: [component:peek-panel, component:embed-block, req:wf2.ui.connected-cards]
```

  - choice:wf2.connected-rows-expand-to-cards Each Connected / tracking row of a defined node gets an expand toggle that renders the node's card under the row with component:embed-block's EmbeddedCard (the source page's card, editable in place); a group heading toggles all of its rows. Nothing is created; the tag still opens the node.

  - context:wf2.connected-rows-expand-to-cards The context column lists what a node is connected to as smart tags; reading a related node meant opening it, which replaced the column's content. The person wants related and child nodes visible like the main card.

  - alternative:wf2.connected-rows-expand-to-cards Render every connected node as a card always (too long for nodes with dozens of relations); a "+ add" that creates a new child or related node (a different request — the person chose expanding); nested expansion of a card's own relations (not asked; a card's tags still open the node).

  - consequence:wf2.connected-rows-expand-to-cards component:peek-panel gains the toggles and depends on component:embed-block; the Connected list's rows keep their shape when collapsed. req:wf2.ui.connected-cards and rule:connected-cards describe it.

![[req:wf2.ui.connected-cards]]

## Tasks

- [x] task:connected-cards-rows Expand toggle on every Connected and tracking row; the expanded row shows the node's EmbeddedCard part of pr:6 (session: edd6ae474d)
- [x] task:connected-cards-groups Cards / tags toggle on every group heading part of pr:6 (session: edd6ae474d)
- [x] task:connected-cards-css The expanded card spans the column under its row part of pr:6 (session: edd6ae474d)
- [x] task:connected-cards-ui-test Verify in Chrome via playwright-core: expand a row, expand a group, collapse, no toggle on a stub, an edit in the expanded card saves part of pr:6 (session: edd6ae474d)
- [x] task:connected-cards-knowledge req:wf2.ui.connected-cards and rule:connected-cards shipped, component:peek-panel refined, ui-test recorded part of pr:6 (session: edd6ae474d)

## Result

Connected rows in the context column expand in place into the node's full card: ▸ on any Connected or tracking row of a defined node renders its EmbeddedCard (the document's editable card) under the row; a group heading's cards/tags toggle opens or closes the whole group; stubs have no toggle; the tag still opens the node. PeekPanel RelRow/RelHead + globals.css; ui-test:connected-cards 16/16 in Chrome; req:wf2.ui.connected-cards and rule:connected-cards shipped, decision:wf2.connected-rows-expand-to-cards proposed; commit 8befe90

Blocks this plan produced:

- added decision:wf2.connected-rows-expand-to-cards — A connected row expands in place into the node's embedded card
- added task:connected-cards-rows — Expand toggle on every Connected and tracking row;
- added task:connected-cards-groups — Cards / tags toggle on every group heading part of pr:6
- added task:connected-cards-css — The expanded card spans the column under its row part of pr:6
- added task:connected-cards-ui-test — Verify in Chrome via playwright-core:
- added task:connected-cards-knowledge — req:wf2.ui.connected-cards and rule:connected-cards shipped, component:peek-panel refined, ui-test recorded pa
- changed component:peek-panel — peek-panel
- changed page:web/context-column — web/context-column
- added req:wf2.ui.connected-cards — A connected node opens as its card under its row in the context column
- added rule:connected-cards — connected-cards
- added ui-test:connected-cards — connected-cards

13 paragraphs added or changed — [per document](/waterfall/sessions/edd6ae474d/changes)
