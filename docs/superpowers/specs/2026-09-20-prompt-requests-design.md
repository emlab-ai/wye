# Prompt Requests — design

2026-09-20. A Prompt Request (PR) replaces the plan document: the one page where a request is refined until it is clear and agreed, approved by the person, and then built by an agent the app runs — several PRs at once when their scopes do not overlap.

## Why

The plan document already is one page per request (Request / Context / Definition / Plan / Tasks / Result) with a lifecycle `proposed → defining → defined → building → done` where *defined* is computed and **Build** hands the request task to a worker. What is missing: an explicit approval by the person, a scheduler that builds approved requests on its own, a notion of a request's scope so two requests can run in parallel when they do not touch the same knowledge, and a command box that says plainly "just talk" versus "make a request". Rather than bolt these onto "plan", the concept is renamed to what it is — a Prompt Request — and sharpened once.

Decisions taken with alex on 2026-09-20: the PR **is** the plan renamed (one concept, existing plans migrated); the **person approves** and the app says what is unagreed (approving anyway is allowed); the **app spawns the agents** itself up to N (external `wye runner` processes are extra slots); **scope = Definition blocks + their impact set**; **⌘P** has two modes — ad-hoc (a conversation, no document) and PR (draft + a refining session).

Two deliverables, one spec: **D1** the PR concept (rename, lifecycle, approval, readiness, ⌘P modes, migration); **D2** the scheduler (scope, overlap, `parallel runners` in Settings, the dispatcher). D1 is complete and useful on its own — Build keeps working by hand until D2 lands.

## 1. The PR document (D1)

- Type `type:pr`, node `pr:<slug>`, file `<project>/docs/pr-<slug>.md` (the slug rule of `planSlug`, prefix `pr-`), a sub-page of the project's **Requests** page (`prs.md`, `module:<project>-prs`, `ensurePrsPage` — the Plans page renamed; the rail shows it as the system folder "PRs").
- Frontmatter (template `templates/docs/pr.md`): `node`, `type: pr`, `title`, `status`, `owner`, `session`, `agent`, `started`, `task`, `part-of`; new: `approved-by`, `approved-at` (set by Approve), `scope` (D2, the computed ids as a list), `finished`.
- Sections: **Request** (verbatim, with where it came from), **Context** (what it touches — tags and embeds), **Definition** (the new and changed blocks, defined in their home documents and embedded here, exactly as today), **Impact** (new — D2 fills it: the ids the impact graph reaches from the Definition, the judge's verdict where one ran, and the PRs that overlap), **Tasks** (`- [ ] task:` lines, `part of pr:<slug>`), **Result** (written by the app when the build ends). The "Plan" section goes: what it held (understood / questions / decisions) lives under Definition (blocks) and Context (prose).
- Statuses (`PR_STATUSES` replacing `PLAN_STATUSES`): `draft` — created, nobody on it; `refining` — a librarian session is on it (set when the session starts, back to `draft` when it ends without approval); `approved` — the person approved, waiting for a slot; `building` — a worker session runs; `done` | `failed` | `cancelled`. (`queued` from the chat design folds into `approved`: an approved PR *is* the queue, in order of `approved-at`.)
- **Readiness** is computed, never a status (`readiness(scope, md)` in `pr-doc.ts`, extending `definitionState`): `definition` (≥ 1 block), `agreed` (every Definition block approved/resolved/…, `AGREED`), `impact` (D2: the scope was computed after the last Definition change; D1: always true), `contradictions` (no open contradiction touches a Definition block), `tasks` (≥ 1 task line). Shown as a checklist on the PR head (`PrHead` component, replacing the plan part of `DocProps`), green when all hold.

## 2. ⌘P (D1)

- The box keeps its target row (new / an open conversation / runner) and gets a **mode** row replacing the intent chips: **Ad-hoc** — "a conversation on what you are looking at; nothing is written unless you ask" — and **PR** (default) — "a request: a page, refined until clear, approved, then built". Remembered per browser (`wf-cmd-mode`).
- Ad-hoc → `POST /api/<p>/sessions { mode: 'chat', pr: false }`: a chat session on the chosen agent, no PR document (`createPrDoc` skipped, `s.prDoc` unset), the first message carries the subject (Context: the document and the node under the cursor) and the constraint packet as today; its block changes are still artifacts and consolidation still runs on it.
- PR → `POST /api/<p>/sessions { role: 'librarian', pr: true }`: the app creates the PR document (`draft`), sets it `refining`, starts the librarian session (chat, `cwd` the Wye repo, as "Ask Wye" does today) with the refining brief, and navigates the person to the PR page (the conversation in the context column). The librarian's brief (`refiningNote`, replacing `librarianPlanNote` + `librarianProtocol`): fill Context; propose the Definition blocks in their home documents with `wye propose --pr <ref>`; record edits of existing nodes as change records; ask at most three questions at a time, on the PR (question blocks); say plainly when the request is already satisfied or contradicts a constraint; stop when readiness is green and say so in one line — **never build, never approve** (`decision:exec.librarian-may-build` is withdrawn: approval is the person's click, the build is the dispatcher's).
- "Send to agent" from a block, the ⇢ agent button, the Ask Wye buttons: all open the box with the subject prefilled; the mode decides what happens. The "plan first" tick, the Task/Plan/Proposal chips and `wye plan build`'s "Plan & build" path go away.
- A message into an existing conversation is unchanged.

## 3. Approval (D1)

- `PrHead` shows the readiness checklist and **Approve** / **Cancel**. Approve → `PATCH /api/<p>/pr { ref, action: 'approve' }`: when readiness is not green the button shows the unagreed items and asks once ("Approve anyway? n blocks are still proposed, k contradictions open"); on yes the frontmatter gets `status: approved`, `approved-by: <me>`, `approved-at`; a live refining session on the PR gets one message ("approved — stop here") and is stopped. Cancel → `cancelled`, the refining session stopped the same way. Both also appear on the PRs list rows.
- Until D2, an approved PR is built the way Build works today: the head shows **Build** (worker choice) on an approved PR — `assignTask(... build: ref)` unchanged. D2 replaces the button with the dispatcher and keeps it as "Build now" for a manual override.
- `wye pr <ref> [--status …]` and `wye pr approve <ref>` do the same from the CLI (the librarian never calls approve; the person may).

## 4. Migration and rename (D1)

- Everything named plan becomes pr: `lib/plan-doc.ts` → `pr-doc.ts` (`prSlug`, `prTitle`, `prDocBody`, `requestTaskId`, `resultSection`, `withResult`, `prStatusOnEnd`, `prsOf`, `definitionIds`, `withDefinition`, `definitionState`, `readiness`), `plan-docs.ts` → `pr-docs.ts` (`ensurePrsPage`, `createPrDoc`, `finishPrDoc`, `adoptPrDoc`, `closePrDoc`, `readPrDoc`, `embedInDefinition`, `prDefinition`, `refreshPrStatuses`, `trackDefinitions`, `definitionContext`), `Session.planDoc` → `prDoc` (with `planDoc` read as a fallback for stored sessions), `SessionPlan` → `SessionPr`, `PlanFolder` → `PrFolder` (groups: refining · approved · building · done), `PlanList` → `PrList`, `op:api.plan` → `op:api.pr`, `wye plan` → `wye pr` (`plan` kept as an alias printing a deprecation line), `prompts/*` and `agent-host` notes (`prDocNote`, `refiningNote`), `templates/docs/plan-request.md` → `pr.md`, `PLAN_STATUSES` → `PR_STATUSES`, `type:plan` → `type:pr` in the base ontology, `lib/graph.js` / `lib/impact.js` `NOT_THROUGH` and `lib/parse.js` page rules, `WorkGroupBy 'plan'` → `'pr'`, `ContextCard` kinds.
- One-off `scripts/plans-to-prs.js`: for every product, every document with `type: plan` — rename the file `plan-x.md` → `pr-x.md`, `node: plan:x` → `pr:x`, `type: pr`, status mapped (`proposed`, `defining`, `defined` → `refining` when a live session holds it else `draft`; `building`, `done`, `cancelled`, `failed` unchanged), `part-of: module:<p>-plans` → `module:<p>-prs`, the Plans page file `plans.md` → `prs.md` with its node and title; every reference `plan:x` in every document of the product → `pr:x` and `part of plan:x` → `part of pr:x`; every stored session's `planDoc` → `prDoc` with the new slug. Run once on the wye product and committed as one change; `ctx check` green before and after.

## 5. Scope and overlap (D2)

- `scopeOf(graph, md)` in `pr-scope.ts` (pure): the Definition ids ∪ the ids tagged in the Request section ∪ for each of those the structural impact candidates from `lib/impact.js` `structuralCandidates(g, id, { hops: 2, min: 0.5 })` — deduplicated, `module:` / `pr:` / `session:` / `block:` ids left out. Written to the frontmatter `scope:` and to the **Impact** section as a card list (`impact` embed lines are not needed: a tag list with the weight and path in prose) whenever the Definition changes (`trackDefinitions` already runs on every change record; it recomputes the scope of the PRs it touched) and on `wye pr scope <ref>`.
- `overlap(a, b)` = `a.scope ∩ b.scope`; `conflicts(pr, others)` lists the other PRs (approved or building) with a non-empty intersection and the shared ids. The PRs list shows "overlaps pr:y (3 ids)" on a row; the Impact section of a PR lists them too.

## 6. Settings and the dispatcher (D2)

- Settings page, section **Agents**: `parallel runners` (N, default 1, 1–8) and `default agent` for builds (claude-code / codex). Stored in `data/_settings.json` (`agents: { parallel, agent }`).
- `lib/dispatch.ts` on the host (registered once like consolidation's `onSessionEnd`; a tick every 15 s, plus `notifyDispatch(productDir)` from approve, session end and runner heartbeat): for each product, `building` = PRs with a live worker session (the session's `prDoc` and `liveState`), `slots = N − building.length` (external runners that are online and idle add one slot each); pick approved PRs by `approved-at` whose scope does not overlap any building PR's scope; for each up to `slots`: start a worker session — `createSession` (agent from Settings, `mode: 'run'`, `cwd` the product's `repo`, `prDoc` set, `task` the request task) and `startChat` with the build instruction as `assignTask(... build)` composes it today (Definition text, change records before/after, constraint packet) — set the PR `building`, log "started by the dispatcher (slot k of N)". If the next approved PR overlaps, it stays approved with a `waiting: overlaps pr:x` line on the row and the dispatcher looks at the ones behind it (no head-of-line blocking).
- `wye work next` / `nextForRunner` apply the same check: an external runner is only handed a PR whose scope is free, and taking it counts as building.
- End of a build: `onSessionEnd` → `finishPrDoc` writes Result, the PR goes `done` / `failed` / `cancelled` as today, the slot frees, `notifyDispatch`. A failed PR does not restart by itself; the row shows Retry (→ `approved` again).
- The Agents page (sessions) shows the dispatcher's state at the top: N, slots in use, what is waiting and why.

## 7. Testing

- vitest: `pr-doc.test.ts` (renamed plan-doc tests + readiness), `pr-scope.test.ts` (scope from a small graph, overlap, conflicts), `dispatch.test.ts` (the pure decision `pickNext(approved, building, slots)` — order, overlap, no head-of-line blocking), `settings.test.ts` (agents section), the command box's request shape, `plans-to-prs` on a scratch copy (ids, references, sessions, statuses, `ctx check` green).
- UI test on a scratch product (playwright-core against the dev server, as `ui-test:*`): ⌘P in PR mode creates `pr-…` and opens it with a refining session in the column; Approve with an unagreed block asks once and sets `approved`; two approved PRs with disjoint scopes both go `building` with N=2; two overlapping ones go one after the other.

## Out of scope

- A review flow for a PR's code changes (pull requests in git) — a PR here is a request, not a diff.
- Automatic approval; per-PR agent choice beyond the Settings default (a "Build now" override keeps the worker choice).
- Cross-product scheduling: N is per app, the overlap check is per product.
