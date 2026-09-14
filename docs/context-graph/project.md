---
node: module:wf2
type: module
title: Waterfall v2 — project
status: proposed
owner: alex
last-verified: 2026-09-14
verified-against: docs/superpowers/specs/2026-09-14-waterfall-v2-design.md (design, no code yet)
source-roots: [., packages/core, packages/server, packages/web, packages/cli, skills, docs]
sources:
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md   # the approved design this graph is derived from
  - docs/superpowers/specs/2026-09-14-web-ui-documents-first-design.md   # the reader: documents first, cards, smart tags, peek panel
  - docs/context-graph/waterfall.md                              # v0.1 self-description; v2 refines and resolves parts of it
  - schema/kinds.yaml
---

# Waterfall v2 — project

This is the project file. It holds the product and project nodes, the sub-systems, the phases, the architectural decisions (ADR nodes), gates, boundary contracts, the drift between this design and the v0.1 graph, and open questions. The other three documents are:

| document | file | holds |
|---|---|---|
| PRD | `docs/context-graph/prd.md` (module:wf2-prd) | requirements `req:wf2.*` in when/then/unless form, flags |
| Dev design | `docs/context-graph/dev-design.md` (module:wf2-dev) | entities, values, state machines, operations (API tools), pages (web UI), rules |
| Test design | `docs/context-graph/test-design.md` (module:wf2-test) | test nodes, what each verifies, untested surfaces |

Everything starts as `status: proposed`; a node moves to `unverified` when its slice ships without a page test and to `shipped` once a `verified-by` test exists. Sources are intended paths under `packages/*`; `ctx check` reports them as warnings until the code exists, and `--strict` turns them into errors, which is the definition of done.

---

## 0. module:wf2

```yaml
- id: module:wf2
  purpose: >
    Hold the full knowledge of a product under development — its artifact graph, tasks, decisions and
    contradictions — so that humans and coding agents (Claude Code, Codex, others) read from and write to one
    picture. v2 keeps the v0.1 markdown graph as the reviewed source of truth and adds a store for the churn
    stream, a server with HTTP and MCP access, a Notion-style web app with an editable mind map, an internal clerk
    agent that turns decisions into graph changes, and contradiction detection with explicit resolution. links t o
    @ads.com entity:product
  product: product:waterfall
  submodules:
    - core      # packages/core — parser, queries, lint (ported from lib/), the new in-place writer, the schema
    - server    # packages/server — repo registry, watcher, in-memory graphs, SQLite, services, HTTP, MCP, SSE
    - web       # packages/web — Next.js app: sidebar, node page, graph view, tasks, decisions, contradictions
    - cli       # packages/cli — ctx as a thin client with local fallback
    - clerk     # packages/server/src/clerk — the internal agent (Messages API tool-use loop)
    - skills    # skills/* rewritten around the MCP tools; CLAUDE.md / AGENTS.md snippet
  documents: [module:wf2-prd, module:wf2-dev, module:wf2-test]
  scoping: one server process; many local repos (projects) grouped under products; ids are global within a project's graph
  edges:
    - module:wf2 -(has)-> module:wf2-prd
    - module:wf2 -(has)-> module:wf2-dev
    - module:wf2 -(has)-> module:wf2-test
    - module:wf2 -(edge-to)-> module:waterfall          # v0.1: parser, queries, lint, static viewer, skills are reused
    - module:wf2 -(edge-to)-> module:claude-code        # MCP client (stdio or HTTP); skills; CLAUDE.md snippet
    - module:wf2 -(edge-to)-> module:codex              # MCP client via ~/.codex/config.toml; AGENTS.md snippet
    - module:wf2 -(edge-to)-> module:anthropic-api      # the clerk runs on the Messages API
    - module:wf2 -(edge-to)-> module:git                # markdown lives in the repo; the server only reads the sha
    - module:wf2 -(edge-to)-> module:yessensei-pos      # first registered project; its inventory graph is the pilot
```

entity:product 

### product:waterfall

```yaml
- id: product:waterfall
  description: >
    The product this graph describes. In the v2 data model a product groups projects (repos); waterfall itself is
    the first product and its own repo the first project.
  projects: [module:wf2, module:waterfall]
```

---

## P. Phases

Each phase is its own implementation plan. Exit criteria are requirements in the PRD; a phase is done when those requirements are `shipped` with `verified-by` and `ctx check --strict` is green.

| phase | delivers | exit criterion (PRD ids) |
|---|---|---|
| 1 — core + server + CLI | monorepo, TypeScript port, writer, SQLite schema, HTTP + MCP with every tool, tasks and decisions stored (clerk skipped), ctx as client, skills rewritten | req:wf2.store, req:wf2.serve, req:wf2.write, req:wf2.api, req:wf2.tasks, req:wf2.decisions, req:wf2.cli |
| 2 — web UI | sidebar, node page, graph view, tasks, decisions, contradictions (structural only), live updates | req:wf2.ui, req:wf2.contradictions.structural |
| 3 — clerk + contradictions | clerk runtime, delta propose/apply/reject, semantic findings, strict check | req:wf2.clerk, req:wf2.contradictions |

---

## D. Decisions (ADRs)

Each decision was taken in the design discussion of 2026-09-14 and `governs` the requirements it shapes.

```yaml
- id: decision:wf2.hybrid-store
  date: 2026-09-14
  status: approved
  context: >
    v0.1 keeps everything in markdown; v2 needs history and structure for tasks, decisions and agent traffic, but
    the reviewed artifact graph must stay in git.
  options:
    - markdown only (no history for the churn stream)
    - database canonical with markdown export (loses git review, noisy diffs)
    - hybrid
  choice: hybrid — artifacts stay markdown in git; tasks, decisions, contradictions, deltas, runs and sessions live in SQLite keyed by node id; nothing in the DB duplicates a node body
  consequences: two stores, one write path into the graph (the file); the DB references node ids as strings
  governs: [req:wf2.store, req:wf2.write.single-path]
- id: decision:wf2.local-first-hosted-ready
  date: 2026-09-14
  status: approved
  context: one user on one machine today; a team and hosting later.
  options:
    - local only, no provisions (rewrite later)
    - hosted now (auth, git sync, webhooks — too much surface)
    - local now with tenant, user and token columns unused
  choice: local now, hosted-ready — every table carries tenant_id and created_by; agent sessions carry a token hash; nothing is enforced locally
  consequences: a few unused columns; Postgres and token enforcement are additive
  governs: [req:wf2.store.hosting-ready, req:wf2.api.identity]
- id: decision:wf2.stack
  date: 2026-09-14
  status: approved
  context: >
    the web app needs a Notion-style page editor and an editable mind map; the server must share code with the
    existing parser.
  options:
    - extend the single-file static viewer (outgrown by a block editor and an editable graph)
    - Vite SPA plus a separate API server
    - Next.js app with BlockNote and React Flow, Hono server, Drizzle over SQLite, MCP TypeScript SDK
  choice: pnpm monorepo in TypeScript; Next.js + BlockNote (block editing of prose keys only) + React Flow; Hono; Drizzle + SQLite; MCP TypeScript SDK
  consequences: BlockNote's markdown round-trip is lossy, so yaml keys are edited as form fields, never as blocks
  governs: [req:wf2.ui.node-page, req:wf2.ui.graph]
- id: decision:wf2.sidecar-server
  date: 2026-09-14
  status: approved
  context: how the server relates to the markdown files and the existing parser.
  options:
    - import into a DB and regenerate markdown (noisy diffs, loses hand formatting)
    - move to one file per node first (migration before any value)
    - a sidecar that parses the files as they are and patches yaml blocks in place
  choice: sidecar over the existing parser; a new writer patches a node's yaml block in place using the file and line the parser records
  consequences: the writer is the one new hard piece of core; per-node files remain possible later
  governs: [req:wf2.serve, req:wf2.write]
- id: decision:wf2.tasks-replace-delta-files
  date: 2026-09-14
  status: approved
  context: v0.1 documented a delta.yaml per feature under _deltas/, which nothing parsed.
  options:
    - keep delta files next to tasks
    - tasks in the DB with node links replace them; clerk-proposed changes are graph_delta rows applied to markdown
  choice: retire the delta file; a task row with links is the unit of intent; a graph_delta row is the unit of proposed change
  consequences: templates/delta.yaml and the skill text are superseded; approval moves onto the task
  governs: [req:wf2.tasks, req:wf2.tasks.replaces-delta]
- id: decision:wf2.immutable-decisions
  date: 2026-09-14
  status: approved
  context: decisions are evidence; editing them in place would erase the trail contradictions depend on.
  options:
    - editable in place
    - immutable, superseded by a later decision
  choice: immutable; a later decision names the one it supersedes
  consequences: the clerk compares against the whole chain; the UI shows superseded decisions greyed
  governs: [req:wf2.decisions]
- id: decision:wf2.human-applies-deltas
  date: 2026-09-14
  status: approved
  context: who may turn a clerk proposal into a markdown change.
  options:
    - external agents apply their own deltas
    - a human or a trusted agent applies; the clerk and the posting agent only propose
  choice: apply and reject are gated; the clerk never edits markdown
  consequences: a review step exists between a decision and the graph; trust for agents is a configuration question (question:wf2.trusted-agent)
  governs: [req:wf2.clerk.propose-only, req:wf2.clerk.apply]
- id: decision:wf2.clerk-triggers
  date: 2026-09-14
  status: approved
  context: when the clerk runs.
  options:
    - on every markdown change (cost, noise)
    - on decision posted, task created or relinked, and on demand from the UI
  choice: decision, task, on demand
  consequences: a node edited by hand is not re-checked until something touches it or a human asks
  governs: [req:wf2.clerk, req:wf2.clerk.on-demand]
- id: decision:wf2.clerk-runtime
  date: 2026-09-14
  status: approved
  context: how the clerk is built.
  options:
    - Claude Agent SDK
    - a hand-rolled tool-use loop over the Messages API using the same service layer
  choice: hand-rolled loop; tools are the read side of the API plus propose_delta and report_contradiction; no shell, no file access
  consequences: full control of budget, caching and audit; every run is a clerk_run row
  governs: [req:wf2.clerk.audit, req:wf2.clerk.budget]
- id: decision:wf2.home-view
  date: 2026-09-14
  status: approved
  context: what the web app opens on.
  options:
    - the mind map
    - sidebar plus node page, graph as a view
  choice: sidebar plus node page
  consequences: the graph view is one click away and deep-linkable
  governs: [req:wf2.ui]
```

---

## 7. Cross-module edges (boundary contracts)

```yaml
- module:claude-code -(calls)-> op:graph.packet
  via: MCP (stdio or Streamable HTTP) configured by the printed `claude mcp add` command
  contract: every tool in the dev-design ops table, same names and argument shapes as HTTP
- module:codex -(calls)-> op:decisions.post
  via: MCP configured by the printed [mcp_servers.waterfall] block in ~/.codex/config.toml
  contract: same tool set; agent name from MCP client info
- module:anthropic-api -(triggers)-> op:clerk.run
  via: Messages API tool-use loop, model from flag:clerk-model
  contract: the clerk sees only the read tools plus propose_delta and report_contradiction
- module:git -(has)-> entity:module-doc
  contract: the server reads the current sha for entity:project; it never commits
- module:waterfall -(has)-> op:ctx.build
  contract: v2 core is a TypeScript port of lib/parse.js and lib/graph.js with the same parse rules (rule:node-detection, rule:edge-from-typed-key, rule:field-generation) so the pilot parses identically
- module:yessensei-pos -(has)-> entity:project
  contract: registered as the first project; its inventory graph is the phase 2 exit fixture
```

---

## 8. Gates

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

---

## 10. Drift and contradictions

Disagreements between this design and the v0.1 graph in `waterfall.md`, plus one between the design and the pilot. Each row is a structural contradiction the server will import; each is resolved by the requirement or question named.

| # | a | b | what disagrees | where |
|---|---|---|---|---|
| 1 | entity:delta, req:wf.pipeline | req:wf2.tasks.replaces-delta | v0.1 says a feature enters as a delta.yaml under _deltas/; v2 retires the file and makes a task row with links the unit of intent. templates/delta.yaml and the skill text still describe the file | templates/delta.yaml:1 vs decision:wf2.tasks-replace-delta-files |
| 2 | rule:viewer-no-server, page:viewer/graph | page:web/node, page:web/graph | v0.1's viewer is a static page with no fetch; v2's web app is server-backed and live. Both exist until question:wf2.static-viewer decides whether `ctx site` is retired | viewer/index.html vs packages/web |
| 3 | page:skill/context | req:wf2.api.skills | the v0.1 skill tells agents to run ctx commands; v2 rewrites it around MCP tool names and adds a CLAUDE.md / AGENTS.md snippet | skills/waterfall-context/SKILL.md vs page:skill/context-v2 |
| 4 | state:node-lifecycle | state:task-lifecycle | v0.1 planned an approved status on nodes; v2 records approval on the task (proposed → approved) and nodes keep only proposed / shipped / deprecated | schema/kinds.yaml:47 vs entity:task |
| 5 | gate:none | gate:agent-token | v0.1 has no identity at all; v2 records who calls but still enforces nothing locally — identity without authorization until hosted | docs/context-graph/waterfall.md vs decision:wf2.local-first-hosted-ready |
| 6 | req:wf2.contradictions.strict | module:yessensei-pos | the pilot has 17 open drift rows; under the v2 strict rule its check goes red until they are resolved or dismissed with a reason | spec §6.3 vs inventory.md §10 |
| 7 | req:wf.query.packet | req:wf2.api.packet-task | v0.1's packet cites files only from nodes with a source key, so requirement-heavy packets cite nothing; v2 adds task seeding and appends decisions and contradictions but does not fix the file list on its own | lib/graph.js:131-137 |
| 8 | decision:wf2.stack | package.json | the decision says pnpm monorepo; pnpm is not installed on the dev machine, so the workspace uses npm workspaces. Same layout, different tool; switch when pnpm is adopted | package.json vs spec §2 |

---

## 11. Open questions

```yaml
- id: question:wf2.per-node-files
  q: >
    One file per node (merge-friendly for many agents) stays deferred. The writer keeps the door open because the
    parser accepts any .md in the graph folder. When does the number of concurrent agents make this worth the
    migration?
  see: question:wf.granularity
- id: question:wf2.section-map
  q: >
    Which section a newly created node is appended to is taken from the template headings today. The map should
    move into schema/kinds.yaml so the writer and the template agree (this also resolves drift:waterfall.6).
- id: question:wf2.static-viewer
  q: >
    Keep `ctx site` and the static phone viewer next to the web app (publishable as an Artifact without a server),
    or retire it after phase 2?
- id: question:wf2.trusted-agent
  q: >
    What makes an agent trusted for deltas.apply — a server config list of agent names, a per-project setting, or
    never (humans only)?
- id: question:wf2.decision-granularity
  q: >
    What counts as a decision an agent must post — anything with a rejected alternative, or only changes to
    requirements and rules? The skill snippet needs a one-line test.
- id: question:wf2.clerk-model
  q: >
    Default model for the clerk — the mid tier for cost, or the top tier for classification quality on
    contradictions? flag:clerk-model makes it configurable; the default is the open choice.
```
