---
node: module:wf2-dev
type: module
title: Waterfall v2 — dev design, 2026-09-14 (retired)
status: retired
owner: alex
last-verified: 2026-09-14
verified-against: docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
source-roots: [., packages/core, packages/server, packages/web, packages/cli, skills]
sources:
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
  - docs/context-graph/prd.md
part-of: module:archive
order: 94
---

# Waterfall v2 — dev design

The mechanisms that satisfy the PRD: entities (DB tables and in-memory types), value objects, state machines, operations (the tool set exposed over MCP and HTTP), pages (the web app and the agent-facing documents) and rules (what the code will enforce). Every `source:` is the intended file; `ctx check --strict` fails until it exists.

---

## 0. module:wf2-dev

---

## 1. Entities

### DB tables (SQLite via Drizzle; every table has id, tenantId, createdBy, createdAt, updatedAt — rule:hosting-columns)

### entity:project

### entity:task-link

### entity:task

### entity:decision

### entity:contradiction

### entity:graph-delta

### entity:clerk-run

### entity:agent-session

### In-memory types (packages/core and packages/server)

### entity:graph-registry

### entity:node-patch

### entity:packet

---

## 2. Value objects and enums

| id | source | values |
|---|---|---|
| value:task-status | packages/server/src/db/schema.ts#taskStatus | proposed, approved, in-progress, done, abandoned |
| value:task-link-role | packages/server/src/db/schema.ts#taskLinkRole | implements, changes, resolves, reads |
| value:assignee-kind | packages/server/src/db/schema.ts#assigneeKind | human, agent |
| value:agent-kind | packages/server/src/db/schema.ts#agentKind | claude-code, codex, internal, other |
| value:clerk-status | packages/server/src/db/schema.ts#clerkStatus | pending, done, failed, skipped |
| value:clerk-run-status | packages/server/src/db/schema.ts#clerkRunStatus | running, done, failed |
| value:clerk-trigger | packages/server/src/db/schema.ts#clerkTrigger | decision, task, on-demand |
| value:contradiction-kind | packages/server/src/db/schema.ts#contradictionKind | structural, semantic |
| value:contradiction-status | packages/server/src/db/schema.ts#contradictionStatus | open, resolved, dismissed |
| value:delta-status | packages/server/src/db/schema.ts#deltaStatus | proposed, applied, rejected |
| value:delta-op | packages/core/src/writer.ts#DeltaOp | create {module, kind, slug, body}, patch {id, body, ifMatch}, edge {from, verb, to, remove}, status {id, status} |
| value:pair-verdict | packages/server/src/clerk/classify.ts#Verdict | consistent, refines, duplicate, contradicts |
| value:error-code | packages/server/src/errors.ts#ErrorCode | conflict (409), invalid_patch (422), not_found (404), lint_failed (422), unauthorized (401) |
| value:sse-event | packages/server/src/events.ts#EventKind | graph.changed, graph.parse_error, task.changed, decision.changed, contradiction.changed, delta.changed |
| value:prose-key | packages/web/src/lib/graph.ts#PROSE_KEYS | purpose, note, notes, statement, description, context, consequences, intent, q |

---

## 3. State machines

---

## 4. Operations (the tool set — same names over MCP and HTTP, rule:one-tool-set)

| op | args | does | gate | source |
|---|---|---|---|---|
| op:serve | --port, --db | start the server: load projects, parse, watch, serve HTTP, MCP, SSE and the web app; print agent config (rule:config-print) | – | packages/server/src/main.ts |
| op:projects.list | – | products with their projects and parse status | – | packages/server/src/tools/projects.ts#list |
| op:projects.register | product, name, rootPath, graphPath? | add a project and parse it | gate:agent-token | packages/server/src/tools/projects.ts#register |
| op:graph.get | project, id or suffix | one node with edges both ways | – | packages/server/src/tools/graph.ts#get |
| op:graph.neighbors | project, id, depth=1, structural=true, kinds? | nodes by hop distance | – | packages/server/src/tools/graph.ts#neighbors |
| op:graph.impact | project, id, depth=3 | reverse structural closure grouped by kind | – | packages/server/src/tools/graph.ts#impact |
| op:graph.search | project, terms, limit | ranked hits, v0.1 scoring | – | packages/server/src/tools/graph.ts#search |
| op:graph.reqs | project, status? | requirement tree with status glyphs | – | packages/server/src/tools/graph.ts#reqs |
| op:graph.packet | project, task or text, budget | entity:packet; task seeding per rule:packet-task-seeds | – | packages/server/src/tools/graph.ts#packet |
| op:graph.check | project, strict? | lint; strict adds rule:strict-open-contradiction | – | packages/server/src/tools/graph.ts#check |
| op:graph.patch | project, entity:node-patch | edit one node in place; conflict on stale ifMatch (rule:if-match) | gate:agent-token | packages/server/src/tools/graph.ts#patch |
| op:graph.create | project, module, kind, slug, body | append a node under its section (rule:section-map) | gate:agent-token | packages/server/src/tools/graph.ts#create |
| op:tasks.list | project, status?, node? | tasks with links | – | packages/server/src/tools/tasks.ts#list |
| op:tasks.get | project, id | task with links, decisions, delta ids | – | packages/server/src/tools/tasks.ts#get |
| op:tasks.create | project, title, intent, links[], assignee | create; queue a clerk run (rule:clerk-triggers) | gate:agent-token | packages/server/src/tools/tasks.ts#create |
| op:tasks.update | project, id, status?, links?, assignee? | update; relinking queues a clerk run; transitions per state:task-lifecycle | gate:agent-token | packages/server/src/tools/tasks.ts#update |
| op:decisions.list | project, node?, task?, since? | decisions newest first with clerk result | – | packages/server/src/tools/decisions.ts#list |
| op:decisions.get | project, id | one decision with clerk result and delta | – | packages/server/src/tools/decisions.ts#get |
| op:decisions.post | project, title, context, options[], choice, consequences, affects[], task?, supersedes? | store immutably, queue a clerk run, wait up to 5 s (rule:post-wait) | gate:agent-token | packages/server/src/tools/decisions.ts#post |
| op:deltas.apply | project, id | write every op through the writer, atomic per file (rule:delta-atomic) | gate:delta-apply | packages/server/src/tools/deltas.ts#apply |
| op:deltas.reject | project, id, reason | mark rejected with reason | gate:delta-apply | packages/server/src/tools/deltas.ts#reject |
| op:contradictions.list | project, status=open, node? | findings with both sides | – | packages/server/src/tools/contradictions.ts#list |
| op:contradictions.resolve | project, id, decision? or task? | open → resolved, resolver recorded | gate:agent-token | packages/server/src/tools/contradictions.ts#resolve |
| op:contradictions.dismiss | project, id, reason | open → dismissed; reason required | gate:agent-token | packages/server/src/tools/contradictions.ts#dismiss |
| op:clerk.run | project, trigger, id or node ids | queue a clerk run; on-demand seeds from node ids | gate:agent-token | packages/server/src/tools/clerk.ts#run |
| op:events.subscribe | project? | SSE stream of value:sse-event | – | packages/server/src/events.ts#subscribe |

The clerk's private tools (not exposed to callers): `propose_delta(ops)` and `report_contradiction(sideA, sideB, verdict, explanation)`, implemented in `packages/server/src/clerk/tools.ts` (rule:clerk-tools).

---

## 5. Pages and actions

### page:web/sidebar

### page:web/node

### page:web/graph

### page:web/context-column

The column's frame: what stays put and what scrolls.

Connected rows as cards: what a related or child node looks like when opened in place.

Selecting a block: what a click on any part of a typed block does to the column.

A node's details: properties, content, and what a card shows of it.

### page:web/types

### page:web/sessions

### page:web/tasks

### page:web/decisions

### page:web/contradictions

### page:skill/context-v2 and page:agents-snippet

---

## 6. Rules

### Storage and identity

### Server and watcher

### Writer

### Tasks, decisions, packets

### Clerk

### Web app


```yaml
- id: module:wf2-dev
  purpose: >
    The technical design of Waterfall v2 — packages, storage, API, web app, clerk — as graph nodes the PRD's
    requirements are satisfied by.
  part-of: module:wf2
  submodules: [core, server, web, cli, clerk]
  layout: |
    packages/core     parser, queries, lint (port of lib/), writer, schema      — no I/O beyond files
    packages/server   registry, watcher, in-memory graphs, SQLite, services, Hono HTTP, MCP, SSE, clerk
    packages/web      Next.js app
    packages/cli      ctx as a client with local fallback
```

## Retired blocks

```yaml
- id: entity:product
  status: retired
  storage: table product
  source: packages/server/src/db/schema.ts#product
  description: A thing being built. Groups projects.
  fields:
    name:          string
    description:   string?
    ownerId:       string?        # unused locally
  edges:
    - entity:product -(has)-> entity:project
- id: entity:project
  status: retired
  storage: table project
  source: packages/server/src/db/schema.ts#project
  description: One repo whose docs/context-graph folder is an artifact graph.
  fields:
    productId:      entity:product
    name:           string         # unique per tenant; accepted wherever a tool takes project
    rootPath:       path           # local checkout
    gitRemote:      string?        # null locally; used by the hosted sync job later
    graphPath:      path           # default docs/context-graph
    lastParsedAt:   datetime?
    lastParsedSha:  string?        # git rev-parse HEAD at parse time; the server never commits
  edges:
    - entity:project -(has)-> entity:graph-registry
    - entity:project -(has)-> entity:task
    - entity:project -(has)-> entity:decision
    - entity:project -(has)-> entity:contradiction
    - entity:project -(governed-by)-> rule:project-scoped
- id: entity:task-link
  status: retired
  storage: table task_link
  source: packages/server/src/db/schema.ts#taskLink
  description: One node a task touches, with the role it plays. req:wf2.ui
  fields:
    taskId:   entity:task
    nodeId:   string               # kind:slug in the project's graph
    role:     value:task-link-role
- id: entity:task
  storage: table task
  source: packages/server/src/db/schema.ts#task
  description: >
    The unit of intent. Replaces the v0.1 delta file (decision:wf2.tasks-replace-delta-files). Links to the nodes
    it will add, change, resolve or read.
  fields:
    projectId:      entity:project
    title:          string
    intent:         string         # one sentence, the requester's words
    status:         retired
    assigneeKind:   value:assignee-kind
    assigneeName:   string?
    packetBudget:   int            # default 6000 chars, used by graph.packet when given this task
  edges:
    - entity:task -(has)-> entity:task-link
    - entity:task -(owns)-> state:task-lifecycle
    - entity:task -(governed-by)-> rule:clerk-triggers
- id: entity:decision
  status: retired
  storage: table decision
  source: packages/server/src/db/schema.ts#decision
  description: >
    A decision posted by an agent or human. Immutable (rule:decision-immutable); superseded, never edited.
  fields:
    projectId:      entity:project
    taskId:         entity:task?
    title:          string
    context:        string
    options:        List<string>   # json
    choice:         string
    consequences:   string
    affects:        List<string>   # json list of node ids
    madeByKind:     value:assignee-kind
    madeByName:     string
    sessionId:      entity:agent-session?
    supersedesId:   entity:decision?
    clerkStatus:    value:clerk-status
  edges:
    - entity:decision -(owns)-> state:decision-clerk-status
    - entity:decision -(governed-by)-> rule:decision-immutable
    - entity:decision -(governed-by)-> rule:post-wait
- id: entity:contradiction
  storage: table contradiction
  source: packages/server/src/db/schema.ts#contradiction
  description: >
    A finding with two sides. Structural rows are upserted from drift nodes and contradicts edges on every parse
    (rule:structural-import); semantic rows come from the clerk (rule:clerk-classify).
  fields:
    projectId:              entity:project
    kind:                   value:contradiction-kind
    sideA:                  string        # node id, or decision:<uuid> (rule:side-ids)
    sideB:                  string
    explanation:            string
    status:                 retired
    resolvedByDecisionId:   entity:decision?
    resolvedByTaskId:       entity:task?
    dismissedReason:        string?
    clerkRunId:             entity:clerk-run?
  unique: (projectId, sideA, sideB) for kind structural
  edges:
    - entity:contradiction -(owns)-> state:contradiction-lifecycle
    - entity:contradiction -(governed-by)-> rule:strict-open-contradiction
- id: entity:graph-delta
  storage: table graph_delta
  source: packages/server/src/db/schema.ts#graphDelta
  description: >
    A proposed change to markdown, produced by the clerk, applied by a person (gate:delta-apply). The patch is a
    list of ops, validated by the parser before the row is stored (rule:delta-validated).
  fields:
    projectId:     entity:project
    decisionId:    entity:decision?
    taskId:        entity:task?
    clerkRunId:    entity:clerk-run?
    status:        retired
    patch:         List<value:delta-op>   # json
    appliedAt:     datetime?
    appliedBy:     string?
    error:         string?                # set when apply fails; status stays proposed
  edges:
    - entity:graph-delta -(owns)-> state:delta-lifecycle
    - entity:graph-delta -(governed-by)-> rule:delta-atomic
    - entity:graph-delta -(governed-by)-> rule:clerk-delta-shape
- id: entity:clerk-run
  storage: table clerk_run
  source: packages/server/src/db/schema.ts#clerkRun
  description: The audit record of one clerk invocation.
  fields:
    projectId:     entity:project
    triggerKind:   value:clerk-trigger
    triggerId:     string              # decision id, task id, or node id for on-demand
    status:        retired
    inputHash:     string              # sha256 of the assembled context (rule:clerk-cache)
    input:         json
    toolCalls:     json                # every call with args and result size
    output:        json                # related, contradictions, deltaId
    model:         string
    tokensIn:      int
    tokensOut:     int
    error:         string?
  edges:
    - entity:clerk-run -(owns)-> state:clerk-run-status
    - entity:clerk-run -(governed-by)-> rule:clerk-budget
- id: entity:agent-session
  status: retired
  storage: table agent_session
  source: packages/server/src/db/schema.ts#agentSession
  description: >
    Who is talking to the server. Created or touched on every call that names an agent (rule:created-by).
  fields:
    name:        string                # from X-Agent header or MCP client info
    kind:        value:agent-kind
    tokenHash:   string?               # null locally; enforced by gate:agent-token when hosted
    lastSeenAt:  datetime
- id: entity:graph-registry
  status: retired
  storage: memory, one per registered project
  source: packages/server/src/registry.ts#GraphRegistry
  description: The current parsed graph of a project plus what the watcher needs to keep it current.
  fields:
    projectId:     entity:project
    graph:         entity:graph          # the v0.1 build output shape
    fileHashes:    Map<path, sha256>
    nodeHashes:    Map<nodeId, sha256>   # sha256 of each node body; what ifMatch compares against (rule:if-match)
    lastGoodAt:    datetime
    lastError:     string?               # file and line of the last parse failure (rule:last-good-graph)
  edges:
    - entity:graph-registry -(governed-by)-> rule:watcher-debounce
    - entity:graph-registry -(governed-by)-> rule:last-good-graph
- id: entity:node-patch
  storage: argument of graph.patch and of a delta op
  source: packages/core/src/writer.ts#NodePatch
  description: What a caller may change on one node.
  fields:
    id:            string
    body:          string?               # the whole yaml body; keys are re-serialised in the caller's order
    status:        retired
    addEdges:      List<{verb, to}>
    removeEdges:   List<{verb, to}>
    ifMatch:       sha256
  edges:
    - entity:node-patch -(governed-by)-> rule:patch-in-place
    - entity:node-patch -(governed-by)-> rule:edge-serialisation
    - entity:node-patch -(governed-by)-> rule:validate-before-write
- id: entity:packet
  status: retired
  storage: result of graph.packet (ephemeral)
  source: packages/core/src/packet.ts#Packet
  description: >
    The v0.1 packet plus, when seeded from a task, the open decisions and contradictions touching its nodes
    (rule:packet-task-seeds).
  fields:
    task:            string?             # task id or free text
    seeds:           List<nodeId>
    nodes:           ordered, nearest-first, budget-capped
    files:           List<path>
    decisions:       List<entity:decision>       # only when seeded from a task
    contradictions:  List<entity:contradiction>  # only when seeded from a task
- id: rule:markdown-canonical
  statement: >
    No DB table stores a node body or edge list; the DB references nodes by id string only. The in-memory graph is
    rebuilt only from files by the watcher; every write, from the UI, an agent or a delta, goes through the writer
    and the file.
  source: packages/server/src/services/graph.ts#write; packages/server/src/db/schema.ts
  status: retired
  requires-tests: [test:server-services#no-body-duplication, test:server-services#ui-write-is-file-write]
- id: rule:hosting-columns
  statement: >
    Every table has tenantId (default "local"), createdBy (the agent or user name), createdAt and updatedAt;
    agent_session has tokenHash. No code path reads tenantId or tokenHash locally.
  source: packages/server/src/db/schema.ts#baseColumns
  status: retired
  requires-tests: [test:server-services#hosting-columns-present]
- id: rule:created-by
  statement: >
    The agent name from the X-Agent header or MCP client info is attached to the request context; every row
    written in that request gets it as createdBy; missing name is "anonymous".
  source: packages/server/src/middleware/agent.ts
  status: retired
  requires-tests: [test:server-api#agent-header-recorded]
- id: rule:project-scoped
  statement: >
    Every tool resolves its project argument by id or unique name before doing anything else and answers not_found
    when unknown.
  source: packages/server/src/tools/_scope.ts
  status: retired
  requires-tests: [test:server-api#unknown-project]
- id: rule:watcher-debounce
  statement: >
    File events under a project's graph path are debounced 200 ms per file; a re-parse runs for the whole project,
    replaces the registry graph, recomputes node hashes, upserts structural contradictions and emits graph.changed
    with the ids whose hash changed.
  source: packages/server/src/registry.ts#watch
  status: retired
  requires-tests: [test:server-services#watch-reparse]
- id: rule:last-good-graph
  statement: >
    If a parse throws, the registry keeps the previous graph and node hashes, records lastError with file and
    line, and emits graph.parse_error; reads keep answering from the previous graph and writes to the broken file
    are refused with invalid_patch.
  source: packages/server/src/registry.ts#reparse
  status: retired
  requires-tests: [test:server-services#parse-error-keeps-last-good]
- id: rule:structural-import
  statement: >
    After every parse, each drift node yields one contradiction per contradicts edge pair and each explicit
    contradicts edge yields one, keyed (project, sideA, sideB) with sides sorted; existing rows are touched,
    missing rows that were open are closed as resolved with reason "removed from markdown", and rows previously
    resolved reopen if the pair reappears.
  source: packages/server/src/services/contradictions.ts#importStructural
  status: retired
  requires-tests: [test:server-services#structural-import-idempotent]
- id: rule:config-print
  statement: >
    On start the server prints a `claude mcp add waterfall -- <stdio command>` line, a `claude mcp add --transport
    http waterfall <url>` line, and a `[mcp_servers.waterfall]` TOML block with command/args and a second with
    url, each ready to paste.
  source: packages/server/src/main.ts#printAgentConfig
  status: retired
  requires-tests: [test:server-api#config-print]
- id: rule:one-tool-set
  statement: >
    Tools are defined once as {name, schema (zod), handler}; the MCP server registers each as an MCP tool and the
    HTTP router mounts each at POST /api/v1/<name>; there is no tool reachable by one transport and not the other.
  source: packages/server/src/tools/index.ts
  status: retired
  requires-tests: [test:server-api#same-cases-http-and-mcp]
- id: rule:error-shape
  statement: >
    Handlers throw ToolError(code, message, details); the HTTP layer maps code to status (409 conflict, 422
    invalid_patch and lint_failed, 404 not_found, 401 unauthorized) and the MCP layer returns isError with the
    same JSON in the content.
  source: packages/server/src/errors.ts
  status: retired
  requires-tests: [test:server-api#error-shape]
- id: rule:sse-refresh
  statement: >
    The server emits value:sse-event over GET /api/v1/events; the web app subscribes once per project and
    refetches only the affected node, list or graph neighbourhood named in the event payload.
  source: packages/server/src/events.ts; packages/web/src/lib/events.ts
  status: retired
  requires-tests: [ui-test:edit-node-flow]
- id: rule:patch-in-place
  statement: >
    The writer locates the node's yaml block by the file and line the parser recorded and the id on its first
    line, replaces exactly those lines, and leaves every other byte of the file unchanged; a node defined by a
    table row or a heading is patched by rewriting that row or the block under the heading.
  source: packages/core/src/writer.ts#patchNode
  status: retired
  requires-tests: [test:core-writer#patch-body, test:core-writer#patch-preserves-neighbours, test:core-writer#round-trip-stability]
- id: rule:edge-serialisation
  statement: >
    addEdges and removeEdges are written as typed keys when the verb has one (refines, satisfied-by, verified-by,
    governed-by, gated-by, reads, writes, calls, contradicts, owns, set-by, applies-to, see, resolves, depends-on)
    and otherwise as `a -(verb)-> b` lines under an edges key; removing the last item of a key removes the key.
  source: packages/core/src/writer.ts#serialiseEdges
  status: retired
  requires-tests: [test:core-writer#edge-add-remove]
- id: rule:section-map
  statement: >
    schema/kinds.yaml gains a sections map from kind to the ## heading the template uses (req → R, entity → 1,
    value → 2, state → 3, op → 4, page → 5, rule → 6, gate → 8, decision → D, question → 11); createNode appends
    to the end of that section and creates the heading in template order when absent.
  source: packages/core/src/writer.ts#createNode; schema/kinds.yaml#sections
  status: retired
  requires-tests: [test:core-writer#create-in-section, test:core-writer#create-adds-heading]
- id: rule:if-match
  statement: >
    A node's hash is sha256 of its dedented body as the parser produces it; graph.patch requires ifMatch and
    refuses with conflict {current, hash} when it differs from the registry's hash; graph.create needs no hash.
  source: packages/core/src/writer.ts#hashOf; packages/server/src/services/graph.ts#patch
  status: retired
  requires-tests: [test:core-writer#conflict]
- id: rule:validate-before-write
  statement: >
    Before touching disk the writer re-parses the patched file text together with the project's other files in
    memory and runs check; a parse failure is invalid_patch, a lint error is lint_failed with the messages, and
    only then is the file written.
  source: packages/core/src/writer.ts#validate
  status: retired
  requires-tests: [test:core-writer#reject-parse-error, test:core-writer#reject-lint-error]
- id: rule:stub-targets-warn
  statement: >
    An edge to an id no file describes is accepted; the write result carries warnings listing the stub ids,
    matching v0.1's rule that referenced-but-undescribed nodes are visible, not refused.
  source: packages/core/src/writer.ts#validate
  status: retired
  requires-tests: [test:core-writer#stub-target-warns]
- id: rule:atomic-file-write
  statement: >
    A file is written to <file>.tmp-<pid> and renamed over the original; the watcher ignores .tmp- files.
  source: packages/core/src/writer.ts#writeAtomic
  status: retired
  requires-tests: [test:core-writer#concurrent-writes-serialised]
- id: rule:per-file-queue
  statement: >
    Writes are serialised per absolute file path through a promise chain; a write waits for the previous write to
    the same file to finish and re-reads the file before applying.
  source: packages/core/src/writer.ts#queue
  status: retired
  requires-tests: [test:core-writer#concurrent-writes-serialised]
- id: rule:cli-fallback
  statement: >
    ctx reads WATERFALL_URL (default http://localhost:7777); if a GET /api/v1/projects.list answers within 300 ms
    it calls the server, otherwise it runs core on the local files; output is rendered by the same formatter
    either way.
  source: packages/cli/src/client.ts
  status: retired
  requires-tests: [test:cli#server-and-local-identical]
- id: rule:clerk-triggers
  statement: >
    A clerk run is queued on decisions.post, on tasks.create, on tasks.update when links change, and on clerk.run;
    never on a markdown change alone.
  source: packages/server/src/clerk/queue.ts#enqueue
  status: retired
  requires-tests: [test:clerk#task-run-no-delta, test:server-api#clerk-run-on-demand]
- id: rule:decision-immutable
  statement: >
    The decision table has no update path except clerkStatus; decisions.post with supersedes sets supersedesId on
    the new row and never touches the old one.
  source: packages/server/src/services/decisions.ts#post
  status: retired
  requires-tests: [test:server-services#decision-immutable]
- id: rule:post-wait
  statement: >
    decisions.post awaits the queued clerk run with a 5 s timeout; on completion it returns {decision, related,
    contradictions, deltaId}, on timeout {decision, clerkStatus: pending}, and when the clerk is disabled
    {decision, clerkStatus: skipped}.
  source: packages/server/src/services/decisions.ts#post
  status: retired
  requires-tests: [test:server-api#decisions-post-waits, test:server-api#decisions-post-pending]
- id: rule:packet-task-seeds
  statement: >
    When graph.packet receives a task id, seeds are the task's linked node ids in link order (instead of search
    hits); after the node blocks, open decisions whose affects intersect the emitted nodes and open contradictions
    with a side among them are appended, within the same budget.
  source: packages/core/src/packet.ts#fromTask
  status: retired
  requires-tests: [test:server-services#packet-from-task]
- id: rule:clerk-context
  statement: >
    A run's input is the trigger row, graph.packet around the affected nodes (budget from the task or 8000), every
    decision whose affects intersects the two-hop neighbourhood, and open contradictions with a side in it; the
    input's sha256 is the run's inputHash.
  source: packages/server/src/clerk/context.ts
  status: retired
  requires-tests: [test:clerk#context-assembly]
- id: rule:clerk-tools
  statement: >
    The clerk's tool list is graph.get, graph.neighbors, graph.impact, graph.search, graph.packet, decisions.list,
    contradictions.list, propose_delta and report_contradiction; it is built from a fixed array, not from the
    public registry.
  source: packages/server/src/clerk/tools.ts
  status: retired
  requires-tests: [test:clerk#tool-set-is-closed]
- id: rule:clerk-no-self-trigger
  statement: >
    The clerk's session kind is internal; tasks.create, tasks.update and decisions.post refuse an internal session
    with unauthorized, so no clerk output can queue another run.
  source: packages/server/src/tools/_scope.ts#refuseInternal
  status: retired
  requires-tests: [test:clerk#tool-set-is-closed]
- id: rule:clerk-propose-only
  statement: >
    propose_delta stores a graph_delta row with status proposed and returns its id; the clerk process has no
    reference to the writer.
  source: packages/server/src/clerk/tools.ts#proposeDelta
  status: retired
  requires-tests: [test:clerk#no-disk-write]
- id: rule:clerk-delta-shape
  statement: >
    A decision run's delta contains one create op for a decision node (id decision:<module>.<slug>, keys date,
    context, options, choice, consequences, decision-id) in the module owning most affected nodes, zero or more
    create or patch ops for req, rule and flag nodes with status proposed, and edge ops; it never contains a
    status op to shipped.
  source: packages/server/src/clerk/prompt.ts; packages/server/src/clerk/tools.ts#validateShape
  status: retired
  requires-tests: [test:clerk#decision-becomes-adr-node]
- id: rule:delta-validated
  statement: >
    Before a graph_delta row is stored its ops are applied to an in-memory copy of the project files and parsed; a
    failure rejects propose_delta with invalid_patch and the run fails.
  source: packages/server/src/services/deltas.ts#validate
  status: retired
  requires-tests: [test:server-services#delta-validated-on-store]
- id: rule:delta-atomic
  statement: >
    deltas.apply groups ops by file, applies each group through the writer with the current hashes, and if any
    group fails restores every file already written from its pre-apply content, records the error on the delta and
    leaves status proposed.
  source: packages/server/src/services/deltas.ts#apply
  status: retired
  requires-tests: [test:server-services#delta-apply-atomic]
- id: rule:clerk-budget
  statement: >
    A run stops with status failed and error "budget" after 40 tool calls or when cumulative input tokens exceed
    200k; both limits are config with those defaults.
  source: packages/server/src/clerk/runner.ts#loop
  status: retired
  requires-tests: [test:clerk#budget-stops-run]
- id: rule:clerk-cache
  statement: >
    Before calling the model the runner looks for a done clerk_run with the same inputHash and model; a hit copies
    its output into the new run with status done and zero tokens.
  source: packages/server/src/clerk/runner.ts#cached
  status: retired
  requires-tests: [test:clerk#cache-hit]
- id: rule:clerk-classify
  statement: >
    For each rule, req and decision in the two-hop neighbourhood the clerk must call report_contradiction with a
    verdict from value:pair-verdict and a one-sentence explanation; contradicts and duplicate create semantic
    contradiction rows, consistent and refines are recorded in the run output only.
  source: packages/server/src/clerk/classify.ts
  status: retired
  requires-tests: [test:clerk#classification-fixtures, test:clerk#decision-vs-rule-finding]
- id: rule:side-ids
  statement: >
    A contradiction side is either a node id (kind:slug) or decision:<uuid>; the UI and the check resolve each
    side to its text through the graph or the decision table.
  source: packages/server/src/services/contradictions.ts#sideText
  status: retired
  requires-tests: [test:clerk#decision-vs-rule-finding]
- id: rule:strict-open-contradiction
  statement: >
    graph.check with strict adds an error for every open contradiction where either side is a node with status
    shipped (or a req with no status); without strict it is a warning with the count.
  source: packages/core/src/check.ts#openContradictions
  status: retired
  requires-tests: [test:core-check#strict-open-contradiction]
```
