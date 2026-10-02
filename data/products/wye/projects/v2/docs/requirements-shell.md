---
node: module:req-shell
type: module
title: Shell and navigation
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 20
---

# Shell and navigation

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Shell and navigation); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

```yaml
- id: req:wf2.ui.intent
  title: The command box asks what the person wants — a task, a plan or a proposal — and a proposal ends on a page of what was proposed
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [component:command-box, page:web/search]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-shell
```

  - when:wf2.ui.intent the person opens the command box (⌘P) and types a request

  - then:wf2.ui.intent three choices sit above the text — Task (a worker does it now), Plan (a worker understands, proposes a plan on a page, confirms, then builds), Proposal (Wye reads what the product knows and proposes requirements, decisions, questions and tasks as blocks — they wait in the Inbox, nothing is built) — with one line saying what each does; Proposal opens a page that lists every block that conversation proposed, as blocks with their Inbox state, filling in as they land, with links to the conversation, its plan and the Inbox

  - unless:wf2.ui.intent a live conversation is chosen as the target — then the text is a message into it and the choices hide

```yaml
- id: req:wf2.ui.search
  title: Search opens from anywhere with ⌘F and shows blocks, not links
  status: shipped
  satisfied-by: [component:search-panel, page:web/search, component:instance-table]
  verified-by: [ui-test:search]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-shell
```

  - when:wf2.ui.search the person presses ⌘F / Ctrl+F on any page

  - then:wf2.ui.search a search panel opens over the page; what they type searches every block's id, title and text, and a kind first (`page: login`, `req:`, `decision: stop`) narrows to that kind; the hits are listed with kind, title, status, where and a snippet, the highlighted hit's card is the preview beside them, ↑↓ move, a click opens the hit's document, and Enter opens a Search page with every hit as blocks — the instances view over every kind (or the named one) with the search in its URL, so a search is a link

  - unless:wf2.ui.search the screen is narrow, where the preview is left out

```yaml
- id: decision:wf2.views-are-pages
  title: Goals and Work are documents holding one instances view each; a view says where its blocks come from
  date: 2026-09-20
  status: approved
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  affects: [page:web/goals, page:web/tasks, page:web/work, component:view-block, constraint:wf2.no-custom-pages]
```

  - choice:wf2.views-are-pages The app writes `goals.md` and `work.md` once into the project that holds Plans (`<!-- view:goal -->`, `<!-- view:task group=status -->`), the rail's Goals and Work link to them, they leave the Documents tree like Plans, and /goals and /work redirect to them. The view block gains `scope`: `product` (the default — every block of every project) or `project` (this document's project), set in its header next to blocks / table. A list region (`<!-- list:… -->`) is the same idea with scope = the page's own blocks.

  - context:wf2.views-are-pages Goals and Work were pages of their own (a tracking list, a work board) — against constraint:wf2.no-custom-pages. The person asked on 2026-09-20 that they use the standard view component with a property saying the content is parsed from the entire project.

  - alternative:wf2.views-are-pages Keep the custom pages (rejected by the constraint); a scope=page on the view (that is the list region).

  - consequence:wf2.views-are-pages The Work page loses the live queued / working state and the Assign button on its rows until the task block shows them (task:wf2.task-block-state); groups of done blocks fold and cards page by forty, because every card is a live embed.

```yaml
- id: decision:wf2.rail-fewer-entries
  title: Graph, Questions and Search leave the rail — search is ⌘F, the graph and the questions stay at their routes
  date: 2026-09-20
  status: approved
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  affects: [page:web/sidebar, req:wf2.ui.search]
```

  - choice:wf2.rail-fewer-entries the rail keeps Overview, Goals, Work, Knowledge, Types, Constitution, Inbox, Agents and Plans; /<product>/graph and /<product>/questions stay reachable by link and from the Knowledge page; search is the ⌘F panel.

  - context:wf2.rail-fewer-entries the person asked on 2026-09-20; the rail listed eleven entries and a search box that found only titles and ids.

  - alternative:wf2.rail-fewer-entries keep the entries and add the shortcut (the person asked for fewer).

  - consequence:wf2.rail-fewer-entries the rail's Search component is gone; the search panel and page replace it.

```yaml
- id: req:wf2.ui.rail-resize
  title: The rail can be made wider or narrower
  status: shipped
  satisfied-by: [component:shell]
  verified-by: [ui-test:rail-resize]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-shell
```

  - when:wf2.ui.rail-resize the person drags the rail's right edge

  - then:wf2.ui.rail-resize the rail takes the width they set (between 200 and 640 px), the content and the context column refit, and the width is remembered in that browser; a double-click on the edge restores the default

  - unless:wf2.ui.rail-resize the screen is narrow (phone), where the rail stacks and has no edge to drag

```yaml
- id: req:wf2.ui.tabs
  title: Pages and opened nodes stay open as tabs, above the content and above the context column
  status: shipped
  satisfied-by: [component:tabs, component:top-bar, component:peek-provider]
  verified-by: [ui-test:tabs]
  by: alex
  evidence: [session:7a334e57e6, packages/web/src/components/Tabs.tsx, packages/web/src/components/TopBar.tsx#usePageTabs, packages/web/src/components/PeekProvider.tsx]
  part-of: module:req-shell
```

  - when:wf2.ui.tabs a person navigates inside a product — opens a document or a view in the content column, or opens a node, a session or a search hit in the context column

  - then:wf2.ui.tabs it opens as a tab in a strip above that column, right after the tab they were on (or the tab that already shows it comes forward — nothing opens twice), so what they were reading stays one click away; a click on a tab goes there, × (or the middle mouse button) closes it and shows its neighbour, a pinned tab keeps its place and shows a pin instead of ×; the strip scrolls sideways when it is full; both strips read the same way and the tabs of each column are remembered per product in that browser, the last one open again after a reload

  - unless:wf2.ui.tabs the tab is fixed (the Context root of the column), which can be neither closed nor pinned

  - [ ] task:wye.ui-test-tabs-write-and-run ui-test:tabs — write and run the playwright-core probe for req:wf2.ui.tabs open, bring forward, close shows neighbour, pin, reload keeps both strips, fixed Context root ; mark the test passed. (by: agent:7a334e57e6, since: 2026-09-20, part-of: req:wf2.ui.tabs)

```yaml
- id: req:wf2.ui.tree-menu
  title: A tree row has a menu to duplicate or delete the document
  status: shipped
  refines: [req:wf2.ui.sidebar]
  satisfied-by: [component:doc-tree, lib:doc-ops, op:api.docs.duplicate, op:api.docs.delete, rule:tree-menu]
  verified-by: [ui-test:tree-menu, test:doc-ops]
```

  - when:wf2.ui.tree-menu a person right-clicks a row of the Documents tree, or presses the "⋯" that appears on hover

  - then:wf2.ui.tree-menu a menu opens at the pointer with Duplicate and Delete. Duplicate makes a copy next to the document — same parent, right after it, "<title> (copy)", every node the document defines re-identified so the copy is a valid page — and opens it. Delete asks first, naming the document and how many sub-documents go with it, then removes the document and everything under it; a person who was on a removed page lands on its parent (else the product), and the tree says how many references from other documents now dangle

  - unless:wf2.ui.tree-menu the confirm is cancelled — nothing changes

```yaml
- id: req:wf2.ui.plans-folder
  title: Plans is a system folder at the top of the rail, not a page in the Documents tree
  refines: [req:wf2.ui.sidebar, req:wf2.sessions.plan-doc]
  satisfied-by: [component:rail, component:pr-folder, page:web/prs, rule:prs-folder]
  verified-by: [ui-test:plans-folder]
  status: shipped
```

  - when:wf2.ui.plans-folder a product has plan documents (type:pr — one per request that starts work, req:wf2.sessions.plan-doc)

  - then:wf2.ui.plans-folder the rail's menu (Overview … Agents) ends with a "Plans" folder: the entry opens the product's Plans page (page:web/prs — every plan of every project as a table with status, tasks done, session, started); beneath it the plan documents themselves, newest first, each a row with its icon and title that opens the plan page (the open one marked), a plan still `proposed` before a done one only by date; the folder collapses and expands with a caret and the choice is remembered per browser. The project's Plans page (`plans.md`) and the plans under it are not shown in the Documents tree; on disk nothing moves — a plan is still `plan-<slug>.md` in the project's docs folder, `part-of` the project's Plans page

  - unless:wf2.ui.plans-folder the product has no plan yet — the folder shows "no plans yet" beneath the entry

```yaml
- id: req:wf2.ui.rail-split
  title: The rail's menu and Documents sections share its height through a draggable horizontal splitter
  status: shipped
  refines: [req:wf2.ui.sidebar]
  related-to: [req:wf2.ui.plans-folder, rule:app-navigation]
  satisfied-by: [component:rail, rule:rail-split]
  verified-by: [ui-test:rail-split]
```

  - when:wf2.ui.rail-split the rail is open

  - then:wf2.ui.rail-split the menu (Overview … Agents, the Plans folder) is one pane and Documents the other, a horizontal splitter between them; by default the menu pane takes what its content needs up to 60% of the rail and scrolls beyond that, so Documents is always visible; dragging the splitter sets the menu pane's height (each pane keeps at least a few rows), the height is remembered per browser, and a double-click on the splitter returns to the default

  - unless:wf2.ui.rail-split the phone layout — the rail is a stacked list and the splitter is not shown

```yaml
- id: req:wf2.ui.sidebar
  title: The rail finds anything
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/sidebar, op:graph.search]
  requires-tests: [test:web-components#sidebar-search]
  refines: req:wf2.ui

```

  - when:wf2.ui.sidebar the user types in the rail search or opens the tree

  - then:wf2.ui.sidebar hits list documents, headings and nodes (a node hit opens its definition); the tree shows documents, not nodes; Tasks, Decisions and Contradictions sit above the tree with open counts

```yaml
- id: req:wf2.ui.phone
  title: It still works on a phone
  status: proposed
  satisfied-by: [page:web/sidebar, page:web/graph]
  requires-tests: [ui-test:phone-layout]
  see: req:wf.view
  refines: req:wf2.ui
```

  - when:wf2.ui.phone the viewport is 400px wide

  - then:wf2.ui.phone the sidebar becomes the first screen and pages and the graph open full screen, as the v0.1 viewer does

<!-- /list:req -->

```yaml
- id: req:wf2.ui.theme
  title: The person picks light, dark or system; the whole app follows, including the editors
  status: shipped
  satisfied-by: [lib:theme, component:theme-switch, page:web/settings]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: module:req-shell
```

  - when:wf2.ui.theme the person presses ☾ / ☀ in the rail's head, or picks System / Light / Dark under Settings › Appearance

  - then:wf2.ui.theme the palette switches at once — the pages, the editor, code blocks and file previews (Monaco), drawings — and the choice is kept in the browser; a page loads in the chosen theme without a light flash; System follows the OS and moves with it



```yaml
- id: decision:wf2.system-pages-in-wye
  title: The pages the app writes live in projects/<p>/.wye/, never in the person's docs/
  date: 2026-10-02
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.views-are-pages, rule:prs-folder, rule:pr-doc, decision:wf2.hooks-and-skills, decision:wf2.workflow-is-a-skill, decision:wf2.run-is-a-page]
```

  - context:wf2.system-pages-in-wye Creating a page called "Goals" failed with "goals.md exists": the rail's Goals view was goals.md in the same docs/ folder, hidden from the Documents tree, so the person was told about a file they could not see. The person: "all system files must be in the .wye folder, so it must not collide with user created files".

  - choice:wf2.system-pages-in-wye The rail views and folders (goals, work, hooks, skills, prs), the PR pages (pr-N), the skills (skill-*), the workflows (workflow-*), the runs (workflow-runs, run-*) and the Comments page are written to projects/<p>/.wye/. In a URL their slug carries a `~` (/d/~goals, /d/~pr-12), which slugify never makes, so a page of the person's and a system page of one name are two pages; an unmarked slug no page of the person's has falls through to the system page, so old links and session refs keep working. The builder reads .wye/ after docs/, so where a node is defined twice the person's page wins. Their relative assets/ and drawings/ resolve in docs/. Existing products moved with scripts/system-to-wye.js, picked by node id, not by name.

  - alternative:wf2.system-pages-in-wye Reserved file names in docs/ (`_goals.md`) — fewer moving parts, but docs/ stays shared; .wye/ inside docs/ — the same; one .wye/ per product — PRs and skills would leave their project. plan.md (the Backlog) stays in docs/: it is the person's page.

  - consequence:wf2.system-pages-in-wye Node counts unchanged in every product. Edges moved where a PR page's list line started with an id and had been read as that node's definition (req:document-opened-in-the was defined at pr-28.md:498); now the real page defines it — wye lost 66 such edges.

```yaml
- id: decision:wf2.pages-share-a-title
  title: Two pages may have one title — the second one's file is <slug>-2.md
  date: 2026-10-02
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.system-pages-in-wye]
```

  - choice:wf2.pages-share-a-title A page's slug from its title steps to the next free one (goals → goals-2) instead of refusing; an explicit slug (a workflow stage's document) still reports the conflict.

  - context:wf2.pages-share-a-title The person: "we should allow notes with the same name" — alongside moving system pages out of docs/, not instead of it.


```yaml
- id: decision:wf2.instances-go-home
  title: An instance of a type with no home goes to its plural's page in docs/ — tasks.md, reqs.md — never the page it was added on
  date: 2026-10-02
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [req:wf2.editor.entity-from-text, req:wf2.instances.list-new-line, decision:wf2.system-pages-in-wye]
```

  - context:wf2.instances-go-home Tasks added on the last line of the Work view were written as cards into the Work page itself — a system page in .wye/ — and the person could not find them: "whenever we add a instance of a type which don't have home we must add it to predefined place, i.e. new tasks should be in tasks.md, new req should be to reqs.md etc".

  - choice:wf2.instances-go-home A base kind (task, req, decision…) is treated like a product type's first instance: a row in the collection page named by its plural (pluralTitle: Tasks, Reqs) in the docs/ of the project the caller is on, created when missing. A product type still writes `home:` on its card; a base kind's card is read-only, so its page is found by name. A task's row is `- [ ]`, born open.

  - alternative:wf2.instances-go-home The page the caller is on (the old rule) — a view or a system page swallows the instance; the Backlog (plan.md) — tasks only, and no answer for reqs.


```yaml
- id: decision:wf2.pr-has-a-goal
  title: A PR started with no goal attached gets its own goal first — then the PR, part of it, then the agent
  date: 2026-10-02
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [rule:pr-doc, req:exec.request-is-a-task, decision:wf2.instances-go-home]
```

  - context:wf2.pr-has-a-goal The person: "make sure that when i create new PR without a goal attached, create first a goal node, then attach agent and start executions".

  - choice:wf2.pr-has-a-goal When ⌘P starts a PR and none of its refs is a goal, the app writes a goal titled like the PR (its slug made unique) as a row of goals.md in the docs/ of the project the request was made in (decision:wf2.instances-go-home), adds it to the session's refs first, so the PR page's request task is part of it; then the page, the intake and the librarian start as before. Refining an existing PR (prRef) adds no goal.

  - alternative:wf2.pr-has-a-goal Ask the person to pick or name a goal before the PR starts — a stop on every request; leave the PR goal-less — what the person asked to end.
