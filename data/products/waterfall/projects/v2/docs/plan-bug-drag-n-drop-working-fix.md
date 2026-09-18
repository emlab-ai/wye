---
node: plan:plan-bug-drag-n-drop-working-fix
type: plan
title: bug: drag n drop is not working , fix it
status: done
owner: unassigned
last-verified: 2026-09-18
session: 9091132439
agent: claude-code
started: 2026-09-18T13:12:03.106Z
part-of: module:v2-plans
order: 20
finished: 2026-09-18T13:22:52.401Z
---

# bug: drag n drop is not working , fix it

## Request

> bug: drag n drop is not working , fix it

_from: module:bugs_

## Context

The screenshot is the rail's Documents tree (component:doc-tree, rule:documents-tree, page:web/sidebar): dragging a row onto another nests the document, between rows reorders, a zone under the tree makes it top level. Reproduced in Chrome via playwright-core: a mouse-driven drag never reached a target, and a synthetic `dragstart` on a row left it with `isConnected: false` — the row was unmounted by the very state change (`setDrag`) that marks it as dragging, because the row was a component defined inside `DocTree`'s render body and took a new identity on every render. Chrome ends a native drag once its source node leaves the document. The tree has been this shape since it shipped (commit 59fc95c); the last change (755b19a, node ids on tree items) did not introduce it. Recorded as bug:doc-tree-dnd in module:bugs.

Second request (same conversation): a context menu on every tree row to duplicate and delete documents. The tree had a move API (op:api.docs.move) and a create route; nothing deleted or copied a document, and no popup-menu pattern existed in the app. Built as req:wf2.ui.tree-menu, rule:tree-menu, lib:doc-ops, op:api.docs.duplicate, op:api.docs.delete.

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
- id: decision:wf2.tree-delete-subtree
  title: Deleting a document from the tree deletes its sub-documents too, after a warning that counts them
  context: >
    The tree's context menu (a second request in session 9091132439) offers Delete and Duplicate on every row. A
    document can have sub-documents; the person had to choose what Delete does with them.
  choice: >
    Delete removes the document and its whole subtree; the confirm names the document and how many sub-documents
    go with it ("…and its N sub-documents"). The files are in git, so a wrong delete is recoverable there.
  alternatives: >
    Move the sub-documents up to the deleted document's parent (proposed by the agent; rejected: the person wants
    the subtree gone); refuse to delete a document that has children (an extra step for every delete of a folder-like
    page).
  consequences: >
    One delete can remove many pages, so the warning is the only guard; references from other documents to nodes
    defined in the deleted pages dangle (ctx check reports them) — the response counts them and the tree shows a
    notice.
  date: 2026-09-18
  affects: [component:doc-tree, rule:tree-menu]
  status: proposed
```

## Tasks

- [x] task:dnd-reproduce Reproduce the dead drag in Chrome and find the root cause (row remounted on dragstart) — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:dnd-hoist-row Hoist the tree row into a module-level Row component in DocTree.tsx — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:dnd-ui-test Verify with a mouse-driven native drag on a scratch product: nest, reorder, top level (ui-test:doc-tree-dnd) — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:dnd-knowledge Record bug:doc-tree-dnd, rule:doc-tree-row-stable, the refined component:doc-tree card and the ui-test — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:tree-menu-lib lib/doc-ops: copySlug, duplicateMarkdown (ids re-suffixed), subtree — with test:doc-ops (5 cases) — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:tree-menu-api op:api.docs.duplicate and op:api.docs.delete under /api/<product>/docs — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:tree-menu-ui Right-click and ⋯ menu on every tree row with Duplicate and Delete (confirm with the sub-document count) — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:tree-menu-test ui-test:tree-menu in Chrome on a scratch product, 12 checks — part of plan:plan-bug-drag-n-drop-working-fix
- [x] task:tree-menu-knowledge req:wf2.ui.tree-menu, rule:tree-menu, lib and op cards, sidebar actions, the tests — part of plan:plan-bug-drag-n-drop-working-fix

## Result

Fixed drag and drop in the sidebar Documents tree (bug:doc-tree-dnd). Root cause: DocTree's row was a component defined inside the render body, so setDrag on dragstart remounted every row and Chrome ended the native drag. The row is now a module-level Row component (packages/web/src/components/DocTree.tsx), rule:doc-tree-row-stable. Verified in Chrome with a mouse-driven drag on a scratch product: nest, reorder, top level — 7/7 (ui-test:doc-tree-dnd). decision:wf2.doc-tree-row-hoisted proposed; 4 tasks done; committed b590416. Also restored two cards the Bugs document had lost since 47d14c8 (question:wf2.bugs-cards-dropped open). Your live drags after the fix (order: on six documents, Plans moved to top level) are left uncommitted.

Blocks this plan produced:

- changed plan:plan-pannel-text-input-bottom-bar-top — the pannel / text input at the bottom and bar on top must not be scrollable, content is…
- changed plan:plan-plan-system-type-waterflow-project-specific — plan must be system type, not waterflow project specific
- changed plan:plan-table-horizontally-scrollable-just-take-100 — table should horizontally scrollable , not just take 100% width, in small screens it…
- changed plan:plan-text-which-sent-agent-beginning-no — this text, which is sent to agent at the beginning, can you no show it, it is kind of…
- changed plan:plan-work-in-progress-visibility — Work-in-progress visibility — a Plans folder, a plan per request, all work items on the Agents page
- changed module:todo — TODO
- changed component:doc-tree — doc-tree
- added bug:doc-tree-dnd — Drag and drop in the sidebar Documents tree did nothing:
- added rule:doc-tree-row-stable — doc-tree-row-stable
- added ui-test:doc-tree-dnd — doc-tree-dnd
- added decision:wf2.doc-tree-row-hoisted — The tree row is a module-level component; the fix stays with the native HTML5 drag
- added task:dnd-reproduce — Reproduce the dead drag in Chrome and find the root cause (row remounted on dragstart) — part of plan:plan-bug
- added task:dnd-hoist-row — Hoist the tree row into a module-level Row component in DocTree.tsx — part of plan:plan-bug-drag-n-drop-workin
- added task:dnd-ui-test — Verify with a mouse-driven native drag on a scratch product:
- added task:dnd-knowledge — Record bug:doc-tree-dnd, rule:doc-tree-row-stable, the refined component:doc-tree card and the ui-test — part 
- added question:wf2.bugs-cards-dropped — The working copy of this document (edited after commit 47d14c8, before session 9091132439) had lost the two ca
- added req:wf2.ui.palette-images — A request from the command palette can carry images
- added decision:wf2.palette-images-are-session-files — Palette images are session attachments, not inbox assets

12 paragraphs added or changed — [per document](/waterfall/sessions/9091132439/changes)
