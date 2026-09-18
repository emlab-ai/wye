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

The mechanisms that satisfy the PRD: entities (DB tables and in-memory types), value objects, state machines, operations (the tool set exposed over MCP and HTTP), pages (the web app and the agent-facing documents) and rules (what the code will enforce). Every `source:` is the intended file; `ctx check --strict` fails until it exists.

---

## 0. module:wf2-dev

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

---

## 1. Entities

### DB tables (SQLite via Drizzle; every table has id, tenantId, createdBy, createdAt, updatedAt — rule:hosting-columns)

```yaml
- id: entity:product
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
- id: entity:project
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

### entity:task-link

```yaml
- id: entity:task-link
  storage: table task_link
  source: packages/server/src/db/schema.ts#taskLink
  description: One node a task touches, with the role it plays. req:wf2.ui
  fields:
    taskId:   entity:task
    nodeId:   string               # kind:slug in the project's graph
    role:     value:task-link-role
```

### entity:task

```yaml
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
    status:         value:task-status
    assigneeKind:   value:assignee-kind
    assigneeName:   string?
    packetBudget:   int            # default 6000 chars, used by graph.packet when given this task
  edges:
    - entity:task -(has)-> entity:task-link
    - entity:task -(owns)-> state:task-lifecycle
    - entity:task -(governed-by)-> rule:clerk-triggers
```

### entity:decision

```yaml
- id: entity:decision
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
```

### entity:contradiction

```yaml
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
- id: entity:clerk-run
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
- id: entity:agent-session
  storage: table agent_session
  source: packages/server/src/db/schema.ts#agentSession
  description: >
    Who is talking to the server. Created or touched on every call that names an agent (rule:created-by).
  fields:
    name:        string                # from X-Agent header or MCP client info
    kind:        value:agent-kind
    tokenHash:   string?               # null locally; enforced by gate:agent-token when hosted
    lastSeenAt:  datetime
```

### In-memory types (packages/core and packages/server)

### entity:graph-registry

```yaml
- id: entity:graph-registry
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
- id: entity:node-patch
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
- id: entity:packet
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
- id: state:task-lifecycle
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
- id: state:decision-clerk-status
  owner: entity:decision
  states: [pending, done, failed, skipped]
  transitions:
    - pending -> done      : the clerk run finished            # packages/server/src/clerk/runner.ts#finish
    - pending -> failed    : model error, budget, invalid delta
    - failed -> pending    : Retry pressed (action:retry-clerk)
    - pending -> skipped   : the clerk is disabled (phase 1) or the decision affects no nodes
- id: state:contradiction-lifecycle
  owner: entity:contradiction
  states: [open, resolved, dismissed]
  transitions:
    - open -> resolved    : contradictions.resolve with a decision or task
    - open -> dismissed   : contradictions.dismiss with a reason
    - resolved -> open    : a structural row reappears in markdown after being resolved (re-opened on parse)
  terminal: [dismissed]
- id: state:delta-lifecycle
  owner: entity:graph-delta
  states: [proposed, applied, rejected]
  transitions:
    - proposed -> applied    : deltas.apply succeeds for every op (rule:delta-atomic)
    - proposed -> rejected   : deltas.reject with a reason
    - proposed -> proposed   : deltas.apply fails; error recorded, nothing written
  terminal: [applied, rejected]
- id: state:clerk-run-status
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
- id: page:web/sidebar
  route: every route; the left rail; first screen at phone width
  component: packages/web/src/app/p/[project]/layout.tsx; packages/web/src/components/DocTree.tsx; packages/web/src/components/Search.tsx
  reads: [op:projects.list, op:graph.search, op:tasks.list, op:contradictions.list]
  actions:
    - action:search:          type to search document titles, headings, node ids and titles; a node hit opens its definition -(navigates)-> page:web/node
    - action:open-document:   tap a document in the tree -(navigates)-> page:web/node
    - action:open-heading:    tap an outline entry under the open document (scrolls to the ## heading)
    - action:open-overview:   Overview — the product page (description, projects, knowledge counts)
    - action:open-goals:      Goals -(navigates)-> page:web/goals
    - action:open-tasks:      Tasks -(navigates)-> page:web/tasks
    - action:open-knowledge:  Knowledge — every kind of node as a list -(navigates)-> page:web/knowledge
    - action:open-types:      Types — the product's ontology -(navigates)-> page:web/types
    - action:open-graph:      Graph -(navigates)-> page:web/graph
    - action:open-questions:  Questions — open question blocks and inbox questions
    - action:open-inbox:      Inbox — proposed blocks and raw notes awaiting review
    - action:open-sessions:   Agents — every conversation and run, and the runners (the rail and the top bar say "Agents", task:new-917) -(navigates)-> page:web/sessions
    - action:new-document:    + next to Documents creates a document under a parent
  display-rules:
    - menu order: Overview, Search, Goals, Tasks, Knowledge, Types, Graph, Questions, Inbox, Sessions; then the Documents tree (rule:documents-tree); the rail is collapsible (rule:app-navigation)
    - the rail lists documents, not nodes: root documents → sub-documents; the open document shows its ## outline beneath it
    - counts and lists refresh on graph, inbox and session change events (rule:live-refresh)
```

### page:web/node

```yaml
- id: page:web/node
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
- id: page:web/graph
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

### page:web/context-column

```yaml
- id: page:web/context-column
  route: the right column on every route; opened by any tag, row or ⇢ action, hidden with ⌘.
  component: packages/web/src/components/PeekPanel.tsx; packages/web/src/components/PeekProvider.tsx; packages/web/src/components/TypeView.tsx; packages/web/src/components/SessionView.tsx; packages/web/src/components/Console.tsx
  reads: [op:graph.get, op:graph.neighbors]
  actions:
    - action:open-item:        a tag, a list row or a graph node pushes the item on the column's chip stack; ← goes back, 📍 pins a chip so it survives, × removes it
    - action:go-to-definition: jump to the node's block in its document -(navigates)-> page:web/node
    - action:show-in-graph:    open the graph focused on the node -(navigates)-> page:web/graph
    - action:send-to-agent:    send the node (id, title, link) to an active session or a new one (rule:agent-sessions)
    - action:open-type-page:   on a type: node -(navigates)-> page:web/types
    - action:edit-type:        on a product type, edit its own properties (name, value type, required, inverse; + property) and purpose; Save to document rewrites the type card
    - action:answer-question:  in a session console, answer the agent's question (rule:agent-questions)
  display-rules:
    - a node shows its card, then (typed nodes) Properties — effective properties with placeholders and the inverses read from the other side — then Connected as a list grouped by relation (incoming relations labelled by their inverse name) or as a graph 1–2 hops out
    - a document shows a preview (title, status, intro, outline, Open document →) and Connected; a goal or task shows its tracking editor and what is part of it; a type shows its card, editable properties, instances and Connected; a session shows its console
    - Context mode (no item open on a document page) follows the block being edited and shows the knowledge nearest to it (rule:context-panel)
    - field, prop and block nodes never appear in Connected; a document's phrase links are read from its blocks (rule:ontology.hidden-kinds)
```

### page:web/types

```yaml
- id: page:web/types
  route: /<product>/types and /<product>/types/<slug>
  component: packages/web/src/app/[product]/types/page.tsx; packages/web/src/app/[product]/types/[slug]/page.tsx; packages/web/src/components/TypeRows.tsx; packages/web/src/components/AddInstance.tsx; packages/web/src/components/AddType.tsx
  reads: [op:graph.get]
  actions:
    - action:open-type:        click anywhere on a type's row → the type in the context column (page:web/context-column); ↗ opens its page
    - action:add-instance:     + add <type> writes a <type>:<slug> card with the type's required properties into the type's home document -(calls)-> op:types.add
    - action:add-type:         + add type under the product's own types: name (→ slug), extends (any type, node by default), purpose, destination document; writes the type: card and opens the new type in the context column where its properties are added -(calls)-> op:types.create
  display-rules:
    - the index lists the product's own types first (name, extends, instance and own-property counts, purpose, where declared), then the base types
    - a type page: crumbs along the extends chain; properties (own and inherited, the root type's folded into one line); subtypes; every instance as component:instance-table — a column per property, search, status chips, a filter per enum / ref / bool property, group by, sort, all in the URL (req:ontology.type-page, req:wf2.instances.filter)
```

### page:web/sessions

```yaml
- id: page:web/sessions
  title: Agents
  route: /<product>/sessions (named "Agents" in the rail, the top bar and its heading); a session opens in the context column
  component: packages/web/src/app/[product]/sessions/page.tsx; packages/web/src/components/SessionList.tsx; packages/web/src/components/SessionView.tsx; packages/web/src/components/Console.tsx; packages/web/src/components/AskQuestions.tsx
  actions:
    - action:new-conversation: + New conversation starts a chat session with the default agent
    - action:command-palette:  ⌘P / Ctrl+P anywhere opens the command box (component:command-box — the same one every "Send to agent" opens, decision:wf2.one-command-box) in the middle of the screen; the node under the cursor and the document travel along as refs; what is typed starts a chat session that plans first (rule:plan-first) — a clean slate by default, rule:clean-slate — or goes into a live conversation chosen in "to" (with "clear context first" its agent restarts from nothing), or is queued for a runner; images pasted or dropped into the box (thumbnails, ×, up to 8) become the session's files and go with the message (req:wf2.ui.palette-images); the conversation opens in the context column
    - action:open-session:     a row opens the session in the context column: status, agent, instruction, refs, then the console
    - action:send-message:     type (⌘↵) or paste images; sent now or queued while a turn runs (rule:session-queue)
    - action:answer-question:  choose options / type an answer on the agent's question card; Answer returns the choices to the agent, Skip lets it go on (rule:agent-questions)
    - action:allow-deny:       Allow or Deny any other permission request; the card shows the tool and what it wants
    - action:expand-activity:  open a folded "n steps" row to read every tool call and result
    - action:see-usage:        the console bar shows the context size (the last call's prompt, as a share of the model's window) and the tokens the session spent so far (read, including cache, and written) — each turn's result event carries its usage (agent-host#claudeUsage; Codex: in/out only), the console adds them up (task:new-441)
    - action:see-knowledge:    after each turn a "knowledge" row lists the documents and nodes the turn changed as tags (the session's artifacts not shown yet, lib:artifacts), and the header keeps a live "knowledge" strip of everything the session changed (req:wf2.sessions.knowledge-changes)
    - action:stop-resume:      Stop the agent; Resume restarts it on the same conversation (rule:agent-host)
    - action:hand-off:         continue the work under another agent (rule:agent-sessions)
  display-rules:
    - Runners online and working; Active / All filters; a row shows status, first line of the instruction, agent, mode, folder, age and refs
    - the console is the conversation: user messages (with images), the agent's replies as markdown, questions and permission cards, folded activity rows, subagents nested under their Task, turn ends with time and cost, `wf session log` lines and the `wf session done` summary in place by time (rule:console-flow)
    - a pending question is the agent waiting: nothing continues until Answer or Skip
```

### page:web/tasks

```yaml
- id: page:web/tasks
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
- id: page:web/decisions
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
- id: page:web/contradictions
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
- id: page:skill/context-v2
  route: skills/waterfall-context/SKILL.md (rewritten)
  component: skills/waterfall-context/SKILL.md
  description: >
    The agent contract in tool names — graph.packet before code, decisions.post for every decision, graph.patch
    before shipping, graph.check before done — plus the wiring section for Claude Code and Codex.
- id: page:agents-snippet
  route: templates/AGENTS-snippet.md (pasted into a project's CLAUDE.md and AGENTS.md)
  component: templates/AGENTS-snippet.md
  description: One paragraph stating the same contract for agents that do not load skills.
```

---

## 6. Rules

### Storage and identity

```yaml
- id: rule:markdown-canonical
  statement: >
    No DB table stores a node body or edge list; the DB references nodes by id string only. The in-memory graph is
    rebuilt only from files by the watcher; every write, from the UI, an agent or a delta, goes through the writer
    and the file.
  source: packages/server/src/services/graph.ts#write; packages/server/src/db/schema.ts
  status: proposed
  requires-tests: [test:server-services#no-body-duplication, test:server-services#ui-write-is-file-write]
- id: rule:hosting-columns
  statement: >
    Every table has tenantId (default "local"), createdBy (the agent or user name), createdAt and updatedAt;
    agent_session has tokenHash. No code path reads tenantId or tokenHash locally.
  source: packages/server/src/db/schema.ts#baseColumns
  status: proposed
  requires-tests: [test:server-services#hosting-columns-present]
- id: rule:created-by
  statement: >
    The agent name from the X-Agent header or MCP client info is attached to the request context; every row
    written in that request gets it as createdBy; missing name is "anonymous".
  source: packages/server/src/middleware/agent.ts
  status: proposed
  requires-tests: [test:server-api#agent-header-recorded]
- id: rule:project-scoped
  statement: >
    Every tool resolves its project argument by id or unique name before doing anything else and answers not_found
    when unknown.
  source: packages/server/src/tools/_scope.ts
  status: proposed
  requires-tests: [test:server-api#unknown-project]
- id: rule:question-decision-nodes
  statement: >
    The template gains a §D Decisions section (ADR keys date, context, options, choice, consequences, optional
    decision-id) and §11 questions are yaml nodes with an id and q; the parser treats both as ordinary yaml nodes.
    The section map (rule:section-map) places new decision and question nodes there.
  source: templates/module.md; schema/kinds.yaml
  status: proposed
  requires-tests: [test:core-parser#question-and-decision-nodes]
```

### Server and watcher

```yaml
- id: rule:watcher-debounce
  statement: >
    File events under a project's graph path are debounced 200 ms per file; a re-parse runs for the whole project,
    replaces the registry graph, recomputes node hashes, upserts structural contradictions and emits graph.changed
    with the ids whose hash changed.
  source: packages/server/src/registry.ts#watch
  status: proposed
  requires-tests: [test:server-services#watch-reparse]
- id: rule:last-good-graph
  statement: >
    If a parse throws, the registry keeps the previous graph and node hashes, records lastError with file and
    line, and emits graph.parse_error; reads keep answering from the previous graph and writes to the broken file
    are refused with invalid_patch.
  source: packages/server/src/registry.ts#reparse
  status: proposed
  requires-tests: [test:server-services#parse-error-keeps-last-good]
- id: rule:structural-import
  statement: >
    After every parse, each drift node yields one contradiction per contradicts edge pair and each explicit
    contradicts edge yields one, keyed (project, sideA, sideB) with sides sorted; existing rows are touched,
    missing rows that were open are closed as resolved with reason "removed from markdown", and rows previously
    resolved reopen if the pair reappears.
  source: packages/server/src/services/contradictions.ts#importStructural
  status: proposed
  requires-tests: [test:server-services#structural-import-idempotent]
- id: rule:config-print
  statement: >
    On start the server prints a `claude mcp add waterfall -- <stdio command>` line, a `claude mcp add --transport
    http waterfall <url>` line, and a `[mcp_servers.waterfall]` TOML block with command/args and a second with
    url, each ready to paste.
  source: packages/server/src/main.ts#printAgentConfig
  status: proposed
  requires-tests: [test:server-api#config-print]
- id: rule:one-tool-set
  statement: >
    Tools are defined once as {name, schema (zod), handler}; the MCP server registers each as an MCP tool and the
    HTTP router mounts each at POST /api/v1/<name>; there is no tool reachable by one transport and not the other.
  source: packages/server/src/tools/index.ts
  status: proposed
  requires-tests: [test:server-api#same-cases-http-and-mcp]
- id: rule:error-shape
  statement: >
    Handlers throw ToolError(code, message, details); the HTTP layer maps code to status (409 conflict, 422
    invalid_patch and lint_failed, 404 not_found, 401 unauthorized) and the MCP layer returns isError with the
    same JSON in the content.
  source: packages/server/src/errors.ts
  status: proposed
  requires-tests: [test:server-api#error-shape]
- id: rule:sse-refresh
  statement: >
    The server emits value:sse-event over GET /api/v1/events; the web app subscribes once per project and
    refetches only the affected node, list or graph neighbourhood named in the event payload.
  source: packages/server/src/events.ts; packages/web/src/lib/events.ts
  status: proposed
  requires-tests: [ui-test:edit-node-flow]
```

### Writer

```yaml
- id: rule:patch-in-place
  statement: >
    The writer locates the node's yaml block by the file and line the parser recorded and the id on its first
    line, replaces exactly those lines, and leaves every other byte of the file unchanged; a node defined by a
    table row or a heading is patched by rewriting that row or the block under the heading.
  source: packages/core/src/writer.ts#patchNode
  status: proposed
  requires-tests: [test:core-writer#patch-body, test:core-writer#patch-preserves-neighbours, test:core-writer#round-trip-stability]
- id: rule:edge-serialisation
  statement: >
    addEdges and removeEdges are written as typed keys when the verb has one (refines, satisfied-by, verified-by,
    governed-by, gated-by, reads, writes, calls, contradicts, owns, set-by, applies-to, see, resolves, depends-on)
    and otherwise as `a -(verb)-> b` lines under an edges key; removing the last item of a key removes the key.
  source: packages/core/src/writer.ts#serialiseEdges
  status: proposed
  requires-tests: [test:core-writer#edge-add-remove]
- id: rule:section-map
  statement: >
    schema/kinds.yaml gains a sections map from kind to the ## heading the template uses (req → R, entity → 1,
    value → 2, state → 3, op → 4, page → 5, rule → 6, gate → 8, decision → D, question → 11); createNode appends
    to the end of that section and creates the heading in template order when absent.
  source: packages/core/src/writer.ts#createNode; schema/kinds.yaml#sections
  status: proposed
  requires-tests: [test:core-writer#create-in-section, test:core-writer#create-adds-heading]
- id: rule:if-match
  statement: >
    A node's hash is sha256 of its dedented body as the parser produces it; graph.patch requires ifMatch and
    refuses with conflict {current, hash} when it differs from the registry's hash; graph.create needs no hash.
  source: packages/core/src/writer.ts#hashOf; packages/server/src/services/graph.ts#patch
  status: proposed
  requires-tests: [test:core-writer#conflict]
- id: rule:validate-before-write
  statement: >
    Before touching disk the writer re-parses the patched file text together with the project's other files in
    memory and runs check; a parse failure is invalid_patch, a lint error is lint_failed with the messages, and
    only then is the file written.
  source: packages/core/src/writer.ts#validate
  status: proposed
  requires-tests: [test:core-writer#reject-parse-error, test:core-writer#reject-lint-error]
- id: rule:stub-targets-warn
  statement: >
    An edge to an id no file describes is accepted; the write result carries warnings listing the stub ids,
    matching v0.1's rule that referenced-but-undescribed nodes are visible, not refused.
  source: packages/core/src/writer.ts#validate
  status: proposed
  requires-tests: [test:core-writer#stub-target-warns]
- id: rule:atomic-file-write
  statement: >
    A file is written to <file>.tmp-<pid> and renamed over the original; the watcher ignores .tmp- files.
  source: packages/core/src/writer.ts#writeAtomic
  status: proposed
  requires-tests: [test:core-writer#concurrent-writes-serialised]
- id: rule:per-file-queue
  statement: >
    Writes are serialised per absolute file path through a promise chain; a write waits for the previous write to
    the same file to finish and re-reads the file before applying.
  source: packages/core/src/writer.ts#queue
  status: proposed
  requires-tests: [test:core-writer#concurrent-writes-serialised]
- id: rule:cli-fallback
  statement: >
    ctx reads WATERFALL_URL (default http://localhost:7777); if a GET /api/v1/projects.list answers within 300 ms
    it calls the server, otherwise it runs core on the local files; output is rendered by the same formatter
    either way.
  source: packages/cli/src/client.ts
  status: proposed
  requires-tests: [test:cli#server-and-local-identical]
```

### Tasks, decisions, packets

```yaml
- id: rule:clerk-triggers
  statement: >
    A clerk run is queued on decisions.post, on tasks.create, on tasks.update when links change, and on clerk.run;
    never on a markdown change alone.
  source: packages/server/src/clerk/queue.ts#enqueue
  status: proposed
  requires-tests: [test:clerk#task-run-no-delta, test:server-api#clerk-run-on-demand]
- id: rule:decision-immutable
  statement: >
    The decision table has no update path except clerkStatus; decisions.post with supersedes sets supersedesId on
    the new row and never touches the old one.
  source: packages/server/src/services/decisions.ts#post
  status: proposed
  requires-tests: [test:server-services#decision-immutable]
- id: rule:post-wait
  statement: >
    decisions.post awaits the queued clerk run with a 5 s timeout; on completion it returns {decision, related,
    contradictions, deltaId}, on timeout {decision, clerkStatus: pending}, and when the clerk is disabled
    {decision, clerkStatus: skipped}.
  source: packages/server/src/services/decisions.ts#post
  status: proposed
  requires-tests: [test:server-api#decisions-post-waits, test:server-api#decisions-post-pending]
- id: rule:packet-task-seeds
  statement: >
    When graph.packet receives a task id, seeds are the task's linked node ids in link order (instead of search
    hits); after the node blocks, open decisions whose affects intersect the emitted nodes and open contradictions
    with a side among them are appended, within the same budget.
  source: packages/core/src/packet.ts#fromTask
  status: proposed
  requires-tests: [test:server-services#packet-from-task]
```

### Clerk

```yaml
- id: rule:clerk-context
  statement: >
    A run's input is the trigger row, graph.packet around the affected nodes (budget from the task or 8000), every
    decision whose affects intersects the two-hop neighbourhood, and open contradictions with a side in it; the
    input's sha256 is the run's inputHash.
  source: packages/server/src/clerk/context.ts
  status: proposed
  requires-tests: [test:clerk#context-assembly]
- id: rule:clerk-tools
  statement: >
    The clerk's tool list is graph.get, graph.neighbors, graph.impact, graph.search, graph.packet, decisions.list,
    contradictions.list, propose_delta and report_contradiction; it is built from a fixed array, not from the
    public registry.
  source: packages/server/src/clerk/tools.ts
  status: proposed
  requires-tests: [test:clerk#tool-set-is-closed]
- id: rule:clerk-no-self-trigger
  statement: >
    The clerk's session kind is internal; tasks.create, tasks.update and decisions.post refuse an internal session
    with unauthorized, so no clerk output can queue another run.
  source: packages/server/src/tools/_scope.ts#refuseInternal
  status: proposed
  requires-tests: [test:clerk#tool-set-is-closed]
- id: rule:clerk-propose-only
  statement: >
    propose_delta stores a graph_delta row with status proposed and returns its id; the clerk process has no
    reference to the writer.
  source: packages/server/src/clerk/tools.ts#proposeDelta
  status: proposed
  requires-tests: [test:clerk#no-disk-write]
- id: rule:clerk-delta-shape
  statement: >
    A decision run's delta contains one create op for a decision node (id decision:<module>.<slug>, keys date,
    context, options, choice, consequences, decision-id) in the module owning most affected nodes, zero or more
    create or patch ops for req, rule and flag nodes with status proposed, and edge ops; it never contains a
    status op to shipped.
  source: packages/server/src/clerk/prompt.ts; packages/server/src/clerk/tools.ts#validateShape
  status: proposed
  requires-tests: [test:clerk#decision-becomes-adr-node]
- id: rule:delta-validated
  statement: >
    Before a graph_delta row is stored its ops are applied to an in-memory copy of the project files and parsed; a
    failure rejects propose_delta with invalid_patch and the run fails.
  source: packages/server/src/services/deltas.ts#validate
  status: proposed
  requires-tests: [test:server-services#delta-validated-on-store]
- id: rule:delta-atomic
  statement: >
    deltas.apply groups ops by file, applies each group through the writer with the current hashes, and if any
    group fails restores every file already written from its pre-apply content, records the error on the delta and
    leaves status proposed.
  source: packages/server/src/services/deltas.ts#apply
  status: proposed
  requires-tests: [test:server-services#delta-apply-atomic]
- id: rule:clerk-budget
  statement: >
    A run stops with status failed and error "budget" after 40 tool calls or when cumulative input tokens exceed
    200k; both limits are config with those defaults.
  source: packages/server/src/clerk/runner.ts#loop
  status: proposed
  requires-tests: [test:clerk#budget-stops-run]
- id: rule:clerk-cache
  statement: >
    Before calling the model the runner looks for a done clerk_run with the same inputHash and model; a hit copies
    its output into the new run with status done and zero tokens.
  source: packages/server/src/clerk/runner.ts#cached
  status: proposed
  requires-tests: [test:clerk#cache-hit]
- id: rule:clerk-classify
  statement: >
    For each rule, req and decision in the two-hop neighbourhood the clerk must call report_contradiction with a
    verdict from value:pair-verdict and a one-sentence explanation; contradicts and duplicate create semantic
    contradiction rows, consistent and refines are recorded in the run output only.
  source: packages/server/src/clerk/classify.ts
  status: proposed
  requires-tests: [test:clerk#classification-fixtures, test:clerk#decision-vs-rule-finding]
- id: rule:side-ids
  statement: >
    A contradiction side is either a node id (kind:slug) or decision:<uuid>; the UI and the check resolve each
    side to its text through the graph or the decision table.
  source: packages/server/src/services/contradictions.ts#sideText
  status: proposed
  requires-tests: [test:clerk#decision-vs-rule-finding]
- id: rule:strict-open-contradiction
  statement: >
    graph.check with strict adds an error for every open contradiction where either side is a node with status
    shipped (or a req with no status); without strict it is a warning with the count.
  source: packages/core/src/check.ts#openContradictions
  status: proposed
  requires-tests: [test:core-check#strict-open-contradiction]
```

### Web app

```yaml
- id: op:node.edit
  args: product, node id; GET → the node, its relations, neighbourhood, type and properties; PUT { status?, text?, props?: { key: value | null } }
  does: >
    edits the node in place under the file lock and rebuilds the graph: a prose node's defining line (status tag,
    text, trailing property group — lib/node-line) or a yaml card (patchYamlCard: status, the text key by name,
    scalars in place, long or multi-line values as `key: >` blocks, null removes). A session header records the
    node as the session's artifact. Used by the wf CLI (wf node set) and the context column's editors.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/node/[id]/route.ts; packages/web/src/lib/node-edit.ts
- id: op:types.create
  args: product; body { slug, extends?, purpose?, doc?, project? } (POST /api/<product>/types)
  does: >
    appends a `type:<slug>` card (extends, purpose) to the product's ontology document — `doc` when given, else
    `ontology.md`, else the document that declares most of its types, else a new `ontology.md` in `project` (the first
    project when none) — into the fence that declares the document's last type, and rebuilds the graph. 409 when
    the slug is a type already (base types included), 422 for a slug that is not lowercase-dashes or an unknown
    parent. Properties come after, through the PUT of op:types.add (decision:ontology.new-type-home)
  gate: none (local app)
  source: packages/web/src/app/api/[product]/types/route.ts; packages/web/src/lib/type-edit.ts; packages/web/src/lib/types.ts
- id: op:types.add
  args: product, type slug; body { slug, title? } (POST /api/<product>/types/<slug>); PUT { props, scalars } edits the type card
  does: >
    appends a `<type>:<slug>` card with the type's required properties as empty keys to the type's home document (its
    `home:` module, else the document that declares it; base types have none) and rebuilds the graph; PUT rewrites the
    card's props block and scalar keys (purpose, extends, open) in place under the file lock
  gate: none (local app)
  source: packages/web/src/app/api/[product]/types/[slug]/route.ts; packages/web/src/lib/instances.ts; packages/web/src/lib/type-edit.ts
- id: op:session.open
  args: product, session id; PATCH { open: "<product/project/doc>[#node]" | "<url>" } (wf session open <id> <target>)
  does: >
    resolves the target to an app path (a document ref becomes /<product>/<project>/d/<doc>, a node suffix its
    anchor, an app URL its path), logs "opened <path>" on the session and emits a live `open` event; the console
    of a chat session that is open in the context column navigates the page to it, once, on the live event only
    (a replayed transcript never navigates). A runner session without a live console just keeps the log line.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/route.ts; packages/web/src/lib/agent-host.ts#openInSession; packages/web/src/lib/open-target.ts; packages/web/src/components/Console.tsx; bin/wf.js#session
```

```yaml
- id: rule:document-tree
  statement: >
    A document is one markdown file in the project's graph folder. The tree comes from has edges between module
    nodes; a module with no incoming has from another module is a root; the main root (where /p/<project> lands)
    is the root with the most sub-documents, ties broken by title. Linked documents exclude module-to-module
    containment edges.
  source: packages/web/src/lib/doc.ts#documentTree; packages/web/src/lib/doc.ts#linkedDocuments
  status: unverified
  verified-by: [test:web-lib#doc]
- id: rule:smart-tags
  statement: >
    Every kind:slug token in prose, inline code, table cells and card properties renders as a tag (kind dot, slug;
    req tags drop the prefix; dashed when the node is referenced but never defined) whose hover shows title and
    status and whose click opens the peek panel. Trailing punctuation stays text; a test id keeps its #method in
    the label but links to the test node. Text already inside a link is left alone.
  source: packages/web/src/lib/remark-tags.ts; packages/web/src/components/SmartTag.tsx; packages/web/src/components/IdLink.tsx#Linkified
  status: unverified
  verified-by: [test:web-lib#remark-tags]
- id: rule:segment-write
  statement: >
    The web app writes a document by span, never by regenerating it. splitDocument records character offsets for
    every prose segment and yaml chunk; a write re-reads the file, re-splits it, compares the sha256 of the target
    span with ifMatch (409 on mismatch), splices the new text (a chunk keeps its list style by re-indenting under
    "- "), writes <file>.tmp-<pid> and renames it, then runs ctx build and ctx check in the project root and
    returns the new hashes and lint errors.
  source: packages/web/src/lib/write.ts; packages/web/src/app/api/p/[project]/doc/[slug]/route.ts
  status: unverified
  verified-by: [test:web-lib#write]
- id: rule:prose-round-trip
  statement: >
    Every prose section is a live block editor (the text between yaml blocks and --- rules); yaml blocks and rules
    are boundaries outside the editor, so they survive untouched. Hard-wrapped paragraphs are unwrapped before
    import; ids become tag inline content on import and on blur, and export as plain id text. A section saves only
    after the user has focused and changed it (programmatic loads never save), 700 ms after the last change, with
    the section's hash; empty table rows the importer invents are dropped from the export. Every section has a
    raw-markdown mode.
  note: >
    Our own serializer (not BlockNote's) writes the document back: wrapped list-item continuation lines are joined
    on import; list items nested under a task or requirement line stay its children and are written back indented
    (nested ids become nodes too); numbered items and numbered nodes are renumbered in sequence; an escaped pipe on
    a table row survives even inside a code span. Verified on the four consolidated YesSensei pages (import → export
    equal, 2026-09-15).
  source: packages/web/src/lib/import.ts; packages/web/src/lib/serialize.ts; packages/web/src/lib/mdflow.ts
  status: shipped
  requires-tests: [ui-test:edit-node-flow]
- id: rule:card-form
  statement: >
    A card is always editable in place: title, status (select), when/then/unless, prose keys as growing text
    areas, list keys as tag chips with an add box (autocomplete from the node index), nested blocks as raw text,
    and a yaml toggle for the raw chunk. Changes autosave 700 ms after the last keystroke with the chunk's hash;
    the fields serialise back in their original order (lists as flow lists, long prose as > blocks) and the id
    never changes.
  source: packages/web/src/lib/yaml-form.ts; packages/web/src/components/CardEditor.tsx
  status: unverified
  verified-by: [test:web-lib#yaml-form]
- id: rule:new-document
  statement: >
    A new document is created from templates/docs/<template>.md with the title, slug, parent and date filled in;
    its frontmatter declares part-of module:<parent> so the tree picks it up without editing the parent file; the
    slug is derived from the title and an existing file is refused.
  source: packages/web/src/app/api/p/[project]/doc/route.ts; packages/web/src/lib/templates.ts; templates/docs
  status: unverified
  verified-by: [test:web-lib#templates]
- id: rule:prose-nodes
  statement: >
    A paragraph or list item whose first token is an id defines that node (`req:<slug> When a sale …`); the text
    after the id is its `text` (title = first sentence), `#status` sets status, a trailing `(key: value, …)` group
    carries other keys. Links `[phrase](kind:slug)` and bare ids in the text become edges whose verb is inferred
    from the words before the id ("satisfied by", "verified by", "refines", "part of", …) and is related-to
    otherwise. Short aliases (et:, rq:, rl:, pg:, st:, dc:, qn:) expand to full kinds. A link in plain prose
    relates the document to its target. Yaml blocks keep defining nodes exactly as before.
  source: lib/parse.js#proseRefs; lib/parse.js#inferVerb; schema/kinds.yaml
  status: unverified
  verified-by: [test:prose]
- id: rule:single-page-editor
  statement: >
    A document is one editor. Prose blocks, headings, lists, tables, code and dividers are ordinary blocks; every
    node (from a yaml block or a prose line) is a typed block with kind, slug and status in its header and its
    text as editable inline content; ids are tag inline content; a phrase can be linked to any node from the
    selection toolbar. Import lifts yaml blocks, rules and id links out of the markdown before the browser parser
    sees them; export is our own serializer, so untouched text round-trips (paragraph wrapping, table alignment
    and block grouping are normalised). A paragraph typed with a leading id becomes a node block when the editor
    loses focus. The whole body autosaves with a hash; a failed import disables editing and shows the reader; a
    save that would drop more than half of the text is refused.
  source: packages/web/src/components/DocEditor.tsx; packages/web/src/lib/import.ts; packages/web/src/lib/serialize.ts
  status: unverified
  verified-by: [test:web-lib#serialize, test:web-lib#import]
- id: rule:todo-tasks
  statement: >
    A checkbox line whose first token is an id (`- [ ] task:slug Do the thing`) defines that node with status
    open, `- [x]` with status done; a #status hashtag overrides. In the editor such a node shows a checkbox in its
    header; toggling it rewrites the line. task is a node kind (alias tk:) and the default for the "task block"
    slash item.
  source: lib/parse.js; packages/web/src/lib/import.ts#proseNode; packages/web/src/lib/serialize.ts#nodeToMarkdown
  status: unverified
  verified-by: [test:prose, test:web-lib#import]
- id: rule:mention-menu
  statement: >
    Typing @ in the editor opens a search over every node and document by id or title; choosing one inserts its
    tag inline. Typing an id as plain text (`req:wf2.ui`) also becomes a tag when the block loses focus. Selecting
    a phrase and choosing "⌁ node" links the phrase instead of inserting a tag.
  source: packages/web/src/components/DocEditor.tsx#mentionItems
  status: unverified
  requires-tests: [ui-test:edit-node-flow]
- id: rule:context-panel
  statement: >
    While a block is being edited, the right panel's Context mode shows the product knowledge closest to that
    block's text: the text is embedded locally (transformers.js, MiniLM) and ranked against every defined node by
    cosine similarity blended 70/30 with a keyword score; the node being edited and ids it already links are
    excluded. "+ link" inserts the node's tag at the cursor (padded with a space when glued to a word); the tag or
    row opens the node. Embeddings are cached in the product's _build/embeddings.json and refreshed per node when
    its text changes. Nothing is sent off the machine.
  source: packages/web/src/lib/semantic.ts; packages/web/src/components/ContextPanel.tsx; packages/web/src/app/api/[product]/context/route.ts
  status: shipped
  verified-by: [test:web-lib#semantic]
- id: rule:goals-and-tasks
  statement: >
    Goals and tasks are tracked like Atlassian goals. Every product has a Goals page and a Tasks page (search, status
    chips, sub-goals nested under the goal they are part of, columns name / status / target or due / progress or goal /
    owner / document); a row opens the item in the right column, whose node view adds a tracking section (status,
    target, owner, progress, sub-goals, tasks and requirements that are part of it). A document may hold a goals or
    tasks table: the lines between `<!-- goals -->` and `<!-- /goals -->` (or tasks) are ordinary goal/task lines to
    the parser and an editable table in the editor (status select, target/due, progress, owner; "+ add" appends a
    row). Progress is `(progress: n)` when given, else the share of done/shipped/complete parts. Goal statuses are
    proposed, on-track, at-risk, off-track, paused, complete, non-goal.
  source: packages/web/src/components/TrackList.tsx; packages/web/src/lib/track.ts; packages/web/src/lib/doc.ts#nodeIndex; packages/web/src/components/DocEditor.tsx#RowNode
  status: shipped
  verified-by: [test:web-lib#import, test:web-lib#props]
- id: rule:type-tables
  statement: >
    A document may hold a table of any type the product declares: the lines between `<!-- table:<slug> -->` and
    `<!-- /table:<slug> -->` are ordinary prose node lines of that kind (`- bug:<slug> Login fails #open (priority:
    high, foundIn: 1.2)`) to the parser — so each row is an instance the type page and `wf` see — and an editable
    table in the editor with a column for status and one per declared property (own and inherited, the root type's
    left out): an enum property is a select, a bool a checkbox, a ref a text cell holding the id, anything else a
    text cell. Values live in the line's trailing property group, whose keys may be camelCase like the type's
    (lib/parse.js grammar). One "Data table" block in the slash menu serves goals, tasks and every own type: its
    header has the type picker (decision:wf2.one-table-block); a table of a type the product no longer declares
    keeps its rows with name and status only.
  source: packages/web/src/lib/serialize.ts#collectionMarker; packages/web/src/lib/import.ts#COLLECTION_OPEN; packages/web/src/components/DocEditor.tsx#TypeRow; packages/web/src/lib/props.ts#EXTRA_KEY
  status: shipped
  verified-by: [test:web-lib#import, test:web-lib#props]
  related-to: [rule:goals-and-tasks, req:ontology.type-table, rule:table-rows]
- id: decision:wf2.one-table-block
  title: One Data table block with a type picker in its header, not one slash item per type
  context: >
    Every own type got its own "<Type>s table" slash item next to Goals table and Tasks table; with ten types the
    menu filled with tables (bug:no-need-to-add).
  choice: >
    A single "Data table" item inserts a table of tasks; its header holds a select with goals, tasks and every type
    the product declares, and picking one re-kinds the (still empty) rows. Once a row has text the picker locks —
    the rows have ids of that kind, and changing the kind would change ids other nodes may link. Goals and tasks
    keep their columns (status, target/due, progress, owner); a type table shows the type's properties. The markdown
    is unchanged: <!-- goals -->, <!-- tasks -->, <!-- table:<slug> -->.
  alternatives: >
    Keep one item per type — the menu grows with the ontology; a kind property edited as text — no discovery of what
    types exist; let the type change with rows present — silent id changes.
  consequences: the Tasks page and rule:type-tables say "Data table"; ui-test:table-rows covers the picker
  status: proposed
  date: 2026-09-17
  related-to: [rule:type-tables, rule:goals-and-tasks, bug:no-need-to-add]
  session: 8aa3926e18
- id: rule:node-page-layout
  statement: >
    The context column shows a node as a page, not a form: the kind and id small on top, the title large and
    editable (a yaml card's title key, else its text — a prose node is its text), then the properties as rows of
    label and value in one column: status first, then the text key when the title is separate, the tracking fields
    of a goal or task, the type's declared properties (own, then inherited, each marked), the root type's link
    properties the node fills in (related-to, depends-on…), and keys the card carries beyond its type. Empty
    optional properties fold under "n more properties"; required empty ones are marked. A value edits in place
    and saves when the field is left (Enter in the title saves it). Relations, sessions and the graph views follow
    below as before (task:new-826).
  source: packages/web/src/components/NodeEditor.tsx; packages/web/src/app/globals.css#ne-props
  status: shipped
  verified-by: [ui-test:table-rows]
  related-to: [component:node-editor, req:wf2.ui.edit-in-context]
- id: rule:table-rows
  statement: >
    A row of any table (goals, tasks, a type's) is selected by a click anywhere in it — its status select, a property
    cell, the grid background, not only its text: the click puts the editor cursor in the row without taking focus
    from the control, so the context column shows the row's node the same way as for a node block (whose header
    behaves alike). Settling a table never rewrites its children: a missing trailing empty row is inserted after the
    last row, a slug is set on the row alone, stray empty rows are removed only when the cursor leaves the table, and
    a paragraph Enter opens inside a table becomes a row of the table's kind — so typing at any speed stays in the
    row. Copy link, Send to agent and the peek dot on a row that has text but no slug yet assign the slug first, so
    a link never ends in `bug:`.
  source: packages/web/src/components/DocEditor.tsx#selectBlockOnClick; packages/web/src/components/DocEditor.tsx#withSlug; packages/web/src/components/DocEditor.tsx#settleCollections
  status: shipped
  verified-by: [ui-test:table-rows]
  related-to: [rule:goals-and-tasks, rule:type-tables]
- id: rule:process-is-active
  statement: >
    A conversation whose claude or codex process is up is active whatever its recorded status: `wf session done`
    marks the work done while the process stays up to take the next message. The API adds `live` (process up) and
    `busy` (a turn is open) to every chat session from the server's own process table (agent-host#liveState —
    never from disk, so a restarted app shows nothing as live until it starts a process). The Agents page counts
    such sessions as active and shows `working` / `live` pills in place of the status (the title keeps the
    recorded one); the session header does the same; the command box's "to" picker offers exactly these.
  source: packages/web/src/lib/agent-host.ts#liveState; packages/web/src/components/SessionList.tsx#isActive; packages/web/src/app/api/[product]/sessions/route.ts
  status: shipped
  related-to: [rule:agent-sessions, rule:console-flow, rule:idle-stop]
- id: rule:clean-slate
  statement: >
    A request from the command box starts a new conversation by default: the "to" picker opens on "New conversation"
    with the agent and the working folder the person used last (localStorage `wf-agent-<product>` /
    `wf-cwd-<product>`), and the live conversations are an explicit choice. A live conversation chosen with
    "clear context first" ticked is restarted fresh before the message: the host ends its process, forgets
    `agentSessionId` (and the Codex thread), emits a `note` divider ("context cleared — fresh agent"), and hands the
    message to a new process as a first message built like a new session's (instruction, refs, link, images, the
    plan-first section when ticked). The Live entry is reused so the console's subscribers keep receiving events,
    and the replaced process's close handler updates nothing. Without the tick, and always from the console's own
    message box, the message goes into the running agent and its context is kept.
  source: packages/web/src/components/CommandBox.tsx; packages/web/src/lib/agent-host.ts#restartFresh; packages/web/src/app/api/[product]/sessions/[id]/message/route.ts
  status: shipped
  verified-by: [ui-test:command-palette]
  related-to: [rule:agent-sessions, rule:process-is-active, rule:plan-first]
- id: rule:idle-stop
  statement: >
    A claude conversation that is live and idle — no open turn, no queued message — for WF_AGENT_IDLE_MIN minutes
    (default 30; 0 disables) is stopped by the host: stdin is closed so claude exits 0, the session is marked done
    with the line "idle for N min — stopped; Resume or a message continues with the same context", and the console
    shows the exit. Resume and the next message start the process again with `--resume <agentSessionId>`
    (rule:agent-host), so the context survives — only the process goes. Codex has no resident process and needs
    nothing. The timer is armed on every `result` event and cleared when a message is written to the agent. A
    process spawned before this rule shipped keeps its old stdout handler and is never armed: it stops only by hand
    (rule:agent-host).
  source: packages/web/src/lib/agent-host.ts#armIdleStop
  status: shipped
  related-to: [rule:process-is-active, rule:agent-host]
- id: rule:agent-sessions
  statement: >
    Any block can be sent to an agent: "Send to agent" sits in every block's drag-handle menu, on node block headers,
    on goal/task table rows and in the right column's node view. It opens the one command box (component:command-box,
    the same ⌘P opens — decision:wf2.one-command-box) with the block text and the ids it defines or links prefilled;
    the request starts a new conversation by default — with the agent (Claude Code, Codex, the Waterfall clerk) and
    the working folder used last, and plan-first (rule:clean-slate) — or goes into a live conversation chosen in
    "to", whose agent restarts from nothing first when "clear context first" is ticked; sending creates
    a session (`data/products/<product>/_sessions/<id>.json`, status queued, gitignored) and opens it in the right
    column, which shows the instruction, refs, status and a log that is polled while the session is queued or
    running. The Agents page lists sessions (active first). Runners update a session with PATCH { status, line,
    result }.
  source: packages/web/src/components/CommandBox.tsx; packages/web/src/components/SessionView.tsx; packages/web/src/lib/sessions.ts; packages/web/src/app/api/[product]/sessions
  status: shipped
- id: rule:documents-tree
  statement: >
    The rail shows one Documents tree per product: every document with its sub-documents, regardless of the project
    folder it lives in (projects stay folders on disk; a new top-level document picks its folder when there are
    several). Any row has "+" for a sub-document; the section "+" creates a top-level one. Rows drag: dropping onto
    a row nests the document under it (its `part-of` frontmatter), dropping between rows reorders siblings (`order:`
    frontmatter, renumbered in tens), and a drop zone under the tree makes it top level. Moving under a document of
    another project moves the file into that project's docs folder. A document cannot be moved under itself.
  source: packages/web/src/components/DocTree.tsx; packages/web/src/app/api/[product]/docs/move/route.ts; packages/web/src/lib/doc.ts#documentTree
  status: shipped
- id: rule:block-links
  statement: >
    Every block has a stable link: `<web>/<product>/<project>/d/<doc>#<anchor>` where the anchor is `n-<id>` for a
    node block, the heading slug for a heading, and `b-<8-hex FNV-1a hash of the normalised text>` for any other
    block. "Copy link" is in every block's drag-handle menu, on node headers and table rows. Opening a link scrolls
    to and flashes the block; `GET /api/<product>/resolve?link=` (and `wf resolve`) return the document, node, block
    text or heading section the link points at. A hashed link whose text changed falls back to the document.
  source: packages/web/src/lib/anchors.ts; packages/web/src/app/api/[product]/resolve/route.ts; packages/web/src/components/DocEditor.tsx#blockAnchor
  status: shipped
  verified-by: [test:web-lib#anchors]
- id: rule:agent-runner
  statement: >
    External agents connect through the `wf` CLI (bin/wf.js) against the running web app. `wf agent listen --product
    p --agent claude-code|codex` registers a runner (heartbeat every 10 s to /api/<product>/runners, entries expire
    after 30 s), claims the oldest queued session for its agent (POST /sessions/claim, first come first served),
    builds a prompt (instruction + every ref and the source link resolved to text + how to talk back), runs the
    agent command with the prompt on stdin (`claude -p …` / `codex exec …`, overridable with --cmd), streams every
    output line into the session log, and marks the session done or failed from the exit code. Agents read and write
    through `wf resolve|doc|node|context|node set|doc write|session log|done|fail|handoff`. A hand-off creates a
    queued child session for another agent carrying the instruction, refs, log tail and result; the parent is
    cancelled if still active and both are linked. `/wf-restore <id>` picks a session up interactively (`wf session
    take`). The Sessions page shows runners online, how many are working, and every session's live log.
  source: bin/wf.js; packages/web/src/lib/sessions.ts; skills/waterfall-agent/SKILL.md; skills/wf-restore/SKILL.md
  status: shipped
- id: rule:agent-host
  statement: >
    Chat sessions are hosted by the app: the server spawns the agent as a child process (Claude Code with
    `-p --input-format stream-json --output-format stream-json --permission-prompt-tool stdio`, Codex with
    `codex exec --json`, one process per turn resumed by thread id), keeps the conversation open, normalises the
    agent's events into ChatEvents (user, assistant, thinking, tool_use, tool_result, result, permission, stderr,
    exit), persists them to the session transcript and streams them to the UI over server-sent events. The console
    in the right column shows the transcript live (rule:console-flow), renders the agent's questions as forms and
    other permission requests as Allow/Deny cards (rule:agent-questions), offers Stop, and Resume (which restarts
    Claude Code with --resume and its own session id). Sending a message while a turn runs queues it. The host
    lives on globalThis so dev reloads do not orphan processes; agents die with the server, and the desktop app owns
    the server. The host does not ask Claude to replay user messages (no --replay-user-messages) and the transcript
    drops a user event that repeats the previous one before the turn ended (dedupeUserEvents), because a turn has
    exactly one user message. A running agent process keeps the arguments and the stdout handler it was spawned
    with: a host code change reaches a session only when its process restarts (Stop / Resume).
  source: packages/web/src/lib/agent-host.ts; packages/web/src/components/Console.tsx; packages/web/src/app/api/[product]/sessions/[id]/{stream,message,control}/route.ts
  status: shipped
- id: rule:session-queue
  statement: >
    Every message to a chat session goes through the session's persistent queue (items with id, text, refs, link,
    addedAt, sentAt in the session file). The host hands the next item to the agent as soon as it is idle — one item
    per turn, or every pending item joined into one message when the session's batch mode is "all" — and a resumed
    agent takes what waited. The console shows the pending items with a remove button and the one/batch toggle.
    All session mutations (queue, transcript, status, log) run under the session file's lock with unique temp
    names, because concurrent read-modify-write cycles corrupted a file once.
  source: packages/web/src/lib/sessions.ts#enqueue; packages/web/src/lib/agent-host.ts#pump
  status: shipped
- id: rule:subagents-in-console
  statement: >
    Claude Code runs with --forward-subagent-text; events produced inside a subagent carry the parent tool use id
    and the console nests them, collapsible, under the Task call that started them, with the subagent type,
    description, event and tool-call counts and whether it has finished (the parent's tool_result arrived).
  source: packages/web/src/lib/agent-host.ts#onClaudeLine; packages/web/src/components/Console.tsx#Subagent
  status: shipped
- id: test:annotations-web
  file: packages/web/src/lib/annotations.test.ts
  description: describeScene — image and size, labelled regions with zone and percent position, arrows by binding or end points, free labels, deleted elements skipped, pixel positions without an image
  count: 5
- id: rule:drawings
  statement: >
    A drawing is an Excalidraw scene stored beside the document (docs/drawings/<slug>.excalidraw) with an SVG export
    next to it; the markdown keeps a plain image link ![Title](drawings/<slug>.excalidraw), so GitHub shows nothing
    broken and the app shows the SVG and opens the full-screen editor on click. A code block (ASCII diagram) turns
    into a drawing from its drag-handle menu.
  source: packages/web/src/components/DrawingBlock.tsx; packages/web/src/app/api/[product]/[project]/drawing/[file]/route.ts; packages/web/src/lib/import.ts
  status: shipped
- id: rule:inline-images
  statement: >
    An image can be part of a node's text. Pasting an image while the cursor is in a node block (a bug, a task, a
    requirement), or "Image in this block" from the slash menu, uploads it to docs/assets and inserts it inline at
    the cursor as a thumbnail (click opens the file); an image pasted in ordinary prose stays an image block. The
    markdown keeps `![alt](assets/x.png)` inside the node's line, so lib/parse.js carries it in the node's `text`
    (the derived title drops it) and the type table row, the peek panel, node cards and the type page show the
    thumbnail. On import an image next to words, or on a line that continues a paragraph, is inline content of
    that paragraph; only an image that is a paragraph of its own is an image block. wf resolve on a node, block,
    section or document lists every image its text embeds with the file path, so an agent can look at a bug's
    screenshot (fixes bug:new-396). The editor's pasteHandler only takes image files in a node block; every other
    paste goes to BlockNote's defaultPasteHandler — BlockNote cancels the browser's paste before asking, so a
    handler that returns undefined silences text paste in the whole document (task:new-286).
  source: packages/web/src/lib/import.ts#liftInlineImages; packages/web/src/lib/serialize.ts#inlineToMarkdown; packages/web/src/components/DocEditor.tsx#InlineImage; packages/web/src/components/IdLink.tsx; packages/web/src/lib/resolve.ts; bin/wf.js#resolve; lib/parse.js
  status: shipped
  verified-by: [test:web-lib#import, test:web-lib#serialize]
  related-to: [rule:image-annotations, store:assets]
- id: rule:image-annotations
  statement: >
    "Annotate image" on an image block (drag-handle menu) turns the image into a drawing whose canvas is the image:
    a locked Excalidraw image element at 0,0 (the file embedded in the scene, its asset path in customData), and the
    person draws shapes, labels and arrows on top. The block's link changes to the drawing; the asset stays in
    docs/assets. Every save exports, beside the scene, the SVG the page shows, a flattened PNG
    (drawings/<slug>.png) and the annotations as text (drawings/<slug>.md): the image and its size, each labelled
    region with its zone and position in percent of the image, each arrow by what it connects (by binding, else by
    end points and the nearest labelled region), free labels with their position, freehand marks counted. The
    description is regenerated on every save and never hand-edited. wf resolve on a block, section or document that
    embeds a drawing appends the description and the PNG path, so an agent reads the annotations and can look at the
    picture.
  source: packages/web/src/lib/annotations.ts; packages/web/src/components/DrawingBlock.tsx#sceneFromImage; packages/web/src/components/DocEditor.tsx#AnnotateItem; packages/web/src/lib/resolve.ts; bin/wf.js#resolve
  status: proposed
  verified-by: [test:annotations-web]
- id: decision:wf2.plan-first-is-a-prompt
  title: Plan-first is a section of the first message, not a session mode or a second agent
  context: >
    The command palette (⌘P) must make an agent understand and propose before it builds, and let the person confirm.
    That could be a distinct session mode with its own host and console, a separate planning agent that hands off,
    or a protocol in the prompt.
  choice: >
    A `plan: true` flag on the session appends a plan-first section to the first message (understand → propose →
    confirm with one AskUserQuestion → build). The confirmation uses the question card every conversation already
    renders (rule:agent-questions); the session, host and console are unchanged. The palette can untick it.
  alternatives: >
    A session mode — duplicates the host and console for one difference; a planning agent handing off to a builder
    — loses the context it just gathered; a fixed "plan" tool — Claude Code's AskUserQuestion already is the form.
  consequences: rule:plan-first; action:command-palette; a later agent can carry the same flag from any entry point
  status: proposed
  date: 2026-09-17
  related-to: [rule:plan-first, rule:agent-questions, decision:wf2.agent-questions-are-forms]
  session: 8aa3926e18
- id: decision:wf2.plan-is-a-page
  title: The plan is the subject's page, worked on together, not a chat message
  context: >
    The first plan-first protocol had the agent propose in a chat message and ask Proceed / Adjust / Cancel. A chat
    message is gone once the session ends, the person can only answer it, and nothing forced the agent to say which
    entity the request is about, whether its type exists, or where it lives.
  choice: >
    The plan lives on the subject's page: the agent names the subject as one node, makes sure its type and its
    document exist (existing document first, a new one only when nothing fits), writes what it understood there as
    typed blocks (req, decision, question, task — proposed), navigates the person to the page (`wf session open`),
    and the two work on the page until the person answers Proceed. The build is what the page says at that moment.
  alternatives: >
    Keep the plan in chat and copy blocks to a document afterwards — the person cannot edit the plan itself and the
    copy drifts; a dedicated "plan" document per session — one more place to look, and the knowledge belongs with
    the entity anyway.
  consequences: rule:plan-first; op:session.open; `wf doc create`, `wf type add`, `wf session open` in bin/wf.js; req:wf2.ui.command-palette
  status: proposed
  date: 2026-09-17
  related-to: [decision:wf2.plan-first-is-a-prompt, rule:plan-first, rule:agent-questions]
  session: 0e07e8fd53
- id: decision:wf2.one-command-box
  title: "Send to agent" and ⌘P are one command box
  context: >
    Two dialogs start work for an agent: the command palette (⌘P: a request, plan-first, agent, folder, pasted
    images, always a new conversation) and "Send to agent" (block menus, node views, question and review lists,
    the top bar: a target — an active conversation, a new one or a runner — agent, folder, an instruction prefilled
    with the block). They drifted: only the palette takes images and plans first; only the dialog can send into a
    running conversation; Enter runs in one, ⌘↵ in the other.
  choice: >
    One component, CommandBox (the palette's look, in the middle of the screen), opened by ⌘P with the cursor's
    context or by any "Send to agent" with the block's text, refs and source prefilled. It has the union of the
    two: the request text (Enter runs, Shift+Enter a new line), the context tags, pasted or dropped images, a
    "to" picker (active conversations, new conversation, queue for a runner) that defaults to the most recent
    active conversation when one is live and to a new conversation otherwise, and for a new conversation the
    agent, the working folder and the plan-first tick. requestSend() and ⌘P both open it; SendToAgentHost and
    CommandPalette go away.
  alternatives: >
    Keep two dialogs and copy features across — they would drift again; make ⌘P open the Send dialog — its
    form-style layout is heavy for a one-line request and has no plan-first or images.
  consequences: >
    component:command-box replaces the Send-to-agent dialog (SendToAgent.tsx) and action:command-palette's own box; the message
    route already takes images; sending into an active conversation from ⌘P becomes possible; rule:agent-sessions
    and req:wf2.ui.command-palette refer to the one box; ui-test:command-palette covers both entry points.
  date: 2026-09-17
  status: proposed
  affects: [action:command-palette, component:command-box, rule:agent-sessions, req:wf2.ui.command-palette]
- id: decision:wf2.clean-slate
  title: A task starts from a clean slate; a chat keeps its context
  context: >
    Waterfall is the memory of every agent: what a task needs is in the documents and the graph, not in the last
    conversation's context window. Yet the command box (⌘P, every "Send to agent") sends a request into the most
    recent live conversation by default, so an unrelated task inherits a context full of the previous one — dearer,
    slower and distracted — while the process behind each conversation stays up for hours holding that context
    (task:idle-agent-timeout: six idle claude processes in one afternoon). Chatting in a conversation's console is
    different: there the person is continuing the same work and wants the context kept.
  choice: >
    The command box defaults to "New conversation" — a fresh agent in a remembered folder with a remembered agent
    (localStorage, like the folder today) — and offers the live conversations only as an explicit choice. When a live
    conversation is chosen, a "clear context first" tick (off by default) restarts its agent from nothing in the same
    folder before the message: the process is stopped, the agent's own session id is forgotten, the transcript gets a
    divider note, and the message goes as a first message with the full contract (plan-first when ticked). The
    console's own message box always keeps the context (no tick there). A live-and-idle conversation is stopped
    after WF_AGENT_IDLE_MIN minutes without a turn (default 30, 0 disables) with a log line saying so; Resume or the
    next message brings it back with `--resume`, so nothing is lost — only the process.
  alternatives: >
    Default to the latest conversation with the tick on — every task lands in one ever-growing session record and
    "Produced" / the knowledge strip stop meaning one piece of work; a "Clear context" button in the console — the
    console is the place where context is wanted, and the tick at send time says what the person means for that
    request; never stop idle processes — memory and context are held for nothing, since `--resume` restores both.
  consequences: >
    rule:clean-slate and rule:idle-stop; component:command-box (default "new", remembered agent, the tick),
    op:api.sessions.message takes `fresh`, agent-host#startChat reuses the Live entry so subscribers survive a
    restart and the old process's close handler no longer touches a replaced process; rule:agent-sessions,
    action:command-palette and decision:wf2.one-command-box's "defaults to the most recent active conversation" are
    superseded; ui-test:command-palette extended.
  date: 2026-09-17
  status: proposed
  affects: [component:command-box, rule:agent-sessions, action:command-palette, rule:process-is-active, req:wf2.sessions.clean-slate, req:wf2.sessions.idle-stop]
  related-to: [decision:wf2.one-command-box, task:idle-agent-timeout]
  session: 64813dfdab
- id: rule:plan-first
  statement: >
    A session started from the command palette carries `plan: true`, and its first message ends with a plan-first
    section. Before changing code the agent (1) understands — `wf context` on the request, resolves the nodes,
    reads their documents and the code involved; (2) models — names the subject of the request as one node
    (`kind:slug`: the node under the cursor or the document the palette sent when they fit, else found, else the
    new node the request creates), makes sure its type exists (`wf node type:<slug>`; else `wf type add`, a
    proposed `type:` card in the product's ontology document) and picks the subject's page: the document where the
    node is defined, else the one open in the palette, else the type's home, and only when the subject is new and
    no document fits a new one (`wf doc create`); (3) writes the plan on that page, not in chat — the subject's
    card when it is new, and everything understood as blocks in the page's sections: `req:` (proposed),
    `decision:` (proposed), `question:` (open), `- [ ] task:` lines, links to the modules and code touched; `ctx
    check` green; (4) shows it — `wf session open <id> <product/project/doc>[#node]` navigates the person's browser
    to the page while the session stays in the context column, and one chat line says what is there; (5)
    collaborates — the person edits, comments and answers on the page; one AskUserQuestion (header "Plan", "Build
    what the page says?", Proceed / Adjust / Cancel) rendered as a question card (rule:agent-questions); Adjust
    re-reads the page and revises it, Cancel ends the session; (6) builds only after Proceed, after re-reading the
    page once more — code and tests for what the page says, then statuses (tasks done, reqs shipped) and `wf
    session done`. The palette can switch the protocol off for a plain run. The flag is part of the prompt, not a
    session mode: the session, host and console are the ones every conversation uses.
  source: packages/web/src/components/CommandBox.tsx; packages/web/src/lib/agent-host.ts#PLAN_FIRST; packages/web/src/lib/sessions.ts#createSession; bin/wf.js#session
  status: proposed
  verified-by: [ui-test:command-palette]
  related-to: [rule:agent-questions, rule:agent-host, component:command-box, decision:wf2.plan-is-a-page, op:session.open]
- id: rule:agent-questions
  statement: >
    An agent's question (Claude Code's AskUserQuestion, which arrives as a permission request over the stdio
    permission channel) is rendered as a question card, never as a permission dump: header, question, options as
    choice buttons with descriptions (multi-select when asked, an "Other…" free-text row, text and number kinds).
    Answer is enabled once every question has a value and returns the choices to the agent inside the tool input as
    `answers: { "<question>": "<label>" }` (multi-select comma-separated) — the shape Claude Code reads; Skip denies
    the request and the agent goes on without an answer. An answered card shows what was chosen; a permission
    answered without answers reads "allowed without an answer". Every other permission request shows the tool and
    what it wants to do (the command, the file) with the raw input folded away, and Allow/Deny. Nothing answers a
    permission on the person's behalf.
  source: packages/web/src/components/AskQuestions.tsx; packages/web/src/components/Console.tsx#Event; packages/web/src/lib/agent-host.ts#answerPermission
  status: proposed
- id: rule:console-flow
  statement: >
    The console is one conversation in time order. Runs of tool calls, results and thinking between two messages
    fold into one collapsed activity row (n steps · duration · errors · the latest step, a live dot while the agent
    works) that opens to every step; a single call stays inline. User messages, the agent's replies, question and
    permission cards, subagent groups and turn ends (time, cost) stay in the flow. `wf session log` lines appear as
    small log notes and the `wf session done` summary as a summary card at the time they were written; after a
    turn (~1 s later, once the watcher has credited the writes) a `knowledge` row names the documents and nodes
    the session changed since the last such row (agent-host#reportKnowledge, the session's artifacts); a chat
    session has no separate Result or Log panel. Rows carry no time column — the width goes to the content; an
    event's time shows at the row's right edge only while it is hovered (task:new-954).
  source: packages/web/src/components/Console.tsx#foldActivity; packages/web/src/components/Console.tsx#Activity; packages/web/src/components/SessionView.tsx
  status: proposed
- id: rule:live-refresh
  statement: >
    The app follows the product on disk: a recursive watcher on data/products/<product> (lib/watch.ts, on
    globalThis) rebuilds the graph 400 ms after a document changes and pushes change events (doc, graph, inbox,
    session) over /api/<product>/events; the LiveRefresh client refreshes the server-rendered parts (rail, lists,
    panels) on graph, inbox and session changes, so documents, tasks, questions and inbox items written by agents
    or editors appear without a reload. A document being edited in the browser is not reloaded while a save is
    pending.
  source: packages/web/src/lib/watch.ts; packages/web/src/app/api/[product]/events/route.ts; packages/web/src/components/LiveRefresh.tsx
  status: shipped
- id: rule:questions-view
  statement: >
    The Questions page lists every open question about the product: question nodes (kind question or status
    question) from the documents and question items waiting in the inbox, newest first, with refs, where they
    come from, a send-to-agent action, and open/all filters.
  source: packages/web/src/app/[product]/questions/page.tsx; packages/web/src/components/QuestionList.tsx
  status: shipped
- id: rule:task-artifacts
  statement: >
    A session's output is traceable from the task it worked on. While a session runs, the app records what it
    produced: documents written on disk (credited by the watcher to every running session of the product, except
    the app's own task-link writes), nodes it changed through the node API (the wf CLI sends its session id in
    x-wf-session), and inbox items it filed (they carry the session id). Tasks among the session's refs get
    `(session: <ids>, produced: module:…)` in their property group — `produced` is an edge — and marking a task
    done with wf node set adds the session too. The task's panel shows a Produced section: the sessions (with
    status and result), the documents, the nodes changed and the inbox items (questions, decisions) with their
    review status. An html comment ends a prose node's text, so tables' closing markers never leak into a task.
  source: packages/web/src/lib/artifacts.ts; packages/web/src/components/Produced.tsx; lib/parse.js
  status: shipped
  verified-by: [test:prose]
- id: decision:wf2.desktop-electron
  title: Waterfall ships as an Electron desktop app that owns the app server and the agent processes
  context: Running full conversations with Claude Code and Codex means owning long-lived local processes with file-system access; a browser tab cannot do that, and people want one thing to open.
  choice: packages/desktop — an Electron shell that starts (or attaches to) the Next.js server on port 3456, opens the window on it, keeps a tray item, and kills the server and every agent on quit. The web app stays usable in a browser against the same server.
  alternatives: [Tauri — smaller binary but a Rust toolchain and no Node in the main process, a plain browser tab plus a background daemon — two things to start and no window]
  consequences: Electron adds ~250 MB of binary per platform; packaging and auto-update are not set up yet.
  status: approved
  date: 2026-09-17
- id: rule:agent-contract
  statement: >
    Every agent Waterfall starts receives the Waterfall contract as its system prompt (prompts/agent-system.md, plus
    data/products/<product>/_agent.md, served at /api/<product>/agent-prompt): read Waterfall before acting (wf
    context / resolve / doc, ctx packet), cite node ids, and record knowledge — every decision made by the person
    or the agent above all, plus new requirements, rules and questions — in the product inbox with `wf inbox add`,
    never directly into the documents. Statuses of existing nodes may be set directly. Claude Code gets it via
    --append-system-prompt (+ --add-dir for the Waterfall repo); Codex gets it on top of the first turn; runners
    fetch it from the API.
  source: prompts/agent-system.md; packages/web/src/lib/agent-prompt.ts; packages/web/src/lib/agent-host.ts; bin/wf.js
  status: shipped
- id: rule:inbox-review
  statement: >
    The Inbox is a review view over the documents, not a store: it lists the blocks nobody has approved yet —
    decisions, requirements, rules, goals with `status: proposed` (or draft) and questions still open — grouped by
    kind with their fields and refs. Approve / Reject / Resolve change the block's status in its document (prose
    lines and yaml cards alike); "Approve all" takes a group. Raw notes without a document (pasted material) still
    land in the inbox folder below the queue. The Questions page shows question blocks only.
  source: packages/web/src/lib/review.ts; packages/web/src/components/ReviewList.tsx; packages/web/src/lib/node-edit.ts
  status: shipped
- id: decision:wf2.typed-blocks-in-documents
  title: Agents write decisions, questions, requirements and rules as typed blocks in the documents; the Inbox reviews them there
  context: A separate inbox store made agents' decisions and questions invisible in the documents they concerned, and design documents came back with questions as bullets and decisions as prose.
  choice: Content rules in the agent contract — every decision a `decision:` block (proposed), every question a `question:` block (open), requirements and rules as blocks, follow-ups as task lines — and the Inbox and Questions pages read those blocks from the graph; review flips their status in place. The inbox folder keeps only raw notes.
  alternatives: [inbox files filed by a reviewer — knowledge lived in two places until someone filed it, free prose plus a clerk that extracts blocks later — unreliable and delayed]
  consequences: Documents written by agents are structurally checkable (ctx check, the Inbox count); the earlier `wf inbox add` types other than note are retired; existing inbox decisions and questions were migrated into their document as blocks.
  status: approved
  date: 2026-09-17
  supersedes: decision:wf2.inbox-before-documents
- id: rule:app-navigation
  statement: >
    The app frame has a collapsible rail (hidden by default on document and session pages, shown elsewhere; toggle
    button bottom-left or ⌘\; remembered per browser) and, when the right column is open, a draggable splitter
    between content and column (width remembered; the column keeps at least 320 px and the content at least 360 px,
    re-clamped on resize and rail toggle).
  source: packages/web/src/components/Shell.tsx
  status: shipped
- id: decision:wf2.agents-via-cli
  title: Agents integrate through a CLI over the web app's HTTP API, not through an MCP server or direct file access
  context: Claude Code and Codex both run shell commands well; sessions, links and knowledge must reach any agent the same way, and writes must go through the app so the graph rebuilds and locks hold.
  choice: One `wf` CLI (read, write, sessions, runner) talking to the Next.js API; runners are plain processes started next to the code they work on; skills teach Claude Code the CLI.
  alternatives: [MCP server per agent — more tooling to keep in sync and Codex support differs, agents editing markdown directly — bypasses locks and rebuilds and loses the session log, a message queue — unnecessary for a local-first tool]
  consequences: The web app must be running for agents to work; an MCP wrapper can be added later on top of the same API.
  status: approved
  date: 2026-09-16
- id: decision:wf2.local-semantic-search
  title: Relevant-context search runs locally with a small sentence model, not a hosted embedding API
  context: The context panel must suggest related requirements, rules and decisions while a person or agent writes; product knowledge is confidential and the tool must work offline.
  choice: transformers.js with all-MiniLM-L6-v2 (q8, ~23 MB, cached under .cache/models) in the Next.js server process; per-product vector cache next to graph.json; keyword blend for ids and code names the model does not know.
  alternatives: [hosted embeddings (OpenAI/Voyage) — better quality but sends product text out and needs a key, keyword-only search — misses paraphrases, a vector database — overkill for a few thousand nodes]
  consequences: First query after a cold start pays ~5 s to load the model; quality is adequate for short technical text, and a larger local model can be swapped in by changing one constant.
  status: approved
  date: 2026-09-16
- id: rule:doc-links
  statement: >
    A link whose target is a module id is a document link: clicking it (or the module tag) opens that document.
    The link picker offers "new document" for any typed title: it creates the page from the blank template under
    the current document and links the selection to module:<slug>. Frontmatter keys that name relations (part-of,
    see, …) are edges from the module node, so a document declares its parent in its own header.
  source: packages/web/src/components/DocEditor.tsx#LinkNodePicker; packages/web/src/components/SmartTag.tsx; lib/parse.js
  status: unverified
  verified-by: [test:prose]
- id: rule:product-layout
  statement: data/products/<product>/_product.md (title, icon, description), projects/<project>/_project.md (title, kind project|goal, status, icon), projects/<project>/docs/*.md (pages), inbox/ (dropped notes and files, unprocessed), _build/graph.json (the product's knowledge, built by ctx from every page of every project; files and folders starting with _ and the inbox are skipped). Routes: /<product>, /<product>/knowledge[/<kind>], /<product>/graph, /<product>/inbox, /<product>/<project>, /<product>/<project>/d/<page>.
  source: packages/web/src/lib/products.ts; packages/web/src/lib/scope.ts; bin/ctx.js#findDocs
  status: unverified
  requires-tests: [test:server-api#serve-starts-with-two-projects]

- id: rule:node-cards
  statement: >
    A yaml block is split into chunks on id lines exactly as the parser does; a chunk whose id the graph defines
    renders as a card, any other chunk as a code block. A block with no defined ids renders as code.
  source: packages/web/src/lib/doc.ts#splitDocument; packages/web/src/components/Document.tsx
  status: unverified
  verified-by: [test:web-lib#doc]
- id: rule:deep-links
  statement: >
    Every view is a route under /p/<project>; the node page is /n/<id>, the graph /graph?focus=<id>&preset=<name>,
    lists carry their filters in the query; navigating updates the URL and loading a URL restores the view.
  source: packages/web/src/app/p/[project]/layout.tsx; packages/web/src/app/p/[project]/graph/page.tsx
  status: unverified
  requires-tests: [ui-test:deep-link]
- id: rule:prose-keys
  statement: >
    A yaml key is prose if it is in value:prose-key or its value is a block scalar (> or |); prose keys get the
    block editor, everything else a form field; edge keys get id lists with typeahead over graph.search.
  source: packages/web/src/lib/graph.ts#parseBody
  status: unverified
  verified-by: [test:web-lib#graph]
  requires-tests: [test:web-components#node-page-properties]
- id: rule:blocknote-prose-only
  statement: >
    BlockNote edits only the text of a prose key; on save its blocks are exported to markdown and written back as
    that key's block scalar; the node's other keys never pass through BlockNote, because its markdown round-trip
    is lossy.
  source: packages/web/src/components/ProseEditor.tsx
  status: proposed
  requires-tests: [test:web-components#node-page-prose-editor]
- id: rule:mindmap-layout
  statement: >
    The graph view lays out the focus node's tree (refines and has edges, outgoing from the focus, depth from the
    preset) with dagre left-to-right, draws remaining structural edges among visible nodes as cross-links, and
    hides mentions unless the preset is Everything.
  source: packages/web/src/lib/layout.ts#layoutMindMap
  status: unverified
  verified-by: [test:web-lib#layout]
  requires-tests: [test:web-components#graph-layout]
```
