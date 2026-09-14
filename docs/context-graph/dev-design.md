---
node: module:wf2-dev
type: module
title: Waterfall v2 — dev design
status: proposed
owner: alex
last-verified: 2026-09-14
verified-against: docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
source-roots: [., packages/core, packages/server, packages/web, packages/cli, skills]
sources:
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
  - docs/context-graph/prd.md
---

# Waterfall v2 — dev design

The mechanisms that satisfy the PRD: entities (DB tables and in-memory types), value objects, state machines,
operations (the tool set exposed over MCP and HTTP), pages (the web app and the agent-facing documents) and rules
(what the code will enforce). Every `source:` is the intended file; `ctx check --strict` fails until it exists.

---

## 0. module:wf2-dev

```yaml
id: module:wf2-dev
purpose: The technical design of Waterfall v2 — packages, storage, API, web app, clerk — as graph nodes the PRD's requirements are satisfied by.
part-of: module:wf2
submodules: [core, server, web, cli, clerk]
layout: |
  packages/core     parser, queries, lint (port of lib/), writer, schema      — no I/O beyond files
  packages/server   registry, watcher, in-memory graphs, SQLite, services, Hono HTTP, MCP, SSE, clerk
  packages/web      Next.js app
  packages/cli      ctx as a client with local fallback
```

---

## 1. Entities

### DB tables (SQLite via Drizzle; every table has id, tenantId, createdBy, createdAt, updatedAt — rule:hosting-columns)

### entity:product

```yaml
id: entity:product
storage: table product
source: packages/server/src/db/schema.ts#product
description: A thing being built. Groups projects.
fields:
  name:          string
  description:   string?
  ownerId:       string?        # unused locally
edges:
  - entity:product -(has)-> entity:project
```

### entity:project

```yaml
id: entity:project
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
```

### entity:task

```yaml
id: entity:task
storage: table task
source: packages/server/src/db/schema.ts#task
description: The unit of intent. Replaces the v0.1 delta file (decision:wf2.tasks-replace-delta-files). Links to the nodes it will add, change, resolve or read.
fields:
  projectId:      entity:project
  title:          string
  intent:         string         # one sentence, the requester's words
  status:         value:task-status
  assigneeKind:   value:assignee-kind
  assigneeName:   string?
  packetBudget:   int            # default 6000 chars, used by graph.packet when given this task
edges:
  - entity:task -(has)-> entity:task-link
  - entity:task -(owns)-> state:task-lifecycle
  - entity:task -(governed-by)-> rule:clerk-triggers
```

### entity:task-link

```yaml
id: entity:task-link
storage: table task_link
source: packages/server/src/db/schema.ts#taskLink
description: One node a task touches, with the role it plays.
fields:
  taskId:   entity:task
  nodeId:   string               # kind:slug in the project's graph
  role:     value:task-link-role
```

### entity:decision

```yaml
id: entity:decision
storage: table decision
source: packages/server/src/db/schema.ts#decision
description: A decision posted by an agent or human. Immutable (rule:decision-immutable); superseded, never edited.
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
```

### entity:contradiction

```yaml
id: entity:contradiction
storage: table contradiction
source: packages/server/src/db/schema.ts#contradiction
description: A finding with two sides. Structural rows are upserted from drift nodes and contradicts edges on every parse (rule:structural-import); semantic rows come from the clerk (rule:clerk-classify).
fields:
  projectId:              entity:project
  kind:                   value:contradiction-kind
  sideA:                  string        # node id, or decision:<uuid> (rule:side-ids)
  sideB:                  string
  explanation:            string
  status:                 value:contradiction-status
  resolvedByDecisionId:   entity:decision?
  resolvedByTaskId:       entity:task?
  dismissedReason:        string?
  clerkRunId:             entity:clerk-run?
unique: (projectId, sideA, sideB) for kind structural
edges:
  - entity:contradiction -(owns)-> state:contradiction-lifecycle
  - entity:contradiction -(governed-by)-> rule:strict-open-contradiction
```

### entity:graph-delta

```yaml
id: entity:graph-delta
storage: table graph_delta
source: packages/server/src/db/schema.ts#graphDelta
description: A proposed change to markdown, produced by the clerk, applied by a person (gate:delta-apply). The patch is a list of ops, validated by the parser before the row is stored (rule:delta-validated).
fields:
  projectId:     entity:project
  decisionId:    entity:decision?
  taskId:        entity:task?
  clerkRunId:    entity:clerk-run?
  status:        value:delta-status
  patch:         List<value:delta-op>   # json
  appliedAt:     datetime?
  appliedBy:     string?
  error:         string?                # set when apply fails; status stays proposed
edges:
  - entity:graph-delta -(owns)-> state:delta-lifecycle
  - entity:graph-delta -(governed-by)-> rule:delta-atomic
  - entity:graph-delta -(governed-by)-> rule:clerk-delta-shape
```

### entity:clerk-run

```yaml
id: entity:clerk-run
storage: table clerk_run
source: packages/server/src/db/schema.ts#clerkRun
description: The audit record of one clerk invocation.
fields:
  projectId:     entity:project
  triggerKind:   value:clerk-trigger
  triggerId:     string              # decision id, task id, or node id for on-demand
  status:        value:clerk-run-status
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
```

### entity:agent-session

```yaml
id: entity:agent-session
storage: table agent_session
source: packages/server/src/db/schema.ts#agentSession
description: Who is talking to the server. Created or touched on every call that names an agent (rule:created-by).
fields:
  name:        string                # from X-Agent header or MCP client info
  kind:        value:agent-kind
  tokenHash:   string?               # null locally; enforced by gate:agent-token when hosted
  lastSeenAt:  datetime
```

### In-memory types (packages/core and packages/server)

### entity:graph-registry

```yaml
id: entity:graph-registry
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
```

### entity:node-patch

```yaml
id: entity:node-patch
storage: argument of graph.patch and of a delta op
source: packages/core/src/writer.ts#NodePatch
description: What a caller may change on one node.
fields:
  id:            string
  body:          string?               # the whole yaml body; keys are re-serialised in the caller's order
  status:        string?
  addEdges:      List<{verb, to}>
  removeEdges:   List<{verb, to}>
  ifMatch:       sha256
edges:
  - entity:node-patch -(governed-by)-> rule:patch-in-place
  - entity:node-patch -(governed-by)-> rule:edge-serialisation
  - entity:node-patch -(governed-by)-> rule:validate-before-write
```

### entity:packet

```yaml
id: entity:packet
storage: result of graph.packet (ephemeral)
source: packages/core/src/packet.ts#Packet
description: The v0.1 packet plus, when seeded from a task, the open decisions and contradictions touching its nodes (rule:packet-task-seeds).
fields:
  task:            string?             # task id or free text
  seeds:           List<nodeId>
  nodes:           ordered, nearest-first, budget-capped
  files:           List<path>
  decisions:       List<entity:decision>       # only when seeded from a task
  contradictions:  List<entity:contradiction>  # only when seeded from a task
```

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

```yaml
id: state:task-lifecycle
owner: entity:task
states: [proposed, approved, in-progress, done, abandoned]
transitions:
  - proposed -> approved       : a human approves (tasks.update by a human session)      # packages/server/src/services/tasks.ts#approve
  - approved -> in-progress    : the assignee starts (tasks.update)
  - in-progress -> done        : the assignee finishes; graph.check strict must be green for the project   # rule:strict-open-contradiction
  - proposed -> abandoned      : anyone
  - approved -> abandoned      : anyone
  - in-progress -> abandoned   : anyone
terminal: [done, abandoned]
```

```yaml
id: state:decision-clerk-status
owner: entity:decision
states: [pending, done, failed, skipped]
transitions:
  - pending -> done      : the clerk run finished            # packages/server/src/clerk/runner.ts#finish
  - pending -> failed    : model error, budget, invalid delta
  - failed -> pending    : Retry pressed (action:retry-clerk)
  - pending -> skipped   : the clerk is disabled (phase 1) or the decision affects no nodes
```

```yaml
id: state:contradiction-lifecycle
owner: entity:contradiction
states: [open, resolved, dismissed]
transitions:
  - open -> resolved    : contradictions.resolve with a decision or task
  - open -> dismissed   : contradictions.dismiss with a reason
  - resolved -> open    : a structural row reappears in markdown after being resolved (re-opened on parse)
terminal: [dismissed]
```

```yaml
id: state:delta-lifecycle
owner: entity:graph-delta
states: [proposed, applied, rejected]
transitions:
  - proposed -> applied    : deltas.apply succeeds for every op (rule:delta-atomic)
  - proposed -> rejected   : deltas.reject with a reason
  - proposed -> proposed   : deltas.apply fails; error recorded, nothing written
terminal: [applied, rejected]
```

```yaml
id: state:clerk-run-status
owner: entity:clerk-run
states: [running, done, failed]
transitions:
  - running -> done     : output stored
  - running -> failed   : budget (rule:clerk-budget), model error, or delta rejected by the parser (rule:delta-validated)
terminal: [done, failed]
```

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

```yaml
id: page:web/sidebar
route: every route; the left rail; first screen at phone width
component: packages/web/src/app/p/[project]/layout.tsx; packages/web/src/components/DocTree.tsx; packages/web/src/components/Search.tsx
reads: [op:projects.list, op:graph.search, op:tasks.list, op:contradictions.list]
actions:
  - action:search:          type to search document titles, headings, node ids and titles; a node hit opens its definition -(navigates)-> page:web/node
  - action:open-document:   tap a document in the tree -(navigates)-> page:web/node
  - action:open-heading:    tap an outline entry under the open document (scrolls to the ## heading)
  - action:open-tasks:      fixed entry with open count -(navigates)-> page:web/tasks
  - action:open-decisions:  fixed entry -(navigates)-> page:web/decisions
  - action:open-contradictions: fixed entry with open count -(navigates)-> page:web/contradictions
display-rules:
  - the rail lists documents, not nodes: root documents → sub-documents (rule:document-tree); the open document shows its ## outline beneath it
  - foot links: Graph, Drift (page:web/graph)
  - counts refresh on task.changed and contradiction.changed events (rule:sse-refresh)
```

### page:web/node

```yaml
id: page:web/node
route: /p/<project>/d/<doc>#n-<id>   (a node's page is its definition inside its document; /p/<project>/n/<id> redirects there)
component: packages/web/src/app/p/[project]/d/[doc]/page.tsx; packages/web/src/components/Document.tsx; packages/web/src/components/NodeCard.tsx; packages/web/src/components/PeekPanel.tsx
reads: [op:graph.get, op:tasks.list, op:decisions.list, op:contradictions.list]
actions:
  - action:edit-property:   change a yaml key in the properties panel (text, enum for status, id list with typeahead for edge keys)
  - action:edit-prose:      edit a prose key in BlockNote (rule:blocknote-prose-only)
  - action:save:            send the page as a patch with its hash -(calls)-> op:graph.patch
  - action:reload-or-overwrite: on conflict, show a diff of mine vs current and choose
  - action:tap-relation:    chip → the related node -(navigates)-> page:web/node
  - action:show-in-graph:   open the graph focused here -(navigates)-> page:web/graph
  - action:recheck:         ask the clerk to re-check this node -(calls)-> op:clerk.run
  - action:retry-clerk:     retry a failed clerk run for a decision on the right rail -(calls)-> op:clerk.run
display-rules:
  - the document renders as text: frontmatter header, prose, tables, and one card per node in each yaml block (rule:node-cards); ids everywhere are smart tags (rule:smart-tags)
  - a card: kind and status pills, title (or id), when/then/unless as one sentence, prose keys as paragraphs, remaining keys as a property strip, raw yaml behind a toggle, anchor n-<id>
  - clicking a tag opens the peek panel (card + relations grouped by verb + Go to definition + Show in graph) without leaving the document; Escape closes
  - the document ends with Linked documents: other files reached by structural edges in either direction, with counts (rule:document-tree)
  - the document is a single Notion-style page (rule:single-page-editor): every block is editable in place, typed blocks carry kind, slug and status, "/" inserts a typed block, selecting a phrase and choosing "⌁ node" links it to any node; the header's title, status, owner and last-verified are inline inputs saved on blur; the rail has "+ New document" (rule:new-document); one save-state hint for the page
  - right rail (proposed): linked tasks, decisions (superseded greyed), open contradictions
```

### page:web/graph

```yaml
id: page:web/graph
route: /p/<project>/graph?focus=<id>&preset=<name>
component: packages/web/src/app/p/[project]/graph/page.tsx; packages/web/src/components/GraphView.tsx
reads: [op:graph.neighbors, op:graph.get]
actions:
  - action:preset:          Requirements | Mechanics | Data | Drift | Everything (rule:graph-presets)
  - action:tap-node:        open the node page in a side panel -(navigates)-> page:web/node
  - action:recentre:        double-click makes the node the focus (rule:mindmap-layout)
  - action:drag-edge:       drag handle to handle, prompt for the verb -(calls)-> op:graph.patch
  - action:delete-edge:     select an edge and delete -(calls)-> op:graph.patch
  - action:rename-node:     inline title edit -(calls)-> op:graph.patch
  - action:add-child:       context menu on a node creates a node under it (refines for req, has for entity) -(calls)-> op:graph.create
display-rules:
  - React Flow canvas; dagre tree layout over refines and has from the focus; other structural verbs drawn as curved cross-links; mentions hidden
  - an edit is shown only after the file changes and graph.changed arrives; until then the edge is dashed "pending"
  - status ring and hollow stubs as in the v0.1 viewer
```

### page:web/tasks

```yaml
id: page:web/tasks
route: /p/<project>/tasks
component: packages/web/src/app/p/[project]/tasks/page.tsx
reads: [op:tasks.list, op:tasks.get, op:graph.packet]
actions:
  - action:new-task:        create with links chosen by typeahead -(calls)-> op:tasks.create
  - action:move-task:       drag between status columns -(calls)-> op:tasks.update
  - action:open-task:       shows links, packet, decisions, deltas
display-rules:
  - columns follow value:task-status; a move that state:task-lifecycle forbids snaps back with the reason
```

### page:web/decisions

```yaml
id: page:web/decisions
route: /p/<project>/decisions?node=<id>
component: packages/web/src/app/p/[project]/decisions/page.tsx
reads: [op:decisions.list, op:decisions.get]
actions:
  - action:filter-by-node:  typeahead over node ids -(calls)-> op:decisions.list
  - action:apply-delta:     shows the markdown diff, then applies -(calls)-> op:deltas.apply
  - action:reject-delta:    asks for a reason -(calls)-> op:deltas.reject
  - action:retry-clerk:     for a failed run -(calls)-> op:clerk.run
display-rules:
  - newest first; superseded decisions greyed with a link to the superseder
  - each card: clerk status, related nodes, contradictions found, delta with Apply / Reject (gate:delta-apply hides them for untrusted sessions)
```

### page:web/contradictions

```yaml
id: page:web/contradictions
route: /p/<project>/contradictions?status=open
component: packages/web/src/app/p/[project]/contradictions/page.tsx
reads: [op:contradictions.list]
actions:
  - action:resolve:         pick a decision or task -(calls)-> op:contradictions.resolve
  - action:dismiss:         reason required -(calls)-> op:contradictions.dismiss
  - action:open-side:       tap a side → its node page or decision card -(navigates)-> page:web/node
display-rules:
  - both sides show their text (node body or decision choice); kind badge structural / semantic; explanation below
```

### page:skill/context-v2 and page:agents-snippet

```yaml
id: page:skill/context-v2
route: skills/waterfall-context/SKILL.md (rewritten)
component: skills/waterfall-context/SKILL.md
description: The agent contract in tool names — graph.packet before code, decisions.post for every decision, graph.patch before shipping, graph.check before done — plus the wiring section for Claude Code and Codex.
```

```yaml
id: page:agents-snippet
route: templates/AGENTS-snippet.md (pasted into a project's CLAUDE.md and AGENTS.md)
component: templates/AGENTS-snippet.md
description: One paragraph stating the same contract for agents that do not load skills.
```

---

## 6. Rules

### Storage and identity

```yaml
- id: rule:markdown-canonical
  statement: No DB table stores a node body or edge list; the DB references nodes by id string only. The in-memory graph is rebuilt only from files by the watcher; every write, from the UI, an agent or a delta, goes through the writer and the file.
  source: packages/server/src/services/graph.ts#write; packages/server/src/db/schema.ts
  status: proposed
  requires-tests: [test:server-services#no-body-duplication, test:server-services#ui-write-is-file-write]

- id: rule:hosting-columns
  statement: Every table has tenantId (default "local"), createdBy (the agent or user name), createdAt and updatedAt; agent_session has tokenHash. No code path reads tenantId or tokenHash locally.
  source: packages/server/src/db/schema.ts#baseColumns
  status: proposed
  requires-tests: [test:server-services#hosting-columns-present]

- id: rule:created-by
  statement: The agent name from the X-Agent header or MCP client info is attached to the request context; every row written in that request gets it as createdBy; missing name is "anonymous".
  source: packages/server/src/middleware/agent.ts
  status: proposed
  requires-tests: [test:server-api#agent-header-recorded]

- id: rule:project-scoped
  statement: Every tool resolves its project argument by id or unique name before doing anything else and answers not_found when unknown.
  source: packages/server/src/tools/_scope.ts
  status: proposed
  requires-tests: [test:server-api#unknown-project]

- id: rule:question-decision-nodes
  statement: The template gains a §D Decisions section (ADR keys date, context, options, choice, consequences, optional decision-id) and §11 questions are yaml nodes with an id and q; the parser treats both as ordinary yaml nodes. The section map (rule:section-map) places new decision and question nodes there.
  source: templates/module.md; schema/kinds.yaml
  status: proposed
  requires-tests: [test:core-parser#question-and-decision-nodes]
```

### Server and watcher

```yaml
- id: rule:watcher-debounce
  statement: File events under a project's graph path are debounced 200 ms per file; a re-parse runs for the whole project, replaces the registry graph, recomputes node hashes, upserts structural contradictions and emits graph.changed with the ids whose hash changed.
  source: packages/server/src/registry.ts#watch
  status: proposed
  requires-tests: [test:server-services#watch-reparse]

- id: rule:last-good-graph
  statement: If a parse throws, the registry keeps the previous graph and node hashes, records lastError with file and line, and emits graph.parse_error; reads keep answering from the previous graph and writes to the broken file are refused with invalid_patch.
  source: packages/server/src/registry.ts#reparse
  status: proposed
  requires-tests: [test:server-services#parse-error-keeps-last-good]

- id: rule:structural-import
  statement: After every parse, each drift node yields one contradiction per contradicts edge pair and each explicit contradicts edge yields one, keyed (project, sideA, sideB) with sides sorted; existing rows are touched, missing rows that were open are closed as resolved with reason "removed from markdown", and rows previously resolved reopen if the pair reappears.
  source: packages/server/src/services/contradictions.ts#importStructural
  status: proposed
  requires-tests: [test:server-services#structural-import-idempotent]

- id: rule:config-print
  statement: On start the server prints a `claude mcp add waterfall -- <stdio command>` line, a `claude mcp add --transport http waterfall <url>` line, and a `[mcp_servers.waterfall]` TOML block with command/args and a second with url, each ready to paste.
  source: packages/server/src/main.ts#printAgentConfig
  status: proposed
  requires-tests: [test:server-api#config-print]

- id: rule:one-tool-set
  statement: Tools are defined once as {name, schema (zod), handler}; the MCP server registers each as an MCP tool and the HTTP router mounts each at POST /api/v1/<name>; there is no tool reachable by one transport and not the other.
  source: packages/server/src/tools/index.ts
  status: proposed
  requires-tests: [test:server-api#same-cases-http-and-mcp]

- id: rule:error-shape
  statement: Handlers throw ToolError(code, message, details); the HTTP layer maps code to status (409 conflict, 422 invalid_patch and lint_failed, 404 not_found, 401 unauthorized) and the MCP layer returns isError with the same JSON in the content.
  source: packages/server/src/errors.ts
  status: proposed
  requires-tests: [test:server-api#error-shape]

- id: rule:sse-refresh
  statement: The server emits value:sse-event over GET /api/v1/events; the web app subscribes once per project and refetches only the affected node, list or graph neighbourhood named in the event payload.
  source: packages/server/src/events.ts; packages/web/src/lib/events.ts
  status: proposed
  requires-tests: [ui-test:edit-node-flow]
```

### Writer

```yaml
- id: rule:patch-in-place
  statement: The writer locates the node's yaml block by the file and line the parser recorded and the id on its first line, replaces exactly those lines, and leaves every other byte of the file unchanged; a node defined by a table row or a heading is patched by rewriting that row or the block under the heading.
  source: packages/core/src/writer.ts#patchNode
  status: proposed
  requires-tests: [test:core-writer#patch-body, test:core-writer#patch-preserves-neighbours, test:core-writer#round-trip-stability]

- id: rule:edge-serialisation
  statement: addEdges and removeEdges are written as typed keys when the verb has one (refines, satisfied-by, verified-by, governed-by, gated-by, reads, writes, calls, contradicts, owns, set-by, applies-to, see, resolves, depends-on) and otherwise as `a -(verb)-> b` lines under an edges key; removing the last item of a key removes the key.
  source: packages/core/src/writer.ts#serialiseEdges
  status: proposed
  requires-tests: [test:core-writer#edge-add-remove]

- id: rule:section-map
  statement: schema/kinds.yaml gains a sections map from kind to the ## heading the template uses (req → R, entity → 1, value → 2, state → 3, op → 4, page → 5, rule → 6, gate → 8, decision → D, question → 11); createNode appends to the end of that section and creates the heading in template order when absent.
  source: packages/core/src/writer.ts#createNode; schema/kinds.yaml#sections
  status: proposed
  requires-tests: [test:core-writer#create-in-section, test:core-writer#create-adds-heading]

- id: rule:if-match
  statement: A node's hash is sha256 of its dedented body as the parser produces it; graph.patch requires ifMatch and refuses with conflict {current, hash} when it differs from the registry's hash; graph.create needs no hash.
  source: packages/core/src/writer.ts#hashOf; packages/server/src/services/graph.ts#patch
  status: proposed
  requires-tests: [test:core-writer#conflict]

- id: rule:validate-before-write
  statement: Before touching disk the writer re-parses the patched file text together with the project's other files in memory and runs check; a parse failure is invalid_patch, a lint error is lint_failed with the messages, and only then is the file written.
  source: packages/core/src/writer.ts#validate
  status: proposed
  requires-tests: [test:core-writer#reject-parse-error, test:core-writer#reject-lint-error]

- id: rule:stub-targets-warn
  statement: An edge to an id no file describes is accepted; the write result carries warnings listing the stub ids, matching v0.1's rule that referenced-but-undescribed nodes are visible, not refused.
  source: packages/core/src/writer.ts#validate
  status: proposed
  requires-tests: [test:core-writer#stub-target-warns]

- id: rule:atomic-file-write
  statement: A file is written to <file>.tmp-<pid> and renamed over the original; the watcher ignores .tmp- files.
  source: packages/core/src/writer.ts#writeAtomic
  status: proposed
  requires-tests: [test:core-writer#concurrent-writes-serialised]

- id: rule:per-file-queue
  statement: Writes are serialised per absolute file path through a promise chain; a write waits for the previous write to the same file to finish and re-reads the file before applying.
  source: packages/core/src/writer.ts#queue
  status: proposed
  requires-tests: [test:core-writer#concurrent-writes-serialised]

- id: rule:cli-fallback
  statement: ctx reads WATERFALL_URL (default http://localhost:7777); if a GET /api/v1/projects.list answers within 300 ms it calls the server, otherwise it runs core on the local files; output is rendered by the same formatter either way.
  source: packages/cli/src/client.ts
  status: proposed
  requires-tests: [test:cli#server-and-local-identical]
```

### Tasks, decisions, packets

```yaml
- id: rule:clerk-triggers
  statement: A clerk run is queued on decisions.post, on tasks.create, on tasks.update when links change, and on clerk.run; never on a markdown change alone.
  source: packages/server/src/clerk/queue.ts#enqueue
  status: proposed
  requires-tests: [test:clerk#task-run-no-delta, test:server-api#clerk-run-on-demand]

- id: rule:decision-immutable
  statement: The decision table has no update path except clerkStatus; decisions.post with supersedes sets supersedesId on the new row and never touches the old one.
  source: packages/server/src/services/decisions.ts#post
  status: proposed
  requires-tests: [test:server-services#decision-immutable]

- id: rule:post-wait
  statement: decisions.post awaits the queued clerk run with a 5 s timeout; on completion it returns {decision, related, contradictions, deltaId}, on timeout {decision, clerkStatus: pending}, and when the clerk is disabled {decision, clerkStatus: skipped}.
  source: packages/server/src/services/decisions.ts#post
  status: proposed
  requires-tests: [test:server-api#decisions-post-waits, test:server-api#decisions-post-pending]

- id: rule:packet-task-seeds
  statement: When graph.packet receives a task id, seeds are the task's linked node ids in link order (instead of search hits); after the node blocks, open decisions whose affects intersect the emitted nodes and open contradictions with a side among them are appended, within the same budget.
  source: packages/core/src/packet.ts#fromTask
  status: proposed
  requires-tests: [test:server-services#packet-from-task]
```

### Clerk

```yaml
- id: rule:clerk-context
  statement: A run's input is the trigger row, graph.packet around the affected nodes (budget from the task or 8000), every decision whose affects intersects the two-hop neighbourhood, and open contradictions with a side in it; the input's sha256 is the run's inputHash.
  source: packages/server/src/clerk/context.ts
  status: proposed
  requires-tests: [test:clerk#context-assembly]

- id: rule:clerk-tools
  statement: The clerk's tool list is graph.get, graph.neighbors, graph.impact, graph.search, graph.packet, decisions.list, contradictions.list, propose_delta and report_contradiction; it is built from a fixed array, not from the public registry.
  source: packages/server/src/clerk/tools.ts
  status: proposed
  requires-tests: [test:clerk#tool-set-is-closed]

- id: rule:clerk-no-self-trigger
  statement: The clerk's session kind is internal; tasks.create, tasks.update and decisions.post refuse an internal session with unauthorized, so no clerk output can queue another run.
  source: packages/server/src/tools/_scope.ts#refuseInternal
  status: proposed
  requires-tests: [test:clerk#tool-set-is-closed]

- id: rule:clerk-propose-only
  statement: propose_delta stores a graph_delta row with status proposed and returns its id; the clerk process has no reference to the writer.
  source: packages/server/src/clerk/tools.ts#proposeDelta
  status: proposed
  requires-tests: [test:clerk#no-disk-write]

- id: rule:clerk-delta-shape
  statement: A decision run's delta contains one create op for a decision node (id decision:<module>.<slug>, keys date, context, options, choice, consequences, decision-id) in the module owning most affected nodes, zero or more create or patch ops for req, rule and flag nodes with status proposed, and edge ops; it never contains a status op to shipped.
  source: packages/server/src/clerk/prompt.ts; packages/server/src/clerk/tools.ts#validateShape
  status: proposed
  requires-tests: [test:clerk#decision-becomes-adr-node]

- id: rule:delta-validated
  statement: Before a graph_delta row is stored its ops are applied to an in-memory copy of the project files and parsed; a failure rejects propose_delta with invalid_patch and the run fails.
  source: packages/server/src/services/deltas.ts#validate
  status: proposed
  requires-tests: [test:server-services#delta-validated-on-store]

- id: rule:delta-atomic
  statement: deltas.apply groups ops by file, applies each group through the writer with the current hashes, and if any group fails restores every file already written from its pre-apply content, records the error on the delta and leaves status proposed.
  source: packages/server/src/services/deltas.ts#apply
  status: proposed
  requires-tests: [test:server-services#delta-apply-atomic]

- id: rule:clerk-budget
  statement: A run stops with status failed and error "budget" after 40 tool calls or when cumulative input tokens exceed 200k; both limits are config with those defaults.
  source: packages/server/src/clerk/runner.ts#loop
  status: proposed
  requires-tests: [test:clerk#budget-stops-run]

- id: rule:clerk-cache
  statement: Before calling the model the runner looks for a done clerk_run with the same inputHash and model; a hit copies its output into the new run with status done and zero tokens.
  source: packages/server/src/clerk/runner.ts#cached
  status: proposed
  requires-tests: [test:clerk#cache-hit]

- id: rule:clerk-classify
  statement: For each rule, req and decision in the two-hop neighbourhood the clerk must call report_contradiction with a verdict from value:pair-verdict and a one-sentence explanation; contradicts and duplicate create semantic contradiction rows, consistent and refines are recorded in the run output only.
  source: packages/server/src/clerk/classify.ts
  status: proposed
  requires-tests: [test:clerk#classification-fixtures, test:clerk#decision-vs-rule-finding]

- id: rule:side-ids
  statement: A contradiction side is either a node id (kind:slug) or decision:<uuid>; the UI and the check resolve each side to its text through the graph or the decision table.
  source: packages/server/src/services/contradictions.ts#sideText
  status: proposed
  requires-tests: [test:clerk#decision-vs-rule-finding]

- id: rule:strict-open-contradiction
  statement: graph.check with strict adds an error for every open contradiction where either side is a node with status shipped (or a req with no status); without strict it is a warning with the count.
  source: packages/core/src/check.ts#openContradictions
  status: proposed
  requires-tests: [test:core-check#strict-open-contradiction]
```

### Web app

```yaml
- id: rule:document-tree
  statement: A document is one markdown file in the project's graph folder. The tree comes from has edges between module nodes; a module with no incoming has from another module is a root; the main root (where /p/<project> lands) is the root with the most sub-documents, ties broken by title. Linked documents exclude module-to-module containment edges.
  source: packages/web/src/lib/doc.ts#documentTree; packages/web/src/lib/doc.ts#linkedDocuments
  status: unverified
  verified-by: [test:web-lib#doc]

- id: rule:smart-tags
  statement: Every kind:slug token in prose, inline code, table cells and card properties renders as a tag (kind dot, slug; req tags drop the prefix; dashed when the node is referenced but never defined) whose hover shows title and status and whose click opens the peek panel. Trailing punctuation stays text; a test id keeps its #method in the label but links to the test node. Text already inside a link is left alone.
  source: packages/web/src/lib/remark-tags.ts; packages/web/src/components/SmartTag.tsx; packages/web/src/components/IdLink.tsx#Linkified
  status: unverified
  verified-by: [test:web-lib#remark-tags]

- id: rule:segment-write
  statement: The web app writes a document by span, never by regenerating it. splitDocument records character offsets for every prose segment and yaml chunk; a write re-reads the file, re-splits it, compares the sha256 of the target span with ifMatch (409 on mismatch), splices the new text (a chunk keeps its list style by re-indenting under "- "), writes <file>.tmp-<pid> and renames it, then runs ctx build and ctx check in the project root and returns the new hashes and lint errors.
  source: packages/web/src/lib/write.ts; packages/web/src/app/api/p/[project]/doc/[slug]/route.ts
  status: unverified
  verified-by: [test:web-lib#write]

- id: rule:prose-round-trip
  statement: Every prose section is a live block editor (the text between yaml blocks and --- rules); yaml blocks and rules are boundaries outside the editor, so they survive untouched. Hard-wrapped paragraphs are unwrapped before import; ids become tag inline content on import and on blur, and export as plain id text. A section saves only after the user has focused and changed it (programmatic loads never save), 700 ms after the last change, with the section's hash; empty table rows the importer invents are dropped from the export. Every section has a raw-markdown mode.
  note: BlockNote's export reflows the section it exports (paragraph wrapping, table column widths), so an edited section is rewritten in the editor's formatting; untouched sections are byte-identical.
  source: packages/web/src/components/SectionEditor.tsx; packages/web/src/components/BlockEditor.tsx
  status: unverified
  requires-tests: [ui-test:edit-node-flow]

- id: rule:card-form
  statement: A card is always editable in place: title, status (select), when/then/unless, prose keys as growing text areas, list keys as tag chips with an add box (autocomplete from the node index), nested blocks as raw text, and a yaml toggle for the raw chunk. Changes autosave 700 ms after the last keystroke with the chunk's hash; the fields serialise back in their original order (lists as flow lists, long prose as > blocks) and the id never changes.
  source: packages/web/src/lib/yaml-form.ts; packages/web/src/components/CardEditor.tsx
  status: unverified
  verified-by: [test:web-lib#yaml-form]

- id: rule:new-document
  statement: A new document is created from templates/docs/<template>.md with the title, slug, parent and date filled in; its frontmatter declares part-of module:<parent> so the tree picks it up without editing the parent file; the slug is derived from the title and an existing file is refused.
  source: packages/web/src/app/api/p/[project]/doc/route.ts; packages/web/src/lib/templates.ts; templates/docs
  status: unverified
  verified-by: [test:web-lib#templates]

- id: rule:prose-nodes
  statement: A paragraph or list item whose first token is an id defines that node (`req:<slug> When a sale …`); the text after the id is its `text` (title = first sentence), `#status` sets status, a trailing `(key: value, …)` group carries other keys. Links `[phrase](kind:slug)` and bare ids in the text become edges whose verb is inferred from the words before the id ("satisfied by", "verified by", "refines", "part of", …) and is related-to otherwise. Short aliases (et:, rq:, rl:, pg:, st:, dc:, qn:) expand to full kinds. A link in plain prose relates the document to its target. Yaml blocks keep defining nodes exactly as before.
  source: lib/parse.js#proseRefs; lib/parse.js#inferVerb; schema/kinds.yaml
  status: unverified
  verified-by: [test:prose]

- id: rule:single-page-editor
  statement: A document is one editor. Prose blocks, headings, lists, tables, code and dividers are ordinary blocks; every node (from a yaml block or a prose line) is a typed block with kind, slug and status in its header and its text as editable inline content; ids are tag inline content; a phrase can be linked to any node from the selection toolbar. Import lifts yaml blocks, rules and id links out of the markdown before the browser parser sees them; export is our own serializer, so untouched text round-trips (paragraph wrapping, table alignment and block grouping are normalised). A paragraph typed with a leading id becomes a node block when the editor loses focus. The whole body autosaves with a hash; a failed import disables editing and shows the reader; a save that would drop more than half of the text is refused.
  source: packages/web/src/components/DocEditor.tsx; packages/web/src/lib/import.ts; packages/web/src/lib/serialize.ts
  status: unverified
  verified-by: [test:web-lib#serialize, test:web-lib#import]

- id: rule:node-cards
  statement: A yaml block is split into chunks on id lines exactly as the parser does; a chunk whose id the graph defines renders as a card, any other chunk as a code block. A block with no defined ids renders as code.
  source: packages/web/src/lib/doc.ts#splitDocument; packages/web/src/components/Document.tsx
  status: unverified
  verified-by: [test:web-lib#doc]

- id: rule:deep-links
  statement: Every view is a route under /p/<project>; the node page is /n/<id>, the graph /graph?focus=<id>&preset=<name>, lists carry their filters in the query; navigating updates the URL and loading a URL restores the view.
  source: packages/web/src/app/p/[project]/layout.tsx; packages/web/src/app/p/[project]/graph/page.tsx
  status: unverified
  requires-tests: [ui-test:deep-link]

- id: rule:prose-keys
  statement: A yaml key is prose if it is in value:prose-key or its value is a block scalar (> or |); prose keys get the block editor, everything else a form field; edge keys get id lists with typeahead over graph.search.
  source: packages/web/src/lib/graph.ts#parseBody
  status: unverified
  verified-by: [test:web-lib#graph]
  requires-tests: [test:web-components#node-page-properties]

- id: rule:blocknote-prose-only
  statement: BlockNote edits only the text of a prose key; on save its blocks are exported to markdown and written back as that key's block scalar; the node's other keys never pass through BlockNote, because its markdown round-trip is lossy.
  source: packages/web/src/components/ProseEditor.tsx
  status: proposed
  requires-tests: [test:web-components#node-page-prose-editor]

- id: rule:mindmap-layout
  statement: The graph view lays out the focus node's tree (refines and has edges, outgoing from the focus, depth from the preset) with dagre left-to-right, draws remaining structural edges among visible nodes as cross-links, and hides mentions unless the preset is Everything.
  source: packages/web/src/lib/layout.ts#layoutMindMap
  status: unverified
  verified-by: [test:web-lib#layout]
  requires-tests: [test:web-components#graph-layout]
```
