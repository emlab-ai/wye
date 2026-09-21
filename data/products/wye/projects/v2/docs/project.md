---
node: module:archive-project
type: module
title: Waterfall v2 — project, 2026-09-14 (retired)
status: retired
owner: alex
last-verified: 2026-09-14
verified-against: docs/superpowers/specs/2026-09-14-wye-v2-design.md (design, no code yet)
source-roots: [., packages/core, packages/server, packages/web, packages/cli, skills, docs]
sources:
  - docs/superpowers/specs/2026-09-14-wye-v2-design.md   # the approved design this graph is derived from
  - docs/superpowers/specs/2026-09-14-web-ui-documents-first-design.md   # the reader: documents first, cards, smart tags, peek panel
  - docs/context-graph/wye.md                              # v0.1 self-description; v2 refines and resolves parts of it
  - schema/kinds.yaml
part-of: module:archive
order: 95
---

# Waterfall v2 — project

This is the project file. It holds the product and project nodes, the sub-systems, the phases, the architectural decisions (ADR nodes), gates, boundary contracts, the drift between this design and the v0.1 graph, and open questions. The other three documents are:

| document | file | holds |
|---|---|---|
| PRD | `docs/context-graph/prd.md` (module:wf2-prd) | requirements `req&#58;wf2.*` in when/then/unless form, flags |
| Dev design | `docs/context-graph/dev-design.md` (module:wf2-dev) | entities, values, state machines, operations (API tools), pages (web UI), rules |
| Test design | `docs/context-graph/test-design.md` (module:wf2-test) | test nodes, what each verifies, untested surfaces |

Everything starts as `status: proposed`; a node moves to `unverified` when its slice ships without a page test and to `shipped` once a `verified-by` test exists. Sources are intended paths under `packages/*`; `wye check` reports them as warnings until the code exists, and `--strict` turns them into errors, which is the definition of done.

---

## 0. module:wf2

### product:wye

---

## P. Phases

Each phase is its own implementation plan. Exit criteria are requirements in the PRD; a phase is done when those requirements are `shipped` with `verified-by` and `wye check --strict` is green.

| phase | delivers | exit criterion (PRD ids) |
|---|---|---|
| 1 — core + server + CLI | monorepo, TypeScript port, writer, SQLite schema, HTTP + MCP with every tool, tasks and decisions stored (clerk skipped), ctx as client, skills rewritten | req:wf2.store, req:wf2.serve, req:wf2.write, req:wf2.api, req:wf2.tasks, req:wf2.decisions, req:wf2.cli |
| 2 — web UI | sidebar, node page, graph view, tasks, decisions, contradictions (structural only), live updates | req:wf2.ui, req:wf2.contradictions.structural |
| 3 — clerk + contradictions | clerk runtime, delta propose/apply/reject, semantic findings, strict check | req:wf2.clerk, req:wf2.contradictions |

---

## C. Constitution

The product's constraints (decision:memory.constraint-type): rules about Wye or how it is built that no code enforces. Approved ones go verbatim into every agent's system prompt and into the constraint packet of every request; they used to live in the spec's non-goals, the agent contract's prose and the person's memory notes.

---

## D. Decisions (ADRs)

Each decision was taken in the design discussion of 2026-09-14 and `governs` the requirements it shapes.

---

## 7. Cross-module edges (boundary contracts)

```yaml
- module:claude-code -(calls)-> op:graph.packet
  via: MCP (stdio or Streamable HTTP) configured by the printed `claude mcp add` command
  contract: every tool in the dev-design ops table, same names and argument shapes as HTTP
- module:codex -(calls)-> op:decisions.post
  via: MCP configured by the printed [mcp_servers.wye] block in ~/.codex/config.toml
  contract: same tool set; agent name from MCP client info
- module:anthropic-api -(triggers)-> op:clerk.run
  via: Messages API tool-use loop, model from flag:clerk-model
  contract: the clerk sees only the read tools plus propose_delta and report_contradiction
- module:git -(has)-> entity:module-doc
  contract: the server reads the current sha for entity:project; it never commits
- module:wye -(has)-> op:ctx.build
  contract: v2 core is a TypeScript port of lib/parse.js and lib/graph.js with the same parse rules (rule:node-detection, rule:edge-from-typed-key, rule:field-generation) so the pilot parses identically
- module:yessensei-pos -(has)-> entity:project
  contract: registered as the first project; its inventory graph is the phase 2 exit fixture
```

---

## 8. Gates

---

## 10. Drift and contradictions

Disagreements between this design and the v0.1 graph in `wye.md`, plus one between the design and the pilot. Each row is a structural contradiction the server will import; each is resolved by the requirement or question named.

| # | a | b | what disagrees | where |
|---|---|---|---|---|
| 1 | entity:delta, req:wf.pipeline | req:wf2.tasks.replaces-delta | v0.1 says a feature enters as a delta.yaml under _deltas/; v2 retires the file and makes a task row with links the unit of intent. templates/delta.yaml and the skill text still describe the file | templates/delta.yaml:1 vs decision:wf2.tasks-replace-delta-files |
| 2 | rule:viewer-no-server, page:viewer/graph | page:web/node, page:web/graph | v0.1's viewer is a static page with no fetch; v2's web app is server-backed and live. Both exist until question:wf2.static-viewer decides whether `wye site` is retired | viewer/index.html vs packages/web |
| 3 | page:skill/context | req:wf2.api.skills | the v0.1 skill tells agents to run ctx commands; v2 rewrites it around MCP tool names and adds a CLAUDE.md / AGENTS.md snippet | skills/wye-context/SKILL.md vs page:skill/context-v2 |
| 4 | state:node-lifecycle | state:task-lifecycle | v0.1 planned an approved status on nodes; v2 records approval on the task (proposed → approved) and nodes keep only proposed / shipped / deprecated | schema/kinds.yaml:47 vs entity:task |
| 5 | gate:none | gate:agent-token | v0.1 has no identity at all; v2 records who calls but still enforces nothing locally — identity without authorization until hosted | docs/context-graph/wye.md vs decision:wf2.local-first-hosted-ready |
| 6 | req:wf2.contradictions.strict | module:yessensei-pos | the pilot has 17 open drift rows; under the v2 strict rule its check goes red until they are resolved or dismissed with a reason | spec §6.3 vs inventory.md §10 |
| 7 | req:wf.query.packet | req:wf2.api.packet-task | v0.1's packet cites files only from nodes with a source key, so requirement-heavy packets cite nothing; v2 adds task seeding and appends decisions and contradictions but does not fix the file list on its own | lib/graph.js:131-137 |
| 9 | entity:project, req:wf2.store | decision:wf2.product-model | the dev design defines a project as a local repo (rootPath, gitRemote, graphPath); the product model makes a project a folder of pages inside a product in Waterfall's own data folder, with one graph per product | dev-design.md vs data/products layout |
| 8 | decision:wf2.stack | package.json | the decision says pnpm monorepo; pnpm is not installed on the dev machine, so the workspace uses npm workspaces. Same layout, different tool; switch when pnpm is adopted | package.json vs spec §2 |

---

## 11. Open questions


## Retired blocks

```yaml
- id: product:wye
  status: retired
  description: >
    The product this graph describes. In the v2 data model a product groups projects (repos); wye itself is
    the first product and its own repo the first project.
  projects: [module:wf2, module:wye]
```
