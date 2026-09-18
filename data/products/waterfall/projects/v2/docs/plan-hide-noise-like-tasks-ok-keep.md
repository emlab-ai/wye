---
node: plan:plan-hide-noise-like-tasks-ok-keep
type: plan
title: hide noise like this from tasks?
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: c8eadd53da
agent: claude-code
started: 2026-09-18T22:14:56.073Z
part-of: module:v2-plans
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

- [x] task:wf2.produced-bottom Move Produced below Connected in the column for a goal or task (PeekPanel NodeView) part of plan:plan-hide-noise-like-tasks-ok-keep (session: c8eadd53da)
- [x] task:wf2.produced-collapsed Produced is a bar with show / hide: closed by default with `n sessions · m documents`, sessions and inbox fetched only while open (Produced.tsx, globals.css) part of plan:plan-hide-noise-like-tasks-ok-keep (session: c8eadd53da)
- [x] task:wf2.produced-test Extend ui-test:node-content: a task with a session shows Produced closed after Connected, no session request went out, "show" loads it part of plan:plan-hide-noise-like-tasks-ok-keep (session: c8eadd53da)
- [x] task:wf2.produced-knowledge Ship req:wf2.ui.produced-collapsed and rule:produced-collapsed, update component:produced, req:wf2.ui.node-page and rule:task-artifacts, test-design part of plan:plan-hide-noise-like-tasks-ok-keep (session: c8eadd53da)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
