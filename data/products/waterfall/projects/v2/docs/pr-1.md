---
node: pr:1
type: pr
title: the pannel / text input at the bottom and bar on top must not be scrollable, content is…
status: done
owner: unassigned
last-verified: 2026-09-18
session: 07aa6645ad
agent: claude-code
started: 2026-09-18T11:57:12.331Z
finished: 2026-09-18T12:16:51.532Z
part-of: module:v2-prs
order: 30
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
  affects: [page:web/context-column, component:console, component:session-view]
  status: proposed
  date: 2026-09-18
```

  The bar and the message box are the only fixed parts; the session header and the conversation are one scroll. The chip in the bar names the session, so the person always knows where they are; the header is one scroll-up away.

  **Context** — The request pins the bar at the top and the message box at the bottom. The session header between them (status, knowledge strip, changes fold, instruction) can be half a screen tall; pinning it too would leave the conversation a few lines high on a laptop.

  **Alternatives** — [pin the header too and scroll only the log — squeezes the conversation under a tall header, fold the header into the bar — a second design change the request did not ask for]

  **Consequences** — The console's stick-to-bottom follows the column's scroller instead of its own log; the console has no fixed height.

## Tasks

- [x] task:column-frame-layout `.peek` becomes a flex column: `.peek-nav` fixed at the top, `.peek-body` (new wrapper in component:peek-panel) the one scroller; `.console` loses its height and `.console-log` its scroll; `.console-input` is sticky at the bottom of the scroller; the session body has no bottom padding under the box. Part of pr:1, part of req:wf2.ui.column-frame. (session: 07aa6645ad)
- [x] task:column-frame-follow component:console finds its nearest scroll ancestor, reads "at the end" from its scroll and scrolls it to the end on a new event when it was at the end (rule:column-frame). Part of pr:1, part of req:wf2.ui.column-frame. (session: 07aa6645ad)
- [x] task:column-frame-ui-test ui-test:column-frame run in Chrome with playwright-core against the dev server: bar and box in view with a long conversation, the body scrolls, the end is followed, a long node keeps its bar. Part of pr:1, part of req:wf2.ui.column-frame. (session: 07aa6645ad)
- [x] task:column-frame-knowledge req:wf2.ui.column-frame and rule:column-frame shipped; component:peek-panel's purpose says what it is (it reads "How an edge reads from the open node's side" today — a stray comment). Part of pr:1. (session: 07aa6645ad)

## Result

The context column is a frame: the bar (←, chips, ×) stays at the top, a session's message box sticks to the bottom, and only what is between them — the session header and the conversation, or a node's card and relations — scrolls (req:wf2.ui.column-frame, rule:column-frame, both shipped). Code: .peek is a flex column with .peek-body as the one scroller (PeekPanel wraps the body), .console has no height or scroll of its own, .console-input is position: sticky; Console's follow-the-end listens to its nearest scroll ancestor and scrolls it to the end on a new event when the person was at the end. Verified in Chrome via playwright-core at 1400×900 (ui-test:column-frame, 14 checks passed). Decision decision:wf2.column-frame-header-scrolls (proposed): the session header scrolls with the conversation; only the bar and the box are pinned. component:peek-panel's purpose now says what it is. Commits 8952936 (CSS + Console, swept in by session c2bbac979d) and 2fb2472; 4 tasks done.

Blocks this plan produced:

- changed page:web/context-column — web/context-column
- added req:wf2.ui.column-frame — The context column's bar and message box stay put; only its content scrolls
- added rule:column-frame — column-frame
- added ui-test:column-frame — column-frame
- added decision:wf2.column-frame-header-scrolls — A session's header scrolls with the conversation; only the bar and the message box are pinned
- added task:column-frame-layout — `.peek` becomes a flex column:
- added task:column-frame-follow — component:console finds its nearest scroll ancestor, reads "at the end" from its scroll and scrolls it to the 
- added task:column-frame-ui-test — ui-test:column-frame run in Chrome with playwright-core against the dev server:
- added task:column-frame-knowledge — req:wf2.ui.column-frame and rule:column-frame shipped;
- changed component:doc-props — doc-props
- changed req:wf2.page.node — Every page is a node of the type it declares
- changed req:wf2.page.header-card — The page header is the page node's card with the type's properties
- changed req:wf2.page.retype — Choosing another type for a page moves its node and every link to it
- changed req:wf2.page.create-typed — A new page can be created as an instance of a type
- changed rule:page-node-line — page-node-line
- changed rule:doc-retype — doc-retype
- added test:page-node — The page as a typed node — parser and check
- added test:retype — rewriteId and retypeFrontmatter
- added ui-test:page-node — A page created as a team, filled in the header, listed in the team table, retyped to person with its links following
- changed task:page-node-parse — lib/parse.js:
- changed task:page-node-web-helper — packages/web/src/lib/doc.ts:
- changed task:page-node-header — component:doc-props becomes the page node's card:
- changed task:page-node-retype — packages/web/src/lib/retype.ts (pure, tested):
- changed task:page-node-create — component:new-doc and `wf doc create --type <slug>`:
- changed task:page-node-types-page — page:web/types:
- changed task:page-node-ui-test — ui-test:page-node in Chrome:
- changed task:page-node-knowledge — After shipping:
- changed store:documents — documents
- changed task:new-226 — make sure that each page is also a node, like any other block, and we can set type for it too, to choose prope
- added req:wf2.console.first-message-is-the-request — a conversation's first message goes to the agent (a new session, or a fresh restart with a queued item)
- added decision:wf2.first-message-shown-as-request — The user row shows the instruction; the full prompt rides on the event behind a fold
- added task:first-message-shown — lib:agent-host:
- added task:first-message-fold — component:console:
- added task:first-message-knowledge — After shipping:
- added task:plan-type-agent-prop — The plan pages the app writes (plan:plan-…, type:pr) carry `agent:` and `session:` in their frontmatter;
- changed component:console — console
- added ui-test:first-message-fold — The console's first user row is the request; the wrapper opens from a fold
- changed component:peek-panel — peek-panel

78 paragraphs added or changed — [per document](/waterfall/sessions/07aa6645ad/changes)
