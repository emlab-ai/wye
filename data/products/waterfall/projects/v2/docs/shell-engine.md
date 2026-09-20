---
node: module:shell-engine
type: module
title: Shell and navigation
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:app
order: 48
---

# Shell and navigation

Shell and navigation

## Decisions

```yaml
- id: decision:wf2.one-table-block
  title: One Data table block with a type picker in its header, not one slash item per type
  context: >
    Every own type got its own "<Type>s table" slash item next to Goals table and Tasks table; with ten types the
    menu filled with tables (bug:no-need-to-add).
  choice: >
    A single "Data table" item inserts a table of tasks; its header holds a select with goals, tasks and every type
    the product declares, and picking one re-kinds the (still empty) rows. Once a row has text the picker locks —
    the rows have ids of that kind, and changing the kind would change ids other nodes may link. Goals and tasks
    keep their columns (status, target/due, progress, owner); a type table shows the type's properties. The markdown
    is unchanged: <!-- goals -->, <!-- tasks -->, <!-- table:<slug> -->.
  alternatives: >
    Keep one item per type — the menu grows with the ontology; a kind property edited as text — no discovery of what
    types exist; let the type change with rows present — silent id changes.
  consequences: the Tasks page and rule:type-tables say "Data table"; ui-test:table-rows covers the picker
  status: proposed
  date: 2026-09-17
  related-to: [rule:type-tables, rule:goals-and-tasks, bug:no-need-to-add]
  session: 8aa3926e18
- id: decision:wf2.one-command-box
  title: "Send to agent" and ⌘P are one command box
  context: >
    Two dialogs start work for an agent: the command palette (⌘P: a request, plan-first, agent, folder, pasted
    images, always a new conversation) and "Send to agent" (block menus, node views, question and review lists,
    the top bar: a target — an active conversation, a new one or a runner — agent, folder, an instruction prefilled
    with the block). They drifted: only the palette takes images and plans first; only the dialog can send into a
    running conversation; Enter runs in one, ⌘↵ in the other.
  choice: >
    One component, CommandBox (the palette's look, in the middle of the screen), opened by ⌘P with the cursor's
    context or by any "Send to agent" with the block's text, refs and source prefilled. It has the union of the
    two: the request text (Enter runs, Shift+Enter a new line), the context tags, pasted or dropped images, a
    "to" picker (active conversations, new conversation, queue for a runner) that defaults to the most recent
    active conversation when one is live and to a new conversation otherwise, and for a new conversation the
    agent, the working folder and the plan-first tick. requestSend() and ⌘P both open it; SendToAgentHost and
    CommandPalette go away.
  alternatives: >
    Keep two dialogs and copy features across — they would drift again; make ⌘P open the Send dialog — its
    form-style layout is heavy for a one-line request and has no plan-first or images.
  consequences: >
    component:command-box replaces the Send-to-agent dialog (SendToAgent.tsx) and action:command-palette's own box; the message
    route already takes images; sending into an active conversation from ⌘P becomes possible; rule:agent-sessions
    and req:wf2.ui.command-palette refer to the one box; ui-test:command-palette covers both entry points.
  date: 2026-09-17
  status: proposed
  affects: [action:command-palette, component:command-box, rule:agent-sessions, req:wf2.ui.command-palette]
```

## Libraries

```yaml
- id: lib:scope
  file: packages/web/src/lib/scope.ts
  side: server
  purpose: >
    Server-only: everything a page needs for one product (and optionally one project), loaded once per request.
  part-of: module:shell-engine
- id: lib:load
  file: packages/web/src/lib/load.ts
  side: server
  purpose: >
    Server-only: the one place the web app touches the filesystem. Keep graph.ts free of node: imports so client components can use it.
  part-of: module:shell-engine
- id: lib:knowledge
  file: packages/web/src/lib/knowledge.ts
  side: shared
  purpose: >
    The knowledge index: how nodes are grouped and named for humans.
  part-of: module:shell-engine
- id: lib:ids
  file: packages/web/src/lib/ids.ts
  side: shared
  purpose: >
    The kind list is open: a product's type: cards add kinds (graph.kinds). setKinds is called with the graph's kinds on the server (loadScope) and in the client provider, so every consumer of ID_RE sees the product's ids.
  part-of: module:shell-engine
- id: lib:presets
  file: packages/web/src/lib/presets.ts
  side: shared
  purpose: >
    Graph presets: which kinds and verbs each view shows (Requirements, Mechanics, Data, Drift, Everything).
  part-of: module:shell-engine
- id: lib:doc-ops
  file: packages/web/src/lib/doc-ops.ts
  side: shared
  purpose: >
    Duplicating and deleting documents from the tree (rule:tree-menu): copySlug (<slug>-copy, -copy-2 …),
    duplicateMarkdown (the node line, the title and every id the document defines take the copy's suffix — other
    documents' ids stay), subtree (a document and every document under it — what a delete removes). Pure; tested by
    test:doc-ops.
  part-of: module:shell-engine
- id: lib:layout
  file: packages/web/src/lib/layout.ts
  side: shared
  purpose: >
    Every visible edge ranks the layout so non-tree presets (Drift, Data) still spread into layers; only refines/has are marked as tree edges for styling. refines points child → parent; has points parent → child; both are ranked parent → child. Other verbs rank from → to.
  part-of: module:shell-engine
```
