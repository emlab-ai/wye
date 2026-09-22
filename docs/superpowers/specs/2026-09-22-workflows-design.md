# Workflows — design

2026-09-22. A **workflow** is an ordered, gated pipeline a person runs on any node or document: an idea becomes
research, a PRD, a tech design and a test design, a plan, and dispatched work — each stage done by a session
following a skill, each ending at the person's Advance. Decisions with alex: a workflow *is* a skill with stages
(part of the skill system, not a second registry); any document can be the starting point; the person advances,
`gate: auto` opts a stage out; a requirement's links to its decisions and tests are written by the stage's skill,
enforced by the stage's exit criterion and shown as a coverage matrix.

Three deliverables: **W1** — the machinery (types, engine, run card, the surfaces, CLI/API); **W2** — the pipeline
above shipped as configuration (five skills, `workflow:feature`, the coverage view); **W3** — the `dispatch` action
and the last stage.

Everything a stage writes is *proposed* and goes through the Inbox, exactly as a hook's work does. The engine starts
no agent the person did not ask for: a content stage's default gate is the person's.

## 1. The types

### `type:workflow extends type:skill`

A document `workflow-<slug>.md` under the project's existing **Skills** page, `node: workflow:<slug>`. It inherits
what `type:skill` already gives — a document you edit in the app, `role`, `wye skills`, attachment — and adds stages.
The body is the prose a person reads; the stages are cards in it. `takes:` says which kinds it may be started on
(`*`, or a comma-separated list of kinds); `status: active | paused`.

A skill's body is text a session follows. A workflow's stages are executed by the app and are **never** pasted into a
session's prompt — otherwise one agent would do all five stages in one pass, which is the thing this replaces. A
skill document that declares `stages:` is a workflow; that is the whole distinction.

```yaml
props:
  stages: list of stage                # in document order
  takes: string?                       # `*` or kinds: module, req, goal, …
  status: active | paused
```

### `type:stage extends type:node`

A card inside the workflow document. Its `do:` lines are the **same action vocabulary as a hook's**, so the product
has one action language and one runner.

```yaml
- id: stage:feature.prd
  title: Write the PRD
  do: task "Write the PRD for {{title}} in {{prd}}" --worker agent --skill skill:prd
  produces: prd                       # template names, comma-separated
  until: every req in prd is agreed, no open question in prd
  gate: person                        # person (default) | auto
  worker: agent                       # optional: overrides the worker of this stage's tasks
  skills: [skill:house-style]          # optional: extra skills for the sessions this stage starts
```

- `do:` — zero or more actions, one per line (`do-2:`, a `-` list and a `|` block all work, as for hooks). A stage
  with no actions is a pure review stop.
- `produces:` — template names from `templates/docs/`. Each produced document is created **only when absent**,
  `part-of` the run's target, and bound to the name for `{{prd}}` / `until` to resolve.
- `until:` — the exit criterion, §2. Default: `session done` when the stage starts sessions, else `manual`.
- `gate:` — `person` (the run waits at `waiting` until Advance) or `auto` (advances itself when ready). `auto: true`
  is accepted as sugar for `gate: auto`.

### `type:run extends type:node`

The state of one run — never on the target, so an arbitrary document is not polluted with stage properties and the
same document can be run twice. A card in the project's **Workflow runs** document (`workflow-runs.md`,
`module:<project>-workflow-runs`, a system folder in the rail; `runs.md` is taken by eval runs in this repo's own
evaluation project, hence the name). The card's content blocks are the log — one line per entry, readiness, advance,
reopen, skip, block — so the history is markdown like everything else.

```yaml
- id: run:feature-3
  workflow: workflow:feature
  on: module:command-box-history       # the node or document it was started from
  stage: stage:feature.design          # where it is now
  status: running                      # running | waiting | blocked | done | cancelled
  produced: [module:cbh-research, module:cbh-prd]
  sessions: [6fdfc7ab9d, 53f99bfd98]
  started: 2026-09-22
```

`status`: `running` (a stage's work is out), `waiting` (ready, the person's Advance is what is missing), `blocked`
(a session failed, or the target is gone), `done`, `cancelled`.

## 2. `until:` — a closed set of predicates

Comma-separated; all must hold. Free text is not accepted: an exit criterion only a human can read cannot gate
anything, and `wye check` must be able to tell you a stage's `until` does not parse *before* you run it.

| predicate | holds when |
|---|---|
| `session done` | every session this stage entry started ended `done` (a failed one blocks the run instead) |
| `<doc> exists` | the named produced document exists and has a body beyond its template |
| `every req in <doc> is agreed` | every `req:` defined in that document has a status in `AGREED` (`pr-doc.ts#AGREED`) |
| `every req in <doc> has <verb>` | every `req:` there carries at least one edge of that verb on its own side **whose other end resolves to a defined node** — the generated inverse is what counts (`decision:d satisfies req:y` is read as `satisfied-by` on the requirement), and a dangling `satisfies req:x` never counts as coverage |
| `every req in <doc> has a task` | every `req:` there is the `part-of` target of at least one task |
| `no open question in <doc>` | no `question:` defined there whose status is outside answered / resolved / dismissed |
| `no open contradiction` | no open contradiction touches a node defined in the run's produced documents |
| `every task in <doc> is done` | every task line there has status `done` |
| `every task in <doc> is ready` | every task line there carries `#ready` or a worker |
| `check passes` | the project's lint (`lib/graph` in-process, as `wye check`) reports no errors |
| `manual` | nothing is computed; the gate is the whole criterion |

`<doc>` resolves against the run's `produced` bindings first (`prd`, `research`, `dev-design`, `test-design`, `plan`),
then as a document slug. Each predicate evaluates to `{ ok, label, blocking: string[] }`, rendered as one readiness
row naming the ids that hold it back — the shape `pr-doc.ts#readiness` already established for a PR.

These predicates live in the **workflow**, not in `wye check`'s global shapes: a product that does not run this
workflow must not start failing its build because someone shipped a stricter idea of traceability.

## 3. The engine — `lib/runs.ts` (pure) + `lib/runs-run.ts` (IO)

The same split as `hooks.ts` / `hooks-run.ts`. Pure: parsing a workflow's stages, the predicate parser and evaluator
against a graph, the next stage, the log lines, the depth rule. IO: starting a run, entering a stage, writing the
card, running the actions, advancing.

**Start** — `startRun(product, workflow, target, { again })`: refuses when the workflow is paused, when `takes:` does
not admit the target's kind, or when a live run already exists for that (workflow, target) and `again` is not set.
Writes the `run:` card (creating `workflow-runs.md` when missing, as `ensureSkillsPage` does), then enters the first
stage.

**Enter a stage** — `enterStage(run, stage)`:

1. For each `produces:` name, create the document from `templates/docs/<name>.md` through `templates.ts#instantiate`,
   `part-of` the target — so research, PRD, designs and plan appear as children of the idea in the document tree —
   and bind the name to the created (or existing) node id. Never overwrites.
2. Run the `do:` lines through the **existing** action runner, with the run as the actor and the target as the node.
   Template vars are `templateVars(target)` plus one per produced binding, so `task "… in {{prd}}"` lands the agent in
   the right document.
3. Record it as a firing in the existing `<product>/_hooks/<id>.json` store: `Firing.by = { hook?, run?, stage? }`
   (the current `hook` field stays, so old records and `firedSet`'s `once` bookkeeping are untouched). One store, and
   the Hooks page's "what fired" keeps working.

**Compute readiness** — `readinessOf(run, graph)`, pure, evaluated on demand: by the run strip, the runs view, the
CLI and the API. It is **never written to the run card**: a derived value in markdown would be rewritten on every
rebuild, and every rewrite is another rebuild. What the card holds is only the state that changed — `stage`, `status`,
`produced`, `sessions` and the log — written when it actually moves.

On every rebuild the watcher's `onBuilt` (which already runs the change pipeline) evaluates each live run's current
stage and acts only on a transition: all green and `gate: person` → `status: waiting` (written once; the strip offers
Advance), all green and `gate: auto` → advance at once, a stage no longer green after an edit → back to `running`.

**Advance** — `advance(run, { by })`, from the person's click, the CLI or an auto gate: log the stage done (who, when,
which predicates were green), move to the next stage, enter it. Past the last stage → `done`, `finished` set.

Also `reopen(run, stage)` (back to a stage — the move you make when you want to iterate the PRD and re-run design;
both passes stay in the log), `skip(run, reason)` (advance without readiness, recorded as an override, never silent),
`retry(run)` (re-enter the current stage after a failure), `cancel(run)`.

**A run reads its workflow fresh when it enters a stage.** Edit a stage you have not reached and the run picks it up;
edit one it has passed and nothing retro-applies. No versioning, no migration of live runs.

### Guards

- A stage's actions run once per entry — a `run|stage` busy key in the module state, as `hooks-run` does for
  `hook|node` — so a burst of rebuilds cannot start two sessions for one stage.
- Consecutive `auto` advances count against the shared `MAX_DEPTH` (3): an all-auto workflow stops and waits rather
  than running away.
- A session started by a stage that ends `failed` puts the run in `blocked` with the reason on the card. Retry, Skip
  or Cancel are the person's.
- A deleted or unresolvable target blocks the run; it never throws in the watcher.
- Automation off (Settings › Agents, `WF_HOOKS=0`): entering a stage still writes its tasks but assigns no worker —
  the pipeline degrades to a to-do list instead of dying.
- Concurrent writes need nothing new (`claimWrite`, the file locks, hash-checked `wye doc write`), but the shipped
  skills must write **by section** (`--section`), which §6 makes a requirement on them.

## 4. Actions

Unchanged from hooks — `task`, `run skill:<id>`, `add <template>`, `assign`, `notify` — with two additions to the
shared vocabulary, so hooks gain them too:

- `run workflow:<id>` — starts a run on the node instead of a session. One clause in `hooks.ts#parseAction`.
- `dispatch <doc> [--workers N]` — assigns that document's ready, unheld tasks through `work-io.ts#assignTask`,
  within the runner slots of Settings › Agents (`agentSettings`), oldest first; the rest stay `#ready` so the existing
  runner can also take them.

`runAction` is generalised from `HookDef` to `Actor = { id, title, skills }` — the only refactor the existing engine
needs.

## 5. Surfaces

- **⌘P, a third mode.** `PR | Ad-hoc | Workflow` (`wf-cmd-mode`, `decision:wf2.cmd-modes`): a picker of the product's
  workflows filtered by `takes:` against what you are looking at, target prefilled from `here()` (the node under the
  cursor, else the document), Enter starts the run. With text typed and **no** target, the box first creates the
  document (`templates/docs/blank.md`, title from the first line, in the project) and runs on that — so "I had an
  idea" and "start from this document" are one mechanism.
- **A Workflows section in any node's column**, beside `HooksSection` and built the same way: the workflows whose
  `takes:` admits this node's kind, each with Run, and the stepper inline when a run is live on it.
- **The run strip** on the document the run started from, in the shape of `PrHead`: `Feature · stage 3 of 5 · Design ·
  2 of 3 ready`, the readiness rows underneath naming what blocks them, and Advance / Reopen / Skip / Cancel.
- **`workflow-runs.md`** per project — `<!-- view:run -->`, every run with workflow, target, stage, status. The rail
  shows live runs with a stages-done hairline bar, the treatment `task:plan-progress` gave request rows.
- **CLI**: `wye workflow list|show <id>|run <id> --on <node> [--again]`, `wye run list|show <id>|advance|reopen
  [--stage s]|skip|retry|cancel <id>`. `wye workflows` aliases the list.
- **API**: `/api/<product>/workflows` (GET the workflows; POST `{ workflow, on, again }` starts a run) and
  `/api/<product>/runs` (GET runs with readiness; POST `{ run, action }`), mirroring `/api/<product>/hooks` so the
  agent-side door is the one agents already know.

## 6. The shipped pipeline (W2)

Five skills join `BASE_SKILLS` — written into a product's Skills page on first open, the `prompts/*.md` file as the
fallback — and one workflow, written by `ensureBaseWorkflows` beside `ensureBaseSkills`. All of it is data the person
edits.

| stage | skill (role) | produces | `until` | gate |
|---|---|---|---|---|
| Research | `skill:research` (worker — the product's repo, reads the code and the graph) | `research` *(new template)* | `session done` | person |
| PRD | `skill:prd` (librarian) | `prd` | `every req in prd is agreed, no open question in prd` | person |
| Design | `skill:tech-design` + `skill:test-design` (librarian, parallel `do:` lines) | `dev-design`, `test-design` | `every req in prd has satisfied-by, every req in prd has verified-by, no open contradiction` | person |
| Plan | `skill:plan` (librarian) | `plan` | `every req in prd has a task, every task in plan is ready` | person |
| Dispatch | — (`dispatch {{plan}}`, the slots from Settings) | — | `every task in plan is done` | auto |

`skill:test-design` composes the existing `skill:define-tests` through the one-level `skills:` composition
`type:skill` already has, rather than duplicating its prompt.

**What every one of these skills is required to do**, stated in its body and relied on by the predicates above:

- Write **by section** (`wye doc write <doc> --section <S>`), never whole documents, so a person editing the same page
  is not clobbered.
- Write the traceability verb on the block it creates: a decision or operation `satisfies req:x`; a test `verifies
  req:x`; a task `part-of req:x`. The parser already generates the inverse (`satisfied-by`, `verified-by`), so
  traceability needs **no new edge machinery** — only that the verb is written, and something to notice when it was
  not. That something is the stage's `until`.
- Never invent an id that does not resolve; raise what is undecided as a `question:` card rather than prose.
- Leave everything `proposed`.

**The coverage view** — `<!-- view:coverage for=prd -->`, a new view block over the same edges: a row per requirement
with what satisfies it, what verifies it, the tasks on it and its status, gaps marked. Clicking a gap opens ⌘P
prefilled ("define tests for req:x"), so filling a hole is a keystroke rather than a hunt. This is what a person looks
at while deciding whether to Advance.

**What the machinery cannot catch**, recorded here rather than designed around: an agent that writes four requirements
where forty were needed produces a perfectly green Design stage. No predicate sees it. The person's gate is the only
defence — the honest reason every content stage defaults to `gate: person`.

## 7. Decisions to record

`decision:wf2.workflow-is-a-skill` (a workflow is a skill with stages; no second registry),
`decision:wf2.run-holds-the-state` (state on a `run:` card, not on the target),
`decision:wf2.until-is-closed` (a closed predicate set, checkable before it runs),
`decision:wf2.gate-is-the-persons` (the person advances; `auto` is opt-in per stage),
`decision:wf2.traceability-is-the-verb` (the skill writes the verb, the inverse is generated, the stage's criterion
enforces it — no derivation, no guessing).

## Testing

node/vitest over the pure half: parsing a workflow's stages and refusing a malformed `until`; every predicate against
a fixture graph, including the dangling-target case; next stage, the advance/reopen/skip log lines; the auto-advance
depth cap; `parseAction` for `run workflow:` and `dispatch`. Live, on a fresh scratch product with the watcher armed
(a new scratch slug per run, `watch.ts` VERSION bumped, `/events` re-armed — otherwise nothing fires): ⌘P → Workflow →
an idea becomes a research document with a session on it; a stage whose `until` is unmet shows its blocking ids and
refuses to advance; Reopen re-enters and the log keeps both passes.

## Out of scope

Branching or conditional stages (the list is linear; several `do:` lines in one stage is the only parallelism).
Nested workflows. Cron or scheduling. Cross-product runs. Versioning or migration of live runs. A visual builder —
the cards are the builder.
