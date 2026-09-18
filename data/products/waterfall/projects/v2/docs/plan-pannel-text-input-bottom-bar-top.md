---
node: plan:plan-pannel-text-input-bottom-bar-top
type: plan
title: the pannel / text input at the bottom and bar on top must not be scrollable, content is…
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: 07aa6645ad
agent: claude-code
part-of: module:wf2-plan
---

# the pannel / text input at the bottom and bar on top must not be scrollable, content is…

## Request

> the pannel / text input at the bottom and bar on top must not be scrollable, content is scrollable if needed

_from: module:wf2-plan_

## Context

The context column — page:web/context-column, the right column that opens any node or session — is one
scroller today: `.peek` has `overflow-y: auto`, so its bar (←, the chips, ×; `.peek-nav`) scrolls away with the
content. A session (component:session-view) shows its header — status, agent, knowledge strip, changes fold,
instruction — and then component:console, a box with its own height (`calc(100dvh − 210px)`) and its own
scrolling log. When the header is taller than 210 px (the screenshot: ~500 px) the console's message box falls
below the fold, and the person scrolls the column to reach it — exactly what the request shows. The app's own
top bar (component:top-bar) is already sticky; the request is about the column.

Code: `packages/web/src/components/PeekPanel.tsx` (the column and its bar), `packages/web/src/components/Console.tsx`
(the log, its stick-to-bottom, the message box), `packages/web/src/app/globals.css` (`.peek`, `.peek-nav`,
`.console`, `.console-log`, `.console-input`). Knowledge: module:app-shell (the column), module:app-agents (the
console), rule:app-navigation (the frame), req:wf2.ui.

![[page:web/context-column]]

## Plan

The column becomes a frame with three parts: the bar at the top (never scrolls), one scroll container under it
(`.peek-body`) holding everything else, and — for a session — the message box stuck to the bottom of that
container (`position: sticky; bottom: 0`). The console loses its own height and its own scroll: the session
header and the conversation scroll as one under the bar and above the box, so a tall header no longer squeezes
or hides the conversation. The message box stays inside component:console (it owns the text, the attachments and
the send), which is why it is sticky rather than a sibling of the scroller — no state moves.

The conversation's follow-the-end behaviour (a new event scrolls to the bottom when the person was at the bottom)
moves from the console's log to the nearest scroll ancestor: the console finds it once, listens to its scroll and
scrolls it to the end. Nodes, documents and types get the same frame for free — their bar stays, their card and
relations scroll.

![[req:wf2.ui.column-frame]]

![[rule:column-frame]]

```yaml
- id: decision:wf2.column-frame-header-scrolls
  title: A session's header scrolls with the conversation; only the bar and the message box are pinned
  context: >
    The request pins the bar at the top and the message box at the bottom. The session header between them (status,
    knowledge strip, changes fold, instruction) can be half a screen tall; pinning it too would leave the
    conversation a few lines high on a laptop.
  choice: >
    The bar and the message box are the only fixed parts; the session header and the conversation are one scroll.
    The chip in the bar names the session, so the person always knows where they are; the header is one scroll-up
    away.
  alternatives: [pin the header too and scroll only the log — squeezes the conversation under a tall header, fold the header into the bar — a second design change the request did not ask for]
  consequences: The console's stick-to-bottom follows the column's scroller instead of its own log; the console has no fixed height.
  affects: [page:web/context-column, component:console, component:session-view]
  status: proposed
  date: 2026-09-18
```

## Tasks

- [x] task:column-frame-layout `.peek` becomes a flex column: `.peek-nav` fixed at the top, `.peek-body` (new wrapper in component:peek-panel) the one scroller; `.console` loses its height and `.console-log` its scroll; `.console-input` is sticky at the bottom of the scroller; the session body has no bottom padding under the box. Part of plan:plan-pannel-text-input-bottom-bar-top, part of req:wf2.ui.column-frame. (session: 07aa6645ad)
- [x] task:column-frame-follow component:console finds its nearest scroll ancestor, reads "at the end" from its scroll and scrolls it to the end on a new event when it was at the end (rule:column-frame). Part of plan:plan-pannel-text-input-bottom-bar-top, part of req:wf2.ui.column-frame. (session: 07aa6645ad)
- [x] task:column-frame-ui-test ui-test:column-frame run in Chrome with playwright-core against the dev server: bar and box in view with a long conversation, the body scrolls, the end is followed, a long node keeps its bar. Part of plan:plan-pannel-text-input-bottom-bar-top, part of req:wf2.ui.column-frame. (session: 07aa6645ad)
- [x] task:column-frame-knowledge req:wf2.ui.column-frame and rule:column-frame shipped; component:peek-panel's purpose says what it is (it reads "How an edge reads from the open node's side" today — a stray comment). Part of plan:plan-pannel-text-input-bottom-bar-top. (session: 07aa6645ad)

## Result

_Written by the app when the session ends._
