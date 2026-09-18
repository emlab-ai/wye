---
node: plan:plan-bug-drag-n-drop-working-fix
type: plan
title: bug: drag n drop is not working , fix it
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: 9091132439
agent: claude-code
started: 2026-09-18T13:12:03.106Z
part-of: module:v2-plans
order: 20
---

# bug: drag n drop is not working , fix it

## Request

> bug: drag n drop is not working , fix it

_from: module:bugs_

## Context

The screenshot is the rail's Documents tree (component:doc-tree, rule:documents-tree, page:web/sidebar): dragging a row onto another nests the document, between rows reorders, a zone under the tree makes it top level. Reproduced in Chrome via playwright-core: a mouse-driven drag never reached a target, and a synthetic `dragstart` on a row left it with `isConnected: false` — the row was unmounted by the very state change (`setDrag`) that marks it as dragging, because the row was a component defined inside `DocTree`'s render body and took a new identity on every render. Chrome ends a native drag once its source node leaves the document. The tree has been this shape since it shipped (commit 59fc95c); the last change (755b19a, node ids on tree items) did not introduce it. Recorded as bug:doc-tree-dnd in module:bugs.

## Plan

Hoist the row out of the tree's render into a module-level `Row` component that takes the tree's shared state (path, closed, drag, over, setters, move, onAddChild) as one `tree` prop; no other behaviour changes. Verify with a real mouse-driven native drag on a scratch product, then record the constraint as a rule so it is not reintroduced.

```yaml
- id: decision:wf2.doc-tree-row-hoisted
  title: The tree row is a module-level component; the fix stays with the native HTML5 drag
  context: >
    Drag and drop in the Documents tree did nothing. Root cause: the row component was defined inside DocTree's
    render, so setDrag on dragstart remounted every row and Chrome aborted the native drag (bug:doc-tree-dnd).
  choice: >
    Hoist the row into a stable module-level Row component that receives the tree's state as one prop; keep the
    native HTML5 drag events, the move API and the zones as they are. Recorded as rule:doc-tree-row-stable.
  alternatives: >
    Replace the native drag with a pointer-event or dnd-kit implementation (a new dependency and a rewrite for a
    one-cause bug); keep the nested component and useMemo/useCallback it (fragile — any missed dependency brings
    the remount back).
  consequences: >
    The smallest change that fixes the root cause; Row re-renders on every tree state change like before (the
    tree is small). ui-test:doc-tree-dnd guards it. Any future draggable row in the app follows the same rule.
  date: 2026-09-18
  affects: [component:doc-tree, rule:documents-tree]
  status: proposed
```

## Tasks

- [x] task:dnd-reproduce Reproduce the dead drag in Chrome and find the root cause (row remounted on dragstart) — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:dnd-hoist-row Hoist the tree row into a module-level Row component in DocTree.tsx — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:dnd-ui-test Verify with a mouse-driven native drag on a scratch product: nest, reorder, top level (ui-test:doc-tree-dnd) — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:dnd-knowledge Record bug:doc-tree-dnd, rule:doc-tree-row-stable, the refined component:doc-tree card and the ui-test — part of plan:plan-bug-drag-n-drop-working-fix

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
