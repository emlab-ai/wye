---
node: module:wf2-test
type: module
title: Tests
status: proposed
owner: alex
verified-against: docs/superpowers/specs/2026-09-14-wye-v2-design.md
source-roots: [., packages/core, packages/server, packages/web, packages/cli]
sources:
  - docs/superpowers/specs/2026-09-14-wye-v2-design.md §9
  - docs/context-graph/prd.md      # every requires-tests entry names a case below
part-of: module:quality
order: 51
last-verified: 2026-09-20
---

# Tests

The tests, by area.

```yaml
- id: module:wf2-test
  purpose: >
    The verification plan of Waterfall v2 — test nodes per package, their cases, the fixture, and the untested
    surfaces.
  part-of: module:wf2
  submodules: [core, server, clerk, cli, web, e2e]
  runner: vitest for core, server, clerk, cli and web components; Playwright for ui-tests; `pnpm test` runs everything but the live clerk smoke (flag:live-clerk)
```




One node per test file. Requirements and rules point here with `requires-tests: [test:<node>#<case>]`, which the parser records as `verified-by` edges; when the code lands those keys become `verified-by` and the status flips. Cases are listed so that `wye get test:core-writer` shows what the file must prove. The last section lists what this design deliberately leaves untested.

---



---



















| package | test node | runner | cases |
|---|---|---|---|
| core | parser, writer, check | vitest | 23 |
| server | services, api (×2 transports) | vitest | 29 |
| clerk | recorded runs + 1 live smoke | vitest | 12 (+1) |
| cli | client | vitest | 2 |
| web | components | vitest + RTL | 11 |
| e2e | 4 flows | Playwright | 4 |

**Untested surfaces (by design, for now):** the hosted path (token enforcement, Postgres, git sync); the clerk's prompt quality beyond the 12 recorded pairs; visual layout of the mind map (no screenshot tests); the skills and the AGENTS snippet (process, verified by reading); install and monorepo tooling.


decision:memory.benchmark: before the write-time verdict pass (decision:memory.write-time-verdict) is on by default, its recall and precision are measured on the product's own contradictions — `node test/verdict-bench.js` (replays `test/fixtures/verdict-bench.json`; `WATERFALL_LIVE=1` asks the model for pairs the record lacks). Positives: every drift row with two defined sides (12 pairs on 2026-09-19); negatives: 30 same-kind pairs sharing a neighbour, not in a drift row, a fixed sample.


| judge | recall (drift pairs → contradicts) | by conflict | precision (neighbour pairs left alone) |
|---|---|---|---|
| claude-haiku-4-5-20251001 @ prompt 6d31662f | 17 % (2 of 12) | static 1, dynamic 1, missed 10 | 100 % (30 of 30) |

What the misses say: the pilot's drift rows record a description against reality ("v0.1 says a delta file, v2 has no such file"; "the viewer is static, the web app fetches"), not two texts that cannot both hold — the judge reads `entity:delta` and `req:wf.pipeline` as a definition and the process that uses it and answers *refines*. The judge is strict, as the prompt asks; it flags nothing that is not a contradiction. So the benchmark's positive set is the weak side, not the judge: a text-vs-text set is needed before recall means anything.



Verified 2026-09-19 (session de966d3bd9) in Chrome with playwright-core against the dev server, on a scratch product
the script creates and removes — /tmp/wfpw/exec.mjs, 42 checks — and, for the librarian's turns, live on a second
scratch product with the real claude. Not in CI yet (task:ui-tests-in-ci).



## Agents and sessions

```yaml
- id: ui-test:agents-queue
  title: Stop and Close from the Agents page; queue states; fresh honoured after the open turn
  steps: >
    1. Start a probe conversation (secret word in turn one). While its turn runs, queue two messages from the
    console: the first plain, the second with "clear context first" ticked. The Agents row shows 1 working ·
    2 waiting; the second waiting item has the fresh mark. 2. The first turn ends: the row shows the first queued
    item working, the transcript has no "context cleared" note yet. 3. That turn ends: the note appears, a new
    process starts, the fresh item is its first message; asked for the secret word the agent does not know it;
    the row shows 2 done · 1 working. 4. Stop on a live idle row ends its process; the row leaves Active; Resume
    from the console brings it back with the context. 5. Close on a busy row: the process ends, the waiting items
    are gone, the recorded status is cancelled, the row is under All only. 6. "Stop idle (n)" stops every live idle
    conversation and nothing else.
  covers: [req:wf2.sessions.stop-from-list, req:wf2.sessions.queue-on-agents, req:wf2.sessions.fresh-in-queue]
  status: passed
  result: run by hand with playwright-core (Chrome) on 2026-09-18 against probes 146c8dff62 and bb8ea7cbd2: fresh item waited for the open turn, then 'context cleared' and 'no idea'; items stamped done; Stop → exit 0, status done, resume kept the context; Close → 1 waiting item dropped, the working one failed 'exited with 143', status cancelled; the Agents row showed 1 working · 2 waiting with FRESH/KEEP toggles, Stop/Close on hover, 'Stop idle (2)'; the console panel showed the states and the fresh tick
- id: ui-test:app-links
  title: A transcript's app links are labels, foreign links leave the app
  steps: >
    1. Open a conversation whose first message has the Context link to a todo task: the Context shows
    `TODO › task:…` with the tag; the opening line shows `Waterfall`. 2. Click the document part: the todo page
    opens in the main column, the conversation stays in the right column. 3. Click the tag: the peek shows the
    task. 4. A message with https://example.com renders as a normal link with target _blank. 5. The session page
    shows the same labels in Instruction and Result.
  covers: [req:wf2.transcript.app-links]
  status: passed
  result: >
    run by hand with playwright-core (Chrome, headless) on 2026-09-18 against a probe session whose transcript held
    buildPrompt-shaped text: the opening line showed `Waterfall`, Context showed `TODO › task:new-226` (href
    /wye/v2/d/todo, the URL as title), a session link `session <id>`, a document link its title (`Agents and
    sessions` for app-agents, whose node is a card in app.md); https://example.com/x stayed a link with target
    _blank; the document click moved the main column to the todo page with the conversation still in the right
    column; the tag click peeked the task; the session page's task and result and the Agents rows showed the same
    labels, no raw localhost anywhere. Desktop (CDP on the relaunched shell): a click on a foreign link left the
    window on http://localhost:3456/wye.
- id: ui-test:plan-doc
  title: A palette request makes a plan document; the result lands on it
  steps: >
    1. ⌘P on a document, type a request with "plan first" on, Enter: the document tree shows `plan-…` under
    that document; the page shows the request under Request with the document as a tag; the session head's
    "page ↗" opens it. 2. The agent (or a probe through the API) adds a task line under Tasks and an embed of
    a req it defined on the entity's page: the page shows the task unchecked and the req card. 3. Set the task
    done through the API: the check ticks on the page. 4. `wye session done <id> "shipped x"`: Result shows
    "shipped x" and the changed blocks; the card's status is done. 5. `/wye/sessions/<id>` redirects
    to the plan document. (2026-09-18, session 07aa6645ad: steps 1, 4 and 5 covered by ui-test:plans through the
    API and Chrome — a queued session's plan under Plans with session / agent / started, the request quoted with
    its source; Result written once with the summary and status done; ending twice keeps one Result. Steps 2–3
    are what every plan-first session does by hand — plan-work-in-progress-visibility is one.)
  covers: [req:wf2.sessions.plan-doc, req:wf2.sessions.plan-result]
  status: passed
- id: ui-test:pr
  title: The PR's head shows readiness and the person's moves; ⌘P offers PR and Ad-hoc
  steps: >
    1. Open a migrated draft PR (pr-have-lot-docs-now-about-wye): the head shows DRAFT, the five checks (✓ definition
    ✗ agreed ✓ impact ✓ no contradiction ✓ tasks), the unagreed ids as tags, Approve and Cancel; the rail's PRs folder
    lists it under refining and 23 under done. 2. ⌘P: the box shows the PR / Ad-hoc chips, PR on, "Start the PR ↵",
    no target row. (Checked in Chrome on 2026-09-20 after the migration; the live refining session and Approve on a
    scratch PR are covered by test:web-lib#pr-docs and left for the scheduler's UI test.)
  covers: [req:wf2.pr]
  status: passed
- id: ui-test:first-message-fold
  title: The console's first user row is the request; the wrapper opens from a fold
  steps: >
    1. Start a chat session from the API (or the palette) with a one-line instruction. 2. Open it from the Agents
    list: the first user row shows only the instruction; under it a collapsed "what the agent received".
    3. Open the fold: the full first message (product line, Instruction, How to work) is there.
  covers: [req:wf2.console.first-message-is-the-request]
  status: passed
  result: >
    run with playwright-core (Chrome, headless) on 2026-09-18 against probe session 90e580f3bb: the row's visible
    text was the instruction alone, the fold was present and closed, its summary "what the agent received"; opened,
    it held the preamble and the How-to-work section. The transcript event carried text = instruction and a
    999-character prompt.
```

## CLI

```yaml
- id: test:cli
  status: retired
  file: packages/cli/test/cli.test.ts
  description: ctx as a client.
  cases:
    - server-and-local-identical: every read command produces identical output with the server up and with it down
    - falls-back-within-300ms: an unreachable server does not delay local mode noticeably
  count: 2
```

## Clerk

```yaml
- id: test:clerk
  status: retired
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

## Core

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
  status: retired
  file: packages/core/test/parse.test.ts
  description: The TypeScript port parses exactly as lib/parse.js did.
  cases:
    - fixture-present: the fixture exists and parses to the expected counts by kind; the suite fails, not skips, when it is missing
    - same-graph-as-v0.1: graph.json from the port equals graph.json from lib/parse.js for the fixture (nodes, edges, fieldIndex), modulo generatedAt
    - question-and-decision-nodes: yaml blocks whose id has the question or decision kind become defined nodes; governs and resolves keys become edges
    - multi-module: the four v2 files parse into one node set; cross-file refs resolve; drift ids are namespaced per module
  count: 4
- id: test:core-writer
  status: retired
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
  status: retired
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
- id: test:cards
  file: test/cards.js
  description: >
    The cards generator (scripts/cards.js, lib:cards, rule:cards-in-step): header extraction after 'use client' and the
    imports (line and block comments, an id-first header), kind and id by path, route → file for op args and page
    routes (dynamic segments, optional segments, query strings, trailing prose), path normalisation; write mode on a
    scratch root (moved file re-pointed with its purpose kept, deleted file retired in place, new component, lib,
    op and page cards under Unsorted or the importing module's Libraries, op source tightened, idempotent); then the
    real tree — every file has a card and every card a file.
  cases:
    - header-of: use client and imports skipped, block comment joined, id-first header split
    - escape-unknown: an undefined id is written kind&#58;slug, a defined one kept
    - kind-and-id: page.tsx → page, route.ts → op, layout.tsx → component, collisions get the parameter name
    - route-to-files: <x> matches any [segment], [/<x>] expands, ?query and prose ignored
    - write-scratch-root: moved, retired, added, tightened; a second write changes nothing
    - real-tree: check() finds no uncovered file and no missing file
  count: 6
- id: test:plans-to-prs
  file: test/plans-to-prs.js
  description: >
    scripts/plans-to-prs (decision:wf2.pr-lifecycle) on a scratch product: a `type: plan` document becomes pr-<x>.md with
    node pr:pr-<x>, type pr, its status mapped (refining when a running session holds it, else draft; done stays),
    part-of the PRs page; plans.md becomes prs.md (module:<p>-prs, "PRs", view:pr); every plan:<x> and task:plan-<x>
    reference in other documents is rewritten; a session's planDoc becomes prDoc with the new slug and its refs
    follow; a second run changes nothing.
  cases:
    - documents: renamed, retyped, restatused, re-parented
    - page: plans.md → prs.md with node, title and view
    - references: prose tags and part-of props rewritten
    - sessions: planDoc → prDoc, refs renamed
    - idempotent: a second run reports no documents
  count: 1
- id: test:jev
  file: test/jev.js
  description: >
    lib/jev.js (req:wf2.link.jev, decision:wf2.jev-judges-never-finds) against a fake fetch: no key → disabled, no
    call, empty results; judgeLinks sends one noul question per candidate keyed by index with the candidate in the
    structured instructions and the bearer key in the header, answers back in order; empty candidates make no call;
    judgeKind is a choice over the five inbox kinds; a 429 is retried, a 401 thrown with its status; LINK_MIN is 0.85.
  cases:
    - disabled: enabled false, judgeLinks [], judgeKind note/0, fetch never called
    - judge-links: request shape (endpoint, POST, Authorization, model, state, questions.0 noul with `knowledge`), answers in order
    - judge-kind: criteria keys decision, requirement, rule, question, note; the winner with its probability
    - retry: 429 then 200 succeeds; 401 rejects with /401/
  count: 4
```

## Documents and editing

```yaml
- id: ui-test:decision-card
  title: Decision card folds its tracking fields
  steps: >
    Open dev-design in Chrome; find the decision:wf2.clean-slate card; it shows the title, context, choice and
    alternatives and no date/affects/consequences/related-to/session rows; click "details"; the rows appear
    with the id and the yaml editor; edit choice on the card and reload — the markdown keeps every key in its
    original order.
  status: passed
  verifies: rule:card-essence
  last-run: 2026-09-18
- id: ui-test:embeds
  title: Embed a node, edit it in the embed, see the source change
  steps: >
    1. Open a document, type /ref, pick req:wf2.cards.decision-essence — the card appears with its header, title
    and when/then/unless. 2. Change the status in the embed — the source document (app-documents) shows the new
    status on its card, the context column too. 3. Open the session changes page of a session that changed a
    decision — the decision card is shown with context, choice and alternatives, editable. 4. Reload — the
    markdown of the embedding document holds exactly `![[req:wf2.cards.decision-essence]]`.
  verifies: [req:wf2.embeds.insert, req:wf2.embeds.render, req:wf2.embeds.edit-sync, req:wf2.sessions.changes-cards]
  result: >
    playwright-core with the installed Chrome against a scratch page (embed-probe, removed after): three embeds and
    a stub rendered with their sections and a "from app-documents" line; the task's checkbox flipped the source
    line to [x]; a title typed in the embed reached the yaml card in app-documents and the source page's own
    card, and an API revert came back into the embed; /ref opened the picker, Enter chose the question and the
    markdown held ![[question:wf2.embed-paragraphs]]; the session changes page showed 19 cards.
  status: passed
  last-run: 2026-09-18
- id: test:page-node
  title: The page as a typed node — parser and check
  file: test/page-node.js
  covers: [req:wf2.page.node, rule:page-node-line]
  status: passed
  result: >
    a `node: team:platform` page is the document node at line 1 with the frontmatter as its body and its
    ref/list properties as edges (lead → person:ana, members → person:bo, the inverse generated); wye check reports
    a mistyped frontmatter property and ignores the page bookkeeping keys; an undeclared kind on the node line
    is an error and the page is not in the graph; `type:` is not read.
- id: test:retype
  title: rewriteId and retypeFrontmatter
  file: packages/web/src/lib/retype.test.ts
  covers: [rule:doc-retype]
  status: passed
  result: >
    every whole-id occurrence rewritten (frontmatter keys, yaml values, prose ids, embeds, links, a trailing full
    stop), a longer id that starts with the old one left alone; the node line takes the new kind and the old
    `type:` line goes.
- id: ui-test:page-node
  title: A page created as a team, filled in the header, listed in the team table, retyped to person with its links following
  steps: >
    1. POST /api/wye/v2/doc { title: 'Probe team', type: 'team' }: the frontmatter has `node: team:probe-team`,
    an empty `name:` key and no `type:` line. 2. Open the page: the header shows the type pill `team`, the id, and
    the fields name (required) and members with the value type as placeholder. 3. Fill name and members in the
    header: the frontmatter has them; after a reload the member shows as a tag. 4. /wye/types/team lists
    team:probe-team with a 📄 link to the page. 5. Pick `person` in the type pill: the header shows person:probe-team
    with name, email, role; every link in a second page (a prose id, a markdown link, a yaml list) now says
    person:probe-team, none says team:probe-team; the page's own node line changed. 6. The tree lists the page; the
    tag in the other page peeks it with "Open document →" to /wye/v2/d/probe-team. 7. A card elsewhere takes
    team:probe-team: retyping back is refused with 409 "team:probe-team already exists".
  covers: [req:wf2.page.node, req:wf2.page.header-card, req:wf2.page.retype, req:wf2.page.create-typed]
  status: passed
  result: >
    run by hand with playwright-core (Chrome, headless) on 2026-09-18 (/tmp/wfpw/pagenode.mjs): every step as
    written; retype reported "3 links in 2 pages now point at person:probe-team". `wye doc create --type team` and
    `wye doc retype --type person` did the same from the CLI.
- id: test:annotations-web
  file: packages/web/src/lib/annotations.test.ts
  description: describeScene — image and size, labelled regions with zone and percent position, arrows by binding or end points, free labels, deleted elements skipped, pixel positions without an image
  count: 5
```

## End-to-end (Playwright, real server on a temp copy of the fixture repo)

```yaml
- id: ui-test:tabs
  file: (by hand with playwright-core against the dev server — not written yet; task:wye.ui-test-tabs-write-and-run)
  status: proposed
  description: >
    req:wf2.ui.tabs — open two documents, the second opens as a tab after the first; open the first again, its tab
    comes forward and nothing is added; open a node in the context column, a tab appears there; × on a tab shows its
    neighbour; pin keeps a tab; reload — both strips come back with the last tab open; the Context root has no ×.
- id: test:node-edit-web
  file: packages/web/src/lib/node-edit.test.ts
  cases: 5
  covers: patchYamlCard — scalar keys in place or appended, null removes, folded blocks for long or multi-line values, the text key by name
- id: test:node-content-web
  file: packages/web/src/lib/node-content.test.ts
  cases: 7
  covers: readContent / writeContent — a paragraph node's, a list item's and the last card's content de-indented, a stale line found again, content replaced with the continuation text and the following blocks kept, list content tight under an item and a blank line after paragraph content, content removed, a card's content after its fence and the fence split for a card that is not last, read-then-write changes nothing
- id: test:import-web
  file: packages/web/src/lib/import.test.ts
  cases: 24
  covers: prepare, escapeAngles, splitCode, protectCode, nodePropsFromChunk, tags; content — liftContent under a named paragraph and a list item with continuation text kept, a card's content on the yaml marker, an indented fence whole, importMarkdown building the tree recursively
- id: test:serialize-web
  file: packages/web/src/lib/serialize.test.ts
  cases: 11
  covers: inline styles, tags, images, prose and yaml node lines, numbering, tables, code, dividers; content — a node block's children as nested lines with a blank line around paragraph content, content under a paragraph node and after a card's fence with the yaml group split
- id: test:open-target-web
  file: packages/web/src/lib/open-target.test.ts
  cases: 5
  covers: openTarget — a product/project/doc ref becomes the document path, a #node suffix its anchor, an app URL keeps its path and hash, an unrelated string is refused
- id: test:doc-ops
  file: packages/web/src/lib/doc-ops.test.ts
  cases: 5
  covers: copySlug — -copy, -copy-2, -copy-3 while taken; duplicateMarkdown — node line, title (plain and quoted, not twice), every defined id suffixed with the copy's suffix (a copy of a copy takes -copy-2), other documents' ids untouched; subtree — depth first
- id: ui-test:command-palette
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    on a document page with the cursor in a node, press ⌘P — the command box opens in the middle with the node and
    the document as context tags and the product's working folder filled in; type a request and press Enter — a
    chat session with plan: true starts and opens in the context column; in its transcript the agent names the
    subject node, writes proposed blocks on its page (a new document only when none fits), runs `wye session open`
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
- id: ui-test:document-not-found
  file: (run by hand with playwright-core against a dev server on a scratch copy — /tmp/wfpw/notfound.mjs; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    open a document in the editor, type a few characters, delete its file on disk outside the app: within ~2 s the
    content area alone shows "Page not found" — URL unchanged, rail and top bar in place, the page tab still titled
    with the document's title; the typed text's save is refused with 404 and the file is not recreated. Write the
    file back: within ~2 s the editor is back with the document's original text, no reload.
  covers: [req:document-opened-in-the, rule:doc-gone-in-place, rule:doc-write-gone]
  status: passed
  result: >
    run by hand with playwright-core (Chrome, headless) on 2026-09-20 against a second dev server (port 3457) on a
    scratch copy of the repo with a scratch product, the main server being down with a stale SSR chunk: every step as
    written (before the change the default Next 404 replaced the whole layout and nothing came back).
- id: ui-test:session-changes
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    create a session and take it (running); create a document, append a paragraph and a req line on disk, set a
    task's status through the API — `wye session changes <id>` lists +req, the paragraph and ~task per document;
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
- id: ui-test:table-scroll
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    open the Bugs document (a bug table) and ontology (a goals/tasks table) at a 700 px viewport with the context
    column open — the editor is 318 px wide: every row's name column is 200 px, the header and every row are one
    width (552 / 586 px), the collection's block has overflow-x auto and scrolls sideways (scrollLeft moves), the
    block itself fits the editor and the page does not scroll; widen to 1400 px — no scrollbar, the rows fill the
    editor (2026-09-18, session 01b14dc871: /tmp/wfpw/table-scroll.mjs, 14 checks passed in Chrome; screenshots at
    480 px show the name column readable and the property columns reached by scrolling)
  status: passed
  verifies: [req:wf2.editor.table-scroll, rule:table-scroll]
  last-run: 2026-09-18
- id: ui-test:table-filter
  file: (run by hand with playwright-core against the dev server — /tmp/wfpw/table-filter.mjs; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a scratch product with type:bug (priority enum, blocking bool), a bug table of three rows and a goals table of
    three: no toolbar without a filter; the header's toggle opens it with All 3 / open 2 / done 1 and the priority
    and blocking chip rows; status=open hides the done row and keeps the trailing empty row, "2 of 3", the hidden
    row still a block; + priority=high leaves one; the file keeps every row and the marker reads
    `<!-- table:bug status=open priority=high -->`; a search narrows by text and lands on the marker; the goals
    table offers an owner select (any / alex / bo), owner=bo shows g2, `<!-- goals owner=bo -->`; after a reload
    both filters apply, the toolbar is open and the toggle says 1/3; a row typed in the trailing row under a filter
    stays one row and visible, hides once the cursor leaves it and is in the file; a hidden row reached with the
    arrow keys shows while the cursor is in it; clear filters shows every row and restores the bare markers
    (2026-09-18, session bd2ece3698: 25 checks passed in Chrome)
  status: passed
  verifies: [req:wf2.editor.table-filter, rule:table-filter]
  last-run: 2026-09-18
- id: ui-test:doc-tree-dnd
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a scratch product with three top-level documents alpha, beta, gamma; drive a native HTML5 drag with the mouse
    (mousedown on a row, a few moves, mouseup on the target): while dragging, the source row is .dragging, the
    target lights up drop-into and the top-level drop zone appears; gamma dropped onto alpha nests under it
    (indented, part-of), beta dropped on alpha's top quarter reorders before it (order: 10/20/30), gamma dropped on
    the zone under the tree is top level again; no error notice. Before the fix the dragged row was unmounted on
    dragstart (isConnected false) and the drag never reached a target (2026-09-18, session 9091132439:
    /tmp/wfpw/dnd.mjs, 7 checks passed in Chrome; /tmp/wfpw/dnd-remount.mjs is the one-check hypothesis test)
  status: passed
  verifies: [rule:documents-tree, rule:doc-tree-row-stable]
  last-run: 2026-09-18
- id: ui-test:connected-cards
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a scratch product with a goal, a req (refines the goal, satisfied-by a defined rule and a stub rule) and two
    tasks part of the goal; open the req from its tag in the prose: Connected shows Refines 1 and Satisfied by 2,
    every group heading with a "cards" toggle, no card open, the stub row without a toggle; ▸ on the rule's row
    opens it (▾, li.open) with the node's embedded card under it — "from spec", the rule kind, slug cc.rows in the
    slug field, the statement in the text field, the source — 511 px wide, the row's own title line hidden; the
    row's tag still opens the rule in the column and the new node starts with nothing expanded; ← back; "cards"
    on Satisfied by opens its one defined row and reads "tags", "cards" on Refines opens the goal's card, "tags"
    closes the group; typing in the goal's expanded card writes the title to spec.md within 1.5 s and the card
    stays open over the refetch; opening the goal, Tasks 1/2 carries the toggle and ▸ on task:cc.one shows its
    task card (2026-09-18, session edd6ae474d: /tmp/wfpw/connected-cards.mjs, 16 checks passed in Chrome; no
    console error from the column)
  status: passed
  verifies: [req:wf2.ui.connected-cards, rule:connected-cards]
  last-run: 2026-09-18
- id: ui-test:block-select
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a scratch product with a prose rule card, a yaml req card whose text carries a tag, an embed of the other
    document's rule and a goals/tasks table; a tag in the prose pushes the req bs.select (a chip, current); a click on
    the rule card's text brings the column to its Context root showing the rule bs.rows with Related under it, the
    chip stays in the bar and none is current; the chip reopens the req; a click on the yaml card's property rows
    selects it; a tag inside the card still pushes the rule bs.rows as a chip; a click in the embed's text area selects
    the other rule bs.other with no Related; a click on a task row's status cell selects the task bs.one and on another row's text
    bs.two; the card's pill and the embed's pill select without adding a chip; two arrow-downs from the rule
    card move the root to the req card (the caret takes over); in the column, opening the req's Satisfied-by row as
    a card and clicking its text area keeps the req bs.select open (2026-09-18, session 367dedec3c:
    /tmp/wfpw/block-select.mjs, 15 checks passed in Chrome; no page error)
  status: passed
  verifies: [req:wf2.ui.block-select, rule:block-select]
  last-run: 2026-09-18
- id: ui-test:node-content
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a scratch product whose spec nests content in every form — a paragraph node with an indented paragraph, a
    two-level list and an indented decision card; a task line with a nested question that has a paragraph of its
    own; a fence of two cards with blocks after it; an embed of the paragraph node. The page editor's tree has the
    children at every level; the paragraph card's header reads ▸ 3 blocks and none of the children has a height,
    the chip opens the node's details with the blocks still hidden, a caret placed inside a child shows them
    (▾ 3 blocks) and a click back on the card's text folds them again; with the caret in a plain paragraph
    Related is a bar reading "show" and no /context request went out, "show" mounts the panel and runs one search;
    selecting the task shows its properties (no title field) and a Content editor whose first block is the task's
    text, then the question with its paragraph; typing in the first block edits the defining line with the content
    under it kept; Enter at the end and typing writes a new item under the task in the file while the question
    keeps its paragraph; /req makes a new node under the task (blank line, indented, in the graph as the task's child);
    a click on its card opens it as a chip with a Content editor of its own (its text, nothing under it);
    Enter and typing there lands two levels down in the file; ← returns to the task at the root, now 4 blocks, the child's card folded to ▸ 1 block; the page
    a task line with `(session: …, produced: module:ct-spec)` shows a Produced bar reading "1 session · 1 document" and "show"
    after Content and Connected and before Related, with no /sessions or /inbox request; "show" fetches both and lists them;
    the next node (no session) has no bar and coming back the fold is closed again; the page
    editor reloaded the nesting task → req → paragraph; the embed shows no preview and ▸ 3 blocks, and its chip
    opens the embedded node's details (2026-09-18, session c8eadd53da: /tmp/wfpw/node-content.mjs, 33 checks
    passed in Chrome; no page error; 203 unit tests)
  status: passed
  verifies: [req:wf2.ui.node-content, req:wf2.ui.card-preview, req:wf2.ui.related-collapsed, req:wf2.ui.produced-collapsed, req:ontology.content, rule:content-editor, rule:card-fold, rule:related-collapsed, rule:produced-collapsed, rule:content-lines]
  last-run: 2026-09-18
- id: ui-test:tree-menu
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a scratch product with alpha > beta > gamma and delta (delta's req refines alpha's): right-click on delta
    opens a menu with Duplicate and Delete, Escape closes it; Duplicate opens delta-copy, listed right after delta,
    its file has the node line, the req and the task re-suffixed -copy, title "delta (copy)", order 25 and its
    reference to alpha's module kept; ⋯ on alpha opens the menu, Delete reads "Delete (with 2 below)", the confirm
    says 'Delete "alpha" and its 2 sub-documents?', cancel keeps every file; from the gamma page, accept: alpha,
    beta and gamma are gone, delta and its copy stay, the browser lands on /dndtest (no parent), the tree shows the
    two, the notice reads "2 references from other documents to the deleted pages now dangle" (2026-09-18, session
    9091132439: /tmp/wfpw/tree-menu.mjs, 12 checks passed in Chrome)
  status: passed
  verifies: [req:wf2.ui.tree-menu, rule:tree-menu]
  last-run: 2026-09-18
- id: ui-test:plans-folder
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    on the wye product: the rail's menu ends with Plans after Agents; the folder rows are exactly the
    `plan-*.md` files of the project newest first (`started` descending), the first is the newest request; the
    Documents tree has neither the Plans page nor any plan; every row carries its status class and a
    "status · date" tooltip; a row opens its plan document and is marked while no tree row is; the entry opens
    /wye/plans — marked, titled Plans, the table has one row per plan and a status chip; the caret collapses
    the folder (aria-expanded false), a reload keeps it collapsed, the caret expands it. On a scratch product whose
    Plans page sits under its main document with no plan: the tree shows Main > Other only, the folder says
    "no plans yet", /pftest/plans says "No plans yet" (2026-09-18, session 48c8885cd2: /tmp/wfpw/plans-folder.mjs,
    16 checks passed in Chrome at 1400×900; the scratch product is removed afterwards)
  status: passed
  verifies: [req:wf2.ui.plans-folder, rule:prs-folder]
  last-run: 2026-09-18
- id: ui-test:rail-split
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    at 1400×700 with the Plans folder open: the menu pane is 420px of the rail's 700 (60%) and scrolls its content,
    the Documents tree shows below the splitter; a drag of the splitter up by 120px makes the pane 300px, the value
    is in localStorage and survives a reload; a drag to the bottom edge is clamped so the Documents pane keeps
    ~100px; a double-click on the splitter returns the pane to 420px and clears the stored value (2026-09-18,
    session 48c8885cd2: /tmp/wfpw/rail-split.mjs, 7 checks passed in Chrome; plans-folder 16/16 still passes)
  status: passed
  verifies: [req:wf2.ui.rail-split, rule:rail-split]
  last-run: 2026-09-18
- id: ui-test:column-frame
  file: (run by hand with playwright-core against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    open a chat session with a long transcript in the context column at 900 px high — the bar (←, chips, ×) and the
    message box are inside the viewport, the conversation's last row is visible above the box; scroll the column's
    body to the top — the bar and the box stay where they were and the session header is in view; append an event
    while scrolled to the bottom — the column follows it; open a long node — the bar stays and the relations scroll
    (2026-09-18, session 07aa6645ad: /tmp/wfpw/frame.mjs, 14 checks passed in Chrome at 1400×900; the event was a
    `wye session open`, since a log line is not streamed to the console)
- id: ui-test:plans
  file: (run by hand with playwright-core and the API against the dev server; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a queued session created through the API gets `plan-<slug>` under the project's Plans page with `session`,
    `agent`, `started` and the request quoted with its source; PATCH done writes one Result with the summary and
    sets status / finished; running → done again keeps one Result with the later summary; the plan's own page is
    not among its blocks; the session API lists the plan. The Agents page: a worker row with two plans shows both
    (the first done with 4/4 tasks, the second marked current and running with 0/7), no "plan ↗" button; the
    session head shows the same list; a plan title opens the plan page, whose header shows the session as a link
    that opens the conversation; the tree shows Plans; the Plans page's view lists the plans. A live probe
    conversation without plan-first gets a plan; a fresh message makes a second one and closes the first as
    cancelled ("Left unfinished"); the first message names the plan document; Close finishes the second as
    cancelled. (2026-09-18, session 07aa6645ad: /tmp/wfpw/plans.mjs 21 checks and /tmp/wfpw/plans-fresh.mjs 6
    checks, all passed in Chrome at 1400×900; the probe plan pages were removed afterwards)
  covers: [req:wf2.sessions.plan-doc, req:wf2.sessions.plan-result]
  status: passed
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

## Execution: work, changes, impact, the librarian (module:prd-execution)

```yaml
- id: ui-test:work-view
  file: (run by hand with playwright-core against the dev server — /tmp/wfpw/exec.mjs; not in CI yet — task:ui-tests-in-ci)
  scenario: >
    a scratch product with four task lines (one with part-of a goal, one #ready blocked-by the first, one #ready with
    priority 2, one done): the Work page grouped by status shows the three open rows with the priority-2 task first,
    every state unassigned, the ready and blocked marks; "done work" adds the fourth row and lands in the URL
    (done=1); ?group=goal groups under the goal; the search narrows to one row; /tasks redirects to /work
    (2026-09-19: 7 checks passed)
  status: passed
  verifies: [req:exec.work-view, req:exec.work-states, req:exec.human-work, rule:work-state, rule:work-nesting]
  last-run: 2026-09-19
- id: ui-test:work-assign
  file: (run by hand with playwright-core — /tmp/wfpw/exec.mjs)
  scenario: >
    the Assign dialog lists claude-code, codex, the runner pool and the product's people; a person as worker writes
    `worker: bo` on the line and the row shows held · bo; a blocked task and a done task are refused with the reason;
    the runner pool with a note makes a queued run session whose refs carry the task and its document and whose plan
    embeds the task; the row reads queued, the ready mark spent, in progress; a runner's claim turns it working; a
    second assign is refused with 409; the session ending moves the task to #review and the task panel shows the
    result; a capture writes a task line under the goal; work/next answers nothing (one blocked, one taken)
    (2026-09-19: 15 checks passed)
  status: passed
  verifies: [req:exec.dispatch, req:exec.request-is-a-task, req:exec.done-comes-back, req:exec.capture, req:exec.ready-for-runners, rule:assign-refusal, rule:capture-home, rule:take-ready]
  last-run: 2026-09-19
- id: ui-test:change-review
  file: (run by hand with playwright-core — /tmp/wfpw/exec.mjs)
  scenario: >
    an edit of an approved requirement's `then` through the node API becomes a pending change record with before and
    after, changed = then, by person; with impact: manual the record carries the structural candidates (the refining
    sub-requirement with path refined-by, the satisfying rule) and no verdicts; a status-only edit is recorded
    accepted and not listed; the Inbox's Changes group shows the word diff (one → two) and the impact set with paths;
    the node's header shows the changed badge with the old value; Revert writes the old value back, marks the record
    reverted and saves the revert as an accepted change with revertOf; a second edit's record is accepted with
    acceptedBy (2026-09-19: 9 checks passed). The judged run — update patches applied from the card, an ask landing
    as a question block, a rework as a task — was verified live with claude-haiku on a second scratch product
    (session de966d3bd9): three candidates judged update / update / ask, Apply wrote the proposed text and recorded it.
  status: passed
  verifies: [req:exec.change-kept, req:exec.change-review, req:exec.change-validated, req:exec.impact-set, req:exec.impact-patch, req:exec.impact-sub-items, rule:change-record, rule:change-review, rule:impact-candidates, rule:impact-run, rule:impact-apply]
  last-run: 2026-09-19
- id: ui-test:ask-wye
  file: (run by hand with playwright-core — /tmp/wfpw/exec.mjs; the librarian's turns live)
  scenario: >
    ⌘P on a document page with nothing selected defaults to Ask Wye; POST sessions with role librarian makes a chat
    session in the Wye repo with a plan whose status is defining, role librarian and a Definition section; wye propose
    with the session header writes a requirement card into the PRD and embeds it on the plan, and a decision with no
    document lands on the plan under Definition marked home: none yet; the plan reads 2 blocks, 0 agreed; approving
    both makes the plan defined (2026-09-19: 7 checks passed). Live (a second scratch product, the real claude): the
    librarian read the context, the seed nodes, the Work view and the PRD, logged what it found, asked three
    questions along who / when / then as one form with the assumed reading first, and on the answers proposed two
    requirements and a question into the PRD, four decisions (three by alex, one its own) and two tasks on the plan,
    ran wye verdicts, replied with the list and the verdicts and noticed a pre-existing gap between an approved
    requirement and its shipped rule; it never edited a file.
  status: passed
  verifies: [req:exec.ask-wye, req:exec.wye-context, req:exec.wye-explains, req:exec.wye-asks, req:exec.wye-proposes, req:exec.plan-defined, req:exec.definition-tracked, rule:librarian-tools, rule:definition]
  last-run: 2026-09-19
- id: ui-test:build-plan
  file: (run by hand with playwright-core — /tmp/wfpw/exec.mjs)
  scenario: >
    the defined plan's request task row says "defined" and offers build; the Build dialog to the runner pool makes a
    run session whose instruction carries "## Definition of …" with every block's status and text, on the same plan
    (planDoc unchanged, status building); the session ending writes the Result with "Against the Definition" and a
    line per block (implemented / changed / left) (2026-09-19: 4 checks passed)
  status: passed
  verifies: [req:exec.build-from-definition, rule:build]
  last-run: 2026-09-19
- id: ui-test:explain
  file: (run by hand — `wye explain <a requirement> --product scratchx`, 2026-09-19)
  scenario: >
    one librarian turn on a requirement of the scratch product: 13 s with claude-sonnet-5; the answer explained the
    current state with the nodes as tags — the approved requirement against its shipped one-step rule, the refining
    sub-requirement as target not current, the four decisions on saved cards and the dismissed duplicate, the
    resolved CVC question — and named the open retry question and the missing rule / task on the two-step split as
    the thin spot; nothing written
  status: passed
  verifies: [req:exec.explain-anywhere, op:api.explain]
  last-run: 2026-09-19
- id: test:librarian
  file: (no recorded replay yet — task:exec.librarian-replay; the turns above were verified live)
  description: >
    The librarian's turns on a recorded conversation: explains with tags, asks only unfilled slots, proposes into home
    documents, never edits code. Today the evidence is the live run on ui-test:ask-wye; a replay needs a recorded
    transcript and a fake host, which task:exec.librarian-replay adds.
  status: proposed
  verifies: [req:exec.wye-explains, req:exec.wye-asks, req:exec.wye-proposes]
- id: ui-test:work.tasks-by-status
  file: (to run by hand with playwright-core against the dev server — /tmp/wfpw/exec.mjs; not in CI yet — task:ui-tests-in-ci)
  title: Opening Tasks shows every task under its status, and a status change moves it
  scenario: >
    a scratch product with one task line per status (open, in-progress, blocked, review, done): the rail's Work entry
    and the old /<product>/tasks route both land on the Work page grouped by status; every status that has a task is
    one group in lifecycle order (review first), each open task under its own status and only there, done folded
    until "done work"; `wye node set task:x --status in-progress` on the open one moves its row to the in-progress
    group without a reload and the status chips' counts follow. ui-test:work-view already checks the grouping and
    the /tasks redirect; this one adds the entry and the move between groups.
  status: proposed
  verifies: [req:wf2.ui.tasks]
- id: ui-test:work.open-task-links
  file: (to run by hand with playwright-core against the dev server — /tmp/wfpw/exec.mjs)
  title: Opening a task shows what it is linked to
  scenario: >
    clicking a row on the Work page opens the task in the column: the header carries kind, slug and status; Connected
    lists Part of (its goal or requirement), Belongs to (the document it is defined in) and Depends on / blocked-by
    when the line has them, each a tag that opens that node; the document link lands on the task's line
    (#n-<id>); the same task opened from its tag in a document shows the same column; a task with no links shows
    "Nothing links to or from this node yet"
  status: proposed
  verifies: [req:wf2.ui.tasks]
- id: ui-test:work.open-task-decisions
  file: (to run by hand with playwright-core against the dev server — /tmp/wfpw/exec.mjs)
  title: Opening a task shows what its sessions decided, asked and produced
  scenario: >
    a task whose finished session wrote a proposed decision, an open question and an edit of an approved node into a
    document: its column's work panel shows the session's state and result summary, lists the decision and the
    question with their Inbox state and a Review action, and Produced (folded) lists every block the session wrote
    with the change to the approved node marked pending; approving the decision in the Inbox updates the panel's
    state for it; a task with no session on it shows Assign and no result
  status: proposed
  verifies: [req:wf2.ui.tasks, req:exec.done-comes-back]
- id: ui-test:rail.fold-caret
  file: (to run by hand in the browser, or with playwright-core against the dev server)
  title: The fold caret of a rail folder folds it, and does not open its page
  scenario: >
    hover the rail's PRs or Skills folder so the caret takes the icon's slot, and click the caret: the folder folds
    and the URL does not change; click it again and it unfolds, and the state survives a reload. The regression it
    guards: the caret is only visible while the head is hovered, and hovering sets the icon's opacity to 0 — which
    makes the icon a stacking context that painted over the caret (both z-index auto, the icon later in the DOM), so
    every click on the caret opened the folder's page instead. Only a real click in a browser catches it:
    elementFromPoint with nothing hovered reports the caret, and jsdom has no layout at all.
  status: proposed
  verifies: [req:wf2.hooks]
```

## Fixture

```yaml
- id: test:fixture
  status: retired
  file: packages/core/test/fixture/inventory-trimmed.md
  description: >
    A trimmed copy of the YesSensei inventory pilot (about 12 reqs, 10 rules, 4 entities, 6 ops, 2 pages, 3 drift
    rows, 2 questions) checked into the repo so the suite never depends on another checkout. A second fixture,
    packages/core/test/fixture/wye-v2/, is a copy of this repo's four v2 files for multi-module cases.
  count: 2 files
```

## Memory: the verdict-pass benchmark

```yaml
- id: test:verdict-bench
  file: test/verdict-bench.js
  count: 12 positive + 30 negative pairs
- id: test:memory
  file: test/memory.js
  count: bitemporal, current-by-construction, constraint packet, shapes, forgetting, verdict pairs and lines
- id: test:impact
  file: test/impact.js
  count: structural candidates with paths and decay (refined-by, satisfied-by, contains, affected-by, related-from, mentioned-by), verbatim repeat, the judged run through test/fake-impact.js (update with new text, rework, contradicts, ask, unaffected; batches; cache; budget)
- id: test:verdicts
  file: packages/web/src/lib/verdicts.test.ts
  count: 4
- id: test:packet
  file: packages/web/src/lib/packet.test.ts
  count: 8
- id: question:memory.benchmark-positives
  title: Where does a text-vs-text positive set for the verdict pass come from?
  q: >
    Ten of the twelve drift pairs are doc-versus-reality drift, which the judge rightly does not call a contradiction
    between the two texts. Should the benchmark keep the drift rows and accept a low ceiling, take only the rows whose
    `what` names two statements (a hand-picked subset), or grow a positive set from the contradiction: nodes people
    confirm in the Inbox over time (the pass's own output, reviewed)?
  context: >
    decision:memory.benchmark makes the number a precondition for switching the pass on by default; with the drift set
    the number cannot rise above ~20 % whatever the model. The Inbox-confirmed set would be the honest one and grows
    with use.
  status: open
  related-to: [decision:memory.benchmark, decision:memory.write-time-verdict, test:verdict-bench]
```

## Server

```yaml
- id: test:server-services
  status: retired
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
  status: retired
  file: packages/server/test/api.test.ts
  description: >
    Contract tests. Every case runs twice, once over HTTP and once over an MCP client on stdio, from one table of
    inputs and expected outputs.
  cases:
    - serve-starts-with-two-projects
    - config-print: the start-up output contains a claude mcp add line and a [mcp_servers.wye] block
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

## Web components (vitest + React Testing Library)

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

## Web pure modules (vitest)

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
    - work: workItems derives queued / working / stalled / held / unassigned / done from the sessions on a task, nests a plan's tasks under its request task and sub-tasks under their task, priority then document order; filterWork (done hidden, mine, goal, plan, search keeps a matching child's parent), groupWork (review first), workCounts, nextReady, assignRefusal
    - changes: nodeValue (text key apart from status and properties), changedKeys, tracking-only, recordsFromDiff (pending for an agent or an approved node, accepted for tracking-only and a person's own proposed block, none for paragraphs), revertPatch (title as a property, removed keys null), changedSince; diff: wordDiff
    - plan-doc (execution): the request task line with worker, session and part-of; an assigned task embedded instead; requestTaskStatusOnEnd; definitionIds (top-level embeds, cards, prose lines; verdicts and indented content ignored), withDefinition (idempotent, creates the section before Plan), definitionState (a task agreed once it is work; open contradictions on agreed blocks), planStatusFromDefinition
    - node-line: the #ready mark beside the status, review
    - runs (workflows): parseStage (actions, produces, until, gate, the defaults, several do lines, a worker and skills), an unparseable until kept as badUntil, workflowOf (stages part-of it in document order, takes, admits, nextStage, the fallback to the document), readinessOf per predicate against a fixture graph — every req agreed naming the ones that are not, has <verb> with a dangling target not counting, session done, tasks ready and done, open questions, contradictions, check, has a task, and the three that must never be green (an empty PRD, an unbound document, a criterion that did not parse); the run card round-tripping through yaml with its log, replaceCard leaving its neighbours alone, runSlug, LIVE, autoRun's cap, logLine
    - instance-table: coverageOf — what satisfies a req, what verifies it, its tasks, and a gap naming which side is missing
  count: 87
```
