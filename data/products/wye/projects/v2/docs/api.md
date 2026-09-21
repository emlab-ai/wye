---
node: module:api
type: module
title: API and CLI
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:app
order: 49
---

# API and CLI

Every operation the UI, the wye CLI and agents call, by area; the CLI commands are the same operations from a shell.


## Agents and sessions

<!-- list:op -->

```yaml
- id: op:api.resolve
  args: GET /api/<product>/resolve?link=
  does: >
    What a link or id points at — document, node, block or section, with drawing annotations — for agents (wye resolve).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/resolve/route.ts
  part-of: module:api
- id: op:api.agent-prompt
  args: GET /api/<product>/agent-prompt
  does: >
    The system prompt agents get: the contract plus the product's _agent.md.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/agent-prompt/route.ts
  part-of: module:api
- id: op:api.sessions
  args: GET | POST /api/<product>/sessions
  does: >
    List sessions; create one (agent, instruction, refs, source, mode chat|run, cwd) — chats start their agent process at once.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/route.ts
  part-of: module:api
- id: op:api.sessions.session
  args: GET | PATCH /api/<product>/sessions/<id>
  does: >
    A session; PATCH appends log lines, changes status or sets the result (runners, wye session log/done, Cancel).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/route.ts
  part-of: module:api
- id: op:api.sessions.message
  args: POST /api/<product>/sessions/<id>/message
  does: >
    Queue a message (text, refs, link, images, fresh, plan) for the agent; resumes the agent if it is not running
    — or, when the head of the queue is a fresh item, starts a new agent with it (agent-host#restartFresh). `fresh`
    rides on the item and is honoured when its turn comes (rule:clean-slate): at once when the agent is idle, after
    the open turn when it is busy; plan-first in that first message when `plan` is set.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/message/route.ts
  part-of: module:api
- id: op:api.sessions.stream
  args: GET /api/<product>/sessions/<id>/stream
  does: >
    Server-sent events for a chat: the stored transcript, then live events, queue and pings.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/stream/route.ts
  part-of: module:api
- id: op:api.sessions.changes
  args: GET /api/<product>/sessions/<id>/changes
  does: >
    Every block the session added, changed or removed, per document, joined with the current graph; counts. Read
    by component:session-changes, the changes page and `wye session changes`.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/changes/route.ts
  part-of: module:api
- id: op:api.sessions.control
  args: POST /api/<product>/sessions/<id>/control
  does: >
    stop (the process ends, the session is done; Resume or a message brings the context back), close (the process
    ends, the waiting items are dropped, the session is cancelled), resume, permission (answer a request, including
    AskUserQuestion answers), batch one|all, unqueue, item (set or clear the fresh mark of a waiting item).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/control/route.ts
  part-of: module:api
- id: op:api.sessions.handoff
  args: POST /api/<product>/sessions/<id>/handoff
  does: >
    A new queued session for another agent that continues this one.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/handoff/route.ts
  part-of: module:api
- id: op:api.sessions.file
  args: GET /api/<product>/sessions/<id>/file/<name>
  does: >
    A file attached to a session message (pasted image).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/file/[name]/route.ts
  part-of: module:api
- id: op:api.sessions.claim
  args: POST /api/<product>/sessions/claim
  does: >
    A runner takes the oldest queued session for its agent (204 when none).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/claim/route.ts
  part-of: module:api
- id: op:api.runners
  args: GET | POST /api/<product>/runners
  does: >
    Runners online; heartbeat and sign-off from wye agent listen.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/runners/route.ts
  part-of: module:api
- id: op:api.sessions.page
  status: retired
  args: GET /api/<product>/sessions/<id>/page
  does: >
    The session page's data — todo rows, blocks by kind, opened pages, counts — joined with the current graph.
    Read by component:session-page while the session is live.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/page/route.ts
  part-of: module:api
- id: op:session.open
  args: product, session id; PATCH { open: "<product/project/doc>[#node]" | "<url>" } (wye session open <id> <target>)
  does: >
    resolves the target to an app path (a document ref becomes /<product>/<project>/d/<doc>, a node suffix its
    anchor, an app URL its path), logs "opened <path>" on the session and emits a live `open` event; the console
    of a chat session that is open in the context column navigates the page to it, once, on the live event only
    (a replayed transcript never navigates). A runner session without a live console just keeps the log line.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/sessions/[id]/route.ts; packages/web/src/lib/agent-host.ts#openInSession; packages/web/src/lib/open-target.ts; packages/web/src/components/Console.tsx; bin/wye.js#session
```

<!-- /list:op -->

## Documents and editing

<!-- list:op -->

```yaml
- id: op:api.link-all
  args: GET /api/<product>/link-all?text= | POST { text, id, docs? }
  does: >
    GET: where a phrase is still a plain word, per document with counts; POST: every plain occurrence becomes a link
    to the node in the documents named (default all), each file written atomically, the graph rebuilt once (lib:link-all).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/link-all/route.ts
  part-of: module:api
- id: op:api.docs.create
  args: POST /api/<product>/<project>/doc
  does: >
    Create a document from a template: { title, template, parent } → { slug }.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/[project]/doc/route.ts
  part-of: module:api
- id: op:api.docs.read-write
  args: GET | PUT /api/<product>/<project>/doc/<slug>
  does: >
    Read a document (markdown + hash) and write it back whole or by segment with If-Match; rebuilds the graph and lints.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/[project]/doc/[slug]/route.ts
  part-of: module:api
- id: op:api.assets.upload
  args: POST /api/<product>/<project>/asset
  does: >
    Upload a pasted or dropped image into docs/assets → { url: assets/<name> }.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/[project]/asset/route.ts
  part-of: module:api
- id: op:api.assets.serve
  args: GET /<product>/<project>/d/assets/<file>
  does: >
    Serve an embedded image relative to the document URL so ![](assets/x) renders here and on GitHub.
  gate: none (local app)
  source: packages/web/src/app/api
  part-of: module:api
- id: op:api.drawings
  args: GET | PUT /api/<product>/<project>/drawing/<file>
  does: >
    An Excalidraw scene and its exports: scene JSON, ?fmt=svg, ?fmt=png, ?fmt=md; PUT { json, svg, png?, description? }.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/[project]/drawing/[file]/route.ts
  part-of: module:api
- id: op:node.edit
  args: product, node id; GET → the node, its relations, neighbourhood, type and properties; PUT { status?, text?, props?: { key: value | null } }
  does: >
    edits the node in place under the file lock and rebuilds the graph: a prose node's defining line (status tag,
    text, trailing property group — lib/node-line) or a yaml card (patchYamlCard: status, the text key by name,
    scalars in place, long or multi-line values as `key: >` blocks, null removes). A session header records the
    node as the session's artifact. Used by the wf CLI (wye node set) and the context column's editors.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/node/[id]/route.ts; packages/web/src/lib/node-edit.ts
- id: op:node.content
  args: product, node id; GET → { text, content, children, bodyHash, project, doc }; PUT { text?, content, ifMatch? } → { ok, bodyHash, lintOk, lintErrors }
  does: >
    reads and replaces a node's text (a card's title when it has one, else its text key; a prose line's text —
    `nodeText`, written back by `patchProseNode` / `patchYamlCard` with `textPatch`) and its content — the blocks indented under its defining line (req:ontology.content) — as
    markdown of its own: `readContent` de-indents the run after a prose line's continuation text or after a card's
    closing fence; `writeContent` re-indents it two spaces deeper than the line, a blank line before it unless it
    starts with a list item and after it when a block follows, and splits a yaml fence so a card that was not last
    gets its content right after it. PUT holds the file lock, refuses a stale `ifMatch` (409, rule:if-match),
    rebuilds and runs the check (rule:validate-before-write), records the session's artifact. `wye node content
    <id> [--file f]` uses both. A block: node has no content form (question:wf2.content-of-block-nodes).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/node/[id]/content/route.ts; packages/web/src/lib/node-content.ts; bin/wye.js (node content)
```

<!-- /list:op -->

## Knowledge and search

<!-- list:op -->

```yaml
- id: op:api.node
  args: GET | PUT /api/<product>/node/<id>
  does: >
    A node with its relations, neighbourhood, type and effective properties; PUT edits status, text or props of its defining line (records the session's artifact).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/node/[id]/route.ts
  part-of: module:api
- id: op:api.types.add
  args: POST /api/<product>/types
  does: >
    Add a type: card (extends, purpose) to the product's ontology document.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/types/route.ts
  part-of: module:api
- id: op:api.view
  args: GET /api/<product>/view/<slug>
  does: >
    A type's (or kind's) instances as component:instance-table rows — columns, rows with their property values
    (relations for a bare kind), status counts — for the view block; filters are applied in the browser.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/view/[slug]/route.ts
  part-of: module:api
- id: op:api.context
  args: POST /api/<product>/context { text, limit?, all?, asOf? }
  does: >
    Knowledge closest to a piece of text: local semantic + keyword ranking → hits with scores and snippets. Superseded,
    rejected and retired nodes leave the ranking by construction and are counted in `hidden` unless `all` or `asOf`
    (req:memory.current-by-construction).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/context/route.ts; packages/web/src/lib/semantic.ts#search
  part-of: module:api
- id: op:api.packet
  args: POST /api/<product>/packet { text?, refs?, budget?, all?, asOf? }
  does: >
    The constraint packet (decision:memory.constraint-packet, req:memory.intake-packet): what governs a request. Seeds
    are the refs (ids or links) plus the semantic hits for the text; from them every rule, constraint, gate, lesson,
    goal and approved decision within two hops over governs, gated-by, affects, refines, part-of, depends-on and
    scope, plus every open question on those nodes — complete, ended nodes out by construction; rendered as markdown
    with the budget shared across kinds. `wye packet --for "<text>" [--ref id]` calls it; buildPrompt puts it in every
    first message under "Constraints in force"; `wye constraints --task` is the offline twin.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/packet/route.ts; packages/web/src/lib/packet.ts; lib/graph.js#constraints; bin/wye.js
  status: shipped
  part-of: module:api
- id: op:api.verdicts
  args: GET | POST /api/<product>/verdicts { ids, budget? }
  does: >
    The verdict pass (decision:memory.write-time-verdict, req:memory.verdicts): GET the judge log; POST classifies the
    given decision / req / rule / constraint nodes against their neighbours now — the same pass the watcher runs after
    a rebuild when `verdicts: on` is set in _product.md. Verdicts that are not "consistent" are written under the node as
    verdict: lines and, for contradicts / duplicate, an open contradiction: line; consistent ones stay in the log
    (_build/verdicts.json, keyed by pair, with model and prompt hash). `wye verdicts <id>` calls it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/verdicts/route.ts; packages/web/src/lib/verdicts.ts; lib/judge.js; lib/graph.js#verdictPairs; packages/web/src/lib/watch.ts
  status: shipped
  part-of: module:api
- id: op:api.inbox
  args: GET | POST /api/<product>/inbox and /inbox/<name>
  does: >
    Inbox items: list, add (agents: wye inbox add), file into a document as a node, dismiss.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/inbox/route.ts
  part-of: module:api
```

<!-- /list:op -->

## Ontology

<!-- list:op -->

```yaml
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
  args: product, type slug; body { slug, title?, home? } (POST /api/<product>/types/<slug>); PUT { props, scalars } edits the type card
  does: >
    writes a new instance and answers where it went (`doc`, `created`, `row`). A product type's instance is a row of
    the type's collection document (rule:collection-document): the document `home:` on the type card names, else one
    titled with the type's plural, created in the project that declares the type on the first instance and written as
    `home:` on the card; a home document without the type's table takes a card as before. A base kind's card goes to
    `home` (project/doc — the page the caller is on); 409 when the id exists, 422 without a home. PUT rewrites the
    card's props block and scalar keys (purpose, extends, open, home, plural) in place under the file lock
  gate: none (local app)
  source: packages/web/src/app/api/[product]/types/[slug]/route.ts; packages/web/src/lib/instances.ts; packages/web/src/lib/type-edit.ts
```

<!-- /list:op -->

## Shell and navigation

<!-- list:op -->

```yaml
- id: op:api.products.create
  args: POST /api/products
  does: >
    Create a product: { title, description, icon } → data/products/<slug>/_product.md.
  gate: none (local app)
  source: packages/web/src/app/api/products/route.ts
  part-of: module:api
- id: op:api.projects.create
  args: POST /api/<product>/projects
  does: >
    Create a project (or goal) in a product: { title, kind, description }.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/projects/route.ts
  part-of: module:api
- id: op:api.docs.move
  args: POST /api/<product>/docs/move
  does: >
    Move a document in the tree: sets part-of, moves the file into the parent's project, reorders.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/docs/move/route.ts
  part-of: module:api
- id: op:api.docs.duplicate
  args: POST /api/<product>/docs/duplicate { id }
  does: >
    Copy a document next to itself in the same project: <slug>-copy.md (then -copy-2 …), title "… (copy)", same
    part-of, order just after the original (+5), every id the document defines suffixed (lib:doc-ops) → { slug,
    node, href }.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/docs/duplicate/route.ts
  part-of: module:api
- id: op:api.docs.delete
  args: POST /api/<product>/docs/delete { id }
  does: >
    Remove a document and every document under it (decision:wf2.tree-delete-subtree) → { removed: ids, dangling:
    the count of edges from the remaining documents to nodes the removed pages defined, href: the parent page or
    the product }. Assets are left in place.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/docs/delete/route.ts
  part-of: module:api
```

<!-- /list:op -->

## Storage and serving

<!-- list:op -->

```yaml
- id: op:api.events
  args: GET /api/<product>/events
  does: >
    Server-sent events: what changed on disk (documents, graph, inbox, sessions), batched per 300 ms.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/events/route.ts
  part-of: module:api
```

<!-- /list:op -->

## Work, changes and impact

<!-- list:op -->

```yaml
- id: op:api.work
  args: GET /api/<product>/work [?id=task:x]; POST { text, partOf?, project?, ready?, by? }
  does: >
    GET: every task with its derived state, plan, goal, worker, sessions, produced count and the plans' Definition
    counts; with ?id one task with its sessions and the blocks they produced (req:exec.done-comes-back). POST:
    capture a task line (rule:capture-home) — `wye work add`, Later in the command box, an inbox note filed as a task.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/work/route.ts; packages/web/src/lib/work-io.ts
  status: shipped
  part-of: module:api
- id: op:api.work.assign
  args: POST /api/<product>/work/assign { id, worker, note?, plan?, cwd?, force?, agent?, by?, build? }
  does: hands a task to a worker (rule:assign-refusal); with `build` the plan's Definition goes with it (rule:build). 422 refused, 409 held.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/work/assign/route.ts; packages/web/src/lib/work-io.ts#assignTask
  status: shipped
  part-of: module:api
- id: op:api.work.next
  args: GET /api/<product>/work/next [?goal=]; POST { agent, runner, goal? }
  does: the oldest ready, unblocked, unassigned task (rule:take-ready); POST takes it as an assignment for the runner's agent — 204 when none or when auto-take is off
  gate: none (local app)
  source: packages/web/src/app/api/[product]/work/next/route.ts; packages/web/src/lib/work-io.ts#nextForRunner
  status: shipped
  part-of: module:api
- id: op:api.changes
  args: GET /api/<product>/changes [?state=&node=&all=1]; GET /changes/<id>; POST /changes/<id> { action: accept | revert | reopen, by?, force? }
  does: the change records with `stale` and `exists` (rule:change-record, rule:change-review)
  gate: none (local app)
  source: packages/web/src/app/api/[product]/changes/route.ts; packages/web/src/app/api/[product]/changes/[id]/route.ts
  status: shipped
  part-of: module:api
- id: op:api.impact
  args: POST /api/<product>/changes/<id>/impact { action: run | apply | apply-all | skip, candidate?, text?, props?, force?, reason?, by? }; POST /api/<product>/impact { id, after, judge? }
  does: the impact run on a change record and its outcomes (rule:impact-run, rule:impact-apply); the what-if for an edit an agent is about to make — candidates with paths, verdicts when judge is not false, nothing written (`wye impact <id> --after`)
  gate: none (local app)
  source: packages/web/src/app/api/[product]/changes/[id]/impact/route.ts; packages/web/src/app/api/[product]/impact/route.ts; packages/web/src/lib/impact-run.ts
  status: shipped
  part-of: module:api
- id: op:api.impact.apply
  args: POST /api/<product>/changes/<id>/impact { action: apply, candidate, text?, props?, force? }
  does: Apply one proposed update (rule:impact-apply); 409 when the candidate moved on
  gate: none (local app)
  source: packages/web/src/lib/impact-run.ts#applyPatch
  status: shipped
  part-of: module:api
- id: op:api.propose
  args: POST /api/<product>/propose { card, plan, doc? } (x-wf-session credits the writer)
  does: one proposed block into the named document, embedded on the plan's Definition; on the plan itself when no document is named (rule:definition); 409 when the id exists — refine it instead. `wye propose` calls it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/propose/route.ts
  status: shipped
  part-of: module:api
- id: op:api.pr
  args: GET /api/<product>/plan?ref=; PATCH { ref, status }; POST { action: refresh }
  does: a plan's status, role, task and Definition state (total, agreed, open, missing, contradicted, defined, items); set the status; recompute defining ↔ defined for every plan. `wye plan` calls it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/pr/route.ts; packages/web/src/lib/pr-docs.ts#planDefinition
  status: retired
  part-of: module:api
- id: op:api.explain
  args: POST /api/<product>/explain { id } | { text }
  does: one librarian turn — the current state around a node or a text with the nodes as tags, nothing written (lib:explain). `wye explain` and the node's Explain call it.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/explain/route.ts; packages/web/src/lib/explain.ts
  status: shipped
  part-of: module:api
```

<!-- /list:op -->

## Unsorted

<!-- list:op -->

```yaml
- id: op:api.inbox.name
  args: GET | POST /api/<product>/inbox/<name>
  does: >
    GET → the item with a filing suggestion. POST { action: 'file', doc, project, id } | { action: 'dismiss' }.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/inbox/[name]/route.ts
  status: proposed
  part-of: module:api
- id: op:api.links
  args: POST /api/<product>/links
  does: >
    POST { blocks: [{ key, text, linked }] } → { links: { [key]: ids } } — the ids Jev is sure each block is about
    (Jev auto-linking design §3), judged over the local search's candidates, cached by text. {} without a key.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/links/route.ts
  status: proposed
  part-of: module:api
- id: op:api.settings.jev.test
  args: POST /api/settings/jev/test
  does: >
    POST → one tiny question to Jev with the stored key: { ok: true, ms, model } or { error }.
  gate: none (local app)
  source: packages/web/src/app/api/settings/jev/test/route.ts
  status: proposed
  part-of: module:api
- id: op:api.settings
  args: GET | PUT /api/settings
  does: >
    GET → { jev: { set, last4 } } (never the key). PUT { jev: { key } } → the same view; an empty key removes it.
  gate: none (local app)
  source: packages/web/src/app/api/settings/route.ts
  status: proposed
  part-of: module:api
- id: op:api.pr
  args: GET | PATCH /api/<product>/pr
  does: >
    (decision&#58;wf2.pr-lifecycle, decision&#58;wf2.pr-approval-is-the-persons-click) — GET
    ?ref=product/project/pr-x → the PR's status, Definition state (n blocks, k agreed, j open, contradicted,
    missing), readiness (definition · agreed · impact · contradictions · tasks), who approved it and its request
    task — the frontmatter `task:` when the PR was made for an existing task, else the `task:<slug>` line the
    request wrote (rule&#58;pr-doc). PATCH { ref, action: 'approve' | 'cancel' | 'reopen', by? } — the person's
    moves: approve sets approved + approved-by / approved-at and stops a live refining session; cancel ends it;
    reopen puts it back to draft. PATCH { ref, status } sets a status outright.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/pr/route.ts
  status: proposed
  part-of: module:api
- id: op:api.comments
  args: GET | POST /api/<product>/comments
  does: >
    Comments (req:ontology.comment-home, decision:ontology.comment-is-a-ref). GET ?on=<id> → the comments on a node,
    oldest first. POST { on, text, by?, session?, project? } → a `comment:` row in the Comments document of the
    node's project (one per project, created on its first comment) with `on:` the node; answers with the comment and
    where it went.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/comments/route.ts
  status: proposed
  part-of: module:api
- id: op:api.hooks
  args: GET /api/<product>/hooks
  does: >
    (decision&#58;wf2.hooks-and-skills) — GET → the product's hooks (id, title, on, where, actions, once, status)
    with their firings (node, event, at, depth, what ran); ?node=<id> narrows the firings to one node — what a
    column shows.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/hooks/route.ts
  status: proposed
  part-of: module:api
- id: op:api.skills
  args: GET | POST /api/<product>/skills
  does: >
    (decision&#58;wf2.hooks-and-skills) — GET → the product's skills (id, title, role, takes, status, document); GET
    ?id=<skill> → one skill with its body (what `wye skill <id>` prints). POST { title, project?, role? } → a new
    skill document from the template under the project's Skills page; returns { slug, project }.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/skills/route.ts
  status: proposed
  part-of: module:api
- id: op:api.index
  args: GET /api/<product>/index
  does: >
    (decision&#58;wf2.parse-cache) — GET → the product's node index (id, kind, title, status, defined, file, doc …)
    as the column, tags and pickers use it; the ETag is the graph's build time, so a client that has it gets 304.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/index/route.ts
  status: proposed
  part-of: module:api
- id: op:api.code
  args: GET /api/<product>/code
  does: >
    (req&#58;wf2.code-preview) — GET ?path=<file>[#<symbol>|:<line>] → the file's text from the product's code (its
    `repo:` in _product.md, else this repo), the language for the viewer, and the line a symbol is defined on
    (`#name` → the line with `function name`, `const name`, `class name`, `name(`…); 1 MB at most; a path must
    resolve inside the code root. ?dir=<folder> lists a folder instead.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/code/route.ts
  status: proposed
  part-of: module:api
- id: op:api.folder
  args: GET | PUT /api/<product>/folder
  does: >
    (decision&#58;wf2.product-folder) — GET → where the product's folder is (root, default or not, and what it
    holds). PUT { root } → moves everything but _product.md (projects, _build, _sessions, _changes, _hooks, inbox,
    _agent.md) from the current folder into `root` (created; `~` allowed; empty or absent), writes `root:` into the
    registry's _product.md and rebuilds; PUT { root: '' } moves it all back under <data>/products/<slug>.
  gate: none (local app)
  source: packages/web/src/app/api/[product]/folder/route.ts
  status: proposed
  part-of: module:api
- id: op:api.import
  args: POST /api/<product>/<project>/import
  does: >
    POST multipart: every "file" part is a markdown file, its name the path inside the import (a folder drop keeps
    "notes/2026/plan.md"); fields `parent` (a document slug), `analyse` ("0" declines the agent). Writes the
    documents (lib&#58;import-docs), rebuilds, returns what landed and what was skipped. The agent comes after,
    through hook:import-analyse on `module.created where status=imported` (req:wf2.import.markdown).
  gate: none (local app)
  source: packages/web/src/app/api/[product]/[project]/import/route.ts
  status: proposed
  part-of: module:api
- id: op:api.import-code
  args: POST /api/<product>/import-code
  does: >
    (no header comment)
  gate: none (local app)
  source: packages/web/src/app/api/[product]/import-code/route.ts
  status: proposed
  part-of: module:api
```

<!-- /list:op -->
