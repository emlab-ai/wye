---
node: module:wf2-prd
type: module
title: Waterfall v2 — PRD
status: proposed
owner: alex
last-verified: 2026-09-14
verified-against: docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
source-roots: [., packages/core, packages/server, packages/web, packages/cli, skills]
sources:
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
  - docs/context-graph/project.md
---

# Waterfall v2 — PRD (requirements)

Every behaviour of v2 as a `req:` node: **when** trigger, **then** observable outcome, **unless** exception. Ids are
dotted paths under `req:wf2.<capability>`; `refines` gives the tree. All are `proposed`. `satisfied-by` names the
mechanism the dev design intends; `requires-tests` names the test node in the test design that must make it real.
`see` links the v0.1 requirement a v2 requirement carries forward; `resolves` closes a v0.1 question or drift row.

---

## 0. module:wf2-prd

```yaml
id: module:wf2-prd
purpose: The product requirements of Waterfall v2, one node per behaviour, grouped by capability.
part-of: module:wf2
submodules: [store, serve, write, api, tasks, decisions, clerk, contradictions, ui, cli, self]
```

---

## R. Requirements (behaviour)

### Flags referenced by requirements

```yaml
- id: flag:strict
  scope: cli / api          # graph.check strict=true; ctx check --strict
  source: packages/core/src/check.ts
  description: turns shipped-without-test, unresolvable source path, and open-contradiction-on-shipped-node from warnings into errors
- id: flag:clerk-model
  scope: server config      # WATERFALL_CLERK_MODEL, default claude-sonnet-5
  source: packages/server/src/config.ts
- id: flag:live-clerk
  scope: test               # WATERFALL_LIVE=1 enables the one live clerk smoke test
  source: packages/server/test/clerk.live.test.ts
- id: flag:trusted-agents
  scope: server config      # list of agent names allowed through gate:delta-apply
  source: packages/server/src/config.ts
```

### R.1 Store — artifacts in markdown, the churn stream in a database

```yaml
- id: req:wf2.store
  title: Artifacts stay in markdown; tasks, decisions and contradictions get a database
  when: a project (a local repo with a docs/context-graph folder) is registered with the server
  then: its markdown files are parsed into the artifact graph exactly as v0.1 does, and tasks, decisions, contradictions, deltas, clerk runs and agent sessions are stored in SQLite keyed to node ids; no table duplicates a node body
  status: proposed
  satisfied-by: [entity:project, entity:task, entity:decision, entity:contradiction, entity:graph-delta, entity:clerk-run, entity:agent-session, rule:markdown-canonical]
  requires-tests: [test:server-services#register-project, test:server-services#no-body-duplication]

- id: req:wf2.store.products
  title: A product holds projects and goals, each a set of pages
  when: a product is created in the app
  then: it is a folder in Waterfall's data (data/products/<slug>), projects and goals are folders under it with their pages in docs/, an inbox receives dropped notes and files, and one graph per product is the product's knowledge; the rail switches products and lists projects with their pages
  status: unverified
  note: shipped 2026-09-15 (decision:wf2.product-model); create product, project and page from the UI or the API
  satisfied-by: [entity:product, op:projects.list, op:projects.register]
  requires-tests: [test:server-services#product-groups-projects]
  refines: req:wf2.store

- id: req:wf2.store.hosting-ready
  title: The schema is ready for hosting without using it
  when: any row is written locally
  then: it carries tenant_id and created_by (a fixed local value), and agent_session carries a token_hash that is never checked locally, so moving to Postgres and enforcing tokens later adds no columns
  status: proposed
  satisfied-by: [rule:hosting-columns, gate:agent-token, entity:agent-session]
  requires-tests: [test:server-services#hosting-columns-present]
  refines: req:wf2.store

- id: req:wf2.store.first-class-questions
  title: Questions and decisions are real nodes
  when: an author writes a question or an ADR into a module file
  then: it is a yaml node with an id (question:<mod>.<slug>, decision:<mod>.<slug>) that tasks and deltas can resolve or govern, and the template has a section for each
  status: proposed
  satisfied-by: [rule:question-decision-nodes, entity:module-doc]
  requires-tests: [test:core-parser#question-and-decision-nodes]
  resolves: [question:wf.questions-as-nodes]
  refines: req:wf2.store
```

### R.2 Serve — one process, many local repos

```yaml
- id: req:wf2.serve
  title: One local process serves every registered repo
  when: waterfall serve starts
  then: it loads the registered projects, parses each graph into memory, watches their files, and serves the HTTP API, the MCP endpoint, the SSE stream and the web app on localhost
  status: proposed
  satisfied-by: [op:serve, entity:graph-registry, rule:watcher-debounce]
  requires-tests: [test:server-api#serve-starts-with-two-projects]

- id: req:wf2.serve.live
  title: A file change is visible within a second
  when: a file under a project's graph path changes on disk
  then: the project's graph is re-parsed, structural contradictions are upserted, and a graph.changed event is emitted over SSE
  status: proposed
  satisfied-by: [rule:watcher-debounce, rule:structural-import, op:events.subscribe]
  requires-tests: [test:server-services#watch-reparse, ui-test:edit-node-flow]
  refines: req:wf2.serve

- id: req:wf2.serve.last-good
  title: A broken file never takes the graph down
  when: a changed file fails to parse
  then: the last good graph keeps serving and a graph.parse_error event carries the file and line
  status: proposed
  satisfied-by: [rule:last-good-graph]
  requires-tests: [test:server-services#parse-error-keeps-last-good]
  refines: req:wf2.serve

- id: req:wf2.serve.config-print
  title: Connecting an agent is copy and paste
  when: the server starts
  then: it prints a ready-to-run `claude mcp add` command and a `[mcp_servers.waterfall]` TOML block for Codex, for both the stdio command and the HTTP url
  status: proposed
  satisfied-by: [op:serve, rule:config-print]
  requires-tests: [test:server-api#config-print]
  refines: req:wf2.serve
```

### R.3 Write — edit a node without touching the rest of the file

```yaml
- id: req:wf2.write
  title: A node can be edited in place
  when: graph.patch is called with a new body, status or edges and the caller's last-seen hash
  then: only that node's yaml block is rewritten; surrounding text, comments and other nodes are byte-identical; the new hash is returned
  status: proposed
  satisfied-by: [op:graph.patch, rule:patch-in-place, rule:edge-serialisation]
  requires-tests: [test:core-writer#patch-body, test:core-writer#patch-preserves-neighbours]

- id: req:wf2.write.create
  title: A new node lands in the right section
  when: graph.create is called with a module, kind, slug and body
  then: a yaml block is appended under the section the schema maps that kind to, creating the heading if the file lacks it, and the id and hash are returned
  status: proposed
  satisfied-by: [op:graph.create, rule:section-map]
  requires-tests: [test:core-writer#create-in-section, test:core-writer#create-adds-heading]
  refines: req:wf2.write

- id: req:wf2.write.conflict
  title: A stale write is refused
  when: the ifMatch hash differs from the node's current body hash
  then: nothing is written and the caller receives a conflict error with the current body and hash
  status: proposed
  satisfied-by: [rule:if-match, value:error-code]
  requires-tests: [test:core-writer#conflict]
  refines: req:wf2.write

- id: req:wf2.write.validated
  title: A write that would break the graph never reaches disk
  when: the patched file is re-parsed in memory before writing
  then: a parse error or a lint error rejects the write with the lint output; edges to ids nobody describes yet are allowed and returned as warnings
  status: proposed
  satisfied-by: [rule:validate-before-write, rule:stub-targets-warn]
  requires-tests: [test:core-writer#reject-parse-error, test:core-writer#reject-lint-error, test:core-writer#stub-target-warns]
  refines: req:wf2.write

- id: req:wf2.write.atomic
  title: Files are never half-written and writes never race
  when: two writes target the same file
  then: they are serialised through a per-file queue and each is written to a temp file and renamed, so a reader sees either the old or the new file
  status: proposed
  satisfied-by: [rule:atomic-file-write, rule:per-file-queue]
  requires-tests: [test:core-writer#concurrent-writes-serialised]
  refines: req:wf2.write

- id: req:wf2.write.single-path
  title: The file is the only way into the graph
  when: the UI, an agent, or a delta changes a node
  then: it goes through the writer and the file; the in-memory graph updates only via the watcher, so there is one write path and no private view model
  status: proposed
  satisfied-by: [rule:markdown-canonical]
  requires-tests: [test:server-services#ui-write-is-file-write]
  refines: req:wf2.write

- id: req:wf2.write.round-trip
  title: A write changes nothing but what it says
  when: a file is parsed, patched and parsed again
  then: the second graph equals the first plus exactly the requested change
  status: proposed
  satisfied-by: [rule:patch-in-place]
  requires-tests: [test:core-writer#round-trip-stability]
  refines: req:wf2.write
```

### R.4 API — one tool set, exposed twice

```yaml
- id: req:wf2.api
  title: Agents and the UI use one tool set over MCP and HTTP
  when: a caller invokes a tool by name
  then: the same name and argument shape work as an MCP tool (stdio or Streamable HTTP) and as POST /api/v1/<name>, and both return the same result and error shapes
  status: proposed
  satisfied-by: [rule:one-tool-set, op:graph.get, op:graph.patch, op:decisions.post]
  requires-tests: [test:server-api#same-cases-http-and-mcp]
  see: req:wf.skills.mcp

- id: req:wf2.api.read
  title: Every v0.1 query is available remotely
  when: an agent needs product context
  then: graph.get, graph.neighbors, graph.impact, graph.search, graph.reqs, graph.packet and graph.check answer for any registered project with the same semantics as the ctx commands
  status: proposed
  satisfied-by: [op:graph.get, op:graph.neighbors, op:graph.impact, op:graph.search, op:graph.reqs, op:graph.packet, op:graph.check]
  requires-tests: [test:server-api#read-tools-match-cli]
  see: req:wf.query
  refines: req:wf2.api

- id: req:wf2.api.packet-task
  title: A packet for a task includes its decisions and contradictions
  when: graph.packet is given a task id instead of text
  then: the task's linked nodes seed the slice and open decisions and contradictions touching them are appended after the nodes
  status: proposed
  satisfied-by: [op:graph.packet, rule:packet-task-seeds]
  requires-tests: [test:server-services#packet-from-task]
  see: req:wf.query.packet
  refines: req:wf2.api

- id: req:wf2.api.errors
  title: Errors have one shape everywhere
  when: a call fails
  then: the result is {error, message, details?} with error in conflict, invalid_patch, not_found, lint_failed, unauthorized; HTTP maps them to 409, 422, 404, 422, 401
  status: proposed
  satisfied-by: [rule:error-shape, value:error-code]
  requires-tests: [test:server-api#error-shape]
  refines: req:wf2.api

- id: req:wf2.api.identity
  title: Every caller has a name
  when: a call arrives with an X-Agent header or MCP client info
  then: an agent_session is created or touched and every row the call writes records that name in created_by
  unless: the header is missing, in which case the name is anonymous and the call still succeeds locally
  status: proposed
  satisfied-by: [entity:agent-session, gate:agent-token, rule:created-by]
  requires-tests: [test:server-api#agent-header-recorded]
  refines: req:wf2.api

- id: req:wf2.api.project-scope
  title: Every call names its project
  when: a tool is called
  then: it takes project as an id or name and refuses with not_found when the project is not registered
  status: proposed
  satisfied-by: [rule:project-scoped]
  requires-tests: [test:server-api#unknown-project]
  refines: req:wf2.api

- id: req:wf2.api.skills
  title: Agents are told the contract in their own config
  when: an agent starts work in a registered repo
  then: the rewritten skills name the tools (packet before code, post every decision, patch before shipping, check before done) and a CLAUDE.md / AGENTS.md snippet states the same in one paragraph
  status: proposed
  satisfied-by: [page:skill/context-v2, page:agents-snippet]
  requires-tests: []          # process; verified by reading
  see: req:wf.skills
  refines: req:wf2.api
```

### R.5 Tasks — the unit of intent

```yaml
- id: req:wf2.tasks
  title: A task links intent to nodes
  when: tasks.create is called with a title, intent, links and an assignee
  then: a task row and its links (node id plus role implements, changes, resolves or reads) are stored with status proposed, and tasks.get returns it with its decisions and delta ids
  status: proposed
  satisfied-by: [entity:task, entity:task-link, state:task-lifecycle, op:tasks.create, op:tasks.update, op:tasks.get]
  requires-tests: [test:server-services#task-create-with-links, test:server-services#task-status-transitions]

- id: req:wf2.tasks.replaces-delta
  title: The delta file is retired
  when: someone wants new behaviour
  then: they create a task with links to the nodes it will add or change, and approval is a status change on the task; no _deltas folder is read or written
  status: proposed
  satisfied-by: [entity:task, state:task-lifecycle]
  requires-tests: []
  see: req:wf.pipeline
  resolves: [drift:waterfall.3, question:wf.approval]
  refines: req:wf2.tasks

- id: req:wf2.tasks.clerk-trigger
  title: Creating or relinking a task asks the clerk for context
  when: a task is created or its links change
  then: a clerk run is queued that returns related nodes and contradictions for the task (no delta)
  status: proposed
  satisfied-by: [rule:clerk-triggers, op:clerk.run]
  requires-tests: [test:clerk#task-run-no-delta]
  refines: req:wf2.tasks
```

### R.6 Decisions — post every one, keep every one

```yaml
- id: req:wf2.decisions
  title: Every decision is posted, kept and attributable
  when: an agent or human calls decisions.post with title, context, options, choice, consequences and the node ids it affects
  then: an immutable decision row is stored with who made it and from which session; a later decision may name it as superseded but nothing edits it
  status: proposed
  satisfied-by: [entity:decision, op:decisions.post, rule:decision-immutable]
  requires-tests: [test:server-services#decision-immutable, test:server-api#decisions-post-shape]

- id: req:wf2.decisions.sync-result
  title: The poster learns what its decision touches
  when: decisions.post is called and the clerk is enabled
  then: the call waits up to five seconds for the clerk run and returns related nodes, contradictions found and the proposed delta id; if the run is slower the call returns the decision with clerk status pending and decisions.get delivers the rest later
  status: proposed
  satisfied-by: [op:decisions.post, rule:post-wait, state:decision-clerk-status]
  requires-tests: [test:server-api#decisions-post-waits, test:server-api#decisions-post-pending]
  refines: req:wf2.decisions

- id: req:wf2.decisions.adr-node
  title: A decision becomes an ADR node in the markdown
  when: the clerk maps a decision
  then: its delta creates a decision node in ADR form (date, context, options, choice, consequences) with a decision-id key pointing back at the row, in the module the affected nodes belong to
  status: proposed
  satisfied-by: [rule:clerk-delta-shape, rule:question-decision-nodes]
  requires-tests: [test:clerk#decision-becomes-adr-node]
  refines: req:wf2.decisions

- id: req:wf2.decisions.timeline
  title: Decisions are browsable per project and per node
  when: decisions.list is called with a project and optionally a node or task
  then: decisions come back newest first with their clerk result, and the web app shows them as a timeline
  status: proposed
  satisfied-by: [op:decisions.list, page:web/decisions]
  requires-tests: [test:server-api#decisions-list-filters]
  refines: req:wf2.decisions
```

### R.7 The clerk — an internal agent that keeps the graph honest

```yaml
- id: req:wf2.clerk
  title: An internal agent maps decisions and tasks into the graph
  when: a decision is posted, a task is created or relinked, or a human asks for a re-check
  then: a clerk run gathers context (the decision or task, a packet around the affected nodes, earlier decisions and open contradictions in the two-hop neighbourhood), proposes a delta, classifies neighbours for contradictions, and returns related nodes, findings and the delta id
  status: proposed
  satisfied-by: [entity:clerk-run, op:clerk.run, rule:clerk-context, rule:clerk-tools, rule:clerk-triggers]
  requires-tests: [test:clerk#decision-run-full, test:clerk#context-assembly]

- id: req:wf2.clerk.propose-only
  title: The clerk proposes, it never writes markdown
  when: a clerk run produces changes
  then: they are stored as a graph_delta row in the ops shape (create, patch, edge, status), validated by the parser before storage, and nothing on disk changes
  status: proposed
  satisfied-by: [rule:clerk-propose-only, entity:graph-delta, rule:delta-validated]
  requires-tests: [test:clerk#no-disk-write, test:server-services#delta-validated-on-store]
  refines: req:wf2.clerk

- id: req:wf2.clerk.apply
  title: A person applies or rejects a delta
  when: deltas.apply or deltas.reject is called by a human or a trusted agent
  then: apply writes every op through the writer atomically per file and records who and when; reject records the reason; a refused caller gets unauthorized
  status: proposed
  satisfied-by: [op:deltas.apply, op:deltas.reject, gate:delta-apply, rule:delta-atomic]
  requires-tests: [test:server-services#delta-apply-atomic, test:server-services#delta-apply-refused-for-clerk]
  refines: req:wf2.clerk

- id: req:wf2.clerk.audit
  title: Every clerk run is auditable
  when: a run starts
  then: a clerk_run row records the trigger, input, every tool call, the output, model and token counts, and its final status
  status: proposed
  satisfied-by: [entity:clerk-run, state:clerk-run-status]
  requires-tests: [test:clerk#run-recorded]
  refines: req:wf2.clerk

- id: req:wf2.clerk.budget
  title: A run cannot run away
  when: a run reaches 40 tool calls or 200k input tokens
  then: it stops with status failed and the reason budget; identical inputs (same sha256) reuse the cached result instead of calling the model
  status: proposed
  satisfied-by: [rule:clerk-budget, rule:clerk-cache]
  requires-tests: [test:clerk#budget-stops-run, test:clerk#cache-hit]
  refines: req:wf2.clerk

- id: req:wf2.clerk.no-loop
  title: The clerk cannot trigger itself
  when: the clerk's tool set is assembled
  then: it contains the read tools plus propose_delta and report_contradiction only; it has no decisions.post, no shell and no file access
  status: proposed
  satisfied-by: [rule:clerk-no-self-trigger, rule:clerk-tools]
  requires-tests: [test:clerk#tool-set-is-closed]
  refines: req:wf2.clerk

- id: req:wf2.clerk.retry
  title: A failed run can be retried
  when: a run fails (model error, budget, invalid delta)
  then: the decision keeps clerk status failed and the web app offers Retry, which queues a new run for the same decision
  status: proposed
  satisfied-by: [state:decision-clerk-status, action:retry-clerk]
  requires-tests: [test:clerk#failed-run-retryable]
  refines: req:wf2.clerk

- id: req:wf2.clerk.on-demand
  title: A human can ask for a re-check
  when: Re-check is pressed on a module or node page
  then: a clerk run is queued with that node set as the seed and its findings appear in the contradictions list
  status: proposed
  satisfied-by: [op:clerk.run, action:recheck]
  requires-tests: [test:server-api#clerk-run-on-demand]
  refines: req:wf2.clerk
```

### R.8 Contradictions — found, shown, resolved explicitly

```yaml
- id: req:wf2.contradictions
  title: Contradictions are findings with two sides and an explicit resolution
  when: a structural or semantic contradiction is detected
  then: a contradiction row holds both sides (node ids or decision ids), a kind, an explanation and status open, and it stays open until a decision or task resolves it or a human dismisses it with a reason
  status: proposed
  satisfied-by: [entity:contradiction, state:contradiction-lifecycle, op:contradictions.list]
  requires-tests: [test:server-services#contradiction-lifecycle]
  see: req:wf.describe.drift

- id: req:wf2.contradictions.structural
  title: Drift rows and contradicts edges become findings automatically
  when: a project's graph is parsed
  then: every drift node and every contradicts edge is upserted as a structural contradiction keyed by project and both sides, so re-parsing never duplicates one and removing the row from markdown closes it
  status: proposed
  satisfied-by: [rule:structural-import]
  requires-tests: [test:server-services#structural-import-idempotent]
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.semantic
  title: Two things that say different things about the same behaviour are flagged
  when: a clerk run examines the two-hop neighbourhood of the affected nodes
  then: each rule, requirement or earlier decision there is classified as consistent, refines, duplicate or contradicts with a one-sentence explanation, and contradicts and duplicate verdicts become semantic findings
  status: proposed
  satisfied-by: [rule:clerk-classify, value:pair-verdict]
  requires-tests: [test:clerk#classification-fixtures]
  see: req:wf.lint.semantic-drift
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.resolve
  title: Resolution is explicit and attributed
  when: contradictions.resolve is called with a decision or task, or contradictions.dismiss with a reason
  then: the row moves to resolved or dismissed with the resolver recorded; a dismiss without a reason is refused
  status: proposed
  satisfied-by: [op:contradictions.resolve, op:contradictions.dismiss, state:contradiction-lifecycle]
  requires-tests: [test:server-services#dismiss-needs-reason]
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.strict
  title: Strict check fails on an open contradiction touching shipped work
  when: graph.check runs with strict and an open contradiction has a shipped node on either side
  then: it is an error and the check exits non-zero
  status: proposed
  satisfied-by: [rule:strict-open-contradiction, op:graph.check, flag:strict]
  requires-tests: [test:core-check#strict-open-contradiction]
  note: the YesSensei pilot has 17 open drift rows and goes red under this rule until they are triaged (drift:wf2.6)
  refines: req:wf2.contradictions

- id: req:wf2.contradictions.decision-vs-rule
  title: A decision can contradict a rule
  when: the clerk finds a posted decision at odds with a rule or an earlier decision
  then: the finding's sides may be a node id and a decision id, and the UI shows both with their text
  status: proposed
  satisfied-by: [rule:side-ids, entity:contradiction]
  requires-tests: [test:clerk#decision-vs-rule-finding]
  refines: req:wf2.contradictions
```

### R.9 Web UI — Notion-style pages and an editable mind map

```yaml
- id: req:wf2.ui
  title: The product opens on its documents
  when: the web app opens a project
  then: it lands on the project's main document; the left rail lists the documents as a tree with the open document's outline; every view has a URL (/p/<project>/d/<doc>#n-<id>, /p/<project>/graph?focus=<id>) that reopens it
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/sidebar, page:web/node, rule:deep-links]
  requires-tests: [test:web-components#sidebar-tree, ui-test:deep-link]
  see: req:wf.view

- id: req:wf2.ui.sidebar
  title: The rail finds anything
  when: the user types in the rail search or opens the tree
  then: hits list documents, headings and nodes (a node hit opens its definition); the tree shows documents, not nodes; Tasks, Decisions and Contradictions sit above the tree with open counts
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/sidebar, op:graph.search]
  requires-tests: [test:web-components#sidebar-search]
  refines: req:wf2.ui

- id: req:wf2.ui.node-page
  title: A document is one editable page where any block can be a typed node and any word can link to anything
  when: a document is opened
  then: it is a single editor; prose, headings, lists, tables and code are ordinary blocks; each node is a typed block with kind, slug and status; a paragraph that starts with an id (`req:<slug> When …`) becomes a requirement; any phrase can be linked to any node and the graph records the relation (verb inferred from the words before it, else related-to); every id is a tag whose click opens a peek panel with the node's card, relations and Go to definition
  status: unverified
  note: single-page editor shipped 2026-09-14 (packages/web); pure modules tested, pages verified in the browser; server-backed data pending
  satisfied-by: [page:web/node, rule:single-page-editor, rule:prose-nodes, rule:todo-tasks, rule:doc-links, rule:mention-menu, rule:smart-tags, rule:node-cards]
  requires-tests: [test:web-components#node-page-properties, test:web-components#node-page-prose-editor]
  see: req:wf.view.sheet
  refines: req:wf2.ui

- id: req:wf2.ui.node-page.save
  title: Editing happens in place and saves with a hash
  when: the user types in a prose section, a card field or a document property, or adds a card or a document from a template
  then: there is no edit mode or save button; the change is written shortly after typing stops to exactly that span of the markdown file with the span's hash as ifMatch; a stale hash is refused and the user is told to reload; after every save the graph is rebuilt and the page, outline and search reflect it
  status: unverified
  note: shipped 2026-09-14 in packages/web through the doc API (rule:segment-write); agents will use graph.patch on the server instead
  satisfied-by: [page:web/node, rule:segment-write, rule:prose-round-trip, op:graph.patch, rule:if-match]
  requires-tests: [ui-test:edit-node-flow, test:web-components#conflict-diff]
  refines: req:wf2.ui.node-page

- id: req:wf2.ui.graph
  title: The graph is a mind map around a focus
  when: the graph view opens with a focus node
  then: the focus sits in the centre with refines and has edges laid out as a tree and other structural verbs as cross-links; mentions are hidden; presets Requirements, Mechanics, Data, Drift and Everything change the visible set; click opens the node page in a side panel and double-click re-centres
  status: unverified
  note: read-only first slice shipped 2026-09-14 (packages/web); no automated page test yet, server-backed data and editing pending
  satisfied-by: [page:web/graph, rule:mindmap-layout, rule:graph-presets]
  requires-tests: [test:web-components#graph-layout, test:web-components#graph-presets]
  see: req:wf.view.graph
  refines: req:wf2.ui

- id: req:wf2.ui.graph-edit
  title: The mind map is editable
  when: the user drags from one node's handle to another, deletes a selected edge, renames a node inline, or chooses Add child
  then: the change is sent through graph.patch or graph.create (an edge drag asks for the verb) and appears only after the file changes and the SSE event arrives
  status: proposed
  satisfied-by: [page:web/graph, action:drag-edge, action:delete-edge, action:rename-node, action:add-child]
  requires-tests: [test:web-components#graph-edit-calls-api, ui-test:graph-edit]
  refines: req:wf2.ui.graph

- id: req:wf2.ui.tasks
  title: Tasks are a board
  when: the Tasks entry opens
  then: tasks show as columns by status; opening one shows its links, packet, decisions and deltas
  status: proposed
  satisfied-by: [page:web/tasks, op:tasks.list, op:graph.packet]
  requires-tests: [test:web-components#task-board]
  refines: req:wf2.ui

- id: req:wf2.ui.decisions
  title: Decisions are a timeline with apply and reject
  when: the Decisions entry opens
  then: decisions list newest first, filterable by node; each card shows the clerk result and its delta with Apply and Reject and a markdown diff of what apply would change
  status: proposed
  satisfied-by: [page:web/decisions, op:decisions.list, op:deltas.apply, op:deltas.reject]
  requires-tests: [test:web-components#decision-card-diff]
  refines: req:wf2.ui

- id: req:wf2.ui.contradictions
  title: Open findings are one list
  when: the Contradictions entry opens
  then: open findings show both sides with their text and the explanation; Resolve asks for a decision or task, Dismiss asks for a reason
  status: proposed
  satisfied-by: [page:web/contradictions, op:contradictions.list, op:contradictions.resolve, op:contradictions.dismiss]
  requires-tests: [test:web-components#contradiction-actions]
  refines: req:wf2.ui

- id: req:wf2.ui.live
  title: What an agent changes appears while you look
  when: the server emits graph.changed or a task, decision or contradiction event
  then: the open views refresh the affected node, list or graph without a reload
  status: proposed
  satisfied-by: [rule:sse-refresh, op:events.subscribe]
  requires-tests: [ui-test:edit-node-flow]
  refines: req:wf2.ui

- id: req:wf2.ui.phone
  title: It still works on a phone
  when: the viewport is 400px wide
  then: the sidebar becomes the first screen and pages and the graph open full screen, as the v0.1 viewer does
  status: proposed
  satisfied-by: [page:web/sidebar, page:web/graph]
  requires-tests: [ui-test:phone-layout]
  see: req:wf.view
  refines: req:wf2.ui
```

#### Images for agents (2026-09-17)

```yaml
- id: req:wf2.ui.annotate-images
  title: A person annotates an image and an agent understands the annotation
  when: a person chooses Annotate image on an image in a document, draws boxes, labels and arrows over it and saves
  then: >
    the document shows the annotated image; an agent that receives the block (wf resolve, ⇢ send, ask) gets the
    annotations as text — labelled regions with their position on the image, arrows from one region to another, free
    labels — and the path of a rendered PNG it can look at
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:image-annotations, rule:drawings]
  verified-by: [test:annotations-web]
- id: decision:wf2.annotations-text-and-png
  title: An annotated image reaches the agent as text and as a rendered picture
  context: >
    Agents read words; some can also see images. A drawing over a screenshot means nothing to an agent unless it is
    translated, and a translation alone loses what the picture shows.
  choice: >
    Both: the scene is described as text (regions, arrows, labels, positions in percent of the image) and flattened
    to a PNG; wf resolve gives the text and names the PNG. The image is embedded in the Excalidraw scene as a locked
    element so the scene is self-contained.
  alternatives: >
    Text only — loses the picture; PNG only — an agent without vision gets nothing and one with vision guesses at
    labels; a separate annotation format instead of Excalidraw — a second drawing tool.
  consequences: rule:image-annotations; scene files grow by the image's size; the description is derived, never edited.
  status: proposed
  date: 2026-09-17
  related-to: [module:wf2-prd, rule:drawings]
  session: 94ac3cf3e0
```

#### Sessions console (2026-09-17)

```yaml
- id: req:wf2.sessions.questions
  title: The agent's questions reach the person and the answer reaches the agent
  when: an agent in a chat session asks the person a question (Claude Code's AskUserQuestion)
  then: >
    the console shows a question card with the options as choices (multi-select, Other…, text or number kinds), the
    session visibly waits, and Answer returns exactly the chosen labels to the agent so its next step uses them
  unless: the person chooses Skip, in which case the agent is told there was no answer
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:agent-questions]
- id: req:wf2.sessions.quiet-console
  title: The console reads as a conversation, not a tool log
  when: a turn makes several tool calls between two messages
  then: >
    they fold into one collapsed row that names how many steps, how long, how many errors and the latest step, and
    opens on click; messages, questions, permission cards and turn ends are never folded
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:console-flow]
- id: req:wf2.sessions.summary-in-flow
  title: A session's summary and progress notes are part of its conversation
  when: an agent writes `wf session log` lines or ends with `wf session done <summary>`
  then: the console shows them in the conversation at the time they were written; a chat session has no separate Result panel
  status: proposed
  refines: req:wf2.ui
  satisfied-by: [rule:console-flow]
- id: decision:wf2.agent-questions-are-forms
  title: Agent questions are answered by the person in the console; permissions are never auto-answered
  context: >
    Claude Code's AskUserQuestion arrives over the stdio permission channel like any tool permission. The console
    showed it as a JSON permission with Allow/Deny; Allow returned the input unchanged, so the agent read "the user
    did not answer" while the console said "answered", and the agent went on with its own assumption.
  choice: >
    Render AskUserQuestion as a form and return the chosen labels in the tool input's `answers`; render other
    permissions as a tool + intent card. The host never answers a permission on its own.
  alternatives: >
    Auto-allow AskUserQuestion with an empty answer (what happened, by accident); make the agent avoid questions in
    sessions (loses the clarifications the contract wants); a separate questions inbox (the question belongs where
    the conversation is).
  consequences: rule:agent-questions; req:wf2.sessions.questions; the agent prompt can keep using AskUserQuestion.
  status: proposed
  date: 2026-09-17
  related-to: [rule:agent-host, module:wf2-prd]
  session: 94ac3cf3e0
```

### R.10 CLI — ctx becomes a client

```yaml
- id: req:wf2.cli
  title: ctx keeps every command and talks to the server when it can
  when: a ctx command runs
  then: it calls the server at the configured localhost port when reachable and otherwise runs the core library on the local files, with identical output
  status: proposed
  satisfied-by: [rule:cli-fallback, op:ctx.build, op:ctx.get, op:ctx.packet, op:ctx.check]
  requires-tests: [test:cli#server-and-local-identical]
  see: req:wf.query
```

### R.11 Delivery — waterfall through its own pipeline

```yaml
- id: req:wf2.self
  title: v2 is built through its own graph
  when: a v2 requirement is implemented
  then: it flips from proposed to shipped in this graph with real sources and a verified-by test, and graph.check strict runs in CI on every PR
  status: proposed
  satisfied-by: [entity:module-doc, flag:strict]
  requires-tests: []
  see: req:wf.self

- id: req:wf2.self.phases
  title: Three phases, each with an exit criterion in this PRD
  when: a phase is planned
  then: its plan names the requirement ids it ships (phase 1 store, serve, write, api, tasks, decisions, cli; phase 2 ui and structural contradictions; phase 3 clerk and semantic contradictions) and the phase closes when they are shipped and strict check is green
  status: proposed
  requires-tests: []
  refines: req:wf2.self

- id: req:wf2.self.fixture
  title: A fresh checkout tests something
  when: the test suite runs without the YesSensei repo present
  then: an in-repo fixture (a trimmed copy of the inventory pilot) drives the parser, writer and check tests, so the suite never exits green with zero assertions
  status: proposed
  satisfied-by: [test:core-parser]
  requires-tests: [test:core-parser#fixture-present]
  resolves: [drift:waterfall.7]
  refines: req:wf2.self
```
