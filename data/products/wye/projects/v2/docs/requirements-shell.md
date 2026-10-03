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
