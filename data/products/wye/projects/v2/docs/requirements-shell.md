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

  - then:wf2.ui.search a search panel opens over the page; what they type ranks passages from the product's blocks, documents, code and sessions, grouped by tabs (All, Blocks, Docs, Code, Sessions), and a kind first (`page: login`, `req:`) narrows to blocks of that kind; the highlighted hit is previewed beside the list, ↑↓ move, ⌘Enter or a click opens it; Enter — or typing a question — asks: an answer streams above the results with numbered citations that open the exact block, passage, code lines or session, the sources a deeper search opens appear while it works, and its deeper answer follows; a follow-up keeps the thread; "Open as blocks" opens the Search page with every hit as blocks

  - unless:wf2.ui.search the screen is narrow, where the preview is left out

```yaml
- id: decision:wf2.ask-sources
  title: Ask searches the graph, document prose, the product's code and agent sessions — not external tools
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [req:wf2.ui.search, component:search-panel]
  part-of: module:req-shell
```

  - context:wf2.ask-sources "improve now how search works, it should work like in Glean, so user should be able to ask questions and our agents should be able to answer them, based on rag, search, graph traversal etc"; search indexed only graph nodes.

  - choice:wf2.ask-sources one local index per product (`_build/search.db`, SQLite FTS5 + MiniLM vectors) over four sources: nodes, document sections with their block ids, the product repo's files split by symbol, and session turns.

  - alternative:wf2.ask-sources graph only (answers miss prose and code); adding Slack / Drive / Gmail connectors (full Glean scope, deferred).

```yaml
- id: decision:wf2.ask-in-search-panel
  title: The ⌘F panel is where a person asks — results while typing, a cited answer above them, follow-ups in place
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [req:wf2.ui.search, component:search-panel]
  part-of: module:req-shell
```

  - choice:wf2.ask-in-search-panel one box: typing ranks results grouped by source with no model call; Enter or a question streams an answer with numbered citations that open the exact block, code lines or session turn. Agents get the same engine through `wye ask`.

  - alternative:wf2.ask-in-search-panel a separate Ask chat page beside ⌘F; or CLI and API first with no UI.

```yaml
- id: decision:wf2.ask-two-lanes
  title: Every question runs a fast answer and a deep agent in parallel; the deep agent's sources appear while it works
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.ask-in-search-panel]
  part-of: module:req-shell
```

  - context:wf2.ask-two-lanes "both, in parallel, while agent working, show what docs you found so far"

  - choice:wf2.ask-two-lanes the fast lane retrieves (BM25 + vectors fused, one hop along graph edges) and makes one tool-less model call; the deep lane is a read-only agent with `wye` search, graph and Read/Grep tools whose every opened source streams to the panel as "Sources found", then its own answer. Both share one citation numbering.

  - alternative:wf2.ask-two-lanes pipeline only (fails multi-hop and code questions); agent only (20–90 s for every search); fast first with "dig deeper" on demand (the person chose both at once).

```yaml
- id: decision:wf2.ask-store-lancedb
  title: The Ask index is an embedded LanceDB per product, with a local cross-encoder reranking a question's passages
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.ask-sources, decision:wf2.ask-two-lanes]
  part-of: module:req-shell
```

  - context:wf2.ask-store-lancedb "are you sure sql lite is the best approach, what about some cool modern oss libs for this?"

  - choice:wf2.ask-store-lancedb `_build/search.lance`: passages with MiniLM vectors, a full-text index and LanceDB's hybrid search (reciprocal rank fusion); a question's top 40 are reranked by jina-reranker-v1-turbo-en, local, 7–15 ms a batch. Measured on the wye product: recall@10 87 % fused, 93 % reranked (`wye eval ask`).

  - alternative:wf2.ask-store-lancedb node:sqlite with FTS5 and brute-force vectors (no new dependency, hybrid fusion by hand); Orama (pure TypeScript, whole index in memory); a search server (Meilisearch, Typesense, Qdrant) — a process to run beside a local-first app.

```yaml
- id: decision:wf2.ask-deep-lane-reads-only
  title: The deep lane reads only — wye refuses every non-read command under WYE_READONLY
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.ask-two-lanes, constraint:wf2.pr-is-the-persons]
  part-of: module:req-shell
```

  - choice:wf2.ask-deep-lane-reads-only the agent gets Bash, Read, Grep and Glob only, no MCP servers, the default permission mode and no session; its `wye` runs with WYE_READONLY, which lets through ask-search, node, doc, resolve, context, packet, session show and the graph reads and refuses the rest. A product's code is searched only where its `repo:` names it.

  - consequence:wf2.ask-deep-lane-reads-only a tool allow-list of `Bash(wye:*)` alone let an agent run `wye node set` or `wye propose`; the review of 2026-10-03 found it before release.

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


```yaml
- id: decision:wf2.page-head-folded
  title: A page's head shows its type and status; the properties fold behind one toggle, and the title is the text's own heading
  date: 2026-10-02
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [req:wf2.page.header-card, decision:wf2.card-is-name-and-properties]
```

  - context:wf2.page-head-folded On a PR page the head repeated the title (cut off at the edge, then again as the text's `# ` heading), the type picker stretched to its longest option, and owner, verified, session, agent, started, role and skills stood before the page. The person: "collapse properties by default (they not important enough)".

  - choice:wf2.page-head-folded The properties sit behind "⌄ properties" on every page, folded until opened; the choice is kept per browser. The head's title field shows only when the text has no `# ` heading of its own. The type picker is as wide as its type.

```yaml
- id: decision:wf2.answers-reach-the-librarian
  title: An answer on the PR's page is shown on its question card and reaches the PR's conversation, whichever way the question was asked
  date: 2026-10-02
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.pr-questions-on-the-page, decision:wf2.answer-is-content]
```

  - context:wf2.answers-reach-the-librarian The person answered the librarian's questions and saw "no answer recorded" on every card: the answers were on the cards as `answer:`, but the card only counted blocks under it. A question the librarian wrote into the Definition (no tool waiting on it) took an answer on the card and told nobody.

  - choice:wf2.answers-reach-the-librarian A question card with no blocks under it shows its `answer` field, editable, with who gave it. Answering a Definition question on the page sends the answer to the PR's latest librarian conversation, resumed when it has stopped.


```yaml
- id: decision:wf2.statuses-per-type
  title: A status picker offers its type's statuses only; a product can set its own list for any type in Types
  date: 2026-10-02
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [type:node, type:req, type:rule]
```

  - context:wf2.statuses-per-type Every card's status picker offered 35 statuses whatever the card was. The person: "keep only basic statuses, but let user to modify enum list somewhere in types section" — and, of a req, "where is Approved status?": a req in a PR counts as agreed only when approved, and req's list had no approved.

  - choice:wf2.statuses-per-type A picker offers the node's type's `statuses:`, else its nearest ancestor's (a city takes node's), plus the status it already has. The Statuses section of a type page edits the list: a product type keeps it on its card; a base kind's list is the product's override, `statuses-<type>: [..]` in its _product.md, applied when the graph is built; "default" puts the base list back. req and rule gain approved and rejected in the base list.

  - alternative:wf2.statuses-per-type One edited list in schema/base-ontology.md for every product — a change for one product would reach all; product types only — the base kinds, the ones most used, would stay fixed.


```yaml
- id: decision:wf2.rail-shows-running-agents
  title: The rail's Agents entry is a folder listing the agents running in this product now
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.rail-fewer-entries, page:web/sessions]
  part-of: module:req-shell
```

  - context:wf2.rail-shows-running-agents "can you make sure our agents running are visible directly on the left panel" — shown with Orca's project list, where each running agent is a row under its project.

  - choice:wf2.rail-shows-running-agents the Agents heading still opens the Agents page; under it, open by default, one row per session that is running, queued or live: a state mark (working, idle, waiting for your answer, queued for a slot), what it works on (a build by its request's title, anything else by its own first line), what it is doing (its last log line, or the question it waits on) and for how long. A click opens the conversation in the column. This product only.

  - alternative:wf2.rail-shows-running-agents the agents of every product in the rail (the rail is per product; one line per other product was offered and left for later).


```yaml
- id: decision:wf2.pinned-documents
  title: Any document can be pinned to the top of the rail; the pins live in the product file
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [page:web/sidebar]
  part-of: module:req-shell
```

  - context:wf2.pinned-documents "add ability to pin any document so it is visible in the top section, or just link shown on top of all docs as starred doc"

  - choice:wf2.pinned-documents "Pin to top" / "Unpin from top" in a document's ⋯ menu; the pinned documents are rows under Overview with a ★, in pin order; the list is `pinned: [project/doc, …]` in _product.md, so the desktop app and a browser show the same pins and a tracked product keeps them in git. A pin whose document is gone is not shown.

  - alternative:wf2.pinned-documents pins in browser storage (per person, but different in the desktop app and each browser).

```yaml
- id: decision:wf2.command-box-modes-on-top
  title: The command box puts its mode on top, says what the mode does and who does it, and keeps the action on the right
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [component:command-box, decision:wf2.cmd-modes]
  part-of: module:req-shell
```

  - context:wf2.command-box-modes-on-top "make this UI nicer (think about better UX, and better buttons), also afaik Remember tasks also require codex or claude to use? where the selector"

  - choice:wf2.command-box-modes-on-top PR · Ad-hoc · Workflow · Remember as a segmented control above the text (⌘1–4), a short placeholder per mode, one line saying what the mode does — PR and Remember name "Wye's librarian on Claude Code", since the librarian runs on Claude Code only — the mode's own fields labelled, the primary action right-aligned with its key, Later beside it where it applies, and only this mode's keys in the footer.

  - consequence:wf2.command-box-modes-on-top Remember and PR have no agent selector: a Codex librarian is a separate change.

```yaml
- id: decision:wf2.rail-agent-opens-as-page
  title: An agent clicked in the rail opens as the page in the main window
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [decision:wf2.rail-shows-running-agents]
  part-of: module:req-shell
```

  - choice:wf2.rail-agent-opens-as-page a row of the rail's Agents folder links to /<product>/sessions/<id>/chat — the conversation in its own tab — and is marked while it is open; not the context column.


```yaml
- id: decision:wf2.no-projects
  title: There are no projects in the app — each folder became a plain top-level page; the documents in it are its children
  date: 2026-10-03
  status: proposed
  by: alex
  evidence: [session:01Nqr8HQFCZEoYeixnzVokg4]
  affects: [page:web/sidebar, page:web/overview]
  part-of: module:req-shell
```

  - context:wf2.no-projects "explain me the purpose of projects?? because we have nested docs, what the purpose of them at all" — a project was a folder with a status and its own system pages; knowledge, search and the graph were product-wide and nested documents already grouped.

  - choice:wf2.no-projects "just delete them, and show existing folders as docs" — first built as folder rows in the tree, which broke adding a root page; then "evalueation and wye v2 must become simple pages, not special objects": each folder got a real page (scripts/projects-to-pages.mjs writes docs/<title>.md and part-of on the folder's top-level documents), the tree has no folder rows, + at the top adds a top-level page with no folder to pick (stored in the largest folder). Overview lists the top-level pages under Documents; nothing in the app says "project".

  - consequence:wf2.no-projects the folders stay on disk and in URLs (/<product>/<folder>/d/<doc>), so no link breaks; the system pages (PRs, Skills, Hooks, Goals, Work) still live per folder — moving them to one set per product is what is left.

```yaml
- id: decision:wf2.settings-holds-config
  title: Types, Hooks and Skills sit under Settings in the rail — what configures the product is one folder
  date: 2026-10-03
  status: proposed
  by: alex
  affects: [page:web/sidebar]
  part-of: module:req-shell
```

  - context:wf2.settings-holds-config "hooks, skills and types, move as nested elment under settings" — they were top-level rail items between the working pages (Goals, Work, Knowledge, Inbox, PRs).

  - choice:wf2.settings-holds-config Settings is a folder (caret folds it, remembered per browser); under it Types, Hooks and the Skills folder with its skills, one step in.

```yaml
- id: decision:wf2.table-columns-roomy
  title: A table view keeps roomy columns and scrolls sideways — the text column never goes under 440px
  date: 2026-10-03
  status: proposed
  by: alex
  affects: [page:web/editor]
  part-of: module:req-shell
```

  - context:wf2.table-columns-roomy "it feels too packed, text is wrapped, make sure that text field at least 2x wider, make sure table is scrollable, no need to pack all into small screen view" — the text column could shrink to 200px, so a goal wrapped to six lines.

  - choice:wf2.table-columns-roomy the text column's minimum is 440px and the other columns are wider (status 128, dates 104, progress 148, owner 120; a type's columns 112–200); a table wider than the editor scrolls sideways (rule:table-scroll) instead of squeezing.

```yaml
- id: decision:wf2.import-is-a-task
  title: Importing many markdown files runs in the background as one task in Work, and an all-empty folder is refused with why
  date: 2026-10-03
  status: proposed
  by: alex
  affects: [component:import-docs]
  part-of: module:req-shell
```

  - context:wf2.import-is-a-task "after i clicked import markdown i see this page - looks ugly and wrong, it should create task (not event goal) and start async import" — an upload of 256 Obsidian files wrote them at once and listed every skipped file in one paragraph; all 256 were empty on disk (Dropbox online-only placeholders), so it imported nothing.

  - choice:wf2.import-is-a-task an upload of more than one file goes the way of the path import (lib:import-run): the pages are written as raw, an "Import: <folder>" page lists every file, one task "Import <folder> — N documents" lands in the Backlog and is checked when the last file is done, and the agent takes the files one at a time. The dialog says only that it started (skipped as a count, folded). A pick whose markdown files are all empty is refused: "make the folder available offline, then import again". One pasted page is still written and opened at once.

```yaml
- id: decision:wf2.import-title-from-name
  title: An imported note whose first heading is only a section name ("Overview") takes its file name as its title
  date: 2026-10-03
  status: proposed
  by: alex
  affects: [component:import-docs]
  part-of: module:req-shell
```

  - context:wf2.import-title-from-name "i did markdown import, and a lot of documents have name overview" — the title was the first `# heading`, and in an Obsidian vault most people's notes begin "# Overview" (others "# Updates", "# Log", "# Next 1:1"); quoted titles also showed their quotes ("Next 1:1", " Terminated").

  - choice:wf2.import-title-from-name the front matter's title, else the first heading unless it is a section word (Overview, Summary, Notes, Log, Updates, Next 1:1…) or a heading two or more files of the same import share — then the file name, which is the note's name in Obsidian. Folder pages drop stray underscores ("_terminated" → "Terminated"). The graph reads a quoted YAML title as its value.

```yaml
- id: decision:wf2.imports-in-agents
  title: A background import is a row under Agents with Stop and Resume, and can be resumed from its page after a restart
  date: 2026-10-03
  status: proposed
  by: alex
  affects: [page:web/sidebar, component:import-docs]
  part-of: module:req-shell
```

  - context:wf2.imports-in-agents "one agent, no queue, if i cancel agent it starts next task, where it is scheduled, how to see in ui?" and "import obsidian showing like an agent but i can't stop it" — the import loop lived in the server's memory: nothing showed it, cancelling a session only moved it to the next file, and nothing stopped it.

  - choice:wf2.imports-in-agents the Agents folder lists each import like an agent row — "Import: <folder> · n of N files · paused" — with no buttons in the row; its menu (right-click or ⋯, the same menu agent rows have: Open, Cancel agent) holds Pause / Resume import and Queue overview ("why resume/stop button there, it make no sense" — "the stop resume button make sense in agent context menu"). The Agents page opens with the queue overview ("i need clear overview of everthing queued, what is running, what will go next"): Running with the slots taken, Waiting for a slot in start order, and each import with its progress, the file now and the next files. The import page carries the same progress and Pause / Resume. An import whose run is gone (server restart) shows as paused; Resume rebuilds it from the page's unchecked file lines. An import made without analysis (`analyse: off`) is not listed.

```yaml
- id: decision:wf2.reveal-open-doc
  title: ⌖ in the Documents head opens the folders above the open document and scrolls to it
  date: 2026-10-03
  status: proposed
  by: alex
  affects: [page:web/sidebar]
  part-of: module:req-shell
```

  - context:wf2.reveal-open-doc "add button to find, scroll to active document — target icon"; choice: the row flashes once when reached.

```yaml
- id: decision:wf2.import-lane
  title: An import runs as one agent lane — pages sorted, short ones batched on the faster model, a cached brief instead of each file looking things up
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:import-docs]
  part-of: module:req-shell
```

  - context:wf2.import-lane "current line by line import is super slow, how can we make it faster, and reuse some tockens i.e. with system context" — one agent process per file, a median 1.2 minutes each; a third of each file's time went to reading the ontology and grepping people and projects again.

  - choice:wf2.import-lane one chat session takes the whole import, a message per page or per few short pages, the pages inline. Its system text — the import skill, the lane protocol, the product's types with fields and homes, the ids of people, projects, customers and the like with their aliases, one finished page — is a stable prefix the model caches. Templates, prompt snippets, drawings and near-empty notes are kept as written with no agent; notes under 2 500 characters go up to four to a message on Sonnet; dense ones one at a time on the default model. Every 12 turns the agent restarts with a brief rebuilt from the graph. A turn's end checks its files off on the import page (a page not set `analysed` is marked failed); Stop or Cancel on the lane session pauses the import. No per-file tasks are made.

  - consequence:wf2.import-lane four short notes in one message took 29 s and $0.21 with three shell calls; a dense note about 25 s.

```yaml
- id: decision:wf2.wikilinks-to-links
  title: Obsidian [[links]] become Wye links on import — a person or project by name first, else the page
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:import-docs]
  part-of: module:req-shell
```

  - context:wf2.wikilinks-to-links "obsidian allows to link items like [[item]], we need to convert it to our model, or we need to support this syntax too" — the agent converted some links and left others; 92 imported pages still had `[[…]]`.

  - choice:wf2.wikilinks-to-links converted, not supported as a second syntax: on import `[[Name]]`, `[[Name|shown]]`, `[[Name#Heading]]`, `[[Folder/Name]]` become `[shown](id)` — the product's things (people, projects, themes…) by title, name or alias first, then the files of the same import, then the product's pages by title or source file; Obsidian's matching (case, `_`/`-`, a leading `_`). `![[picture.png]]` becomes an image the import copies (found by name anywhere in the upload). An unmatched name stays `[[Name]]`; code is left alone. The import lane converts a page as it loads it, and its agent maps a leftover `[[Name]]` when the brief says who it is. scripts/convert-wikilinks.ts converts pages imported before. Typing `[[` in the editor is not part of this.

```yaml
- id: decision:wf2.hook-upcoming
  title: A hook can fire only for what is still to come — `where: upcoming=<date key>`; the 1:1 prep hook uses it
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:hooks]
  part-of: module:req-shell
```

  - context:wf2.hook-upcoming an Obsidian import created months-old 1:1 meetings and hook:ea.one-on-one-prep started a prep workflow for each — 26 runs queued; alex chose "cancel them, and skip past ones".

  - choice:wf2.hook-upcoming `upcoming=<key>` in a hook's `where` holds when the card's date under that key is today or later; hook:ea.one-on-one-prep is `where: prop=format:1on1 upcoming=date` in the executive-assistant package.

```yaml
- id: decision:wf2.import-drawings
  title: An Obsidian Excalidraw note is imported as a Wye drawing — the scene on the page, its words listed under it
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:import-docs]
  part-of: module:req-shell
```

  - context:wf2.import-drawings "there several excalidraw files in the imported folder, we have drawing component, so make sure they are imported too" — they came in as markdown pages showing the plugin's compressed data.

  - choice:wf2.import-drawings a `.excalidraw.md` note (or one with `excalidraw-plugin:` front matter) has its ```compressed-json (LZ-string) or ```json scene read; the scene goes to docs/drawings/<slug>.excalidraw and the page, named after the file, is `![Title](drawings/<slug>.excalidraw)` plus "Text in the drawing" with its words; it is `raw`, no agent. An empty drawing is skipped. `![[Drawing …]]` in another note of the import shows the drawing. A drawing with a scene but no preview gets its SVG, PNG and description the first time a page shows it.

```yaml
- id: decision:wf2.table-hides-done
  title: A table of tasks or goals hides completed rows by default — but a row completed while the page is open stays until it is opened again
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [page:web/editor]
  part-of: module:req-shell
```

  - context:wf2.table-hides-done "tasks/goals by default should hide completed items (but not immediately) if i complete item it must not dissapear immediately".

  - choice:wf2.table-hides-done done, shipped and complete rows are hidden unless the table's filter says `done=show` (the "✓ n done" toggle in its header) or a done status is picked; a row seen open since the page was opened stays visible when it is completed, and goes on the next visit. The row the cursor is in is spared only while the editor has focus.

```yaml
- id: decision:wf2.digest-live-page
  title: The executive assistant's digest is a live page of views, with a daily summary section — not a brief page written each day
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:executive-assistant]
  part-of: module:req-shell
```

  - context:wf2.digest-live-page "my digest overivew must be realtime page, which consists of multiple filters, i.e. show important tasks, show status on projects" — then "not a page, but i need to add a section inside, where we will write daily summary, analysed context (which is done using a skill which cn be customised)" and "add also slack threads … emails to be answered".

  - choice:wf2.digest-live-page the package seeds a Digest page (module:ea-digest, pinned, the person's own to edit): views of commitments and tasks late or due within a week, Slack threads and emails waiting (open), important tasks (priority=high), decisions that are the director's and still open, projects, risks; and a "Daily summary" section. Each weekday at 08:00 hook:ea.daily-summary runs workflow:ea.daily-summary: skill:ea.daily-summary (an editable skill document) reads `wye ea digest context` — what arrived, changed or closed since the last summary, grouped by project and person, from a snapshot of the assistant's nodes — and writes a dated entry at the top of the section (`wye ea digest summary`). The daily brief is run by hand now.

```yaml
- id: decision:wf2.messages-pushed
  title: Slack threads and emails waiting on the director are pushed in by outside tools, not fetched by Wye
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:executive-assistant]
  part-of: module:req-shell
```

  - context:wf2.messages-pushed asked "agent fetches them, outside tools push, or both" — alex chose "Outside tools push" (Wye pulls nothing stays).

  - choice:wf2.messages-pushed `wye ea intake` takes `messages: [{ via: slack|email, id, title, link, at, from?, channel?, waiting?, answered?, project? }]`, with or without a meeting; each is a thread: or email: card (types the package gained), open until a push says answered (then done); the tool's id updates the same card. Not proposed: they are what waits, not knowledge to review.

```yaml
- id: decision:wf2.view-windows
  title: Views filter on what is still open, a due-date window and the director — open=1, due=late|today|<n>d, <column>=me
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:instance-table]
  part-of: module:req-shell
```

  - choice:wf2.view-windows open=1 leaves out done, met, dropped, answered (status or state); due=7d keeps due within a week, late included (a date value is still the column); `=me` is the product's director by id, title or alias. In every table and view block.

```yaml
- id: decision:wf2.package-seeds-and-new-types
  title: A package can seed pages once, and a type it gains later reaches the products that installed it
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:install]
  part-of: module:req-shell
```

  - choice:wf2.package-seeds-and-new-types `seed/*.md` in a package is copied into the project on install (and on the next sync for older installs) as the person's own page, recorded (`seeded:`) so a deleted seed is not copied again; `seed-pin: true` pins it. The packages listing syncs: types the package declares that the product does not are declared and recorded.

```yaml
- id: decision:wf2.live-collections
  title: A Data table or Data list can show the whole product's items, live — the Digest is built from them
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [page:web/editor, component:executive-assistant]
  part-of: module:req-shell
```

  - context:wf2.live-collections "digest must not be a custom page! it must be normal page with normal blocks, editable by a user, i.e. use data lists or data tables" — asked how the rows get there, alex chose "Live rows from everywhere".

  - choice:wf2.live-collections `scope=product` on a table's marker (⊕ in its header, on a table with no rows of its own): its rows are the product's items of the kind that its filter keeps (open=1, due=7d, owner=me, a status, a column), each the same editable row as in any table — status, date, owner, a type's columns — written where the item lives (the node API). Done rows are hidden unless asked; a row edited here stays until the page is opened again. The Digest's sections are such tables; "Instances view" blocks are no longer used there.

```yaml
- id: decision:wf2.tables-own-width
  title: Tables keep their own width — columns sized to content, never stretched to the page; a wider table scrolls inside its block
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [page:web/editor]
  part-of: module:req-shell
```

  - context:wf2.tables-own-width "current tables looks shit, do not force them to be 100% width, make them scrollable" — the instances table squeezed its columns to the page and chips overlapped.

```yaml
- id: decision:wf2.run-skill-on-a-node
  title: Any skill can be run on a project, person, page or any item — and a built-in Complete skill closes an item and what belongs to it
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:command-box, component:skills]
  part-of: module:req-shell
```

  - context:wf2.run-skill-on-a-node "add ability to run skills on projects or other elements, i.e. i would like to complete a project, that needs to go and mark relevant items as completed too".

  - choice:wf2.run-skill-on-a-node the command box has a Skill mode (⌘4): the skills whose `takes:` fits the item (`*`, its kind, `page`), package skills included; a note is optional; the skill's agent starts at once on the item (a librarian unless the skill says worker). Reached from a page's ⋯ / the tree's menu (Run a skill…, Complete…) and the ✧ in an item's column header. skill:complete (prompts/complete.md, a base skill every product gets, editable) reads what points at the item, closes what is done (commitments met), dismisses what the finish made moot with a reason, leaves follow-ups open, asks when unsure, closes the item last, never deletes or touches another product.

```yaml
- id: decision:wf2.list-props-as-tags
  title: A list property whose items are ids shows them as tags (evidence, sessions …), other items as chips; ✎ edits the text
  date: 2026-10-04
  status: proposed
  by: alex
  affects: [component:node-editor]
  part-of: module:req-shell
```

  - context:wf2.list-props-as-tags "evidence prop, must show tags, not text".
