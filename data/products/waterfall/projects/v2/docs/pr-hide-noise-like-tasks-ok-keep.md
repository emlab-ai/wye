---
node: pr:pr-hide-noise-like-tasks-ok-keep
type: pr
title: hide noise like this from tasks?
status: done
owner: unassigned
last-verified: 2026-09-18
session: c8eadd53da
agent: claude-code
started: 2026-09-18T22:14:56.073Z
part-of: module:v2-prs
finished: 2026-09-18T22:26:09.129Z
---

# hide noise like this from tasks?

## Request

> hide noise like this from tasks?
> 
> it is ok to keep it, but fully collapsed and somwhere at the bottom

_from: module:todo · refs: task:new-441_

## Context

The block under the cursor was task:new-441 on the TODO page (module:todo). What the screenshot shows is not the task's own knowledge but the **Produced** section of the context column — component:produced, rendered by component:peek-panel for every goal or task that has sessions: the sessions with their result line, the documents they wrote, the nodes they changed, the inbox items they filed. It comes from rule:task-artifacts (a session's output is traceable from the task) and sits right under the properties, before Content and Connected — so on a one-line task it is the largest thing on the page.

![[component:produced]]

The column's layout is req:wf2.ui.node-page / rule:node-page-layout; the same "keep it, but fold it" shape already exists for Related: req:wf2.ui.related-collapsed and rule:related-collapsed (a bar with show / hide, nothing fetched while closed). Code: `packages/web/src/components/Produced.tsx` (fetches every session and the inbox on mount), `packages/web/src/components/PeekPanel.tsx` NodeView (where Produced is placed, line ~123), `packages/web/src/app/globals.css` `.produced`, `.related-bar`.

## Plan

Produced stays — it is how a person gets from a task to what the agent left behind — but it moves to the bottom of the column and is folded until asked for, like Related. Closed, it is one bar: **Produced** with what is known without a request (`2 sessions · 11 documents`) and a "show" button. Open, it shows what it shows today. Nothing is fetched while it is closed, so a task column stops making one request per session plus the inbox on every open.

Order of a task's column after this: bar · properties · Content · Connected · Produced · Related.

```yaml
- id: decision:wf2.produced-kept-collapsed
  title: Produced stays on a task, folded at the bottom of the column
  context: >
    On task:new-441 the Produced section (sessions, documents, nodes changed) dwarfed the task itself: a one-line
    todo item followed by a card of twenty tags. The person asked whether to hide it, and allowed keeping it
    "fully collapsed and somewhere at the bottom".
  choice: >
    Keep it (rule:task-artifacts needs a way from the task to what its sessions produced) but render it after
    Connected as a bar with a show button, closed by default, with a one-line count so a person knows there is
    something behind it; its data is fetched only when opened.
  alternatives: >
    Drop it from the column and rely on the session page's knowledge strip (loses the task → output path);
    keep it where it is but folded (still above Content and Connected, the things a person came for);
    show only when the task is done (a running session's output is what a person watches).
  consequences: >
    Content and Connected come first on every goal and task; the sessions and inbox are not requested until asked;
    ui-test:node-content gains a task with a session.
  date: 2026-09-18
  status: proposed
  related-to: [component:produced, req:wf2.ui.produced-collapsed, rule:task-artifacts]
- id: decision:wf2.produced-not-remembered
  title: The Produced fold is not remembered across nodes
  context: >
    Related's show / hide is remembered per browser (rule:related-collapsed) because a person who writes with it
    open wants it open everywhere. Produced is looked at per task.
  choice: >
    Produced opens for the node it was opened on and is closed again on the next node; no localStorage key.
  alternatives: >
    Remember it like Related (`wf-produced`) — one click would re-inflate every task column for that browser.
  consequences: one less bit of state in PeekProvider; the toggle lives in Produced itself.
  date: 2026-09-18
  status: proposed
  related-to: [decision:wf2.produced-kept-collapsed, rule:related-collapsed]
```

The requirement and its rule are defined on the dev design next to req:wf2.ui.related-collapsed, the family they belong to (the column's layout), and embedded here:

![[req:wf2.ui.produced-collapsed]]

![[rule:produced-collapsed]]

## Tasks

- [x] task:wf2.produced-bottom Move Produced below Connected in the column for a goal or task (PeekPanel NodeView) part of pr:pr-hide-noise-like-tasks-ok-keep (session: c8eadd53da)
- [x] task:wf2.produced-collapsed Produced is a bar with show / hide: closed by default with `n sessions · m documents`, sessions and inbox fetched only while open (Produced.tsx, globals.css) part of pr:pr-hide-noise-like-tasks-ok-keep (session: c8eadd53da)
- [x] task:wf2.produced-test Extend ui-test:node-content: a task with a session shows Produced closed after Connected, no session request went out, "show" loads it part of pr:pr-hide-noise-like-tasks-ok-keep (session: c8eadd53da)
- [x] task:wf2.produced-knowledge Ship req:wf2.ui.produced-collapsed and rule:produced-collapsed, update component:produced, req:wf2.ui.node-page and rule:task-artifacts, test-design part of pr:pr-hide-noise-like-tasks-ok-keep (session: c8eadd53da)

## Result

Produced (sessions, documents, nodes changed) on a goal or task is now the last section of the context column, folded: a bar 'Produced · n sessions · m documents' with show / hide, closed on every node, the sessions and inbox fetched only when opened (req:wf2.ui.produced-collapsed, rule:produced-collapsed shipped; decision:wf2.produced-kept-collapsed, decision:wf2.produced-not-remembered proposed). ui-test:node-content 33/33, 203 unit tests, tsc clean. Commit on main.

Blocks this plan produced:

- added req:wf2.ui.produced-collapsed — What a task's sessions produced is folded at the bottom of the column
- added rule:produced-collapsed — produced-collapsed
- added decision:wf2.produced-kept-collapsed — Produced stays on a task, folded at the bottom of the column
- added decision:wf2.produced-not-remembered — The Produced fold is not remembered across nodes
- added task:wf2.produced-bottom — Move Produced below Connected in the column for a goal or task (PeekPanel NodeView) part of plan:plan-hide-noi
- added task:wf2.produced-collapsed — Produced is a bar with show / hide:
- added task:wf2.produced-test — Extend ui-test:node-content:
- added task:wf2.produced-knowledge — Ship req:wf2.ui.produced-collapsed and rule:produced-collapsed, update component:produced, req:wf2.ui.node-pag
- changed component:node-cards — node-cards
- changed rule:card-fold — card-fold
- changed req:wf2.ui.card-preview — A card of a node with content shows only its own first block; the content is in the details
- added decision:wf2.card-shows-no-content — A card shows none of its content; the count chip opens the details
- added task:wf2.card-no-content — EditorCard hides every child block (not only beyond the first), the chip opens the details (wf:select / the pe
- added task:wf2.card-no-content-verify — ui-test:node-content rewritten for the new fold (none of the children has a height, the chip opens the details
- changed ui-test:node-content — node-content
- changed pr:pr-told-show-card-additional-blocks-only — i told you not to show in the card, additional blocks only first one, the reset is in…
- changed component:produced — produced
- changed page:web/context-column — web/context-column
- changed rule:task-artifacts — task-artifacts

49 paragraphs added or changed — [per document](/waterfall/sessions/c8eadd53da/changes)
