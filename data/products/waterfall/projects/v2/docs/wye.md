---
node: module:wf2
type: module
title: Wye
status: in-progress
owner: alex
source-roots: [., packages/web, packages/desktop, lib, bin, prompts, skills, schema]
sources:
  - README.md
  - schema/base-ontology.md
  - prompts/agent-system.md
  - prompts/librarian-system.md
order: 1
last-verified: 2026-09-20
---

# Wye

Wye keeps a product's knowledge — goals, requirements, rules, constraints, decisions, questions and work — as
markdown documents that are also a graph, shared by the people who define the product and the agents that build it.
A person describes the product; an agent reads what governs a request before it works, writes what it decided as
blocks for review, and every ask is validated against the constraints in force. Markdown in git is the only source of
truth; the app, the `wye` CLI and the graph are views and doors onto it.

```yaml
- id: module:wf2
  title: Wye
  purpose: >
    Hold the full definition of a product — what it must do, what a person sees, what it knows, how it works, how we
    know it works — as documents with a graph on top, so that people and coding agents (Claude Code, Codex) read
    from and write to one picture: every decision becomes memory, every request is checked against the constraints
    in force, and what an agent proposes waits for a person in the Inbox.
  product: product:waterfall
  submodules:
    - web       # packages/web — the Next.js app: documents, editor, knowledge views, work, inbox, agents
    - desktop   # packages/desktop — the Electron shell that owns the server
    - lib       # lib/ — parser, graph, judge, impact: markdown → graph, packet, verdicts
    - cli       # bin/wye.js (wye), bin/ctx.js (ctx) — the agents' and the terminal's door
    - prompts   # prompts/ — the worker contract and the librarian
    - skills    # skills/ — Claude Code skills that teach an agent the contract
  documents: [module:wf2-prd, module:experience, module:domain, module:app, module:quality, module:decisions, module:research, module:archive]
```

## How to read this

The definition is the tree under this page, by the question a reader asks:

- **Product** (module:wf2-prd) — what it must do: the users and their jobs, the requirements by area in the person's words, the constitution.
- **Experience** (module:experience) — what you see: the shell, the pages by route, the blocks and components, the rules of interaction.
- **Domain** (module:domain) — what it knows: the ontology, the entities and their states, where everything lives on disk.
- **Systems** (module:app) — how it works: one page per area with its rules, decisions, libraries and operations; the API and CLI.
- **Quality** (module:quality) — how we know: the tests, and the Evaluation project.
- **Decisions** (module:decisions) — the log, newest first. **Research** (module:research) — the essays. **Archive** (module:archive) — what was.

Plans, TODO and Bugs are intake, outside the definition. A block has one home; anywhere else it is an embed or a row of
a view. Ids never change.

## Goals

<!-- list:goal -->

<!-- view:goal -->

<!-- /list:goal -->

## Constitution

<!-- view:constraint status=approved -->

## Product-level decisions

<!-- list:decision -->

```yaml
- id: decision:wf2.definition-layers
  title: The definition is layered by the reader's question — Wye, Product, Experience, Domain, Systems, Quality — with areas inside each; Decisions, Research and Archive beside them
  date: 2026-09-20
  status: proposed
  supersedes: decision:wf2.definition-shape
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  affects: [module:wf2, module:wf2-prd, module:experience, module:domain, module:app, module:quality, module:archive, decision:wf2.definition-shape]
```

  - choice:wf2.definition-layers Six layers, each a parent page, areas inside: Wye (what it is: purpose, goals, constitution, product-level decisions), Product (users and jobs, requirements by area in the person's words, constitution), Experience (shell, pages by route, blocks and components, interaction rules), Domain (ontology, entities and states, storage), Systems (one page per area with rules, decisions, libraries, operations; API and CLI), Quality (tests; the Evaluation project). Beside them: Decisions (a view by date), Research (the essays, blocks moved out), Archive (v0.1 and the 2026-09-14 design set, retired in place). Plans, TODO and Bugs stay as intake. Overview pages are view blocks over the graph, never lists kept by hand. One home per block; ids, the product slug and the project folder do not change; a moved card that said part-of its old page now says its new one.

  - context:wf2.definition-layers Three generations of documents described Wye side by side (module:archive). decision:wf2.definition-shape (session d4d72bd04a, 2026-09-20) proposed one tree by kind on top — Wye, PRD, a Design page per area, Tests, Research, Archive. The person asked for a universal structure that shows the product, its UI, pages, components, modules and systems, and to keep every id.

  - alternative:wf2.definition-layers decision:wf2.definition-shape's Design-per-area (a designer and an agent asking "how does Work work" want different pages; the person asked for UI, pages, components and systems as explicit things); by area only; by kind only.

  - consequence:wf2.definition-layers 43 pages written or rewritten on 2026-09-20 by a migration script (798 blocks moved, 96 retired); the packet for a text now reaches an area's rules through governs and part-of, not through the document a rule happened to share with a type — a rule with no governs link is harder to reach (task:wf2.definition.govern-links); the tree becomes the template for a new product (task:wf2.definition.template).

```yaml
- id: decision:wf2.annotations-text-and-png
  title: An annotated image reaches the agent as text and as a rendered picture
  status: proposed
  date: 2026-09-17
  related-to: [module:wf2-prd, rule:drawings]
  session: 94ac3cf3e0
```

  - choice:wf2.annotations-text-and-png Both: the scene is described as text (regions, arrows, labels, positions in percent of the image) and flattened to a PNG; wf resolve gives the text and names the PNG. The image is embedded in the Excalidraw scene as a locked element so the scene is self-contained.

  - context:wf2.annotations-text-and-png Agents read words; some can also see images. A drawing over a screenshot means nothing to an agent unless it is translated, and a translation alone loses what the picture shows.

  - alternative:wf2.annotations-text-and-png Text only — loses the picture; PNG only — an agent without vision gets nothing and one with vision guesses at labels; a separate annotation format instead of Excalidraw — a second drawing tool.

  - consequence:wf2.annotations-text-and-png rule:image-annotations; scene files grow by the image's size; the description is derived, never edited.

```yaml
- id: decision:wf2.agent-questions-are-forms
  title: Agent questions are answered by the person in the console; permissions are never auto-answered
  status: proposed
  date: 2026-09-17
  related-to: [rule:agent-host, module:wf2-prd]
  session: 94ac3cf3e0
```

  - choice:wf2.agent-questions-are-forms Render AskUserQuestion as a form and return the chosen labels in the tool input's `answers`; render other permissions as a tool + intent card. The host never answers a permission on its own.

  - context:wf2.agent-questions-are-forms Claude Code's AskUserQuestion arrives over the stdio permission channel like any tool permission. The console showed it as a JSON permission with Allow/Deny; Allow returned the input unchanged, so the agent read "the user did not answer" while the console said "answered", and the agent went on with its own assumption.

  - alternative:wf2.agent-questions-are-forms Auto-allow AskUserQuestion with an empty answer (what happened, by accident); make the agent avoid questions in sessions (loses the clarifications the contract wants); a separate questions inbox (the question belongs where the conversation is).

  - consequence:wf2.agent-questions-are-forms rule:agent-questions; req:wf2.sessions.questions; the agent prompt can keep using AskUserQuestion.

```yaml
- id: decision:wf2.hybrid-store
  date: 2026-09-14
  status: approved
  options:
    - markdown only (no history for the churn stream)
    - database canonical with markdown export (loses git review, noisy diffs)
    - hybrid
  governs: [req:wf2.store, req:wf2.write.single-path]
```

  - choice:wf2.hybrid-store hybrid — artifacts stay markdown in git; tasks, decisions, contradictions, deltas, runs and sessions live in SQLite keyed by node id; nothing in the DB duplicates a node body

  - context:wf2.hybrid-store v0.1 keeps everything in markdown; v2 needs history and structure for tasks, decisions and agent traffic, but the reviewed artifact graph must stay in git.

  - consequence:wf2.hybrid-store two stores, one write path into the graph (the file); the DB references node ids as strings

```yaml
- id: decision:wf2.local-first-hosted-ready
  date: 2026-09-14
  status: approved
  options:
    - local only, no provisions (rewrite later)
    - hosted now (auth, git sync, webhooks — too much surface)
    - local now with tenant, user and token columns unused
  governs: [req:wf2.store.hosting-ready, req:wf2.api.identity]
```

  - choice:wf2.local-first-hosted-ready local now, hosted-ready — every table carries tenant_id and created_by; agent sessions carry a token hash; nothing is enforced locally

  - context:wf2.local-first-hosted-ready one user on one machine today; a team and hosting later.

  - consequence:wf2.local-first-hosted-ready a few unused columns; Postgres and token enforcement are additive

```yaml
- id: decision:wf2.stack
  date: 2026-09-14
  status: approved
  options:
    - extend the single-file static viewer (outgrown by a block editor and an editable graph)
    - Vite SPA plus a separate API server
    - Next.js app with BlockNote and React Flow, Hono server, Drizzle over SQLite, MCP TypeScript SDK
  governs: [req:wf2.ui.node-page, req:wf2.ui.graph]
```

  - choice:wf2.stack pnpm monorepo in TypeScript; Next.js + BlockNote (block editing of prose keys only) + React Flow; Hono; Drizzle + SQLite; MCP TypeScript SDK

  - context:wf2.stack the web app needs a Notion-style page editor and an editable mind map; the server must share code with the existing parser.

  - consequence:wf2.stack BlockNote's markdown round-trip is lossy, so yaml keys are edited as form fields, never as blocks

```yaml
- id: decision:wf2.sidecar-server
  date: 2026-09-14
  status: approved
  options:
    - import into a DB and regenerate markdown (noisy diffs, loses hand formatting)
    - move to one file per node first (migration before any value)
    - a sidecar that parses the files as they are and patches yaml blocks in place
  governs: [req:wf2.serve, req:wf2.write]
```

  - choice:wf2.sidecar-server sidecar over the existing parser; a new writer patches a node's yaml block in place using the file and line the parser records

  - context:wf2.sidecar-server how the server relates to the markdown files and the existing parser.

  - consequence:wf2.sidecar-server the writer is the one new hard piece of core; per-node files remain possible later

```yaml
- id: decision:wf2.tasks-replace-delta-files
  date: 2026-09-14
  status: approved
  options:
    - keep delta files next to tasks
    - tasks in the DB with node links replace them; clerk-proposed changes are graph_delta rows applied to markdown
  governs: [req:wf2.tasks, req:wf2.tasks.replaces-delta]
```

  - choice:wf2.tasks-replace-delta-files retire the delta file; a task row with links is the unit of intent; a graph_delta row is the unit of proposed change

  - context:wf2.tasks-replace-delta-files v0.1 documented a delta.yaml per feature under _deltas/, which nothing parsed.

  - consequence:wf2.tasks-replace-delta-files templates/delta.yaml and the skill text are superseded; approval moves onto the task

```yaml
- id: decision:wf2.immutable-decisions
  date: 2026-09-14
  status: approved
  options:
    - editable in place
    - immutable, superseded by a later decision
  governs: [req:wf2.decisions]
```

  - choice:wf2.immutable-decisions immutable; a later decision names the one it supersedes

  - context:wf2.immutable-decisions decisions are evidence; editing them in place would erase the trail contradictions depend on.

  - consequence:wf2.immutable-decisions the clerk compares against the whole chain; the UI shows superseded decisions greyed

```yaml
- id: decision:wf2.human-applies-deltas
  date: 2026-09-14
  status: approved
  options:
    - external agents apply their own deltas
    - a human or a trusted agent applies; the clerk and the posting agent only propose
  governs: [req:wf2.clerk.propose-only, req:wf2.clerk.apply]
```

  - choice:wf2.human-applies-deltas apply and reject are gated; the clerk never edits markdown

  - context:wf2.human-applies-deltas who may turn a clerk proposal into a markdown change.

  - consequence:wf2.human-applies-deltas a review step exists between a decision and the graph; trust for agents is a configuration question (question:wf2.trusted-agent)

```yaml
- id: decision:wf2.clerk-triggers
  date: 2026-09-14
  status: approved
  options:
    - on every markdown change (cost, noise)
    - on decision posted, task created or relinked, and on demand from the UI
  governs: [req:wf2.clerk, req:wf2.clerk.on-demand]
```

  - choice:wf2.clerk-triggers decision, task, on demand

  - context:wf2.clerk-triggers when the clerk runs.

  - consequence:wf2.clerk-triggers a node edited by hand is not re-checked until something touches it or a human asks

```yaml
- id: decision:wf2.clerk-runtime
  date: 2026-09-14
  status: approved
  options:
    - Claude Agent SDK
    - a hand-rolled tool-use loop over the Messages API using the same service layer
  governs: [req:wf2.clerk.audit, req:wf2.clerk.budget]
```

  - choice:wf2.clerk-runtime hand-rolled loop; tools are the read side of the API plus propose_delta and report_contradiction; no shell, no file access

  - context:wf2.clerk-runtime how the clerk is built.

  - consequence:wf2.clerk-runtime full control of budget, caching and audit; every run is a clerk_run row

```yaml
- id: decision:wf2.product-model
  date: 2026-09-15
  status: approved
  options:
    - keep documents inside code repositories, one graph per repository
    - a data folder owned by Waterfall — products/<product>/projects/<project>/docs — with one graph per product
    - a database as the store from day one
  governs: [req:wf2.store, req:wf2.store.products, req:wf2.ui]

```

  - choice:wf2.product-model the data folder, git-tracked with the app for now (WATERFALL_DATA later): _product.md and _project.md carry metadata, docs/*.md are the pages, inbox/ holds dropped inputs, _build/graph.json is the product's knowledge; a goal is a project with kind goal

  - context:wf2.product-model the first design made a project equal to a code repository with a docs/context-graph folder, and agents edited those files locally. The user wants the system itself to be the store — products, projects (or goals) and their documents live in Waterfall, agents maintain them here over the API, and product knowledge is a separate section built from everything the product holds.

  - consequence:wf2.product-model the web app, ctx and the skills point at data/products; the spec's "project = repo" wording and entity:project's rootPath/gitRemote are superseded (drift:wf2.9); the clerk's job becomes turning inbox items into knowledge

```yaml
- id: decision:wf2.home-view
  date: 2026-09-14
  status: approved
  options:
    - the mind map
    - sidebar plus node page, graph as a view
  governs: [req:wf2.ui]
```

  - choice:wf2.home-view sidebar plus node page

  - context:wf2.home-view what the web app opens on.

  - consequence:wf2.home-view the graph view is one click away and deep-linkable

```yaml
- id: decision:wf2.definition-shape
  title: The definition of Wye is by kind on top and by area inside — one Wye page, one PRD, one Design parent with a module page per area, Tests, Research, Archive
  date: 2026-09-20
  status: proposed
  by: alex
  evidence: [session:d4d72bd04a]
  affects: [module:wf2, module:wf2-prd, module:wf2-dev, module:wf2-test, module:app, module:memory-review, module:ontology-design, module:prd-execution, rule:documents-tree]
```

  - choice:wf2.definition-shape One tree, by kind on top and by area inside. "Wye" (what it is: purpose, goals, the constitution, the product-level decisions). "PRD" with a section per area holding every requirement and open question. "Design", a parent with one module page per area — Documents and editing, Knowledge views, Agents and sessions, Work and the librarian, Shell and navigation, Storage and serving, Graph core, Ontology, Memory — each holding that area's rules, decisions, components, libs, ops and flags. "Tests" (the verification index). "Research" for the essays (the memory review, the ontology design, the benchmarks) with their decisions moved to Design or Wye. "Archive" for retired pages. TODO, Bugs and Plans stay as intake. This is where `wf propose` already puts each kind: requirements and questions in the PRD, rules and decisions on the area's page.

  - context:wf2.definition-shape On 2026-09-20 the product's knowledge is spread over three generations of documents written side by side — the v0.1 self-description (module:waterfall), the 2026-09-14 design set (module:wf2, module:wf2-prd, module:wf2-dev, module:wf2-test, module:wf2-plan) and the App map by area (module:app and seven sub-pages) — plus topic essays (module:memory-review, module:ontology-design, module:prd-execution). Requirements live in seven documents, rules in four, decisions in six; no page says what Wye is.

  - alternative:wf2.definition-shape By area only (each area page holds its own requirements too; the PRD an index of embeds) — rejected: a person reading what Wye must do would visit nine pages. By kind only (one Requirements page, one Rules page, one Decisions page) — rejected: a rule loses the components and libs it is read next to.

  - consequence:wf2.definition-shape The App sub-pages become the Design module pages (same ids, retitled); requirements in module:memory-review, module:ontology-design, module:prd-execution and the App pages move into the PRD; module:wf2 becomes the Wye page. Ids do not change (constraint:wf2.one-defining-place).

  verdict:3a130fb759b6 refines rule:documents-tree — B concretely specifies the tree structure (Wye, PRD, Design per area, Tests, Research, Archive, intake) that A describes generally. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: rule:documents-tree decision:wf2.definition-shape)

  verdict:3e8a0f2aadb1 duplicate req:wf2.definition.one-place-per-kind — A (requirement) and B (decision) express the same structure: identical tree layout, identical placement of block kinds by location. (kind: duplicate, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:wf2.definition.one-place-per-kind decision:wf2.definition-shape)

  contradiction:waterfall.3e8a0f2aadb1 decision:wf2.definition-shape duplicates req:wf2.definition.one-place-per-kind — A (requirement) and B (decision) express the same structure: identical tree layout, identical placement of block kinds by location. #open (between: decision:wf2.definition-shape req:wf2.definition.one-place-per-kind, conflict: static, reason: A  requirement  and B  decision  express the same structure: identical tree layout  identical placement of block kinds by location.)

  verdict:cf5b47fa3b4d refines req:wf2.definition.what-wye-is — A specifies what content the Wye page holds (purpose, goals, constitution, product decisions, area links); B only mentions there is one Wye page. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:wf2.definition.what-wye-is decision:wf2.definition-shape)

  verdict:78e21e73b893 refines decision:wf2.definition-leftovers — A details cleanup actions (move plan sections, rename titles to Wye, keep ids stable) needed to achieve what B describes. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.definition-leftovers decision:wf2.definition-shape)

```yaml
- id: decision:wf2.superseded-layers
  title: The v0.1 and 2026-09-14 layers are sorted block by block — what exists moves, what was never built is retired, the emptied pages go to Archive
  date: 2026-09-20
  status: proposed
  by: alex
  evidence: [session:d4d72bd04a]
  affects: [module:waterfall, module:wf2-prd, module:wf2-dev, module:wf2-plan, decision:memory.forgetting]
```

  - choice:wf2.superseded-layers Every block is sorted. A block that still describes what exists moves into its new home with its id unchanged. A block that was never built and is not planned is marked `status: retired` in place — it leaves default retrieval and the packet (decision:memory.forgetting) but is never deleted. The emptied pages move under one Archive page outside the main tree.

  - context:wf2.superseded-layers module:waterfall (v0.1: ctx CLI and the static viewer, 37 requirements, 26 rules) and the 2026-09-14 design set (module:wf2-prd with 68 `req&#58;wf2.*`, module:wf2-dev with 91 rules and the SQLite / Hono / MCP / clerk design) describe in part what runs today and in part what was superseded by decision:wf2.product-model and never built (rule:clerk-triggers, rule:clerk-tools, rule:clerk-context, entity:clerk-run, entity:graph-delta …). All of it is still live in default retrieval and in the constraint packet.

  - alternative:wf2.superseded-layers Archive the pages whole and write the definition fresh — rejected: duplicates stay live and the packet keeps citing unbuilt rules. Keep the clerk / SQLite / MCP design live as the plan — rejected by the person: it is not the plan.

  - consequence:wf2.superseded-layers The packet stops citing the unbuilt clerk rules; `wf context --all` and `--as-of` still show them. Drift rows in module:wf2 §10 that name retired nodes are closed by the retirement.

  verdict:d1d88601cbbe refines decision:memory.forgetting — A establishes the archiving policy (done work is hidden, not deleted); B applies this policy to the specific case of empty pages from the documentation migration. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:memory.forgetting decision:wf2.superseded-layers)

  verdict:875d671b302d refines req:wf2.definition.links-survive — A specifies the full requirements for links to survive migration (IDs unchanged, tags resolve, no dangling refs); B narrows to one required implementation detail (moving blocks with IDs unchanged). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:wf2.definition.links-survive decision:wf2.superseded-layers)

```yaml
- id: decision:wf2.definition-leftovers
  title: Session leftovers leave the definition pages and every page says Wye — ids and the product slug stay
  date: 2026-09-20
  status: proposed
  by: alex
  evidence: [session:d4d72bd04a]
  affects: [module:app-agents, module:app-knowledge, module:bugs, module:v2-prs]
```

  - choice:wf2.definition-leftovers A plan section inside a module page moves into that request's plan document, or is retired there when the plan is done; done plan documents stay under Plans marked done. Every definition page's title names Wye, not Waterfall v2. Node ids, the product slug and the folder do not change (constraint:wf2.one-defining-place; question:waterfall.rename-slug stays open). TODO and Bugs stay as the two intake pages.

  - context:wf2.definition-leftovers Past sessions left `## Plan: …` sections inside module:app-agents (six, one with a whole plan document pasted in), module:app-knowledge and module:bugs; 24 plan documents sit under Plans; page titles still read "Waterfall v2 — …" although the app calls itself Wye (decision:waterfall.rename-scope).

  - alternative:wf2.definition-leftovers Restructure the definition pages only and leave leftovers and titles for a later pass — rejected by the person.

  - consequence:wf2.definition-leftovers Module pages hold only the definition; the history of how a block came to be stays reachable through the plan documents and the change records.

  verdict:4f0788d0dce8 refines decision:waterfall.rename-scope — B adds specificity to A's rename decision by detailing that definition page titles must say Wye (not Waterfall v2) while maintaining A's constraint to keep the product slug unchanged. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:waterfall.rename-scope decision:wf2.definition-leftovers)

  verdict:128894926465 refines constraint:wf2.one-defining-place — B applies and details A's constraint about stable ids by showing concretely that ids and product slug remain unchanged despite the Wye rename, exemplifying A's principle of id stability. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: constraint:wf2.one-defining-place decision:wf2.definition-leftovers)

<!-- /list:decision -->

## Gates

```yaml
- id: gate:agent-token
  statement: >
    Every API call carries an agent name (HTTP header X-Agent or MCP client info) and is recorded as an
    agent_session. Locally the token is not checked; when hosted, token_hash must match.
  applies-to: [op:graph.patch, op:graph.create, op:tasks.create, op:tasks.update, op:decisions.post, op:deltas.apply, op:deltas.reject, op:contradictions.resolve, op:contradictions.dismiss, op:clerk.run]
  NOT-applied-to: [op:graph.get, op:graph.search, op:graph.packet]   # reads are open locally; hosted reads will need the same token
- id: gate:delta-apply
  statement: >
    deltas.apply and deltas.reject are allowed for a human user or an agent_session whose kind is marked trusted
    in server config; the internal clerk and the agent that posted the decision are refused.
  applies-to: [op:deltas.apply, op:deltas.reject]
```
