# Waterfall v2 — context, requirement, task and decision system for agents and humans

Date: 2026-09-14. Status: approved in discussion, awaiting written review.

## 1. Goal

Waterfall holds the full knowledge of a product under development so that humans and coding agents (Claude Code,
Codex, others) work from the same picture. v0.1 already describes a product as markdown that is also a graph
(requirements, entities, rules, ops, pages, gates, tests, drift) and queries it from a CLI. v2 adds:

- a store for the high-churn stream around the graph: products, projects, tasks, decisions, contradictions;
- a server that exposes everything for reading and writing over HTTP and MCP, so any agent can use it;
- a web app that renders projects and artifacts as Notion-style pages and as an editable mind map;
- an internal agent (the clerk) that converts posted decisions and tasks into graph changes and returns the
  relevant elements to the caller;
- contradiction detection, structural and semantic, with explicit resolution.

Non-goals for v2: hosting, multi-user auth, git sync from remotes, automatic commits. The schema and API are
shaped so those are additive later.

## 2. Decisions taken in the design discussion

| decision | choice | rejected |
|---|---|---|
| source of truth | hybrid: reviewed artifacts stay in markdown in git; tasks, decisions, contradictions, deltas, sessions live in a database keyed to markdown node ids | DB canonical with markdown export (loses git review); markdown only (no history for the churn stream) |
| deployment | local, single user, several repos; schema and API carry tenant/user/token fields unused until hosted | hosted now (too much surface); local with no hosting provisions (rewrite later) |
| stack | pnpm monorepo, TypeScript; Next.js + BlockNote + React Flow for the web app; Hono server; SQLite via Drizzle (Postgres later); MCP TypeScript SDK; Claude Messages API for the clerk | Vite SPA + separate server; extending the single-file viewer |
| server vs parser | sidecar: the server runs the existing parser over each registered repo's `docs/context-graph/*.md`, holds the graph in memory, and a new writer patches yaml blocks in place | regenerate markdown from a DB (noisy diffs); one file per node first (migration before value) |
| deltas | the markdown `_deltas/` file goes away; a task row in the DB with node links replaces it; clerk-proposed changes are `graph_delta` rows applied to markdown | keep delta.yaml alongside tasks |
| decisions | immutable once posted; superseded by later decisions | editable in place |
| who applies clerk deltas | a human, or a trusted agent, via `deltas.apply`; external agents cannot apply their own | agents apply directly |
| clerk triggers | decision posted, task created or relinked, on demand from the UI | on every markdown change |
| clerk runtime | hand-rolled tool-use loop over the Messages API using the same service layer | Claude Agent SDK |
| home view | sidebar + node page; graph is a view | graph as home |

## 3. Domain model

Two layers joined by node ids. Nothing in the DB duplicates a node body, so markdown stays canonical.

### 3.1 Markdown layer (unchanged format, git)

A project is a repo with a `docs/context-graph/` folder. Its `.md` files parse (existing `lib/parse.js` rules)
into modules and nodes with typed edges. Kinds and verbs are those of `schema/kinds.yaml`. Two changes:

- `question:` and `decision:` become first-class yaml nodes with template sections (§11 questions already use
  `- id: question:…` in `waterfall.md`; the template and pilot are converted). A `decision:` node is the ADR form:
  date, context, options, choice, consequences, plus `decision-id:` pointing at the DB row that produced it.
- `contradicts` edges and drift rows are still written by authors; the server imports them as structural
  contradictions on every parse.

### 3.2 Database layer (SQLite via Drizzle; every table has `id`, `tenant_id`, `created_by`, `created_at`, `updated_at`)

| table | fields | notes |
|---|---|---|
| `product` | name, description, owner_id | a thing being built; has many projects |
| `project` | product_id, name, root_path, git_remote (null locally), graph_path (default `docs/context-graph`), last_parsed_at, last_parsed_sha | one repo |
| `task` | project_id, title, intent, status, assignee_kind (human, agent), assignee_name, packet_budget | status: proposed, approved, in-progress, done, abandoned |
| `task_link` | task_id, node_id, role | role: implements, changes, resolves, reads |
| `decision` | project_id, task_id?, title, context, options (json list), choice, consequences, affects (json list of node ids), made_by_kind, made_by_name, session_id?, supersedes_id?, clerk_status | immutable; clerk_status: pending, done, failed, skipped |
| `contradiction` | project_id, kind (structural, semantic), side_a, side_b (node id or `decision:<uuid>`), explanation, status (open, resolved, dismissed), resolved_by_decision_id?, resolved_by_task_id?, dismissed_reason?, clerk_run_id? | structural rows are upserted from drift/contradicts on parse, keyed by (project, side_a, side_b) |
| `graph_delta` | project_id, decision_id?, task_id?, clerk_run_id?, status (proposed, applied, rejected), patch (json, see §5.3), applied_at, applied_by | validated by the parser before it is stored |
| `clerk_run` | project_id, trigger_kind, trigger_id, status (running, done, failed), input (json), tool_calls (json), output (json), model, tokens_in, tokens_out, error? | audit trail |
| `agent_session` | name, kind (claude-code, codex, internal, other), token_hash (null locally), last_seen_at | identity of callers |

Node ids are strings of the form `kind:slug`; decision sides use `decision:<uuid>` so a contradiction can pit a
decision against a rule.

## 4. Architecture

```
packages/core     parser + graph queries (ported from lib/), the writer, the schema, the lint. No I/O beyond files.
packages/server   `waterfall serve`: repo registry, chokidar watcher, one in-memory Graph per project, SQLite,
                  service layer (GraphService, TaskService, DecisionService, ContradictionService, ClerkService),
                  Hono HTTP API, MCP server (stdio + Streamable HTTP), SSE event stream.
packages/web      Next.js app: sidebar, node page, graph view, tasks, decisions, contradictions.
packages/cli      `ctx`: same commands as today; calls the server when reachable, otherwise runs core locally.
skills/           agent contract rewritten around the MCP tools; CLAUDE.md / AGENTS.md snippet.
docs/context-graph/waterfall.md   waterfall's own graph; v2 reqs enter as proposed and flip to shipped with tests.
```

### 4.1 Data flow

1. File change → watcher (debounced, ignores half-written files) → parser → in-memory graph → structural
   contradictions upserted → SSE `graph.changed` event.
2. Any write to a node (UI or agent) → writer edits the yaml block in the `.md` → path 1. The file is the only way
   into the graph; there is one write path.
3. `decisions.post` or task create/relink → DB row → clerk run queued → clerk proposes a `graph_delta` and
   contradictions → result returned to the caller and shown in the UI. `deltas.apply` goes through path 2.

### 4.2 Writer (packages/core)

The parser records `file` and `line` for every node. The writer:

- `patchNode(id, {body?, status?, addEdges?, removeEdges?}, ifMatch)` replaces the node's yaml block text in place,
  keeping surrounding text and comments; edges are written as typed keys when the verb has a key
  (`satisfied-by`, `refines`, …) and as `a -(verb)-> b` lines under `edges:` otherwise;
- `createNode(module, kind, slug, body)` appends a yaml block under the section the template assigns to that kind
  (creating the section heading if missing);
- `ifMatch` is the sha256 of the node's current body; mismatch returns `conflict` with the current body and hash;
- every write re-parses the affected file in memory first and rejects the patch if it produces a parse error or
  a lint error; only then is the file written. Edges to ids nobody describes yet are allowed (they become stub
  nodes, as today) and are returned as warnings so the caller can describe them next;
- writes are serialized per file through a queue.

### 4.3 Concurrency and git

Writes are serialized per file; the hash check catches lost updates across UI and agents. Git commits stay manual.
The server never runs git except to read the current sha for `project.last_parsed_sha`.

### 4.4 Hosted later

Projects gain `git_remote` and a sync job instead of a local watcher; `agent_session.token_hash` is enforced;
`tenant_id` is populated from the login; SQLite is swapped for Postgres through Drizzle. No API change.

## 5. API surface

One tool set exposed twice with identical names and argument shapes: MCP tools (stdio and Streamable HTTP) and
HTTP under `/api/v1` (JSON, tool name as the path, e.g. `POST /api/v1/graph.patch`). Every call takes `project`
(id or name). Errors have one shape: `{error: conflict | invalid_patch | not_found | lint_failed | unauthorized,
message, details?}`.

### 5.1 Read

| tool | args | returns |
|---|---|---|
| `graph.get` | id or suffix | node with all edges both ways |
| `graph.neighbors` | id, depth=1, structural=true, kinds? | nodes by hop distance |
| `graph.impact` | id, depth=3 | reverse structural closure grouped by kind |
| `graph.search` | terms, limit | ranked hits (existing scoring) |
| `graph.reqs` | status? | requirement tree with status glyphs |
| `graph.packet` | task id or text, budget | nearest-first slice plus cited files; with a task id, seeds from the task's links and appends open decisions and contradictions touching them |
| `graph.check` | strict? | lint result; under strict, open contradictions touching a shipped node are errors |
| `tasks.list` / `tasks.get` | status?, node? / id | tasks with links, decisions, delta ids |
| `decisions.list` / `decisions.get` | node?, task?, since? / id | decisions with clerk result |
| `contradictions.list` | status=open, node? | findings with both sides and explanation |
| `projects.list` | | registered projects and products |

### 5.2 Write

| tool | args | behaviour |
|---|---|---|
| `graph.patch` | id, body?, status?, addEdges?, removeEdges?, ifMatch | writer §4.2; returns new hash |
| `graph.create` | module, kind, slug, body | appends the node; returns id and hash |
| `tasks.create` / `tasks.update` | title, intent, links[], status, assignee | queues a clerk run on create or relink |
| `decisions.post` | title, context, options[], choice, consequences, affects[], task?, supersedes? | stores the row, queues a clerk run; waits up to 5 s for it and returns `{decision, related, contradictions, delta_id}` or `{decision, clerk_status: pending}` |
| `deltas.apply` / `deltas.reject` | id, reason? | apply writes the patch through the writer; both record who and when |
| `contradictions.resolve` / `contradictions.dismiss` | id, decision? or task?, reason? | explicit resolution only |

### 5.3 `graph_delta.patch` shape

```json
{ "ops": [
  { "op": "create", "module": "module:inv", "kind": "req", "slug": "inv.sale.hold", "body": "…yaml…" },
  { "op": "patch", "id": "rule:fifo-oldest-first", "body": "…", "ifMatch": "sha256…" },
  { "op": "edge", "from": "req:inv.sale.hold", "verb": "satisfied-by", "to": "rule:…", "remove": false },
  { "op": "status", "id": "question:inv.hold", "status": "resolved" }
] }
```

Applied atomically per file; if any op fails, no file is written and the delta stays `proposed` with the error.

### 5.4 Agent identity and wiring

Callers send an agent name (HTTP header `X-Agent`, or MCP client info). Locally nothing is enforced. The server
prints ready-to-paste config on start: a `claude mcp add` command and a `[mcp_servers.waterfall]` block for
`~/.codex/config.toml`, both for stdio and for the HTTP url. Skills are rewritten to the tool names; a CLAUDE.md /
AGENTS.md snippet states the contract: packet before code, post every decision, patch nodes before shipping,
check green before done.

## 6. The clerk and contradictions

### 6.1 Runtime

A tool-use loop over the Claude Messages API (default `claude-sonnet-5`, configurable) whose tools are the read
side of §5.1 plus `propose_delta` and `report_contradiction`. It has no shell and no file access. Every run is a
`clerk_run` row with input, tool calls, output and token counts. Per-run budget: 40 tool calls, 200k input
tokens; results are cached by sha256 of the input.

### 6.2 A run on a decision

1. Context: the decision, its task, `graph.packet` around `affects`, earlier decisions touching those nodes, open
   contradictions in the two-hop neighbourhood.
2. Mapping: a `graph_delta` whose ops create a `decision:` node (ADR form, `decision-id:` back-reference), create or
   patch `req:` / `rule:` / `flag:` nodes with `status: proposed`, and add edges (`satisfied-by`, `refines`,
   `resolves` for questions or drift). The delta is validated by the parser before it is stored.
3. Detection: for each rule, req, or earlier decision in the two-hop neighbourhood, classify the pair as
   consistent, refines, duplicate, or contradicts, with a one-sentence explanation. `contradicts` and `duplicate`
   become `contradiction` rows of kind semantic.
4. Result: `{related: [{id, title, kind}], contradictions: [...], delta_id}` returned to the caller.

A run on a task does steps 1, 3 and 4 with the task's links as the seed and no delta.

### 6.3 Contradiction lifecycle

Structural findings come from drift rows and `contradicts` edges on every parse. Semantic findings come from the
clerk. Both share the table and UI. Resolution is explicit: a decision or task `resolves` it, or a human
dismisses it with a reason. `graph.check --strict` fails on an open contradiction touching a shipped node.

### 6.4 Guardrails

The clerk never edits markdown; it only proposes deltas. It cannot post decisions, so it cannot trigger itself.
A failed run leaves the decision stored with `clerk_status: failed`, retryable from the UI.

## 7. Web UI

Served by the same process, five views, all deep-linkable (`/p/<project>/n/<id>`, `/p/<project>/graph?focus=<id>`).

- **Sidebar**: product → project → module → section → node tree with kind icon and status dot; search at top
  (`graph.search`); fixed entries Tasks, Decisions, Contradictions with open counts.
- **Node page**: title, kind and status pills; a properties panel rendering every yaml key of the body as a field
  (text, enum for status, id lists with typeahead for edge keys); relations grouped by verb both ways as chips;
  prose keys (`purpose`, `note`, `statement`, `description`, `context`, `consequences`) edit in BlockNote, all
  other keys as form fields; right rail with linked tasks, decisions, contradictions, and "show in graph". Save
  calls `graph.patch` with the hash; conflicts show a diff.
- **Graph view**: React Flow. Mind-map layout with the focused node in the centre, `refines` and `has` as the
  tree (dagre layout), other structural verbs as cross-links, mentions hidden. Presets Requirements, Mechanics,
  Data, Drift, Everything as today. Click opens the node page in a side panel; double-click re-centres. Editing:
  drag handle to handle adds an edge (verb prompt), select + delete removes an edge, inline rename, "add child"
  creates a node under the selected one. Every edit goes through the API.
- **Tasks**: board by status; a task shows its links, packet, decisions and deltas.
- **Decisions**: timeline per project, filter by node; each card shows the clerk result and its delta with
  Apply / Reject and a markdown diff.
- **Contradictions**: open findings with both sides and explanation; resolve (pick a decision or task) or dismiss
  (reason required).

Live updates over SSE. Phone width keeps the current viewer's behaviour: tree first, graph and pages full screen.

## 8. Error handling

- Writer: reject on parse error or lint error, with the lint output; stub targets are warnings, not errors;
  conflict returns current body and hash. Never leaves a file half-written (write to temp, rename).
- Watcher: debounce 200 ms, skip files that fail to parse and emit `graph.parse_error` with file and line, keep
  serving the last good graph.
- Clerk: model error, budget hit, or invalid delta marks the run failed; the decision stays; the UI offers retry.
- API: one error shape over HTTP and MCP; 409 for conflict, 422 for invalid_patch and lint_failed, 404, 401.

## 9. Testing

- core: the smoke test becomes a suite with an in-repo fixture (a trimmed copy of the inventory pilot) so a fresh
  checkout tests something. Writer tests: patch, create, add/remove edge, conflict, and round-trip stability
  (parse → patch → parse equals the original graph plus the change).
- server: service tests against a temp repo and in-memory SQLite; API contract tests run the same cases once over
  HTTP and once over MCP.
- clerk: recorded model responses for deterministic mapping and classification tests; one live smoke behind
  `WATERFALL_LIVE=1`.
- web: component tests for the node page and graph editing; one Playwright flow: open a project, edit a node,
  observe the file change and the SSE refresh.
- Waterfall's own graph: every v2 requirement enters `waterfall.md` as `proposed` and flips to `shipped` with a
  `verified-by` as it lands; `graph.check --strict` runs in CI.

## 10. Phases

Each phase gets its own implementation plan.

1. **Core + server + CLI**: monorepo, TypeScript port of parser and queries, writer, SQLite schema, HTTP + MCP with
   all §5 tools except the clerk-dependent parts of `decisions.post` (stores only, `clerk_status: skipped`),
   `ctx` as a client, skills rewritten. Exit: Claude Code and Codex can read and write a registered repo's graph
   and post tasks and decisions.
2. **Web UI**: sidebar, node page, graph view, tasks, decisions, contradictions (structural only). Exit: the
   YesSensei inventory graph is browsable and editable in the browser, with live updates.
3. **Clerk + contradictions**: clerk runtime, delta proposal and apply/reject, semantic findings, strict check.
   Exit: a decision posted from Codex returns related nodes and a contradiction, and applying its delta changes the
   markdown.

## 11. Open questions carried into planning

- Per-node files (drift row 1 in `waterfall.md`) remain deferred; the writer keeps that door open because the
  parser accepts any `.md` in the graph folder.
- Which sections the writer appends new kinds to is taken from the template heading map; the map becomes part of
  `schema/kinds.yaml` (resolves drift row 6).
