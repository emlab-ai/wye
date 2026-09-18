---
node: module:wf2-test
type: module
title: Waterfall v2 — test design
status: proposed
owner: alex
last-verified: 2026-09-14
verified-against: docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
source-roots: [., packages/core, packages/server, packages/web, packages/cli]
sources:
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md §9
  - docs/context-graph/prd.md      # every requires-tests entry names a case below
---

# Waterfall v2 — test design

One node per test file. Requirements and rules point here with `requires-tests: [test:<node>#<case>]`, which the parser records as `verified-by` edges; when the code lands those keys become `verified-by` and the status flips. Cases are listed so that `ctx get test:core-writer` shows what the file must prove. The last section lists what this design deliberately leaves untested.

---

## 0. module:wf2-test

```yaml
- id: module:wf2-test
  purpose: >
    The verification plan of Waterfall v2 — test nodes per package, their cases, the fixture, and the untested
    surfaces.
  part-of: module:wf2
  submodules: [core, server, clerk, cli, web, e2e]
  runner: vitest for core, server, clerk, cli and web components; Playwright for ui-tests; `pnpm test` runs everything but the live clerk smoke (flag:live-clerk)
```

---

## 9. Verification index

### Fixture

```yaml
- id: test:fixture
  file: packages/core/test/fixture/inventory-trimmed.md
  description: >
    A trimmed copy of the YesSensei inventory pilot (about 12 reqs, 10 rules, 4 entities, 6 ops, 2 pages, 3 drift
    rows, 2 questions) checked into the repo so the suite never depends on another checkout. A second fixture,
    packages/core/test/fixture/waterfall-v2/, is a copy of this repo's four v2 files for multi-module cases.
  count: 2 files
```

### Core

```yaml
- id: test:prose
  file: test/prose.js
  description: >
    Prose nodes in the current parser (lib/parse.js): a temp document with id-first paragraphs and list items,
    aliases, hashtag status, a trailing key group, links with inferred verbs, a plain-prose link, and a yaml block
    alongside.
  cases:
    - alias-expands: et:<x> → entity:<x>
    - verb-inference: "satisfied by" → satisfied-by, no phrase → related-to
    - prose-req-defined: title is the first sentence, status from #proposed, text and extra keys in the body
    - edges: refines, related-to, satisfied-by, verified-by from one line
    - list-item-node and see-verb
    - plain mention is not a link; plain-prose link relates the document
  count: 6
- id: test:core-parser
  file: packages/core/test/parse.test.ts
  description: The TypeScript port parses exactly as lib/parse.js did.
  cases:
    - fixture-present: the fixture exists and parses to the expected counts by kind; the suite fails, not skips, when it is missing
    - same-graph-as-v0.1: graph.json from the port equals graph.json from lib/parse.js for the fixture (nodes, edges, fieldIndex), modulo generatedAt
    - question-and-decision-nodes: yaml blocks whose id has the question or decision kind become defined nodes; governs and resolves keys become edges
    - multi-module: the four v2 files parse into one node set; cross-file refs resolve; drift ids are namespaced per module
  count: 4
- id: test:core-writer
  file: packages/core/test/writer.test.ts
  description: The in-place writer.
  cases:
    - patch-body: patching a body rewrites only the node's lines; the file diff is confined to that block
    - patch-preserves-neighbours: neighbouring nodes, comments and table rows are byte-identical after a patch
    - round-trip-stability: parse → patch → parse equals the original graph plus exactly the requested change
    - edge-add-remove: addEdges writes typed keys or edge lines by verb; removeEdges removes items and empty keys
    - create-in-section: createNode appends under the section the map assigns to the kind
    - create-adds-heading: creating a kind whose section heading is absent inserts the heading in template order
    - conflict: a stale ifMatch returns conflict with the current body and hash and writes nothing
    - reject-parse-error: a body that breaks the yaml block is refused with invalid_patch; file untouched
    - reject-lint-error: a rule body without source is refused with lint_failed listing the message
    - stub-target-warns: an edge to an undescribed id is written and reported as a warning
    - concurrent-writes-serialised: 20 concurrent patches to one file all land, in order, with no lost update and no .tmp- file left
    - table-row-node: patching an op defined by a table row rewrites that row
  count: 12
- id: test:core-check
  file: packages/core/test/check.test.ts
  description: The lint, including the red paths v0.1 never tested.
  cases:
    - rule-without-source-is-error
    - req-without-satisfied-by-is-error
    - stub-rule-is-error
    - shipped-without-test-warns-then-errors-under-strict
    - source-path-missing-warns-then-errors-under-strict
    - strict-open-contradiction: an open contradiction touching a shipped node is an error under strict, a warning otherwise
    - exit-code: ok is false only on errors
  count: 7
```

### Server

```yaml
- id: test:server-services
  file: packages/server/test/services.test.ts
  description: Service layer against a temp copy of the fixture repo and an in-memory SQLite.
  cases:
    - register-project: registering parses the graph and records lastParsedSha
    - product-groups-projects: projects.list groups by product
    - hosting-columns-present: every table has tenantId, createdBy, createdAt, updatedAt; agent_session has tokenHash
    - no-body-duplication: no table has a column holding node bodies or edges
    - watch-reparse: editing a file on disk re-parses within 1 s and emits graph.changed with the changed ids
    - parse-error-keeps-last-good: a broken file leaves reads answering from the previous graph and emits graph.parse_error
    - ui-write-is-file-write: a patch through the service changes the file and the graph updates only after the watcher fires
    - task-create-with-links: links are stored with roles and returned by tasks.get
    - task-status-transitions: every transition of the lifecycle is allowed and every other refused
    - packet-from-task: a task id seeds the packet from its links and appends open decisions and contradictions
    - decision-immutable: no update path changes a decision's fields; supersedes sets the new row only
    - contradiction-lifecycle: open → resolved and open → dismissed with attribution; dismissed is terminal
    - dismiss-needs-reason: dismiss without a reason is refused
    - structural-import-idempotent: parsing twice yields one row per pair; removing a drift row closes it; re-adding reopens it
    - delta-validated-on-store: a delta whose ops break the parse is refused with invalid_patch
    - delta-apply-atomic: a delta touching two files where the second fails leaves both files as before
    - delta-apply-refused-for-clerk: an internal session or the posting agent gets unauthorized
  count: 17
- id: test:server-api
  file: packages/server/test/api.test.ts
  description: >
    Contract tests. Every case runs twice, once over HTTP and once over an MCP client on stdio, from one table of
    inputs and expected outputs.
  cases:
    - serve-starts-with-two-projects
    - config-print: the start-up output contains a claude mcp add line and a [mcp_servers.waterfall] block
    - same-cases-http-and-mcp: identical results for the whole table
    - read-tools-match-cli: graph.get, neighbors, impact, search, reqs, packet equal the ctx output on the fixture
    - error-shape: conflict, invalid_patch, not_found, lint_failed, unauthorized map to the same JSON and to 409 / 422 / 404 / 422 / 401
    - agent-header-recorded: X-Agent creates a session and stamps createdBy; missing header is anonymous
    - unknown-project: not_found
    - decisions-post-shape: the response carries decision, related, contradictions, deltaId
    - decisions-post-waits: a fast clerk (stubbed) returns inline
    - decisions-post-pending: a slow clerk (stubbed) returns clerkStatus pending and decisions.get completes later
    - decisions-list-filters: node, task and since filters
    - clerk-run-on-demand: clerk.run with node ids queues a run
  count: 12
```

### Clerk

```yaml
- id: test:clerk
  file: packages/server/test/clerk.test.ts
  description: >
    The clerk with recorded model responses (packages/server/test/fixture/clerk/*.json) so runs are deterministic.
    One live smoke in clerk.live.test.ts runs only with flag:live-clerk.
  cases:
    - context-assembly: the input holds the decision, packet, earlier decisions and open contradictions of the two-hop neighbourhood; inputHash is stable
    - decision-run-full: a recorded run yields related nodes, findings and a delta
    - decision-becomes-adr-node: the delta's first op creates decision:<module>.<slug> with ADR keys and decision-id
    - task-run-no-delta: a task trigger returns related and findings and proposes nothing
    - classification-fixtures: 12 recorded pairs (3 per verdict) classify as expected; contradicts and duplicate become rows
    - decision-vs-rule-finding: a finding with a decision id on one side and a rule on the other is stored and resolvable
    - tool-set-is-closed: the tool list equals the fixed array; decisions.post from an internal session is unauthorized
    - no-disk-write: the fixture repo's files are byte-identical after a run
    - run-recorded: the clerk_run row holds input, every tool call, output, model and tokens
    - budget-stops-run: a recorded run with 41 tool calls fails with error budget
    - cache-hit: the same input twice calls the model once
    - failed-run-retryable: a failed decision can be re-queued and succeeds with a different recording
  count: 12
```

### CLI

```yaml
- id: test:cli
  file: packages/cli/test/cli.test.ts
  description: ctx as a client.
  cases:
    - server-and-local-identical: every read command produces identical output with the server up and with it down
    - falls-back-within-300ms: an unreachable server does not delay local mode noticeably
  count: 2
```

### Web pure modules (vitest)

```yaml
- id: test:web-lib
  file: packages/web/src/lib/graph.test.ts
  description: >
    vitest over the pure modules of the web app — also packages/web/src/lib/presets.test.ts and
    packages/web/src/lib/layout.test.ts.
  cases:
    - graph: indexGraph, sidebarTree (file order), neighborhood (depth, structural), parseBody (prose keys, block scalars), relations
    - presets: Requirements, Mechanics, Drift, focus override, Everything
    - layout: every node positioned, children right of the focus, tree edges vs cross-links, forest without focus
    - doc: splitDocument (frontmatter, markdown/yaml segments, chunking on id lines), outline, documentTree (roots, main, byFile), linkedDocuments (excludes containment), nodeIndex, docSlug
    - graph-diff: added / changed / removed defined nodes with their document, status change counts, task-link writes ignored, undefined ignored; mergeBlocks (added+changed, added+removed, changed+removed)
    - session-page: todo rows from blocks ∪ task refs ∪ session: back-links (once each, done from the graph, part-of, change), a gone task kept as gone, blocks by kind in order with status now, opened pages from open events (latest first, once per path), empty session
    - instance-table: columns per property kind, rows with values and document, relations for a bare kind; parseFilters / filtersToQuery; search, status, property and list-cell filters; group by column / status / doc; sort asc / desc; parseViewQuery / viewQuery (quoted values)
    - remark-tags: ids in text and inline code become tag links, trailing punctuation stays text, test #method kept in label, existing links untouched
    - write: replaceSegment (exact span, conflict, bad index), replaceChunk (list re-indent), appendChunk, insertYamlAfterSegment, patchFrontmatter
    - yaml-form: bodyToFields classification and flattening, fieldsToBody round trip, empty fields dropped, long prose wrapped
    - templates: slugify, placeholder filling
    - mdflow: unwrapParagraphs keeps lists, tables, code, headings, rules and hard breaks; tagifyInline splits text on ids, keeps punctuation, turns code-only ids into tags, recurses into links and table cells, leaves code blocks alone
    - serialize: inline styles, tags and links; prose and yaml node lines (text key and status rewritten in place, comments kept); headings, lists, tables, code, dividers, merged yaml groups
    - import: prepare lifts yaml blocks, rules and id links into markers and escapes tag-like angle brackets; expand turns markers into divider and node blocks, id-first paragraphs into prose nodes, link markers into links; round trip through the serializer
  count: 57
```

### Web components (vitest + React Testing Library)

```yaml
- id: test:web-components
  file: packages/web/test/components.test.tsx
  description: Components against a mocked API.
  cases:
    - sidebar-tree: product → project → module → section → node with icons and status dots
    - sidebar-search: typing calls graph.search and renders hits
    - node-page-properties: yaml keys render as fields; edge keys as id lists; prose keys as the block editor
    - node-page-prose-editor: editing a prose key exports markdown into that key only
    - conflict-diff: a conflict response shows mine vs current and the two choices
    - graph-layout: refines and has form the tree; other verbs are cross-links; mentions hidden
    - graph-presets: each preset yields the expected visible set on the fixture
    - graph-edit-calls-api: drag-edge, delete-edge, rename-node and add-child call graph.patch or graph.create with the right payload
    - task-board: columns by status; a forbidden move snaps back
    - decision-card-diff: Apply shows the markdown diff before calling deltas.apply
    - contradiction-actions: Resolve asks for a decision or task; Dismiss requires a reason
  count: 11
```

### End-to-end (Playwright, real server on a temp copy of the fixture repo)

```yaml
- id: test:node-edit-web
  file: packages/web/src/lib/node-edit.test.ts
  cases: 5
  covers: patchYamlCard — scalar keys in place or appended, null removes, folded blocks for long or multi-line values, the text key by name
- id: test:open-target-web
  file: packages/web/src/lib/open-target.test.ts
  cases: 5
  covers: openTarget — a product/project/doc ref becomes the document path, a #node suffix its anchor, an app URL keeps its path and hash, an unrelated string is refused
- id: ui-test:command-palette
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    on a document page with the cursor in a node, press ⌘P — the command box opens in the middle with the node and
    the document as context tags and the product's working folder filled in; type a request and press Enter — a
    chat session with plan: true starts and opens in the context column; in its transcript the agent names the
    subject node, writes proposed blocks on its page (a new document only when none fits), runs `wf session open`
    — the main area navigates to that page while the session stays in the context column — and asks one "Plan"
    question (Proceed / Adjust / Cancel) before any code change (2026-09-17, session 3d2f42d484 for the chat-plan
    version; the page version is verified by session 0e07e8fd53). Images: paste a png into the box — a thumbnail
    with × appears under the text and the run button is enabled even without text; Enter posts `images` (name +
    data URL) with the request; the session lists the saved file, the first user event in the console shows it and
    the agent sees it (2026-09-17, session 6ca1fd641c: the agent described the pasted screenshot without a tool).
    One box: "Send to agent" on a block (a `wf:send` event) opens the same box with "Work on <ids>." and the block
    text prefilled; "to" opens on New conversation with the agent, plan-first and folder ("Plan & build ↵");
    Escape closes (2026-09-17, session 6ca1fd641c). Clean slate (rule:clean-slate, 2026-09-18, session
    64813dfdab): with nine live conversations the box still opens on New conversation; choosing a live one shows
    "Send ↵", the note "keeps its context and folder" and the "clear context first" tick; ticking it shows the
    plan-first tick too, the note "restarts that conversation's agent from nothing" and "Restart & send ↵". API
    side on a probe session: a first turn told the agent a secret word; a message with fresh: true got "no idea",
    a new agentSessionId, the "context cleared" note in the transcript and one claude process for the session; two
    plain messages after it kept context (BLUE → BLUE).
- id: ui-test:table-rows
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    open a document with a type table; click a row's status select, a property cell edge, a property input and a
    node block's header — the context column shows that node each time and the clicked control keeps focus; type a
    row at 15 ms per key — one row, no split; press Enter in a row and type — a new row of the same kind; copy the
    link of a row that was just typed — the link carries a slug (bug:when-i-select-a, 2026-09-17); type "/data",
    insert the Data table, switch its header picker to Goals, type a row, leave — the markdown holds a <!-- goals -->
    region with one goal line and the picker is locked (bug:no-need-to-add); click a bug row's status cell — the
    context column shows the bug's editable card; change its text and its priority — the defining line in the
    document carries both (bug:properties-need-to-be)
- id: ui-test:instance-table
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    open /types/bug — every bug in one table with status chips; click a status chip and type in the search — the
    rows narrow and the URL carries ?q=&status=; open that URL — the same rows and the search box prefilled; group
    by document — one bucket per document; click a row — the node opens in the context column. Open
    /knowledge/page — a column per page property and a select for the ref column; /knowledge/task?status=open&group=doc
    — 22 of 53 in 5 buckets. In a document with `<!-- view:task status=open group=doc -->` and `<!-- view:bug -->`
    — two view blocks with those rows and filters; click a chip in the bug view — the line on disk becomes
    `<!-- view:bug status=done -->`; switch the header picker — the line names the new type with no query
    (2026-09-17, session 53f99bfd98)
- id: ui-test:session-changes
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    create a session and take it (running); create a document, append a paragraph and a req line on disk, set a
    task's status through the API — `wf session changes <id>` lists +req, the paragraph and ~task per document;
    /sessions/<id>/changes shows the counts in the heading, the change and kind chips narrow the list, a row opens
    the node in the context column; the session in the context column shows +n ~n n¶ ↗ on the knowledge strip
    and the same list in the "changes" fold (2026-09-18, session 53f99bfd98)
- id: ui-test:session-page
  file: (run by hand with playwright-core against the dev server — /tmp/wfpw/spage.mjs; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    create a session and take it (running); write a document on disk with one proposed req and one task line, add
    an `open` event to its transcript — /sessions/<id> shows the instruction as markdown, "plan on" with the document
    and node, the task unchecked with "0 of 1 done" and its part-of, the req under "req" as proposed; setting the
    task done and the req shipped through the API (x-wf-session) ticks the task and shows shipped without a reload;
    from the Agents page a row opens the session in the column, "page ↗" navigates to the page with the column
    kept, ‹ in the top bar returns to Agents with the column kept, ⌘] and ⌘[ go forward and back (2026-09-18,
    session efee530d46)
- id: ui-test:edit-node-flow
  file: packages/web/e2e/edit-node.spec.ts
  scenario: open a project, open a node, edit a prose key and a status, save; assert the file on disk changed, the graph.changed event arrived, and the sidebar dot updated without a reload
- id: ui-test:deep-link
  file: packages/web/e2e/deep-link.spec.ts
  scenario: load /p/<project>/graph?focus=<id>&preset=Mechanics directly; the graph is centred on the node with that preset; navigating updates the URL
- id: ui-test:graph-edit
  file: packages/web/e2e/graph-edit.spec.ts
  scenario: drag an edge between two nodes, choose the verb; the edge is dashed until the file changes, then solid; the markdown now contains the edge
- id: ui-test:phone-layout
  file: packages/web/e2e/phone.spec.ts
  scenario: at 400px the sidebar is the first screen; opening a node and the graph go full screen; no horizontal scroll
```

### Coverage summary

| package | test node | runner | cases |
|---|---|---|---|
| core | parser, writer, check | vitest | 23 |
| server | services, api (×2 transports) | vitest | 29 |
| clerk | recorded runs + 1 live smoke | vitest | 12 (+1) |
| cli | client | vitest | 2 |
| web | components | vitest + RTL | 11 |
| e2e | 4 flows | Playwright | 4 |

**Untested surfaces (by design, for now):** the hosted path (token enforcement, Postgres, git sync); the clerk's prompt quality beyond the 12 recorded pairs; visual layout of the mind map (no screenshot tests); the skills and the AGENTS snippet (process, verified by reading); install and monorepo tooling.
