---
node: module:archive-prd
type: module
title: Waterfall v2 — PRD, 2026-09-14 (retired)
status: retired
owner: alex
last-verified: 2026-09-14
verified-against: docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
source-roots: [., packages/core, packages/server, packages/web, packages/cli, skills]
sources:
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
  - docs/context-graph/project.md
part-of: module:archive
order: 93
---

# Waterfall v2 — PRD (requirements)

Every behaviour of v2 as a `req:` node: **when** trigger, **then** observable outcome, **unless** exception. Ids are
dotted paths under `req&#58;wf2.<capability>`; `refines` gives the tree. All are `proposed`. `satisfied-by` names the
mechanism the dev design intends; `requires-tests` names the test node in the test design that must make it real.
`see` links the v0.1 requirement a v2 requirement carries forward; `resolves` closes a v0.1 question or drift row.

---

## 0. module:wf2-prd

---

## R. Requirements (behaviour)

### Flags referenced by requirements

### R.1 Store — artifacts in markdown, the churn stream in a database

### R.2 Serve — one process, many local repos

### R.3 Write — edit a node without touching the rest of the file

### R.4 API — one tool set, exposed twice

### R.5 Tasks — the unit of intent

### R.6 Decisions — post every one, keep every one

### R.7 The clerk — an internal agent that keeps the graph honest

### R.8 Contradictions — found, shown, resolved explicitly

### R.9 Web UI — Notion-style pages and an editable mind map

#### Images for agents (2026-09-17)

#### Sessions console (2026-09-17)

### R.10 CLI — ctx becomes a client

### R.11 Delivery — waterfall through its own pipeline


```yaml
- id: module:archive-prd
  purpose: The product requirements of Waterfall v2, one node per behaviour, grouped by capability.
  part-of: module:wf2
  submodules: [store, serve, write, api, tasks, decisions, clerk, contradictions, ui, cli, self]
```

## Retired blocks

```yaml
- id: flag:strict
  status: retired
  scope: cli / api          # graph.check strict=true; ctx check --strict
  source: packages/core/src/check.ts
  description: turns shipped-without-test, unresolvable source path, and open-contradiction-on-shipped-node from warnings into errors
- id: flag:clerk-model
  status: retired
  scope: server config      # WATERFALL_CLERK_MODEL, default claude-sonnet-5
  source: packages/server/src/config.ts
- id: flag:live-clerk
  status: retired
  scope: test               # WATERFALL_LIVE=1 enables the one live clerk smoke test
  source: packages/server/test/clerk.live.test.ts
- id: flag:trusted-agents
  status: retired
  scope: server config      # list of agent names allowed through gate:delta-apply
  source: packages/server/src/config.ts
- id: req:wf2.store
  title: Artifacts stay in markdown; tasks, decisions and contradictions get a database
  when: a project (a local repo with a docs/context-graph folder) is registered with the server
  then: its markdown files are parsed into the artifact graph exactly as v0.1 does, and tasks, decisions, contradictions, deltas, clerk runs and agent sessions are stored in SQLite keyed to node ids; no table duplicates a node body
  status: retired
  satisfied-by: [entity:project, entity:task, entity:decision, entity:contradiction, entity:graph-delta, entity:clerk-run, entity:agent-session, rule:markdown-canonical]
  requires-tests: [test:server-services#register-project, test:server-services#no-body-duplication]

- id: req:wf2.store.hosting-ready
  title: The schema is ready for hosting without using it
  when: any row is written locally
  then: it carries tenant_id and created_by (a fixed local value), and agent_session carries a token_hash that is never checked locally, so moving to Postgres and enforcing tokens later adds no columns
  status: retired
  satisfied-by: [rule:hosting-columns, gate:agent-token, entity:agent-session]
  requires-tests: [test:server-services#hosting-columns-present]
  refines: req:wf2.store

- id: req:wf2.store.first-class-questions
  title: Questions and decisions are real nodes
  when: an author writes a question or an ADR into a module file
  then: it is a yaml node with an id (question:<mod>.<slug>, decision:<mod>.<slug>) that tasks and deltas can resolve or govern, and the template has a section for each
  status: retired
  satisfied-by: [rule:question-decision-nodes, entity:module-doc]
  requires-tests: [test:core-parser#question-and-decision-nodes]
  resolves: [question:wf.questions-as-nodes]
  refines: req:wf2.store
- id: req:wf2.serve
  title: One local process serves every registered repo
  when: waterfall serve starts
  then: it loads the registered projects, parses each graph into memory, watches their files, and serves the HTTP API, the MCP endpoint, the SSE stream and the web app on localhost
  status: retired
  satisfied-by: [op:serve, entity:graph-registry, rule:watcher-debounce]
  requires-tests: [test:server-api#serve-starts-with-two-projects]

- id: req:wf2.serve.live
  title: A file change is visible within a second
  when: a file under a project's graph path changes on disk
  then: the project's graph is re-parsed, structural contradictions are upserted, and a graph.changed event is emitted over SSE
  status: retired
  satisfied-by: [rule:watcher-debounce, rule:structural-import, op:events.subscribe]
  requires-tests: [test:server-services#watch-reparse, ui-test:edit-node-flow]
  refines: req:wf2.serve

- id: req:wf2.serve.last-good
  title: A broken file never takes the graph down
  when: a changed file fails to parse
  then: the last good graph keeps serving and a graph.parse_error event carries the file and line
  status: retired
  satisfied-by: [rule:last-good-graph]
  requires-tests: [test:server-services#parse-error-keeps-last-good]
  refines: req:wf2.serve

- id: req:wf2.serve.config-print
  title: Connecting an agent is copy and paste
  when: the server starts
  then: it prints a ready-to-run `claude mcp add` command and a `[mcp_servers.waterfall]` TOML block for Codex, for both the stdio command and the HTTP url
  status: retired
  satisfied-by: [op:serve, rule:config-print]
  requires-tests: [test:server-api#config-print]
  refines: req:wf2.serve
- id: req:wf2.api
  title: Agents and the UI use one tool set over MCP and HTTP
  when: a caller invokes a tool by name
  then: the same name and argument shape work as an MCP tool (stdio or Streamable HTTP) and as POST /api/v1/<name>, and both return the same result and error shapes
  status: retired
  satisfied-by: [rule:one-tool-set, op:graph.get, op:graph.patch, op:decisions.post]
  requires-tests: [test:server-api#same-cases-http-and-mcp]
  see: req:wf.skills.mcp

- id: req:wf2.api.read
  title: Every v0.1 query is available remotely
  when: an agent needs product context
  then: graph.get, graph.neighbors, graph.impact, graph.search, graph.reqs, graph.packet and graph.check answer for any registered project with the same semantics as the ctx commands
  status: retired
  satisfied-by: [op:graph.get, op:graph.neighbors, op:graph.impact, op:graph.search, op:graph.reqs, op:graph.packet, op:graph.check]
  requires-tests: [test:server-api#read-tools-match-cli]
  see: req:wf.query
  refines: req:wf2.api

- id: req:wf2.api.packet-task
  title: A packet for a task includes its decisions and contradictions
  when: graph.packet is given a task id instead of text
  then: the task's linked nodes seed the slice and open decisions and contradictions touching them are appended after the nodes
  status: retired
  satisfied-by: [op:graph.packet, rule:packet-task-seeds]
  requires-tests: [test:server-services#packet-from-task]
  see: req:wf.query.packet
  refines: req:wf2.api

- id: req:wf2.api.errors
  title: Errors have one shape everywhere
  when: a call fails
  then: the result is {error, message, details?} with error in conflict, invalid_patch, not_found, lint_failed, unauthorized; HTTP maps them to 409, 422, 404, 422, 401
  status: retired
  satisfied-by: [rule:error-shape, value:error-code]
  requires-tests: [test:server-api#error-shape]
  refines: req:wf2.api

- id: req:wf2.api.identity
  title: Every caller has a name
  when: a call arrives with an X-Agent header or MCP client info
  then: an agent_session is created or touched and every row the call writes records that name in created_by
  unless: the header is missing, in which case the name is anonymous and the call still succeeds locally
  status: retired
  satisfied-by: [entity:agent-session, gate:agent-token, rule:created-by]
  requires-tests: [test:server-api#agent-header-recorded]
  refines: req:wf2.api

- id: req:wf2.api.project-scope
  title: Every call names its project
  when: a tool is called
  then: it takes project as an id or name and refuses with not_found when the project is not registered
  status: retired
  satisfied-by: [rule:project-scoped]
  requires-tests: [test:server-api#unknown-project]
  refines: req:wf2.api

- id: req:wf2.api.skills
  title: Agents are told the contract in their own config
  when: an agent starts work in a registered repo
  then: the rewritten skills name the tools (packet before code, post every decision, patch before shipping, check before done) and a CLAUDE.md / AGENTS.md snippet states the same in one paragraph
  status: retired
  satisfied-by: [page:skill/context-v2, page:agents-snippet]
  requires-tests: []          # process; verified by reading
  see: req:wf.skills
  refines: req:wf2.api
- id: req:wf2.tasks
  title: A task links intent to nodes
  when: tasks.create is called with a title, intent, links and an assignee
  then: a task row and its links (node id plus role implements, changes, resolves or reads) are stored with status proposed, and tasks.get returns it with its decisions and delta ids
  status: retired
  satisfied-by: [entity:task, entity:task-link, state:task-lifecycle, op:tasks.create, op:tasks.update, op:tasks.get]
  requires-tests: [test:server-services#task-create-with-links, test:server-services#task-status-transitions]

- id: req:wf2.tasks.replaces-delta
  title: The delta file is retired
  when: someone wants new behaviour
  then: they create a task with links to the nodes it will add or change, and approval is a status change on the task; no _deltas folder is read or written
  status: retired
  satisfied-by: [entity:task, state:task-lifecycle]
  requires-tests: []
  see: req:wf.pipeline
  resolves: [drift:waterfall.3, question:wf.approval]
  refines: req:wf2.tasks

- id: req:wf2.tasks.clerk-trigger
  title: Creating or relinking a task asks the clerk for context
  when: a task is created or its links change
  then: a clerk run is queued that returns related nodes and contradictions for the task (no delta)
  status: retired
  satisfied-by: [rule:clerk-triggers, op:clerk.run]
  requires-tests: [test:clerk#task-run-no-delta]
  refines: req:wf2.tasks
- id: req:wf2.decisions
  title: Every decision is posted, kept and attributable
  when: an agent or human calls decisions.post with title, context, options, choice, consequences and the node ids it affects
  then: an immutable decision row is stored with who made it and from which session; a later decision may name it as superseded but nothing edits it
  status: retired
  satisfied-by: [entity:decision, op:decisions.post, rule:decision-immutable]
  requires-tests: [test:server-services#decision-immutable, test:server-api#decisions-post-shape]

- id: req:wf2.decisions.sync-result
  title: The poster learns what its decision touches
  when: decisions.post is called and the clerk is enabled
  then: the call waits up to five seconds for the clerk run and returns related nodes, contradictions found and the proposed delta id; if the run is slower the call returns the decision with clerk status pending and decisions.get delivers the rest later
  status: retired
  satisfied-by: [op:decisions.post, rule:post-wait, state:decision-clerk-status]
  requires-tests: [test:server-api#decisions-post-waits, test:server-api#decisions-post-pending]
  refines: req:wf2.decisions

- id: req:wf2.decisions.adr-node
  title: A decision becomes an ADR node in the markdown
  when: the clerk maps a decision
  then: its delta creates a decision node in ADR form (date, context, options, choice, consequences) with a decision-id key pointing back at the row, in the module the affected nodes belong to
  status: retired
  satisfied-by: [rule:clerk-delta-shape, rule:question-decision-nodes]
  requires-tests: [test:clerk#decision-becomes-adr-node]
  refines: req:wf2.decisions

- id: req:wf2.decisions.timeline
  title: Decisions are browsable per project and per node
  when: decisions.list is called with a project and optionally a node or task
  then: decisions come back newest first with their clerk result, and the web app shows them as a timeline
  status: retired
  satisfied-by: [op:decisions.list, page:web/decisions]
  requires-tests: [test:server-api#decisions-list-filters]
  refines: req:wf2.decisions
- id: req:wf2.clerk
  title: An internal agent maps decisions and tasks into the graph
  when: a decision is posted, a task is created or relinked, or a human asks for a re-check
  then: a clerk run gathers context (the decision or task, a packet around the affected nodes, earlier decisions and open contradictions in the two-hop neighbourhood), proposes a delta, classifies neighbours for contradictions, and returns related nodes, findings and the delta id
  status: retired
  satisfied-by: [entity:clerk-run, op:clerk.run, rule:clerk-context, rule:clerk-tools, rule:clerk-triggers]
  requires-tests: [test:clerk#decision-run-full, test:clerk#context-assembly]

- id: req:wf2.clerk.propose-only
  title: The clerk proposes, it never writes markdown
  when: a clerk run produces changes
  then: they are stored as a graph_delta row in the ops shape (create, patch, edge, status), validated by the parser before storage, and nothing on disk changes
  status: retired
  satisfied-by: [rule:clerk-propose-only, entity:graph-delta, rule:delta-validated]
  requires-tests: [test:clerk#no-disk-write, test:server-services#delta-validated-on-store]
  refines: req:wf2.clerk

- id: req:wf2.clerk.apply
  title: A person applies or rejects a delta
  when: deltas.apply or deltas.reject is called by a human or a trusted agent
  then: apply writes every op through the writer atomically per file and records who and when; reject records the reason; a refused caller gets unauthorized
  status: retired
  satisfied-by: [op:deltas.apply, op:deltas.reject, gate:delta-apply, rule:delta-atomic]
  requires-tests: [test:server-services#delta-apply-atomic, test:server-services#delta-apply-refused-for-clerk]
  refines: req:wf2.clerk

- id: req:wf2.clerk.audit
  title: Every clerk run is auditable
  when: a run starts
  then: a clerk_run row records the trigger, input, every tool call, the output, model and token counts, and its final status
  status: retired
  satisfied-by: [entity:clerk-run, state:clerk-run-status]
  requires-tests: [test:clerk#run-recorded]
  refines: req:wf2.clerk

- id: req:wf2.clerk.budget
  title: A run cannot run away
  when: a run reaches 40 tool calls or 200k input tokens
  then: it stops with status failed and the reason budget; identical inputs (same sha256) reuse the cached result instead of calling the model
  status: retired
  satisfied-by: [rule:clerk-budget, rule:clerk-cache]
  requires-tests: [test:clerk#budget-stops-run, test:clerk#cache-hit]
  refines: req:wf2.clerk

- id: req:wf2.clerk.no-loop
  title: The clerk cannot trigger itself
  when: the clerk's tool set is assembled
  then: it contains the read tools plus propose_delta and report_contradiction only; it has no decisions.post, no shell and no file access
  status: retired
  satisfied-by: [rule:clerk-no-self-trigger, rule:clerk-tools]
  requires-tests: [test:clerk#tool-set-is-closed]
  refines: req:wf2.clerk

- id: req:wf2.clerk.retry
  title: A failed run can be retried
  when: a run fails (model error, budget, invalid delta)
  then: the decision keeps clerk status failed and the web app offers Retry, which queues a new run for the same decision
  status: retired
  satisfied-by: [state:decision-clerk-status, action:retry-clerk]
  requires-tests: [test:clerk#failed-run-retryable]
  refines: req:wf2.clerk

- id: req:wf2.clerk.on-demand
  title: A human can ask for a re-check
  when: Re-check is pressed on a module or node page
  then: a clerk run is queued with that node set as the seed and its findings appear in the contradictions list
  status: retired
  satisfied-by: [op:clerk.run, action:recheck]
  requires-tests: [test:server-api#clerk-run-on-demand]
  refines: req:wf2.clerk
- id: req:wf2.contradictions
  title: Contradictions are findings with two sides and an explicit resolution
  when: a structural or semantic contradiction is detected
  then: a contradiction row holds both sides (node ids or decision ids), a kind, an explanation and status open, and it stays open until a decision or task resolves it or a human dismisses it with a reason
  status: retired
  satisfied-by: [entity:contradiction, state:contradiction-lifecycle, op:contradictions.list]
  requires-tests: [test:server-services#contradiction-lifecycle]
  see: req:wf.describe.drift

- id: req:wf2.contradictions.structural
  title: Drift rows and contradicts edges become findings automatically
  when: a project's graph is parsed
  then: every drift node and every contradicts edge is upserted as a structural contradiction keyed by project and both sides, so re-parsing never duplicates one and removing the row from markdown closes it
  status: retired
  satisfied-by: [rule:structural-import]
  requires-tests: [test:server-services#structural-import-idempotent]
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.semantic
  title: Two things that say different things about the same behaviour are flagged
  when: a clerk run examines the two-hop neighbourhood of the affected nodes
  then: each rule, requirement or earlier decision there is classified as consistent, refines, duplicate or contradicts with a one-sentence explanation, and contradicts and duplicate verdicts become semantic findings
  status: retired
  satisfied-by: [rule:clerk-classify, value:pair-verdict]
  requires-tests: [test:clerk#classification-fixtures]
  see: req:wf.lint.semantic-drift
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.resolve
  title: Resolution is explicit and attributed
  when: contradictions.resolve is called with a decision or task, or contradictions.dismiss with a reason
  then: the row moves to resolved or dismissed with the resolver recorded; a dismiss without a reason is refused
  status: retired
  satisfied-by: [op:contradictions.resolve, op:contradictions.dismiss, state:contradiction-lifecycle]
  requires-tests: [test:server-services#dismiss-needs-reason]
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.strict
  title: Strict check fails on an open contradiction touching shipped work
  when: graph.check runs with strict and an open contradiction has a shipped node on either side
  then: it is an error and the check exits non-zero
  status: retired
  satisfied-by: [rule:strict-open-contradiction, op:graph.check, flag:strict]
  requires-tests: [test:core-check#strict-open-contradiction]
  note: the YesSensei pilot has 17 open drift rows and goes red under this rule until they are triaged (drift:wf2.6)
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.decision-vs-rule
  title: A decision can contradict a rule
  when: the clerk finds a posted decision at odds with a rule or an earlier decision
  then: the finding's sides may be a node id and a decision id, and the UI shows both with their text
  status: retired
  satisfied-by: [rule:side-ids, entity:contradiction]
  requires-tests: [test:clerk#decision-vs-rule-finding]
  refines: req:wf2.contradictions
- id: req:wf2.cli
  title: ctx keeps every command and talks to the server when it can
  when: a ctx command runs
  then: it calls the server at the configured localhost port when reachable and otherwise runs the core library on the local files, with identical output
  status: retired
  satisfied-by: [rule:cli-fallback, op:ctx.build, op:ctx.get, op:ctx.packet, op:ctx.check]
  requires-tests: [test:cli#server-and-local-identical]
  see: req:wf.query
```
