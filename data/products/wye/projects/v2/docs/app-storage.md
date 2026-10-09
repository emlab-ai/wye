---
node: module:app-storage
type: module
title: Storage and serving
status: proposed
owner: unassigned
sources:
  - packages/web/src/lib/products.ts
  - packages/web/src/lib/watch.ts
  - packages/web/src/lib/artifacts.ts
  - packages/desktop/main.js
part-of: module:app
order: 48
last-verified: 2026-09-20
---

# Storage and serving

Storage and serving

```yaml
- id: module:app-storage
  purpose: >
    Where everything lives on disk and how the app follows it: the data folder layout (products, projects, documents, assets, drawings, build output, sessions, inbox), the watcher that rebuilds the graph when anything changes, the atomic writes, the events stream the UI refreshes from, and the desktop shell that owns the server. Markdown is canonical; everything under _build is derived.
```

What this module must do is written where it was decided — the PRD and the dev design; this document maps the code onto it. Requirements: req:wf2.store, req:wf2.store.products, req:wf2.serve, req:wf2.serve.live, req:wf2.serve.last-good, req:wf2.write.single-path, req:wf2.ui.live. Rules the code enforces: rule:markdown-canonical, rule:product-layout, rule:watcher-debounce, rule:last-good-graph, rule:live-refresh, rule:sse-refresh, rule:atomic-file-write, rule:per-file-queue, rule:task-artifacts.

Modules under packages/web/src/lib (`lib:` cards): pure logic and server-only IO, tested with vitest where marked pure.

Where data lives (`store:` cards): path pattern, format, purpose. Markdown stores are canonical; json ones are derived or operational.

HTTP operations this module serves (`op:` cards); the wf CLI and the UI call them.


## Rules

<!-- list:rule -->

```yaml
- id: rule:question-decision-nodes
  source: templates/module.md; schema/kinds.yaml
  status: proposed
  requires-tests: [test:core-parser#question-and-decision-nodes]
  title: >
    The template gains a §D Decisions section (ADR keys date, context, options, choice, consequences, optional dec
```

  - statement:question-decision-nodes The template gains a §D Decisions section (ADR keys date, context, options, choice, consequences, optional decision-id) and §11 questions are yaml nodes with an id and q; the parser treats both as ordinary yaml nodes. The section map (rule:section-map) places new decision and question nodes there.

```yaml
- id: rule:live-refresh
  source: packages/web/src/lib/watch.ts; packages/web/src/app/api/[product]/events/route.ts; packages/web/src/components/LiveRefresh.tsx
  status: shipped
  title: The app follows the product on disk:
```

  - statement:live-refresh The app follows the product on disk: a recursive watcher on data/products/<product> (lib/watch.ts, on globalThis) rebuilds the graph 400 ms after a document changes and pushes change events (doc, graph, inbox, session) over /api/<product>/events; the LiveRefresh client refreshes the server-rendered parts (rail, lists, panels) on graph, inbox and session changes, so documents, tasks, questions and inbox items written by agents or editors appear without a reload. A document being edited in the browser is not reloaded while a save is pending.

```yaml
- id: rule:product-layout
  source: packages/web/src/lib/products.ts; packages/web/src/lib/scope.ts; bin/wye-graph.js#findDocs
  status: unverified
  requires-tests: [test:server-api#serve-starts-with-two-projects]
  title: >
    data/products/<product>/_product.md (title, icon, description), projects/<project>/_project.md (title, kind pr

```

  - statement:product-layout data/products/<product>/_product.md (title, icon, description), projects/<project>/_project.md (title, kind project|goal, status, icon), projects/<project>/docs/*.md (pages), inbox/ (dropped notes and files, unprocessed), _build/graph.json (the product's knowledge, built by ctx from every page of every project; files and folders starting with _ and the inbox are skipped). Routes: /<product>, /<product>/knowledge[/<kind>], /<product>/graph, /<product>/inbox, /<product>/<project>, /<product>/<project>/d/<page>.

<!-- /list:rule -->

## Decisions

<!-- list:decision -->

```yaml
- id: decision:wf2.delete-to-trash
  title: Deleting a product moves its folder to _trash; nothing is erased
  date: 2026-09-27
  status: approved
  affects: [lib:delete-product]
  related-to: [rule:product-layout, lib:products]
```

  - choice:wf2.delete-to-trash Deleting a product renames its registry folder to <data>/_trash/<slug>-<stamp> instead of unlinking it. A product is months of knowledge and a person deleting one in a web UI has no undo; a rename keeps every file, recoverable from Finder, while rm does not. The stamp is to the second and a collision appends a counter, so the same slug can be deleted, made again and deleted again without either copy being lost. _trash is not committed (.gitignore), and nothing in the app reads it — a product comes back by being moved out of it by hand.

```yaml
- id: decision:wf2.deleted-relocated-folder-stays
  title: A product relocated beside its code keeps that folder when it is deleted
  date: 2026-09-27
  status: approved
  affects: [lib:delete-product]
  related-to: [rule:product-layout, decision:wf2.delete-to-trash]
```

  - choice:wf2.deleted-relocated-folder-stays When a product's folder was moved out of the data folder — `root:` in _product.md, so its documents sit beside its code — deleting the product trashes only the registry entry and leaves that folder exactly where it is, untouched. The app owns its own registry, not a folder someone else's repo holds; moving a person's knowledge out from beside their code because they pressed delete in a browser is a surprise no confirmation dialog earns. The deletion says which of the two cases it is and what survives, and pointing a product at that folder again brings everything back.

```yaml
- id: decision:wf2.app-vs-product-settings
  title: The app's settings and a product's settings are different pages
  date: 2026-09-27
  status: approved
  affects: [lib:settings, lib:products]
  related-to: [rule:product-layout, decision:wf2.delete-to-trash]
```

  - choice:wf2.app-vs-product-settings Settings split along the boundary their storage already has: what lives in <data>/_settings.json is about the app on this machine — the theme, the agents, the Jev key — and sits at /settings, reached from the rail's workspace row; what lives in a product's own _product.md is about that product — where its folder is, deleting it — and sits at /<product>/settings, where the rail's gear points. One page mixing the two made a machine-wide key look like a product's property.

```yaml
- id: decision:wf2.product-transfer
  title: A product comes and goes as one file, or is opened where its folder already is
  date: 2026-10-05
  status: proposed
  by: agent
  affects: [lib:products, lib:product-transfer]
  related-to: [decision:wf2.app-vs-product-settings, decision:wf2.delete-to-trash]
```

  - context:wf2.product-transfer Products could only be created empty (Add a product › New). A product made on another machine, a teammate's clone or a repo that keeps its product in wye/ could not be brought in without copying folders by hand into the data folder, and there was no way to hand a product to someone.

  - choice:wf2.product-transfer Three ways in and one out. Export writes <slug>.wye.tgz: _product.md without root:, projects/ (documents and the app's .wye pages), inbox/ and _agent.md; the graph is rebuilt on the other side, and sessions, change records and hook logs stay on the machine that made them. Import lists the archive before writing anything — only those top-level names, no absolute path, no .., no link or device — unpacks it beside the registry under a free slug and builds it. Open registers a folder that holds projects/ (or a repo's wye/projects/) in place, as a registry entry with root: pointing at it; nothing is copied, and opening the same folder again answers with the product that already points at it. In the app: Add a product › Open a folder / Import a file, and Settings › Export; on the command line wye export, wye import <file.wye.tgz>, wye open <folder>.

  - alternative:wf2.product-transfer-zip A .zip export: friendlier to double-click on Windows, but Node has no zip writer and the package would need a dependency; tar is on macOS, Linux and Windows 10+.

  - alternative:wf2.product-transfer-sessions Exporting agent sessions and change records too: a complete history, but large, often private (prompts, paths on this machine), and meaningless without the machine's agents; the knowledge they produced is already in the documents.

  - consequence:wf2.product-transfer Opening a folder gives a product whose edits land in that folder, so a product kept in a repo is shared through git like the code; importing gives an independent copy. A Markdown folder that is not a Wye product (no projects/) is refused by Open and goes through wye import --product instead.

## Libraries

<!-- list:lib -->

```yaml
- id: lib:products
  file: packages/web/src/lib/products.ts
  side: server
  purpose: >
    Server-only registry of products and projects, read from the data folder: <data>/products/<product>/_product.md <data>/products/<product>/projects/<project>/_project.md <data>/products/<product>/projects/<project>/docs/*.md <data>/products/<product>/_build/graph.json (one graph per product: all its projects' docs) <dat
  part-of: module:app-storage
- id: lib:delete-product
  file: packages/web/src/lib/delete-product.ts
  side: server
  purpose: >
    Deleting a product: its registry folder is moved to <data>/_trash/<slug>-<stamp> rather than unlinked (decision:wf2.delete-to-trash), a product relocated beside its code keeps that folder (decision:wf2.deleted-relocated-folder-stays), and the product to land on next is named. Takes the data root, so it is tested against a temp folder with real files.
  part-of: module:app-storage
- id: lib:watch
  file: packages/web/src/lib/watch.ts
  side: server
  purpose: >
    Watches the product data on disk so the app follows what agents and editors write: any change under data/products/<product> (documents, inbox, sessions) is pushed to subscribers, and a changed document rebuilds the graph (agents may edit files without running wye build). Lives on globalThis across dev reloads.
  part-of: module:app-storage
- id: lib:artifacts
  file: packages/web/src/lib/artifacts.ts
  side: server
  purpose: >
    What a session produced: documents written while it ran (from the disk watcher), nodes it changed (from the node API), the blocks it added / changed / removed (from the graph diff at each rebuild, rule:block-attribution) and inbox items it filed (they carry the session id themselves). Running sessions of a product are credited with document changes; the tasks a session works on get `session:` and `produced:` links so t
  part-of: module:app-storage
- id: lib:desktop.main
  file: packages/desktop/main.js
  side: server
  purpose: >
    The Electron main process: owns the Next.js server as a child, waits until it answers, opens the window; agents are children of the server so everything dies together.
  part-of: module:app-storage
- id: lib:asking
  file: packages/web/src/lib/asking.ts
  side: server
  purpose: >
    A live conversation waiting on the person (req:wf2.sessions.question-toast): the last permission request in its
    transcript that no `note` answered — an AskUserQuestion (the question's text) or another tool's permission.
  status: proposed
  part-of: module:app-storage
- id: lib:constitution
  file: packages/web/src/lib/constitution.ts
  side: server
  purpose: >
    The constitution (decision:memory.constraint-type): the approved, current constraint: blocks of a product — the
    small, stable set of rules every plan and agent action must respect. Read from the graph; nothing is stored
    apart.
  status: proposed
  part-of: module:app-storage
- id: lib:retype
  file: packages/web/src/lib/retype.ts
  side: server
  purpose: >
    Changing a page's type changes its id (rule:doc-retype): the frontmatter node line takes the new kind and every
    reference to the old id in the product's documents is rewritten to the new one — a whole-id match, so
    `module&#58;platform-ops` and `module&#58;platform.x` are not touched by a rewrite of `module&#58;platform`.
    Pure.
  status: proposed
  part-of: module:app-storage
- id: lib:apply-links
  file: packages/web/src/lib/apply-links.ts
  side: server
  purpose: >
    Links applied in the editor (Jev auto-linking design §3), pure and client-safe: a paragraph or a prose node gets
    the ids as smart tags at its end (the prose convention — a tag in text is a related-to edge); a yaml card gets
    them merged into related-to in its body. Code, embeds, drawings and blocks not in the map are untouched.
  status: proposed
  part-of: module:app-storage
- id: lib:jev
  file: packages/web/src/lib/jev.ts
  side: server
  purpose: >
    The app's Jev client (Jev auto-linking design §1): lib/jev.js bound to the key the settings hold — shared with
    the CLI and the eval suite through createRequire like the judge. Disabled without a key: every method returns
    the empty result and makes no call.
  status: proposed
  part-of: module:app-storage
- id: lib:links
  file: packages/web/src/lib/links.ts
  side: server
  purpose: >
    Automatic links (Jev auto-linking design §3): the local search finds candidates for a text, Jev judges each ("is
    the text about it?" → probability), and the ids above LINK_MIN are the links. judgeText is the shared step
    (inbox, editor, consolidation); linksFor is the editor's batch — per block, cached by the text's hash in
    <product>/_build/jev.json so an unchanged block is never judged twice, invalidated when the question wording
    changes.
  status: proposed
  part-of: module:app-storage
- id: lib:settings
  file: packages/web/src/lib/settings.ts
  side: server
  purpose: >
    The app's settings (Jev auto-linking design §0): one json file at <data>/_settings.json — local to this machine,
    listed in .gitignore, mode 0600 because it holds keys. Read fresh on every use (cheap, and the page's Save is
    visible to the next request); the browser only ever sees publicSettings().
  status: proposed
  part-of: module:app-storage
- id: lib:pr-doc
  file: packages/web/src/lib/pr-doc.ts
  side: server
  purpose: >
    The plan document (req&#58;wf2.sessions.pr-doc, rule&#58;pr-doc): one per request that starts work — a new
    session or a fresh-context message (decision:wf2.plan-per-request) — created by the app from
    templates/docs/pr.md under the project's Plans page (decision:wf2.plans-folder), finished by the app with the
    result. Pure: the slug, the body, the result section scoped to the plan's window, the frontmatter edits, a
    session's plans read from the graph; the IO lives in lib/plan-docs.
  status: proposed
  part-of: module:app-storage
- id: lib:pr-docs
  file: packages/web/src/lib/pr-docs.ts
  side: server
  purpose: >
    Server-only IO for Prompt Requests (rule&#58;pr-doc): the project's PRs page (decision:wf2.plans-folder), a PR
    page document for every request that starts work (decision:wf2.plan-per-request), the result written when the
    build ends (decision:wf2.plan-result-owned-by-app). The shapes come from lib/pr-doc (pure).
  status: proposed
  part-of: module:app-storage
- id: lib:pr-sessions
  file: packages/web/src/lib/pr-sessions.ts
  side: server
  purpose: >
    The sessions on a PR (decision&#58;wf2.pr-approval-is-the-persons-click): when the person approves or cancels,
    the live refining session on it is told once and stopped. Kept apart from lib/pr-docs so that module stays free
    of the agent host (which imports it).
  status: proposed
  part-of: module:app-storage
- id: lib:dispatch
  file: packages/web/src/lib/dispatch.ts
  side: server
  purpose: >
    The dispatcher (decision&#58;wf2.pr-scheduler): approved PRs are built by the app itself. Whenever a PR is
    approved, a session ends, or the tick fires, each product is looked at: the PRs building (status building with a
    live or queued session on them — a stale one goes back to approved), the free slots (Settings › Agents, parallel
    runners minus the building), and the approved PRs in approval order; every one whose scope does not overlap a
    building PR's gets a worker session through assignTask(... build) — the Definition as its context — until the
    slots are spent. A PR that has to wait knows why (the head and the PRs folder show it). pickNext is pure.
  status: proposed
  part-of: module:app-storage
- id: lib:pr-intake
  file: packages/web/src/lib/pr-intake.ts
  side: server
  purpose: >
    Intake (decision&#58;wf2.pr-intake): the moment a PR page exists, the app reads the product for it — before the
    librarian starts. One model call gives a real title and the request restated as what the person wants; the
    constraint packet and the semantic search give what it touches and what is in force; lib/impact's structural
    candidates give what the change reaches. Written into the page (title, Context, Impact) and put in front of the
    librarian as its first message's "What Wye found", so it continues from there instead of re-explaining. Pure
    helpers first (the prompt, the parser, the section bodies), then the IO.
  status: proposed
  part-of: module:app-storage
- id: lib:pr-questions
  file: packages/web/src/lib/pr-questions.ts
  side: server
  purpose: >
    A librarian's questions live on its PR page (decision&#58;wf2.pr-questions-on-the-page): when a refining session
    raises AskUserQuestion, the questions become `question:` cards under the PR's "## Questions" — the question, its
    header, the options with their descriptions, `asked-by: session:<id>#<request>`, status open. The person answers
    on the page (op:api.pr answer) or in the console; either way the card gets `answer`, `by`, status resolved, and
    once every card of one request is answered the tool is answered too, so the session continues. Pure helpers
    first, then the IO.
  status: proposed
  part-of: module:app-storage
- id: lib:pr-scope
  file: packages/web/src/lib/pr-scope.ts
  side: server
  purpose: >
    A PR's scope (decision&#58;wf2.pr-scheduler): the ids its build will touch — the Definition's blocks, the ids
    the request tags, and what lib/impact's structural candidates reach from those (two hops with decay, weight ≥
    0.5). Written to the frontmatter as `scope: [..]` with `scope-of: <hash of the Definition ids>` so readiness can
    tell whether it is fresh; two PRs overlap when their scopes intersect — the dispatcher never builds them at
    once.
  status: proposed
  part-of: module:app-storage
- id: lib:comments
  file: packages/web/src/lib/comments.ts
  side: server
  purpose: >
    Comments (decision:ontology.comment-is-a-ref, req:ontology.comment-home): a comment is a `comment:` row in the
    Comments document of the project the commented node belongs to — one per project, created on the project's first
    comment, holding one `<!-- table:comment -->` block — never nested under the node. `on:` names the node; the
    node lists its comments as the inverse edge. The document is the collection document of type:comment
    (lib/instances).
  status: proposed
  part-of: module:app-storage
- id: lib:hooks-run
  file: packages/web/src/lib/hooks-run.ts
  side: server
  purpose: >
    Hooks, the IO part (decision&#58;wf2.hooks-and-skills): `fire` takes the events the watcher, approve and session
    end emit, matches them against the product's hooks (lib/hooks) and runs the actions — `run skill:<id>` starts a
    session on the node with the skill's body in its first message, `add <template>` appends a template's blocks
    under the node as proposed content. Every firing is a record in <product>/_hooks/<id>.json: `once` holds through
    it, a node's column can show what ran, and a session started by a firing carries it (Session.hook) so the
    changes it makes fire hooks one level deeper — never past MAX_DEPTH, never the same hook on the same node twice.
    WF_HOOKS=0 turns it off.
  status: proposed
  part-of: module:app-storage
- id: lib:hooks
  file: packages/web/src/lib/hooks.ts
  side: server
  purpose: >
    Hooks, the pure part (decision&#58;wf2.hooks-and-skills): a hook card — `on: <kind>.<event>`, `where:` filters,
    `do:` actions, `once`, status — read from its node; the events a graph diff means (created, status:<x>,
    linked:<verb>); which active hooks match an event on a node; a template filled for a node. The IO — firings, the
    sessions a `run` starts, the blocks an `add` writes — is lib/hooks-run.
  status: proposed
  part-of: module:app-storage
- id: lib:skills
  file: packages/web/src/lib/skills.ts
  side: server
  purpose: >
    Skills (decision&#58;wf2.hooks-and-skills): an instruction a session follows, kept as a document under the
    project's Skills page — `skill-<slug>.md`, node `skill:<slug>`, type:skill. The shipped prompts (prompts/*.md)
    are written here as skills the first time a product needs them, so a person can read and edit them; the host
    reads a skill's body from the document when present, else the file — the file stays the fallback so nothing
    breaks without them. The Hooks page (hooks.md) lives beside it: one document of hook and template cards per
    project.
  status: proposed
  part-of: module:app-storage
- id: lib:build
  file: packages/web/src/lib/build.ts
  side: server
  purpose: >
    The build coordinator (decision&#58;wf2.parse-cache): a product's graph is built in this process — lib/build.js
    with a parse cache kept across builds, so a save re-parses the one document that changed and replays the rest —
    and the built graph stays in memory with its indexes, served to every request until graph.json changes
    underneath (a CLI build). One build per product at a time; a request that arrives while one runs gets the next.
    Listeners registered with onBuilt run after every build with the graph before and after — the watcher's change
    pipeline lives there.
  status: proposed
  part-of: module:app-storage
- id: lib:graph-delta
  file: packages/web/src/lib/graph-delta.ts
  side: shared
  purpose: >
    What one build changed, for the pages that are open (decision&#58;wf2.change-names-what-changed): the ids whose
    record, content or relations changed — a line that only moved is not a change — and whether any of it is
    knowledge (a node a list shows, or a relation other than a paragraph's place on its page). More than 400 ids,
    or no graph before, is "everything". Pure; tested by test:web-lib#graph-delta.
  status: proposed
  part-of: module:app-storage
- id: lib:change
  file: packages/web/src/lib/change.ts
  side: shared
  purpose: >
    The app's change event as a page hears it (`wf:change`, relayed by component:live-refresh): which kinds of
    things changed on disk and, for the graph, what in it (lib:graph-delta). `nodeChanged` is what a card asks,
    `knowledgeChanged` what a view, a table and the node index ask, so a save of prose makes none of them fetch
    again. An event that does not say reads as everything. Pure; tested by test:web-lib#change.
  status: proposed
  part-of: module:app-storage
- id: lib:request
  file: packages/web/src/lib/request.ts
  side: server
  purpose: >
    Is this render for the router (a refresh or a client navigation — an RSC request) rather than a full page load?
    Next strips its own `rsc` header before `headers()`, so the fetch metadata tells: the router fetches with
    sec-fetch-dest "empty" (a document load says "document"), and accepts text/x-component. A plain curl counts as a
    full load. Used to leave the node index and the server-rendered reader out of a refresh
    (decision&#58;wf2.parse-cache).
  status: proposed
  part-of: module:app-storage
- id: lib:code-paths
  file: packages/web/src/lib/code-paths.ts
  side: server
  purpose: >
    Source paths in a property's text (req&#58;wf2.code-preview): `packages/web/src/lib/x.ts#fn`,
    `eval/lib/record.js:22`, a list of them separated by `;` or `,` — every token that reads as a file with a
    code-like extension, with its `#symbol` / `:line` kept. A `<placeholder>` in the path is not a file.
  status: proposed
  part-of: module:app-storage
- id: lib:import-docs
  file: packages/web/src/lib/import-docs.ts
  side: server
  purpose: >
    Import markdown files — one file or a folder tree — as documents of a project (req:wf2.import.markdown,
    decision:wf2.import-lands-first-agent-rewrites-in-place). `plan` is pure: given the files (path + text) and what
    the project already has, it says which documents to write with what front matter and where the tree's folders
    become parent documents. `write` puts them on disk. No model here: the agent comes after, through the hook on
    `module.created where status=imported`.
  status: proposed
  part-of: module:app-storage
- id: lib:theme
  file: packages/web/src/lib/theme.ts
  side: client
  purpose: >
    The app's theme (req&#58;wf2.ui.theme): the person's choice — system, light or dark — in localStorage
    `wf-theme`, applied as `data-theme` on <html> (the CSS palette hangs on it). `system` follows
    prefers-color-scheme and moves with it. The inline script in the root layout applies it before first paint so a
    dark page never flashes light.
  status: proposed
  part-of: module:app-storage
- id: lib:node-blocks
  file: packages/web/src/lib/node-blocks.ts
  side: server
  purpose: >
    The pre-defined blocks a node's content can carry, by kind (decision&#58;wf2.column-is-content): what the column
    used to render as fixed sections — a goal's Requirements and Tasks, a question's answer, a decision's parts —
    are blocks in the node's content markdown now: deletable, movable, re-addable. `suggest` says which are missing
    so the column can offer them; nothing is written until the person clicks.
  status: proposed
  part-of: module:app-storage
- id: lib:recent
  file: packages/web/src/lib/recent.ts
  side: client
  purpose: >
    What the command box has been asked before (task:palette-recent-commands): the last texts sent from a product,
    newest first, no duplicates — ↑ in the empty box walks back through them like a shell's history. Kept per
    product in localStorage (`wf-recent-<product>`), never sent anywhere; a private window that throws simply has no
    history.
  status: proposed
  part-of: module:app-storage
- id: lib:doc-create
  file: packages/web/src/lib/doc-create.ts
  side: server
  purpose: >
    Creating a page in a project from a template — the one path the doc route, a hook and a workflow stage all use
    (rule:page-node-line: a typed page's card is its frontmatter, so the template's own module card is dropped).
  status: proposed
  part-of: module:app-storage
- id: lib:runs-run
  file: packages/web/src/lib/runs-run.ts
  side: server
  purpose: >
    Workflows, the IO part (decision&#58;wf2.workflow-is-a-skill, decision&#58;wf2.run-holds-the-state): starting a
    run on a node or document, entering a stage — the documents it produces created from templates/docs when they
    are absent, its `do:` actions run through the hook runner with the stage as the actor — and the person's moves:
    advance, reopen, skip, retry, cancel. Readiness is computed on demand (lib/runs#readinessOf) and never written
    to the card: a derived value in markdown would be rewritten by every rebuild, and every rewrite is another
    rebuild. The state is the `run:` card in the project's Workflow runs document; `sweepRuns` is what the watcher
    calls after each build.
  status: proposed
  part-of: module:app-storage
- id: lib:runs
  file: packages/web/src/lib/runs.ts
  side: server
  purpose: >
    Workflows, the pure part (decision&#58;wf2.workflow-is-a-skill): a workflow is a skill that declares stages — a
    document whose `stage:` cards are its steps, in document order, each with the same `do:` actions a hook runs,
    the documents it produces and its exit criterion. This file parses a workflow, its stages and the closed
    `until:` predicate set (decision&#58;wf2.until-is-closed), and evaluates that criterion against a graph as
    readiness rows. The IO — starting a run, entering a stage, writing the run card — is lib/runs-run.
  status: proposed
  part-of: module:app-storage
- id: lib:floating
  file: packages/web/src/lib/floating.ts
  side: server
  purpose: >
    Where a link between two nodes should touch them (decision:map.links-take-the-nearest-sides): the canvas draws
    every edge from the side of one card that faces the other, so a node below its parent is joined bottom to top
    and one to the left is joined left to right — never the long sweep a fixed right-to-left handle pair gives. Pure
    geometry over two boxes; the canvas turns it into a curve.
  status: proposed
  part-of: module:app-storage
- id: lib:map
  file: packages/web/src/lib/map.ts
  side: server
  purpose: >
    A map page, the pure part (decision:map.page-owns-its-nodes): a document of type:map whose cards are the nodes
    of a canvas and whose links are its edges. This file reads and writes the one thing the canvas owns — the `##
    Layout` section, a fenced block of `<id> <x>,<y>` lines with `ref` on a node that lives in another document and
    `open` on one shown as its full card (decision:map.layout-is-a-fenced-section) — works out what the canvas
    should draw, and says which verbs an edge between two kinds may take (decision:map.verbs-from-the-ontology). The
    IO is the map route.
  status: proposed
  part-of: module:app-storage
- id: lib:timeline
  file: packages/web/src/lib/timeline.ts
  side: server
  purpose: >
    A timeline (decision&#58;wf2.timeline-is-a-query): what a Gantt page draws, worked out from the graph and one
    query line — which nodes are on it, when each one happens, and what the rows are. Pure: the graph in, rows of
    bars out. The query is the view block's language (lib/instance-table) with three keys of its own: `rows` says
    what the Y axis groups by, `from` and `to` the window.
  status: retired
  part-of: module:app-storage
- id: lib:ask
  file: packages/web/src/lib/ask/ask.ts
  side: server
  purpose: >
    Ask (decision:wf2.ask-two-lanes): retrieve once, then the fast and the deep lane run at the same time; their
    output is merged into one stream of events with one citation numbering. The fast lane's sources are numbered
    first, in the order its prompt lists them, so its [n] are already right; the deep lane's [[ref]] are renumbered
    as they stream.
  status: proposed
  part-of: module:app-storage
- id: lib:chunk
  file: packages/web/src/lib/ask/chunk.ts
  side: server
  purpose: >
    The passages Ask indexes (decision:wf2.ask-sources): a node is one passage; a document's prose is cut by heading
    and at ~1 200 chars on paragraph boundaries (its yaml cards are nodes already); code is cut at top-level
    symbols, else 60-line windows; a session is one passage per turn. Pure: the walker (refresh.ts) reads the files.
  status: proposed
  part-of: module:app-storage
- id: lib:citations
  file: packages/web/src/lib/ask/citations.ts
  side: server
  purpose: >
    One numbering for both answers (decision:wf2.ask-two-lanes): [3] is the same source in the fast and the deep
    answer.
  status: proposed
  part-of: module:app-storage
- id: lib:claude
  file: packages/web/src/lib/ask/claude.ts
  side: server
  purpose: >
    One `claude -p` run as a stream of its JSON lines (decision:memory.model-calls-via-cli). WYE_CLAUDE_BIN replaces
    the binary (a shell command line — the tests point it at a stub). Abort kills the child and ends the stream
    quietly.
  status: proposed
  part-of: module:app-storage
- id: lib:deep
  file: packages/web/src/lib/ask/deep.ts
  side: server
  purpose: >
    The deep lane (decision:wf2.ask-two-lanes): a read-only agent — wye search, graph and document reads, Read /
    Grep / Glob in the product's code — that investigates until it can answer. It never writes or proposes
    (constraint:wf2.pr-is-the-persons). Capped at 20 tool calls or 120 s; then it is stopped and its partial answer
    stands.
  status: proposed
  part-of: module:app-storage
- id: lib:embed-2
  file: packages/web/src/lib/ask/embed.ts
  side: server
  purpose: >
    The local models (transformers.js, cached under .cache/models; nothing leaves the machine): the sentence
    embedder shared by the semantic context search and the Ask index (MiniLM, normalised, so a dot product is the
    cosine), and the cross-encoder Ask uses to rerank passages against a question (decision:wf2.ask-two-lanes).
  status: proposed
  part-of: module:app-storage
- id: lib:env
  file: packages/web/src/lib/ask/env.ts
  side: server
  purpose: >
    What a query needs for one product: the scope (graph, index), the store brought up to date, the embedder and the
    reranker when their models load — without the embedder search is full-text only and says so.
  status: proposed
  part-of: module:app-storage
- id: lib:fast
  file: packages/web/src/lib/ask/fast.ts
  side: server
  purpose: >
    The fast lane (decision:wf2.ask-two-lanes): the retrieved passages, numbered, and the question go to one
    tool-less model call; its answer streams back token by token with [n] citations into that numbering.
  status: proposed
  part-of: module:app-storage
- id: lib:question
  file: packages/web/src/lib/ask/question.ts
  side: server
  purpose: >
    Typing a question in ⌘F asks it (decision:wf2.ask-in-search-panel): it ends with "?", or it starts with a
    question word and has at least one more word. Client-safe.
  status: proposed
  part-of: module:app-storage
- id: lib:reducer
  file: packages/web/src/lib/ask/reducer.ts
  side: server
  purpose: >
    The panel's view of one question: the stream of AskEvents folded into what it shows. Client-safe.
  status: proposed
  part-of: module:app-storage
- id: lib:refresh
  file: packages/web/src/lib/ask/refresh.ts
  side: server
  purpose: >
    Keeps a product's Ask index current (decision:wf2.ask-sources): each source file whose mtime moved is re-chunked
    and only passages whose text changed are rewritten; files that vanished lose their passages; passages written
    without a vector (no model yet) get one once the model loads. The product's code is its `repo:` (else this
    repo): the files git tracks, ≤200 KB, text only. One diff, one write (store.apply).
  status: proposed
  part-of: module:app-storage
- id: lib:refs
  file: packages/web/src/lib/ask/refs.ts
  side: server
  purpose: >
    What the deep lane is doing and what it has looked at, read off its tool calls (decision:wf2.ask-two-lanes):
    every file, node or passage it opens becomes a source the panel shows while it is still working. Pure.
  status: proposed
  part-of: module:app-storage
- id: lib:retrieve
  file: packages/web/src/lib/ask/retrieve.ts
  side: server
  purpose: >
    Ask's retriever (decision:wf2.ask-two-lanes): the store's hybrid search (BM25 + vectors, fused by reciprocal
    rank), ended nodes left out (req:memory.current-by-construction), then one hop along the graph's structural
    edges — a decision brings what it affects, a requirement what satisfies it, a node the passages that mention it
    — at a share of the parent's score; for a question, a cross-encoder reranks the lot against it; finally trimmed
    to a budget.
  status: proposed
  part-of: module:app-storage
- id: lib:store
  file: packages/web/src/lib/ask/store.ts
  side: server
  purpose: >
    The Ask index on disk (decision:wf2.ask-sources): one embedded LanceDB database per product, <product>/_build/
    search.lance — one row per passage with its vector, a full-text index over title + text, and hybrid search (BM25
    and vectors fused by reciprocal rank). Writes are batched (state → apply) so a refresh is one delete and one
    add, not one per file. Which file each passage came from, and that file's mtime, is kept beside it in
    scopes.json.
  status: proposed
  part-of: module:app-storage
- id: lib:types-2
  file: packages/web/src/lib/ask/types.ts
  side: server
  purpose: >
    Ask (decision:wf2.ask-sources, decision:wf2.ask-two-lanes): the shapes shared by the index, the retriever, the
    two answer lanes, the API and the panel. Client-safe: no node imports.
  status: proposed
  part-of: module:app-storage
- id: lib:import-run
  file: packages/web/src/lib/import-run.ts
  side: server
  purpose: >
    A big folder (an Obsidian vault, a wiki export) imported from a path on disk (the desktop app has the file
    system already — no browser upload needed, req&#58;wf2.import.markdown-path). Unlike the multipart route, which
    writes every file at once and lets the watcher fire hook:import-analyse on all of them together — fine for a
    handful of pages, but a vault of hundreds spawns that many concurrent agent sessions — this writes everything as
    `raw` (no auto-fire), makes one request page listing every file as a task, then works the list one file at a
    time: fire the analyse hook, wait for its session to end, check the task, move on. The request page is the
    progress: reopen it any time to see how far the import got.
  status: proposed
  part-of: module:app-storage
- id: lib:instance-add
  file: packages/web/src/lib/instance-add.ts
  side: server
  purpose: >
    A new instance of a type, and where it went (decision:ontology.collection-document, req:ontology.instance-home):
    a row of the type's collection document — the document `home:` on the type card names, else one titled with the
    type's plural, created in the project that declares the type on the first instance and written as `home:` so
    every later path lands there. A type with no `home:` — a base kind (task, req, decision…) among them — gets the
    same: its plural's page in the person's docs/ (tasks.md, reqs.md, goals.md), in the project the caller is on
    (`home`: <project>/<page>), never the page itself — that may be a view, or a system page in .wye/
    (decision:wf2.instances-go-home). A base kind's card is read-only, so its page is found by name each time. The
    graph rebuilds. The types route and a PR without a goal (decision:wf2.pr-has-a-goal) both come here.
  status: proposed
  part-of: module:app-storage
- id: lib:propose-card
  file: packages/web/src/lib/propose-card.ts
  side: server
  purpose: >
    One proposed card for op:api.propose (req:exec.wye-proposes): checked and normalised before it is written, and
    placed where it belongs. Wye cards are not strict yaml (a title may hold a colon), so the check is of shape: one
    card, keys at one indentation, no key twice — the shapes an agent's edit-by-repropose produced (a second card
    nested in the first, an old and a new title side by side) are refused with the reason, not written.
  status: proposed
  part-of: module:app-storage
- id: lib:verdict-reconcile
  file: packages/web/src/lib/verdict-reconcile.ts
  side: server
  purpose: >
    A node's verdict lines kept current (decision:memory.write-time-verdict): one verdict per pair — a new judgement
    of a pair (its text changed, so the pair is judged again) replaces the old line instead of piling up beside it;
    an open contradiction of a pair that no longer conflicts is closed (#resolved, saying what it is now); one that
    still conflicts gives way to the new one. A contradiction the person settled (dismissed, resolved, …) is theirs
    and stays.
  status: proposed
  part-of: module:app-storage
- id: lib:instrumentation
  file: packages/web/src/instrumentation.ts
  side: client
  purpose: >
    Once per server process (Next's instrumentation hook): the hooks clock (decision&#58;ea.time-based-hooks) — a
    tick every 60 s over every product, one at startup for the slots missed while the app was down. Node runtime
    only.
  status: proposed
  part-of: module:app-storage
- id: lib:briefs
  file: packages/web/src/lib/ea/briefs.ts
  side: server
  purpose: >
    The briefs, the pure part (req&#58;ea.daily-brief, req&#58;ea.weekly-pace, req&#58;ea.one-on-one-prep): markdown
    built from one plain input — the assistant's knowledge (ea/model), the follow scan of the other products
    (ea/follow) and the snapshot of the last brief — so every rule here is tested with fixtures. ea/brief-run
    gathers the input and writes the page. Only approved commitments count (constraint&#58;ea.pushed-is-proposed,
    test&#58;ea.proposed-commitment-stays-in-inbox); met and dropped never show; every open one is listed from the
    day it is made, late and due today first (decision&#58;ea.briefs-list-all-open-commitments,
    decision&#58;ea.daily-brief-lists-all-open); every line links to the block it is about
    (test&#58;ea.brief-lines-link-to-source).
  status: proposed
  part-of: module:app-storage
- id: lib:commitments
  file: packages/web/src/lib/ea/commitments.ts
  side: server
  purpose: >
    Commitments (task&#58;ea.commitment-tracking, req&#58;ea.dates-followed): a date someone committed to is
    followed until it is met, moved or dropped. A move keeps the old date, the new one, when and why as a `move:`
    line under the commitment (test&#58;ea.move-keeps-history) and sets due and state; met keeps the day it was met
    on (test&#58;ea.met-leaves-briefs); drop keeps its reason and is refused without one
    (test&#58;ea.dropped-closed-with-reason). The checks are pure (commitmentOp); the writes are node-content +
    node-edit under the file lock.
  status: proposed
  part-of: module:app-storage
- id: lib:follow-run
  file: packages/web/src/lib/ea/follow-run.ts
  side: server
  purpose: >
    The follow scan, the IO part: every other product's graph read as it stands — from the build coordinator's
    memory or its graph.json (lib/build#graphFor), never built here, so a product without a graph is skipped rather
    than written (constraint&#58;ea.reads-other-products-only). Nothing in this file writes.
  status: proposed
  part-of: module:app-storage
- id: lib:follow
  file: packages/web/src/lib/ea/follow.ts
  side: server
  purpose: >
    The follow scan (decision&#58;ea.follow-is-owner-or-tag, task&#58;ea.follow-scan): what the director follows in
    every other product — each open task, commitment, question, proposed decision or risk whose owner (a task's
    worker too) is one of the names the director goes by there, or whose text carries `@follow`. Pure over one
    product's graph; the IO (ea/follow-run) reads the graphs and never writes into them
    (constraint&#58;ea.reads-other-products-only).
  status: proposed
  part-of: module:app-storage
- id: lib:intake-run
  file: packages/web/src/lib/ea/intake-run.ts
  side: server
  purpose: >
    Intake, the IO part (task&#58;ea.cli-intake): the plan ea/intake makes, written — people, the meeting and the
    item cards as rows of their types' collection documents (lib/instance-add,
    decision:ontology.collection-document), updates under their project and questions under the meeting as content
    (node-content, under the file lock), an inbox item per question, one rebuild at the end. Writes go only into the
    product named (constraint&#58;ea.reads-other-products-only).
  status: proposed
  part-of: module:app-storage
- id: lib:intake
  file: packages/web/src/lib/ea/intake.ts
  side: server
  purpose: >
    Intake, the pure part (decision&#58;ea.tools-push-through-cli, task&#58;ea.cli-intake,
    req&#58;ea.meeting-lands-in-place): a meeting analysis an outside tool pushes is validated, then planned against
    what the product holds — the meeting card, a proposed card for every decision, commitment and risk (`by:
    agent:<source>`, `from:` the meeting), an update line under its project, a proposed person for every name nobody
    goes by, and for an item whose project is unknown or ambiguous, or whose owner is ambiguous, an open question
    under the meeting and an inbox item instead of a guess. Everything lands proposed
    (constraint&#58;ea.pushed-is-proposed). Same title + date → same meeting, and an item already filed from it is
    not filed again, so a second push of one analysis plans nothing. ea/intake-run does the writes.
  status: proposed
  part-of: module:app-storage
- id: lib:model
  file: packages/web/src/lib/ea/model.ts
  side: server
  purpose: >
    The executive assistant's knowledge, the pure part (decision&#58;ea.kinds): person, project, commitment,
    meeting, risk and Wye's own decision, read from graph nodes into plain records — card values off the node's body
    (hooks#cardValue, a prose row's `(k: v)` group and a yaml card read the same), a commitment's moves and a
    project's updates off the lines of its content (`- move:<c>-<n> from A to B on C because why`, `- update:<slug>
    text (from:, date:)`). Name matching (a person by name or alias, a project by title, name or slug), commitment
    history and slip counts live here too. The IO — which nodes, which files — is ea/read.ts.
  status: proposed
  part-of: module:app-storage
- id: lib:read
  file: packages/web/src/lib/ea/read.ts
  side: server
  purpose: >
    The assistant's knowledge, the IO part: the ea product's nodes read into an EaModel (ea/model), each
    commitment's and project's content read from its document (the moves and updates written under it), and the
    director from the product card (`director: person:<p>.<slug>`).
  status: proposed
  part-of: module:app-storage
- id: lib:hooks-clock
  file: packages/web/src/lib/hooks-clock.ts
  side: server
  purpose: >
    The clock of the hooks engine (decision&#58;ea.time-based-hooks, task&#58;ea.cadence): a `time.<schedule>` hook
    fires when its last scheduled slot (lib/hooks#lastSlot, in the person's zone) is past the one it last saw —
    once, however many slots went by while the app was down (one catch-up run, not one per missed tick). First sight
    of a hook — just written, just installed — records the current slot and fires nothing: a Friday review installed
    on Wednesday does not run last Friday's. State per product in <product>/_hooks/clock.json { [hook]: { seen, last
    } }, written before the actions run so a crash never runs a slot twice. The firing itself is the engine's
    (hooks-run#fire, `only` the hook, forced): a record in _hooks/<id>.json like any. A ticker every 60 s over every
    product, armed once per server (instrumentation).
  status: proposed
  part-of: module:app-storage
- id: lib:install
  file: packages/web/src/lib/install.ts
  side: server
  purpose: >
    The system library and installs, the CLI/API subset of the install design
    (module&#58;implement-a-feature-to-install- system-skills-and-dev-design): a package is
    `<system>/projects/<pkg>/` — `package.md` (its card: title, description, entity:install.package), `docs/`
    (skills, workflows, hook documents, templates) and, outside docs/ so no link ever exposes it, `types.md`: the `-
    id: type:<slug>` cards the package brings (decision&#58;ea.packages-carry-types). Install (op:install.install)
    declares those types in the product, writes the project's record and makes one directory link
    (decision:install.directory-link); the record is the fact, the link derived from it
    (decision:install.record-is-canonical). One function per op, called by the API routes and, through them, `wye`.
  status: proposed
  part-of: module:app-storage
- id: lib:product-create
  file: packages/web/src/lib/product-create.ts
  side: server
  purpose: >
    A new product folder, the way the app makes one (POST /api/products) and `wye install --create-product` does:
    the registry entry with its _product.md, an inbox, and one project to hold documents — `main` unless named.
  status: proposed
  part-of: module:app-storage
- id: lib:brief-run
  file: packages/web/src/lib/ea/brief-run.ts
  side: server
  purpose: >
    The briefs, the IO part: one input gathered — the ea product's knowledge, the follow scan of every other product
    (read-only), the snapshot of the last brief before the day — then built (ea/briefs) and, with `write`, kept as a
    page under the project's Briefs page (module&#58;ea-briefs, the package's; else a `briefs` page, made when
    neither exists): brief-<date>, weekly-<date>, 1on1-<person>-<date>, in the project's own docs/ — replaced when
    it exists, one per day (test&#58;ea.brief-arrives-once-each-morning). Every written brief leaves a snapshot in
    <product>/_ea/snapshots/<date>.json, what "changed since yesterday" compares with
    (test&#58;ea.brief-lists-projects-changed-since-yesterday).
  status: proposed
  part-of: module:app-storage
- id: lib:rail-agents
  file: packages/web/src/lib/rail-agents.ts
  side: server
  purpose: >
    The rail's Agents folder (decision&#58;wf2.rail-shows-running-agents): the sessions running in this product now,
    each as one row — its state, what it works on, what it is doing, for how long. Pure, client-safe.
  status: proposed
  part-of: module:app-storage
- id: lib:digest-run
  file: packages/web/src/lib/ea/digest-run.ts
  side: server
  purpose: >
    The Digest's daily summary, the IO part (decision&#58;ea.digest-is-a-page): the context for the agent (the
    assistant's nodes against the snapshot the last summary left in <product>/_ea/digest/<date>.json), and the
    summary written into the Digest page's "Daily summary" section — which leaves today's snapshot, what the next
    context compares with.
  status: proposed
  part-of: module:app-storage
- id: lib:digest
  file: packages/web/src/lib/ea/digest.ts
  side: server
  purpose: >
    The Digest's daily summary, the pure part (decision&#58;ea.digest-is-a-page). The Digest is a live page of
    views; once a weekday morning skill:ea.daily-summary writes an entry into its "Daily summary" section. The agent
    reads a context computed here — what arrived, changed or closed since the last summary (a snapshot of the
    assistant's nodes then against now), grouped by project and person, and what waits now — then writes a few lines
    of judgment on top of it.
  status: proposed
  part-of: module:app-storage
- id: lib:messages
  file: packages/web/src/lib/ea/messages.ts
  side: server
  purpose: >
    Slack threads and emails waiting on the director (decision&#58;ea.messages-pushed): an outside tool pushes them
    with `wye ea intake` as `{ "messages": [...] }`, next to or instead of a meeting. Each becomes a thread: or
    email: card in its collection page — open while a reply (or a look) is owed, answered once given. The tool's own
    id is kept (`source-id`), so a second push of the same thread updates its card: a newer time, the answer given.
    They are not knowledge waiting for review but what is waiting on the director, so they are not proposed;
    answered is `done`. Pure: the IO is in intake-run.
  status: proposed
  part-of: module:app-storage
- id: lib:suggest
  file: packages/web/src/lib/ea/suggest.ts
  side: server
  purpose: >
    Suggested actions (decision&#58;ea.suggested-actions): what the assistant suggests the director does now —
    follow up on a project gone quiet, answer a thread, check a commitment due soon — each a suggestion: card (type
    of the package) in the project's Suggestions page, about one item, with why. The Digest lists the open ones at
    the top as a live table; the director ticks one done or dismisses it there. skill:ea.suggest-actions writes them
    with `wye ea suggest`; a second suggestion of the same action about the same item renews the one that is open
    instead of adding another.
  status: proposed
  part-of: module:app-storage
- id: lib:import-brief
  file: packages/web/src/lib/import-brief.ts
  side: server
  purpose: >
    The import lane's shared brief and its sorting of files (decision:wf2.import-lane). One agent session takes a
    whole import, files arriving as messages; what every file needs — the product's types, the ids of the people,
    projects and the like it already has, the commands, one finished page — goes once into the session's system
    text, a stable prefix the model caches, instead of each file's agent looking it all up again (a third of its
    time). Pure: the caller hands in the graph's nodes and the pages.
  status: proposed
  part-of: module:app-storage
- id: lib:menu-fit
  file: packages/web/src/lib/menu-fit.ts
  side: server
  purpose: >
    A popup menu placed at a point (a right-click, or under a ⋯ button) is kept inside the window: once it is drawn
    and its size known, a menu that would run past the bottom opens upward from the point, and one past the right
    edge moves left. Call from a layout effect with the menu element and the point it was opened at. `above`: the
    top of the button it hangs from, so an upward menu ends above the button, not over it.
  status: proposed
  part-of: module:app-storage
- id: lib:obsidian-drawing
  file: packages/web/src/lib/obsidian-drawing.ts
  side: server
  purpose: >
    Obsidian Excalidraw files in an import (decision:wf2.import-drawings). The plugin keeps a drawing as a markdown
    note (`<name>.excalidraw.md`, front matter `excalidraw-plugin: parsed`): a "Text Elements" list and the scene
    itself in a ```compressed-json block (LZ-string, base64) or a plain ```json one. On import it becomes a page
    with a Wye drawing on it — the scene stored as docs/drawings/<slug>.excalidraw, the page
    `![Title](drawings/<slug>.excalidraw)` — and the drawing's words listed under it, so search and agents read
    them. Pure.
  status: proposed
  part-of: module:app-storage
- id: lib:pins
  file: packages/web/src/lib/pins.ts
  side: server
  purpose: >
    Pinned documents (decision:wf2.pinned-documents): `pinned: [project/doc, …]` in the product's _product.md, shown
    at the top of the rail in pin order. Pure.
  status: proposed
  part-of: module:app-storage
- id: lib:query-write
  file: packages/web/src/lib/query-write.ts
  side: server
  purpose: >
    A table's SQL written from words (decision:wf2.query-from-words): the person says what the table should show;
    one `claude -p` call (no tools) writes the query from the graph's real shape — the columns of `nodes`, its kinds
    with counts, the verbs of `edges`, the table's kind, page and current SQL — and the server runs it before
    handing it back. A query that fails is sent back once with the engine's message. Nothing is saved here: the
    table keeps it.
  status: proposed
  part-of: module:app-storage
- id: lib:query
  file: packages/web/src/lib/query.ts
  side: server
  purpose: >
    Queries over the product's graph (decision:wf2.graph-query): SQL — and SQL/PGQ graph patterns (MATCH) through
    the DuckPGQ extension — run by an in-memory DuckDB that holds the graph Wye already built (graph.json), nothing
    else. Nothing is stored: the markdown stays the only source; the engine is rebuilt in memory when the graph
    changes. File and network access are switched off and the settings locked before any query runs, so a query can
    only read the graph; one read statement at a time (SELECT / WITH / FROM). nodes(id, kind, title, status, open,
    folder, page (folder/slug: the page it is on), file, text, props JSON, <a column per property in use>) — state,
    due, owner, project (the item it links), date … each `-` as `_` (part_of); props->>'key' for any other
    edges(src, dst, verb) — every link: part-of, project, to, mentions … has(cell, v) — the cell is v or a list [a,
    b] that holds v (owner, to, tags …) graph `wye` (when DuckPGQ loads): FROM GRAPH_TABLE (wye MATCH
    (a:nodes)-[e:edges]->(b:nodes) WHERE … COLUMNS (…))
  status: proposed
  part-of: module:app-storage
- id: lib:table-sql
  file: packages/web/src/lib/table-sql.ts
  side: server
  purpose: >
    Every Data table is a query (decision:wf2.table-is-sql): a new table on a page runs SELECT id FROM nodes WHERE
    kind = 'task' AND page = 'folder/this-page' AND open ORDER BY coalesce(due, target), title and each filter of
    its bar adds a line to that SQL — search, status, open only, a due window, mine, a column's value, the sort. "⊕
    whole product" drops the page line. The SQL is shown under the bar; edited by hand it becomes the table's own
    (`sql=` on the marker) and the bar's switches step aside. Pure: lib/query runs it.
  status: proposed
  part-of: module:app-storage
- id: lib:when
  file: packages/web/src/lib/when.ts
  side: server
  purpose: >
    Dates as the app prints them — one fixed locale, so the server's render and the browser's agree (a
    default-locale toLocaleString printed "Oct 3, 12:50 PM" on the server and "3 Oct, 12:50" in the browser: a
    hydration error).
  status: proposed
  part-of: module:app-storage
- id: lib:wikilinks
  file: packages/web/src/lib/wikilinks.ts
  side: server
  purpose: >
    Obsidian-style links in imported notes (decision:wf2.wikilinks-to-links): `[[Note]]`, `[[Note|shown text]]`,
    `[[Note#Heading]]`, `[[Folder/Note]]` and embeds `![[picture.png]]` become Wye's own links — `[shown text](id)`,
    a tag the graph follows — when the name is something the product has: a person, project or the like under that
    name or alias (the knowledge model first), else a page by its file name or title. An image embed becomes a plain
    image the import copies. A name nothing matches stays `[[Name]]`, so no link is lost. Code is left alone. Pure.
  status: proposed
  part-of: module:app-storage
- id: lib:product-transfer
  file: packages/web/src/lib/product-transfer.ts
  side: server
  purpose: >
    A product in and out of this machine, besides creating one: export it as one file, import such a file as a new
    product, or open a product folder that is already on disk where it is (decision&#58;wf2.product-transfer).
    export — a gzipped tar of what the product knows: _product.md (without `root:`, a path on this machine),
    projects/ (documents and the app's .wye pages), inbox/ and _agent.md. The graph (_build) is rebuilt from the
    documents; sessions, change records and hook logs are this machine's history and stay here. import — the archive
    is listed before anything is written: only those top-level names, no absolute path, no `..`, no link or device;
    it is unpacked beside the registry and renamed into place, then built. open — a folder holding projects/ (or a
    repo holding wye/projects/) becomes a product in place: a registry entry with `root:` pointing at it
    (decision&#58;wf2.product-folder), nothing copied.
  status: proposed
  part-of: module:app-storage
- id: lib:agents-available
  file: packages/web/src/lib/agents-available.ts
  side: server
  purpose: >
    Which coding agents this machine has (the Quick start's `agent` step, the Welcome's agent check): `claude` and
    `codex` looked up on PATH the way agent-host spawns them — an executable file in a PATH entry, no child process.
    Cached a minute per PATH value: an install shows up without a restart, a page render never scans twice.
  status: proposed
  part-of: module:app-storage
- id: lib:onboarding-io
  file: packages/web/src/lib/onboarding-io.ts
  side: server
  purpose: >
    The Quick start's state for one product (docs/superpowers/specs/2026-10-05-onboarding-design.md): the Signals
    read from the built graph in a pass over its nodes and edges (no file reads, no model calls — a product of
    thousands of nodes costs one walk), the agent check, and the per-machine marks in <data>/_settings.json
    `onboarding`.
  status: proposed
  part-of: module:app-storage
- id: lib:onboarding
  file: packages/web/src/lib/onboarding.ts
  side: server
  purpose: >
    The Quick start (docs/superpowers/specs/2026-10-05-onboarding-design.md): nine steps that tick themselves from
    the product's real state. Pure — Signals in, step states out — so it is tested without a product;
    lib/onboarding-io reads the Signals from the graph, the disk and the per-machine marks in _settings.json.
  status: proposed
  part-of: module:app-storage
- id: lib:product-from-code
  file: packages/web/src/lib/product-from-code.ts
  side: server
  purpose: >
    A product from a code folder (Add a product › From your code): what `wye init --product <slug> --repo <dir>
    --title "…"` does, through the same code (lib/init.js) — the registry entry with `repo:`, the layered definition
    read from the folder's surface (modules, pages, components, operations, tests, one #ready describe task per
    module), no model, the folder untouched — then an inbox and the built graph. The folder is checked before
    anything is written, and a failure on the way removes what was made, so a refusal never leaves half a product.
  status: proposed
  part-of: module:app-storage
- id: lib:quick-start-links
  file: packages/web/src/lib/quick-start-links.ts
  side: server
  purpose: >
    Where the Quick start's buttons and the Help sheet's lines go
    (docs/superpowers/specs/2026-10-05-onboarding-design.md): the pages that live at a project-dependent address —
    the first document, the newest Prompt Request, the Hooks and Skills pages — resolved from the graph once, on the
    server, and handed to the client components as plain hrefs.
  status: proposed
  part-of: module:app-storage
- id: lib:system-pages
  file: packages/web/src/lib/system-pages.ts
  side: server
  purpose: >
    The pages the app writes into every product (lib/doc SYSTEM_DIR): Goals and Work (lib/pr-docs SYSTEM_VIEWS),
    Hooks, Skills with the base skills and the shipped workflows (decision:wf2.hooks-and-skills). They live in the
    project that holds PRs (else the first) and are written the first time the product is shown. A page written just
    now is not in the graph yet, so the product is built before anything renders it — or the rail's Goals and Work
    of a new product lead to "Page not found" until something else builds it.
  status: proposed
  part-of: module:app-storage
- id: lib:folders
  file: packages/web/src/lib/folders.ts
  side: server
  purpose: >
    The folders under a path, for the folder picker (components/FolderPicker): names only, hidden ones left out
    unless asked for, sorted; `product` says the folder holds projects/ (or wye/projects/) — what Open a folder
    takes. An empty path is the home folder; a path that is not a folder answers with its nearest existing parent.
  status: proposed
  part-of: module:app-storage
- id: lib:toolchain
  file: packages/web/src/lib/toolchain.ts
  side: server
  purpose: >
    What this machine has for the app and its agents (op&#58;install.toolchain): the coding agents
    (agents-available), the `wye` command (installed in ~/.local/bin, bin/wye-home.js) and the command-line tools an
    agent may reach for. Checked once at startup (instrumentation.ts, which also installs `wye` when it is missing),
    then on request, cached a minute.
  status: proposed
  part-of: module:app-storage
- id: lib:vault-init
  file: packages/web/src/lib/vault-init.ts
  side: server
  purpose: >
    Init Wye here (req:wf2.vault-init): a vault for a folder, the way `wye init` in that folder makes one — through
    the same code (lib/vault.js): <folder>/.wye/ with the shallow definition of the folder's code, _agent.md, the
    note to agents in AGENTS.md / CLAUDE.md, and the parent / child links on both sides — then opened in place and
    built, so it is a product in the app at once (decision:wf2.vault-first-slice). A folder that has a vault is
    opened, never rewritten.
  status: proposed
  part-of: module:app-storage
- id: lib:files
  file: packages/web/src/lib/files.ts
  side: server
  purpose: >
    The files of a folder, for the rail's Files section and a file's tab (req:wf2.workspace-files,
    decision:wf2.files-are-code-tabs): a folder's entries — what git ignores and the usual build folders left out
    unless asked for — and one file's text with its language. A path always resolves inside the root it is asked
    under; a binary file or one over 1 MB is named, not sent.
  status: proposed
  part-of: module:app-storage
- id: lib:workspace
  file: packages/web/src/lib/workspace.ts
  side: server
  purpose: >
    The workspace (decision:wf2.workspace-is-the-top): the folder the person has open. Its vaults — the folder's
    own, and link by link every vault below it (decision:wf2.vault-links, lib/vault.js#reach) — are the products the
    rail shows, one Documents root each; Goals, Work, Inbox and Pinned read all of them. No folder open is the home
    workspace: the app's own products (<data>/products), as before workspaces existed. Which folder is open, the
    recent ones and the list a Rescan found for a folder no vault names are this machine's, in <data>/_settings.json
    — the links themselves are text in each vault's _product.md, in the folder's git.
  status: proposed
  part-of: module:app-storage
- id: lib:inbox-raw
  file: packages/web/src/lib/inbox-raw.ts
  side: server
  purpose: >
    Raw input in the inbox (decision&#58;waterfall.raw-input-stays-raw,
    decision&#58;waterfall.raw-request-to-inbox-then-digest): the person's words from `wye remember`, their impact
    on what is known judged on arrival, and the digest — a Remember conversation told that the input is a request,
    not knowledge. Shared by the inbox routes (arrival, Digest again).
  status: proposed
  part-of: module:app-storage
- id: lib:analytics-write
  file: packages/web/src/lib/analytics-write.ts
  side: server
  purpose: >
    An analytics page written from words (decision&#58;waterfall.analytics-from-words,
    decision:wf2.query-from-words): the person says what the page should show — "tasks by team per month", "a board
    of what is blocked, by worker" — and one `claude -p` call (no tools) writes the page's whole query line from the
    graph's real shape: the kinds with counts, the properties the nodes carry with the values they hold, the verbs
    of `edges`, and the line as it is. A line that carries `sql=` is run once before it is handed back; one that
    fails is sent back once with the engine's message. Nothing is saved here: the page keeps the line in its front
    matter.
  status: proposed
  part-of: module:app-storage
- id: lib:analytics
  file: packages/web/src/lib/analytics.ts
  side: server
  purpose: >
    An analytics page (decision&#58;waterfall.analytics-view-replaces-timeline, decision:wf2.timeline-is-a-query):
    what a cross-tab of cards draws, worked out from the graph and one query line — which nodes are on it, and what
    the rows and the columns group by. Pure: the graph in, a grid of cards out. The query is the view block's
    language (lib/instance-table) with keys of its own: `y` and `x`, each a list of dimensions outer first, and
    `from` / `to`, the window of a span column. A dimension is a property, `kind`, `status`, a path of links
    (`worker.part-of` is the team of the worker), or a date field with a bucket — `due:month`, `when:week`;
    `when:span` is the continuous track the old timeline drew, and may only be the last column level. A cell shows
    the cards at its intersection, never a count: the page is for seeing the work, not counting it.
  status: proposed
  part-of: module:app-storage
```

<!-- /list:lib -->

```yaml
- id: decision:wf2.vault-is-a-product-in-wye
  title: A vault is a product kept in its folder's .wye/, beside the code it describes
  date: 2026-10-05
  status: proposed
  by: alex
  evidence: [session:fc7ee08157]
  affects: [lib:products, lib:init, lib:product-transfer, decision:wf2.product-model, decision:wf2.system-pages-in-wye]
  related-to: [decision:wf2.product-transfer]
```

  - context:wf2.vault-is-a-product-in-wye A large monorepo holds many services; the person wants each to keep its own knowledge, made by running wye init in its folder. Today a product is a folder in the app's data (decision:wf2.product-model), or one opened in place with root: (decision:wf2.product-transfer) — one per registration, never discovered.

  - choice:wf2.vault-is-a-product-in-wye A vault is exactly what a product is today, laid out in <folder>/.wye/: product.md (title, slug, links), docs/ (the person's pages), system/ (the app's pages that now live in projects/<p>/.wye/), inbox/, _agent.md and skills; _build/ and the caches are gitignored. The vault's slug is its id prefix (req&#58;payments.x) and is unique in a workspace. Everything per product — graph, packet, librarian, hooks, Inbox — works per vault unchanged; the folder the vault sits in is its code root. The person chose this over a new lighter unit.

  - alternative:wf2.vault-lighter-unit A new, smaller unit (docs and config only) hanging under products — two notions of "a place for knowledge" and every feature asked which one it serves.

  - alternative:wf2.vault-plain-folder Any folder of markdown is a vault, no metadata and no graph of its own — no packet, no ids, nothing for an agent to write back to.

  - consequence:wf2.vault-is-a-product-in-wye The knowledge of a service is committed with its code and moves with it; decision:wf2.product-model's data folder becomes one place a vault can be, not the only one. The projects/ level disappears from a vault's layout (decision:wf2.no-projects already removed it from the app); existing products are migrated by a script, ids unchanged.

  verdict:ede034c0bf9d contradicts decision:wf2.product-model — A describes centralized product storage in data/ folder; B proposes distributed vaults in code/.wye/ folders, replacing the storage model. (kind: contradicts, conflict: dynamic, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.product-model decision:wf2.vault-is-a-product-in-wye)

  contradiction:wye.ede034c0bf9d decision:wf2.vault-is-a-product-in-wye contradicts decision:wf2.product-model — A describes centralized product storage in data/ folder; B proposes distributed vaults in code/.wye/ folders, replacing the storage model. #open (between: decision:wf2.vault-is-a-product-in-wye decision:wf2.product-model, conflict: dynamic)

  verdict:b7dc71b47f87 refines decision:wf2.system-pages-in-wye — A specifies system pages live in projects/<p>/.wye/; B refines this by showing system pages (formerly in projects/<p>/.wye/) now live in vault's system/ folder, preserving the principle of segregating app content in .wye/. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.system-pages-in-wye decision:wf2.vault-is-a-product-in-wye)

  verdict:e9eebe3e6df4 contradicts decision:wf2.product-transfer — A describes import with central registry and slug assignment (unpacking under registry with new slug); B's distributed vault model has no central registry and assigns slug as id prefix from vault location. (kind: contradicts, conflict: dynamic, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.product-transfer decision:wf2.vault-is-a-product-in-wye)

  contradiction:wye.e9eebe3e6df4 decision:wf2.vault-is-a-product-in-wye contradicts decision:wf2.product-transfer — A describes import with central registry and slug assignment (unpacking under registry with new slug); B's distributed vault model has no central registry and assigns slug as id prefix from vault location. #open (between: decision:wf2.vault-is-a-product-in-wye decision:wf2.product-transfer, conflict: dynamic)

  verdict:2de9dd712507 refines decision:wf2.app-vs-product-settings — A establishes the principle of product settings living separately in _product.md; B refines this by specifying product.md in vault's .wye/ contains title, slug, and links. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.app-vs-product-settings decision:wf2.vault-is-a-product-in-wye)

  verdict:0e572d9bc62a contradicts req:wf2.store.products — A specifies products as folders in centralized data/products/<slug> with nested projects; B proposes vaults in code/.wye/, replacing the centralized storage model. (kind: contradicts, conflict: dynamic, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:wf2.store.products decision:wf2.vault-is-a-product-in-wye)

  contradiction:wye.0e572d9bc62a decision:wf2.vault-is-a-product-in-wye contradicts req:wf2.store.products — A specifies products as folders in centralized data/products/<slug> with nested projects; B proposes vaults in code/.wye/, replacing the centralized storage model. #open (between: decision:wf2.vault-is-a-product-in-wye req:wf2.store.products, conflict: dynamic)

  verdict:8c138f3fd0b3 refines constraint:wf2.one-defining-place — A states every id is defined in one place; B adds that vault slugs are unique in the workspace and prefix ids (e.g., req&#58;payments.x), clarifying how one-defining-place works across multiple vaults through namespace scoping. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: constraint:wf2.one-defining-place decision:wf2.vault-is-a-product-in-wye)

```yaml
- id: decision:wf2.workspace-is-the-top
  title: The app opens a folder as a workspace; the vaults it reaches replace the product list
  date: 2026-10-05
  status: proposed
  by: alex
  evidence: [session:fc7ee08157]
  affects: [lib:products, rule:documents-tree, page:web/sidebar, page:web/overview, decision:wf2.product-model]
```

  - context:wf2.workspace-is-the-top With vaults in many folders, the product picker can no longer be the top: the person wants to open any folder — the monorepo or one service — and see every vault in it.

  - choice:wf2.workspace-is-the-top A workspace is a folder the person opens (wye app <folder>, Open folder in the app; the recent ones are remembered in ~/.wye). Its vaults are the folder's own, every vault reached through child links, and every linked shared vault. Documents has one root per vault, nested as the folders nest. Goals, Work, Inbox, Pinned and search are views over all of them, each item labelled with its vault. Each vault keeps its own graph; a workspace is the union for views and packets, never a merged store. Today's data/products is opened as the default workspace, so existing products are its vaults and their URLs keep working. The person chose this over keeping the product picker.

  - alternative:wf2.workspace-beside-products Keep the product picker and add a workspace as one more kind of entry grouping several products — two top levels, and the merged views would exist only in one of them.

  - alternative:wf2.workspace-merged-graph One graph over the whole workspace with vaults as folders in it — ids would collide across services and a service's knowledge would no longer stand on its own when opened alone.

  - consequence:wf2.workspace-is-the-top Every route that starts with /<product> resolves a vault inside the open workspace; a reference across vaults (req&#58;payments.x from search's page) resolves through the workspace and is unresolved when that vault is not reachable — see question:wf2.cross-vault-ids.

  verdict:0a178921fc0f contradicts rule:documents-tree — A establishes Documents as drag-reorderable via UI (part-of and order: frontmatter control hierarchy), while B's 'nested as the folders nest' implies folder structure determines hierarchy in the workspace model. (kind: contradicts, conflict: dynamic, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: rule:documents-tree decision:wf2.workspace-is-the-top)

  contradiction:wye.0a178921fc0f decision:wf2.workspace-is-the-top contradicts rule:documents-tree — A establishes Documents as drag-reorderable via UI (part-of and order: frontmatter control hierarchy), while B's 'nested as the folders nest' implies folder structure determines hierarchy in the workspace model. #open (between: decision:wf2.workspace-is-the-top rule:documents-tree, conflict: dynamic)

  verdict:1bf618e47556 refines decision:wf2.product-model — B refines A's centralized data-folder product model by generalizing it to workspace-based vault discovery, with existing products becoming vaults in the default workspace. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.product-model decision:wf2.workspace-is-the-top)

```yaml
- id: decision:wf2.vault-links
  title: A parent vault lists its child vaults, and init keeps the links both ways
  date: 2026-10-05
  status: proposed
  by: alex
  evidence: [session:fc7ee08157]
  affects: [lib:init, lib:products, decision:wf2.workspace-is-the-top]
```

  - context:wf2.vault-links Finding vaults by walking a large monorepo on every open is slow (node_modules, build output, thousands of folders); the person asked that parents store links to their children.

  - choice:wf2.vault-links product.md carries vaults: (relative paths of the nearest vaults below) and parent: (the relative path of the nearest vault above). wye init walks up to the nearest .wye/ and adds itself there, takes over the children below it that pointed at that parent, and records its own parent; moving a vault to trash removes it from both sides and gives its children back to its parent. Opening a workspace follows the links from the vaults at and above the folder; a full scan happens only on Rescan, or when a link points at nothing — and then it proposes the corrected links rather than writing them silently.

  - alternative:wf2.vault-links-scan Scan the folder on every open — always right, but seconds on a large monorepo and repeated on every reload.

  - alternative:wf2.vault-links-registry A central list of vaults in ~/.wye — fast, but outside git: a teammate's clone would not know its vaults (constraint:wf2.text-canonical).

  - consequence:wf2.vault-links The links are text in git, so a clone finds every vault without a scan; a vault made by hand without init is found by Rescan.

```yaml
- id: decision:wf2.shared-vault-is-a-local-clone
  title: A shared vault is a folder the person cloned themselves; Wye links to its path and never syncs it
  date: 2026-10-05
  status: proposed
  by: alex
  evidence: [session:fc7ee08157]
  affects: [req:wf2.shared-vault, decision:wf2.vault-links, constraint:wf2.local-first]
```

  - context:wf2.shared-vault-is-a-local-clone Company knowledge kept in its own git repository should govern the services that link to it. constraint:wf2.local-first rules out remote git sync by Wye.

  - choice:wf2.shared-vault-is-a-local-clone A vault's product.md lists shared: (absolute or ~ paths of vaults outside the workspace, each with a name). Wye reads them like any reachable vault: a linked root in Documents, their approved constraints and decisions in the packet of every vault that links them. Agents propose into them like into any vault; the person commits and pushes. Wye never clones, pulls or pushes. Designed now, built later.

  - alternative:wf2.shared-vault-by-url Wye clones and pulls a shared vault from a git URL — convenient, but needs constraint:wf2.local-first changed.

  - alternative:wf2.shared-vault-read-only Linked vaults are never written — simpler, but a lesson learned in a service could never reach company knowledge except by hand.

  - consequence:wf2.shared-vault-is-a-local-clone A path differs per machine, so the link lives in the vault but a teammate whose clone is elsewhere sees it unreachable until they point it at their copy (a per-machine override in ~/.wye).

```yaml
- id: decision:wf2.vault-keeps-folders
  title: A vault keeps today's folders inside .wye/ — not flat; the person makes subfolders as with documents now
  status: proposed
  date: 2026-10-05
  by: alex
  evidence: session:13bdb849d4
  affects: [decision:wf2.vault-is-a-product-in-wye, task:wf2.vault-loader, lib:products, lib:product-transfer]
  text: >
    Asked how a vault is laid out, the person answered "not flat, let user to create subfolders, the same as we do it with documents now". So <folder>/.wye/ is exactly a product folder as it is today — _product.md, projects/<folder>/docs for the person's pages, projects/<folder>/.wye for the app's pages, inbox/, _agent.md, _build/ gitignored — and not the flat product.md / docs/ / system/ layout the choice of decision:wf2.vault-is-a-product-in-wye describes. That reading is the agent's (agent:claude-code): "subfolders as with documents now" is taken to mean the folders a product has today. It follows that the loader is the existing root: path (decision:wf2.product-folder) taught to find .wye/, that no migration script is needed for existing products, and that the layout sentence of decision:wf2.vault-is-a-product-in-wye and the migration half of task:wf2.vault-loader no longer hold.
```

```yaml
- id: decision:wf2.vault-first-slice
  title: The vault loader and wye init in a folder are built first; a vault shows in the app as an opened product until workspaces exist
  status: proposed
  date: 2026-10-05
  by: alex
  evidence: session:13bdb849d4
  affects: [task:wf2.vault-loader, task:wf2.vault-init-here, task:wf2.workspace-open, decision:wf2.product-transfer, decision:wf2.vault-links]
  text: >
    The person chose to build task:wf2.vault-loader and task:wf2.vault-init-here now, with the proposed decisions of the request treated as agreed for that slice only; workspace open, Files, write-back routing and the default workspace stay open tasks. Until a workspace can be opened, the agent (agent:claude-code) bridges the gap this way: wye init registers the new vault with the running app the way Open a folder does (a registry entry with root: pointing at <folder>/.wye, decision:wf2.product-transfer), so the vault is a product in the picker today. The entry is this machine's pointer only; the vault's own _product.md with its parent: and vaults: links stays the text in git, and the entry goes away when task:wf2.workspace-open lands.
```

```yaml
- id: lib:vault
  file: lib/vault.js
  side: server
  purpose: >
    A vault — a product kept in <folder>/.wye/, beside the code it describes (decision:wf2.vault-is-a-product-in-wye, decision:wf2.vault-keeps-folders). initVault is what `wye init` in a folder and Init Wye here both run: the shallow definition of the folder's code through lib:init, _agent.md, a .gitignore for the built graph and this machine's history, the note to agents in AGENTS.md / CLAUDE.md, and the parent: / vaults: links in _product.md on both sides. vaultAbove, vaultsBelow, links and readMeta read them — tested by test:vault.
  status: proposed
  part-of: module:app-storage
```

```yaml
- id: rule:vault-init
  source: lib/vault.js#initVault; lib/vault.js#writeNote; packages/web/src/lib/vault-init.ts#initVaultHere; bin/wye.js#initHere
  status: proposed
  verified-by: [test:vault]
  satisfies: [req:wf2.vault-init]
  title: wye init in a folder writes that folder's vault once and never overwrites one
```

  - statement:vault-init `wye init [folder]` without --product, and POST /api/products/init, make <folder>/.wye/ as a product folder: _product.md with the vault's slug (the folder's name, or --slug) and no path of this machine, projects/<slug>/docs with the shallow definition (rule:init-shallow) whose ids carry the slug, _agent.md, inbox/, and a .gitignore for _build, _sessions, _changes, _hooks and _impact. The code of a folder below that has its own vault is left out of the scan. AGENTS.md gains a marked section that sends agents to the vault, CLAUDE.md too unless it takes AGENTS.md in; a file that exists keeps its text and gains the section at its end, once. A folder whose .wye/ already holds _product.md or projects/ is reported with its path and nothing is written. A slug already used by the parent, a sibling under it or a child is refused before anything is written. When the app runs, the vault is opened in place as a product (op:api.product-open).

```yaml
- id: rule:vault-links
  source: lib/vault.js#initVault; lib/vault.js#links; lib/vault.js#vaultAbove; lib/vault.js#vaultsBelow
  status: proposed
  verified-by: [test:vault]
  satisfies: [req:wf2.vault-init]
  title: A new vault is linked to the nearest vault above and the nearest ones below, on both sides
```

  - statement:vault-links A vault's _product.md holds parent: (the path from its folder to the nearest folder above that has a vault) and vaults: (the paths to the nearest ones below), as relative paths between folders. initVault finds the parent by walking up and the children by a walk down that stops at each vault and skips what init skips; it writes its own links, adds itself to the parent's vaults: in place of the children it takes over, and sets parent: in each of those children. A grandchild keeps its parent. Reading the links never rewrites them: a path that no longer holds a vault is returned as missing (decision:wf2.vault-links).

```yaml
- id: rule:workspace-open
  source: lib/vault.js#reach; lib/vault.js#rescan; lib/vault.js#applyFixes; packages/web/src/lib/workspace.ts; packages/web/src/lib/products.ts#listProducts; packages/web/src/app/api/workspace/route.ts; bin/wye.js#app
  status: proposed
  verified-by: [test:vault]
  satisfies: [req:wf2.workspace-open]
  title: An opened folder reaches its vaults through their links; which folder is open is this machine's
```

  - statement:workspace-open The workspace is the folder the person has open (`wye app <folder>`, Open folder… at the top of the rail, POST /api/workspace { folder }); none open is the home workspace — the app's own products under <data>/products. Its vaults are found without a walk: the folder's own vault and, link by link (`vaults:`), every vault below it; a folder without a vault takes the links of the nearest vault above that point inside it; a folder with no vault at or above it is walked once when it is opened and the roots found are kept. listProducts returns the registry's products and the open folder's vaults — a vault read from its own _product.md, addressed by its own `slug:` (stepped, `-2`, when a product already has it) and needing no registry entry — so every /<product>/… address and API resolves a vault like any product. The open folder, the twelve most recent ones and the kept roots are in <data>/_settings.json (`workspace`, `workspaces`, `workspaceScan`), never in a vault. Rescan walks the folder once and answers with every vault found and the links that differ from what it found; they are written only when the person sends them back (POST { fix }), and only for vaults at, under or above the open folder.

```yaml
- id: rule:vault-packet-inherit
  source: packages/web/src/lib/packet.ts#inheritedConstraints
  status: proposed
  satisfies: [req:wf2.workspace-open]
  title: A vault's packet carries the approved constraints of the vaults above it, and nothing else of them
```

  - statement:vault-packet-inherit packetFor appends, for each vault above the product's own (its `parent:` link, then that vault's, to the top), a section "From the vault above — <title>" listing that vault's approved, current constraints, read from its own built graph; a parent that was never built on this machine is named with how to build it instead of being silently empty. Rules, decisions, goals and questions of a parent do not flow down (decision:wf2.root-vault-only-if-inited).

```yaml
- id: rule:vault-delete
  source: packages/web/src/lib/delete-product.ts#deleteProduct; packages/web/src/lib/workspace.ts#unlinkVault
  status: proposed
  satisfies: [req:wf2.vault-init]
  title: Deleting a vault moves its .wye/ to the app's trash and takes it out of the links on both sides
```

  - statement:vault-delete A vault of the open workspace has no registry entry to move: deleteProduct moves <folder>/.wye/ into <data>/_trash/<slug>-<stamp> (a copy and a removal when the trash is on another disk), the vault above stops naming it and names its children instead, each child names that vault as its parent, and a pointer entry the vault had goes to the trash with it. The note in the folder's AGENTS.md / CLAUDE.md stays — it is the person's file. A vault's folder cannot be moved from Settings › Folder: it lives in its folder and moves with it.

```yaml
- id: decision:wf2.vault-pointer-outside-workspace
  title: A vault inside the open folder needs no registry entry; one outside it keeps the entry as this machine's pointer
  date: 2026-10-05
  status: proposed
  by: agent:claude-code
  evidence: [pr:31]
  affects: [decision:wf2.vault-first-slice, lib:products, lib:product-transfer, lib:workspace]
```

  - context:wf2.vault-pointer-outside-workspace decision:wf2.vault-first-slice said the registry entry `wye init` makes goes away when workspaces exist. With them built, a vault the open folder reaches is found through its links — but `wye init` in a terminal, or `wye` run inside a vault, may concern a folder the app does not have open, and the CLI must still be able to address it.

  - choice:wf2.vault-pointer-outside-workspace openProduct makes no entry for a vault the open workspace reaches (lib/workspace#noteVault), and makes the `root:` entry as before for one it does not. A vault is always read from its own _product.md — the entry carries only where it is — and a rename or a setting is written to the vault's own file (Product.metaFile). In the home workspace every such pointer is listed with the app's own products.

  - alternative:wf2.vault-pointer-outside-workspace Drop the entry everywhere and refuse a vault outside the open folder — the CLI inside a service would fail whenever the app shows another folder.

```yaml
- id: decision:wf2.home-is-separate-products
  title: The home workspace keeps its products apart; only an opened folder reads its vaults together
  date: 2026-10-05
  status: proposed
  by: agent:claude-code
  evidence: [pr:31]
  affects: [decision:wf2.workspace-is-the-top, req:wf2.workspace-open, component:rail, page:web/inbox]
```

  - context:wf2.home-is-separate-products decision:wf2.workspace-is-the-top says today's data/products is the default workspace and that Goals, Work, Inbox, Pinned and search read every vault. The app's own data holds unrelated products (a person's work products, private ones, scratch ones); reading them together would put one product's tasks, pins and proposals into another's pages.

  - choice:wf2.home-is-separate-products In an opened folder the app's Goals and Work pages default to every vault, the rail shows every vault's pins, the Inbox lists what waits in the other vaults and ⌘F searches them all. At home each product keeps its own: a view reads the others only when its line says `scope=workspace`, and pins, the Inbox and search stay per product. In both, Documents has one root per product. The agent chose this; the person can overrule it by making home behave as a folder does.

  - alternative:wf2.home-is-separate-products Merge at home too, as the decision reads literally — unrelated products in one Work list.

```yaml
- id: decision:wf2.shared-vault-design
  title: A shared vault is named in the linking vault, overridden per machine, and governs with its constraints and its decisions
  date: 2026-10-05
  status: proposed
  by: agent:claude-code
  evidence: [pr:31]
  affects: [req:wf2.shared-vault, decision:wf2.shared-vault-is-a-local-clone, rule:vault-packet-inherit, constraint:wf2.local-first]
```

  - context:wf2.shared-vault-design task:wf2.shared-vault-design asked for the `shared:` links, the per-machine path override and how a shared vault's constraints enter a packet, as blocks for review, with no build.

  - choice:wf2.shared-vault-design Designed, not built. A vault's _product.md carries `shared: [company=~/code/company-knowledge, legal=../legal]` — a name and the folder of a vault the person cloned themselves, `~` or relative to the vault's folder. This machine may point a name elsewhere: `sharedPaths: { "<vault folder>": { "company": "/abs/path" } }` in <data>/_settings.json, which wins over the vault's own path and is never committed. lib/vault.js#reach gains the shared vaults of every vault it reaches, marked `shared`, never followed further (a shared vault's own links are not the workspace's); a path that holds no vault is kept in the list as unreachable. The rail shows a shared vault as a root with ↗, its slug stepped like any vault's. In a packet a shared vault counts as a vault above (rule:vault-packet-inherit): its approved constraints, and — unlike a parent — its approved decisions, since a shared vault exists to govern. Writes go into it like into any vault (wye run in its folder, or --product); Wye never clones, pulls, commits or pushes it. Building it is a task of its own once the person approves this.

  - alternative:wf2.shared-vault-design Keep the link only in this machine's settings — nothing in git says the service depends on the company vault, and a teammate would not know to link it.

  - consequence:wf2.shared-vault-design Approved decisions of a shared vault enter every linking vault's packet: a large company vault makes large packets, so the packet's budget rule applies to them as to the vault's own.
