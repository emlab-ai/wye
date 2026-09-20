---
node: plan:plan-work-task-app-keep-step-regenerate
type: plan
title: Work on task:app.keep-in-step: Regenerate the component, lib and op cards from the code…
status: proposed
owner: unassigned
last-verified: 2026-09-20
session: 7a334e57e6
agent: claude-code
started: 2026-09-20T11:28:16.883Z
task: task:app.keep-in-step
part-of: module:v2-plans
---

# Work on task:app.keep-in-step: Regenerate the component, lib and op cards from the code…

## Request

> Work on task:app.keep-in-step: Regenerate the component, lib and op cards from the code (the header comment is the purpose) whenever a file is added or renamed under packages/web/src; a check that every file has a card and every card a file. Part of module:app.
> 
> do it
> 
> It serves module:app.
> 
> When it is done: `wf node set task:app.keep-in-step --status done`; what you leave open stays as task lines under it.

_from: module:wf2-plan · refs: task:app.keep-in-step, module:app_

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

The cards live in the Systems layer: component: cards on module:components (components.md, five sections by area), op: cards on module:api (api.md), lib: cards on the six module pages under module:app (module:app-agents, module:app-documents, module:app-knowledge, module:app-graph, module:app-storage, module:app-work, module:shell-engine), page: cards on pages.md. 60 component, 60 lib, 45 op and 28 page cards today, written by hand; type:component and type:lib carry `file:`, op cards `source:` (mostly the folder `packages/web/src/app/api`, the route in `args:`), page cards `component:` (one or more files) and `route:`.

Measured against the 188 `.ts`/`.tsx` files under packages/web/src (tests excluded): 28 files have no card (13 route pages under app/[product], app/layout.tsx, app/page.tsx, app/new/page.tsx, 2 api routes, 4 components — Attachments, ConstitutionList, EditorScope, Tabs — and 2 libs — constitution.ts, retype.ts); 3 cards name a file that no longer exists (component:session-page, lib:session-page, component:search — all deleted in git, not renamed). 164 files open with a header comment; 12 api routes already carry an id-first `// op:api.x — …` comment in the grammar of decision:memory.code-source.

![[task:app.keep-in-step]]

Related: decision:memory.code-source (proposed: code comments as a second source of nodes; its spike is task:memory.code-source-spike), task:app.trace-requirements, rule:documents-tree.

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here; the plan is defined when every one is agreed._

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

One script, `scripts/cards.js`, that reads the source tree and the definition documents and compares them; a test that runs it in check mode so `npm test` fails when they drift; a write mode that brings them back in step without touching what a person wrote. The cards stay where they are (their documents, sections and ids); the generator only adds, re-points and retires.

```yaml
- id: decision:app.cards-generator
  title: One script keeps the component, lib, op and page cards in step with packages/web/src — check in npm test, write on demand
  context: >
    task:app.keep-in-step asks for the cards to be regenerated from the code whenever a file is added or renamed,
    and for a check that every file has a card and every card a file. The 193 cards were written by hand and their
    purposes are richer than the files' header comments; a generator that rewrote them would lose that text.
  choice: >
    `scripts/cards.js --check` lists every file under packages/web/src (`.ts`/`.tsx`, tests excluded) that no card
    names and every card whose file is gone, exit 1 when there is one; test/cards.js runs it under `npm test`.
    `scripts/cards.js --write` (also `npm run cards`) adds a card for every uncovered file with the file's header
    comment as its purpose (the comment lines before or right after the imports, joined; "(no header comment)"
    when there is none) and `status: proposed` so it reaches the Inbox to be placed and worded; re-points a card
    whose file moved (the same basename now lives elsewhere under packages/web/src, uniquely) to the new path;
    marks a card whose file is gone `status: retired` in place. It never edits the purpose, side or part-of of an
    existing card, and it never deletes a block.
  alternatives: >
    Regenerate every card's purpose from its header on every run — rejected, the hand-written purposes are the
    better text and would be lost. A watcher in the app on source roots — rejected for now, the knowledge is edited
    by people and agents in git; a test that fails is the step nobody can skip. Waiting for the comment pass of
    decision:memory.code-source — that decision is proposed and its spike open; this generator is the bridge, and
    since a new card's purpose is the header, moving the cards into the headers later is mechanical.
  consequences: >
    `npm test` fails after a file is added, moved or deleted under packages/web/src until `npm run cards` runs
    (or the card is written by hand); generated cards land in the Inbox as proposed; op cards gain an exact
    `source:` file where the route maps to one (a tracking field, set without review).
  date: 2026-09-20
  status: proposed
  by: agent:claude-code
  evidence: session:7a334e57e6
  affects: [module:components, module:api, module:app, task:app.keep-in-step]
  part-of: plan:plan-work-task-app-keep-step-regenerate
- id: decision:app.cards-file-kinds
  title: What a file is, by its path — page.tsx is a page card, route.ts an op, components/ a component, lib/ a lib
  context: >
    The task names component, lib and op cards, but 16 of the 28 uncovered files are Next.js route files
    (page.tsx, layout.tsx) whose home today is a page: card on pages.md with `route:` and `component:`.
  choice: >
    A file is covered when any component, lib, op or page card names it in `file:`, `source:` or `component:`, or
    when an op card's `args:` route or a page card's `route:` maps to it (`/api/<product>/x/<id>` →
    app/api/[product]/x/[id]/route.ts; `/<product>/work` → app/[product]/work/page.tsx). A new card's kind
    follows the path: app/**/page.tsx → page:web/<path> on pages.md (route derived from the path);
    app/**/layout.tsx and components/* → component: on module:components under "## Unsorted";
    app/api/**/route.ts → op: on module:api under "## Unsorted" (args from the path, methods from the exported
    handlers); lib/* → lib: on the module page that holds the most lib cards the file imports, else
    module:app-storage, under its "## Libraries" list. Ids are the slug of the file name (kebab-case, `.tsx`
    dropped); an op is `op:api.<path with dots>`.
  alternatives: >
    A component card for every route file — rejected, pages.md is where the app's screens are defined and the
    route belongs on the page card. Asking the person to place every new card — the Inbox does that after the fact.
  consequences: >
    Two "## Unsorted" sections appear on components.md and api.md and are meant to be emptied by moving cards.
  date: 2026-09-20
  status: proposed
  by: agent:claude-code
  evidence: session:7a334e57e6
  affects: [module:components, module:api, module:app-storage]
  part-of: plan:plan-work-task-app-keep-step-regenerate
- id: question:app.cards-trigger
  q: >
    Is a failing `npm test` enough of a trigger for "whenever a file is added or renamed", or should the
    generator also run from a git pre-commit hook (`node scripts/cards.js --check` before every commit) or from
    the agent contract (every session that adds a file under packages/web/src runs `npm run cards` before it ends)?
  context: >
    The task's "whenever" names a trigger; the test is the least the repo can enforce, the hook and the contract
    catch it earlier. The plan builds the test and the script; the other two are one line each once it is decided.
  status: open
  part-of: plan:plan-work-task-app-keep-step-regenerate
- id: question:app.cards-and-code-source
  q: >
    When decision:memory.code-source ships (the parser reads id-first comments in code), do the generated cards
    move into the files' headers (`// component:tabs A strip of tabs …`) and the generator retire, or do documents
    keep the cards and the header comment stays plain prose?
  context: >
    The task says the header comment is the purpose; the code-source decision says a comment whose first token is
    an id defines the node. Both cannot hold for the same file — one defining place per id — but the generator is
    built so either answer is a mechanical move.
  status: open
  part-of: plan:plan-work-task-app-keep-step-regenerate
```

The generator's own card is lib:cards on module:app-graph (the graph core and CLI page, since the script reads the documents and the tree, not the app):

![[lib:cards]]

## Tasks

_`- [ ] task:` lines, `part of plan:plan-work-task-app-keep-step-regenerate`; their check state is what is in progress._

![[task:app.keep-in-step]]

- [x] task:app.cards-script scripts/cards.js: read the cards (component, lib, op, page) from the v2 documents and the files under packages/web/src; coverage by file/source/component and by route mapping; `--check` prints the two lists and exits 1 when either is non-empty; `--json`. Part of plan:plan-work-task-app-keep-step-regenerate, part of task:app.keep-in-step. (session: 7a334e57e6)
- [x] task:app.cards-write `--write`: a new card per uncovered file (kind by path, purpose = header comment, status proposed, into the right document and section, yaml row appended inside the list region), re-point renamed files (same basename, unique), retire cards of deleted files in place; op cards' `source:` tightened to the route file. Part of plan:plan-work-task-app-keep-step-regenerate, part of task:app.keep-in-step. (session: 7a334e57e6)
- [x] task:app.cards-test test/cards.js in `npm test` (the check against the real tree) and a fixture test of the mapping and the header extraction; `npm run cards` script. Part of plan:plan-work-task-app-keep-step-regenerate, part of task:app.keep-in-step. (session: 7a334e57e6)
- [x] task:app.cards-run Run `--write` once: 28 new cards, 3 retired, op sources tightened; ctx check green; lib:cards card; commit. Part of plan:plan-work-task-app-keep-step-regenerate, part of task:app.keep-in-step. (session: 7a334e57e6)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
