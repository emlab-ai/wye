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
  statement: >
    The template gains a §D Decisions section (ADR keys date, context, options, choice, consequences, optional
    decision-id) and §11 questions are yaml nodes with an id and q; the parser treats both as ordinary yaml nodes.
    The section map (rule:section-map) places new decision and question nodes there.
  source: templates/module.md; schema/kinds.yaml
  status: proposed
  requires-tests: [test:core-parser#question-and-decision-nodes]
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
- id: rule:product-layout
  statement: data/products/<product>/_product.md (title, icon, description), projects/<project>/_project.md (title, kind project|goal, status, icon), projects/<project>/docs/*.md (pages), inbox/ (dropped notes and files, unprocessed), _build/graph.json (the product's knowledge, built by ctx from every page of every project; files and folders starting with _ and the inbox are skipped). Routes: /<product>, /<product>/knowledge[/<kind>], /<product>/graph, /<product>/inbox, /<product>/<project>, /<product>/<project>/d/<page>.
  source: packages/web/src/lib/products.ts; packages/web/src/lib/scope.ts; bin/ctx.js#findDocs
  status: unverified
  requires-tests: [test:server-api#serve-starts-with-two-projects]

```

<!-- /list:rule -->

## Libraries

<!-- list:lib -->

```yaml
- id: lib:products
  file: packages/web/src/lib/products.ts
  side: server
  purpose: >
    Server-only registry of products and projects, read from the data folder: <data>/products/<product>/_product.md <data>/products/<product>/projects/<project>/_project.md <data>/products/<product>/projects/<project>/docs/*.md <data>/products/<product>/_build/graph.json (one graph per product: all its projects' docs) <dat
  part-of: module:app-storage
- id: lib:watch
  file: packages/web/src/lib/watch.ts
  side: server
  purpose: >
    Watches the product data on disk so the app follows what agents and editors write: any change under data/products/<product> (documents, inbox, sessions) is pushed to subscribers, and a changed document rebuilds the graph (agents may edit files without running ctx build). Lives on globalThis across dev reloads.
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
```

<!-- /list:lib -->
