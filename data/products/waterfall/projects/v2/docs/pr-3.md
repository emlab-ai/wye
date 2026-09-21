---
node: pr:3
type: pr
title: Work-in-progress visibility — a Plans folder, a plan per request, all work items on the Agents page
status: done
owner: unassigned
last-verified: 2026-09-18
session: 07aa6645ad
agent: claude-code
started: 2026-09-18T12:21:39Z
part-of: module:v2-prs
finished: 2026-09-18T12:46:43.506Z
order: 50
---

# Work-in-progress visibility — a Plans folder, a plan per request, all work items on the Agents page

## Request

> need to improve work in progress visibility, again make new node type - plan, when new work is planned add new plan document to Plans folder, attach session id to the plan, add all tasks there to show what is in progress, add result too, all the produced blosks
>
> 2. one agent can work on multiple plans (not at the same time), so all completed work need to be tracked and visible in the agents view, show all work items there (not a single page link)
>
> agent is a worker, it operate on tasks/plans etc

_from: the command box, a fresh message on this conversation_

## Context

Most of this exists uncommitted in the working tree — session 672f4fdf3d built it and was stopped before it
committed: type:pr (extends type:module) on the ontology page; lib:pr-doc (pure: slug, body from
`templates/docs/pr.md`, result section; 8 tests pass) and `lib/plan-docs.ts` (create at session start,
finish on the end hook in lib:sessions); the session record's `planDoc`; the "plan ↗" link on the Agents rows and
the session head; `/sessions/<id>` redirecting to the plan. rule:pr-doc and req:wf2.sessions.plan-doc describe
it; question:wf2.plan-doc-parent asked whether the parent is the source document or one Plans page — this request
answers it. Two plan documents exist (this session's earlier one and session c2bbac979d's), both under
module:wf2-plan.

What is wrong with it against this request:

- one plan per session: a fresh request on the same conversation (this message) got none, and `planDoc` is a
  single pointer — earlier plans of a worker fall out of the session record;
- the plan is parented on the document the request was made on, not on a Plans folder;
- the Result section is appended on every end — plan-pannel-text-input-bottom-bar-top carries the same result
  three times (done → context cleared → running → done again re-fires the hook);
- "blocks this session touched" is the whole session's artifacts, not the plan's: it lists page-node and
  first-message blocks from other sessions, because lib:artifacts credits every running session with every block
  change on disk (`creditBlockChanges`);
- the Agents row is one "plan ↗" button; nothing says which plans a worker did, which is running, how many
  tasks are done.

Code: `packages/web/src/lib/pr-doc.ts`, `plan-docs.ts`, `sessions.ts` (end hook), `agent-host.ts`
(`restartFresh`, `planFirst`, `buildPrompt`), `app/api/[product]/sessions/route.ts` (GET / POST),
`components/SessionList.tsx` (component:session-list), `SessionView.tsx` (component:session-view),
`DocProps.tsx` (component:doc-props), `templates/docs/pr.md`, ontology `type:pr`.

![[type:pr]]

![[rule:pr-doc]]

## Plan

**A plan is the unit of work; a session is the worker's conversation.** Every request that starts work — a new
session, and every fresh-context message on an existing one — gets a plan document, whether or not "plan first"
is ticked (the tick keeps meaning only "propose before building"). A follow-up message without a context clear
continues the current plan. So a worker's history is its list of plans, in order; the current one is what it is
on now.

**One Plans page per project** (`plans.md`, module:<project>-plans, created by the app when the first plan is
made; this page is the first) is the parent of every plan document in the tree, with a live view of type:pr on
it. Where the request came from stays as tags under Request. The two existing plan documents move under it.

**The plan card** (type:pr) declares `session`, `agent`, `started`, `finished`; the page header shows the
session as a link that opens the conversation. `status` runs proposed → done / failed / cancelled (an unfinished
plan is finished as cancelled when a fresh request replaces it or the session is cancelled); building on Proceed
stays question:wf2.plan-doc-status-building.

**Tasks and result.** Tasks are the `- [ ] task:` lines the agent writes under Tasks, `part of plan:<slug>`; their
check state is live, so the page shows what is in progress. The app owns the Result section: it is rewritten,
not appended, each time the plan ends, with the summary and the blocks credited to the session between the
plan's `started` and `finished` (the plan's own node and the Plans page left out), and a count of paragraphs with
a link to the changes page.

**The Agents page shows the work.** The sessions API answers each session with its `plans` read from the graph
(plan nodes whose `session` is the id, oldest first: ref, title, status, started, finished, tasks done / total)
— the documents are the source, the session record keeps only the current `planDoc`. A row lists them under the
request line — a status pill, the title as a link to the plan page, "3/4 tasks", when — with the current one
marked; the "plan ↗" button goes. The session head in the context column shows the current plan and the count of
earlier ones the same way.

Not in this plan: crediting every running session with every block change (lib:artifacts) stays as it is — a
task below records the fix to make.

```yaml
- id: decision:wf2.plans-folder
  title: Every plan document is a sub-page of one Plans page per project
  affects: [req:wf2.sessions.plan-doc, rule:pr-doc, lib:pr-doc]
  status: proposed
  date: 2026-09-18
```

  The app creates `plans.md` (module:<project>-plans, title Plans, a view of type:pr) in the project when the first plan is made, and every plan document is `part-of` it. The source document, node and refs stay as tags under the plan's Request. The two plan documents that exist move under it.

  **Context** — question:wf2.plan-doc-parent asked whether a plan sits under the document the request was made on or under one Plans page. The request asks for a Plans folder: one place where all work, in progress and done, is found.

  **Alternatives** — Under the source document — a module's plans sit with the module, but nothing lists all work; a docs/plans/ subfolder on disk — the document routes and the watcher are flat, and a page as folder is what the tree already does.

  **Consequences** — resolves question:wf2.plan-doc-parent; req:wf2.sessions.plan-doc and rule:pr-doc say "under the project's Plans page"; lib:pr-doc's parent lookup changes.

```yaml
- id: decision:wf2.plan-per-request
  title: A plan document for every request that starts work; a worker's history is its list of plans
  affects: [rule:pr-doc, req:wf2.sessions.plan-doc, lib:agent-host, op:api.sessions]
  status: proposed
  date: 2026-09-18
```

  Every new session and every fresh-context message creates a plan document, whatever the plan-first tick; the tick only adds the propose-before-building protocol. A plain follow-up message continues the current plan. A plan left unfinished when a fresh request comes is finished as cancelled. The session record keeps the current `planDoc`; the list of a worker's plans is read from the graph (plan nodes with `session: <id>`), so a plan made by hand or moved counts too.

  **Context** — A session is the conversation with one worker; the person clears its context and sends new work on it (rule:clean-slate). With one `planDoc` per session created only when "plan first" is on, a fresh request without the tick gets no plan and an earlier plan is forgotten by the record.

  **Alternatives** — Only plan-first requests get a plan — quick requests leave no trace of what a worker did; keep `plans[]` on the session record — a second copy of what the documents say.

  **Consequences** — a probe request also leaves a plan page (small, cancelled or done); the sessions API joins the graph; rule:pr-doc, req:wf2.sessions.plan-doc change; the first message always names the plan document.

```yaml
- id: decision:wf2.plan-result-owned-by-app
  title: The app owns a plan's Result section and scopes the blocks to the plan's time window
  affects: [req:wf2.sessions.plan-result, lib:pr-doc, type:pr]
  status: proposed
  date: 2026-09-18
```

  Result is rewritten each time the plan ends: the summary, the blocks credited to the session with `at` between the plan's `started` and `finished`, a paragraph count. Notes the person wants to keep go under Plan, not Result.

  **Context** — The Result was appended on every end, so a session that ended, was restarted and ended again carries the result three times; and it listed every block credited to the session, which for a long-lived worker is other plans' work too.

  **Alternatives** — keep appending and de-duplicate by text — fragile; a Result per end — noise.

  **Consequences** — req:wf2.sessions.plan-result's "appends below" clause goes; type:pr gets `started`; the plan's blocks are still only as exact as lib:artifacts' crediting (see task:artifacts-credit-by-session).

## Tasks

- [x] task:plans-folder lib/plan-docs: `ensurePlansPage(project)` writes `plans.md` (module:<project>-plans, title Plans, `<!-- view:plan -->`) when missing; createPlanDoc parents every plan on it; the template's frontmatter gains `started:`; the two existing plan documents move under module:v2-prs. Part of pr:3, part of decision:wf2.plans-folder. (session: 07aa6645ad)
- [x] task:plan-per-request createSession (chat and queue) and restartFresh create a plan document for every request, plan-first ticked or not; a plan left unfinished is finished as cancelled when a fresh request replaces it; buildPrompt always names the plan document (the plan-first protocol adds its steps on top). Part of pr:3, part of decision:wf2.plan-per-request. (session: 07aa6645ad)
- [x] task:plan-result-owned lib/plan-doc: `withResult` replaces the section; `resultSection` takes the plan's window and leaves out the plan's own node and the Plans page; finishing twice yields one Result; the two existing plan documents are cleaned. Tests in plan-doc.test.ts. Part of pr:3, part of decision:wf2.plan-result-owned-by-app. (session: 07aa6645ad)
- [x] task:plans-in-agents-view GET /api/<product>/sessions joins the graph: `plans` per session (ref, node, title, status, started, finished, tasks done/total) from plan nodes with `session: <id>`; component:session-list renders the work list under each row with the current plan marked and drops "plan ↗"; component:session-view shows the current plan and the earlier count. Part of pr:3, part of decision:wf2.plan-per-request. (session: 07aa6645ad)
- [x] task:plan-type-props type:pr declares `session`, `agent`, `started`, `finished`; component:doc-props shows `session` as a link that opens the conversation. Closes task:plan-type-agent-prop. Part of pr:3. (session: 07aa6645ad)
- [x] task:plans-ui-test ui-test:plans in Chrome (playwright-core): a fresh request on a live conversation makes a second plan under Plans; the Agents row lists both with the first done and the second running; `wf session done` writes one Result with only this plan's blocks; ending twice keeps one Result. Part of pr:3. (session: 07aa6645ad)
- [x] task:plans-knowledge After shipping: rule:pr-doc, req:wf2.sessions.plan-doc and req:wf2.sessions.plan-result refined and shipped; question:wf2.plan-doc-parent resolved; session 672f4fdf3d's tasks (plan-doc-lib, plan-doc-create, plan-first-prompt, plan-doc-result, plan-doc-links, session-page-retire) set done where the code is in; commit. Part of pr:3. (session: 07aa6645ad)
- [ ] task:artifacts-credit-by-session lib:artifacts credits every running session with every block change on disk, so two workers at once (or a plan's window) get each other's blocks; credit by the writer instead (x-wf-session on API writes; for disk writes, the session whose process's cwd and agent match, else all running). Part of module:app-agents, follows decision:wf2.plan-result-owned-by-app.

## Result

Work in progress is visible as plans. Every request that starts work — a new session (chat or queued) or a fresh-context message — gets a plan document plan-<slug> under the project's Plans page (plans.md, created by the app; the tree shows them there, the page carries a live view of type:pr), with session, agent, started in its card; the agent's first message always names it and says where tasks, questions and decisions go; the session's tasks are its `- [ ] task:` lines, ticked as work goes; when the session ends the app writes one Result (the summary and the blocks produced inside the plan's window) and sets status/finished — ending twice no longer appends (this session's earlier plan carried its result three times). One worker, many plans: the Agents rows list every plan of a session (status, title → the page, tasks done/all, when, the current one marked) instead of a single 'plan ↗'; the session head shows the same list; a plan's header shows its session as a link. A fresh request closes an unfinished plan as cancelled; a handoff carries the plan on. Decisions (proposed, on plan-work-in-progress-visibility): decision:wf2.plans-folder (resolves question:wf2.plan-doc-parent), decision:wf2.plan-per-request, decision:wf2.plan-result-owned-by-app. req:wf2.sessions.plan-doc / plan-result and rule:pr-doc shipped; ui-test:plans passed (27 checks, Chrome + API + a live probe). Session 3805823665 moved type:pr to the base ontology in parallel (ffe2df6). Commit 239c96a; 7 tasks done. Open: task:artifacts-credit-by-session — every running session is credited with every block change, so a plan's block list is only as exact as that.

Blocks this plan produced:

- added pr:1 — the pannel / text input at the bottom and bar on top must not be scrollable, content is…
- added pr:2 — this text, which is sent to agent at the beginning, can you no show it, it is kind of…
- added task:plan-type-agent-prop — The plan pages the app writes (plan:plan-…, type:pr) carry `agent:` and `session:` in their frontmatter;
- added decision:wf2.plans-folder — Every plan document is a sub-page of one Plans page per project
- added decision:wf2.plan-per-request — A plan document for every request that starts work; a worker's history is its list of plans
- added decision:wf2.plan-result-owned-by-app — The app owns a plan's Result section and scopes the blocks to the plan's time window
- added task:plans-folder — lib/plan-docs:
- added task:plan-per-request — createSession (chat and queue) and restartFresh create a plan document for every request, plan-first ticked or
- added task:plan-result-owned — lib/plan-doc:
- added task:plans-in-agents-view — GET /api/<product>/sessions joins the graph:
- added task:plan-type-props — type:pr declares `session`, `agent`, `started`, `finished`;
- added task:plans-ui-test — ui-test:plans in Chrome (playwright-core):
- added task:plans-knowledge — After shipping:
- added task:artifacts-credit-by-session — lib:artifacts credits every running session with every block change on disk, so two workers at once (or a plan
- changed type:pr — moved from waterfall/v2/ontology.md to schema/base-ontology.md (extends module;
- added plan:plan-plan-system-type-waterflow-project-specific — plan must be system type, not waterflow project specific
- added rule:pr-type-base — plan-type-base
- added decision:wf2.plan-type-is-base — type:pr is a base type in schema/base-ontology.md, not a card of the waterfall product
- added task:wf2.plan-type-move-base — Move the type:pr card from data/products/waterfall/projects/v2/docs/ontology.md to schema/base-ontology.md (
- added task:wf2.plan-type-kinds-yaml — Add `plan` to schema/kinds.yaml (purpose, required:
- added task:wf2.plan-type-test — test/page-node.js:
- added task:wf2.plan-type-knowledge — app-agents.md "type:pr (ontology, proposed)" → base ontology;
- changed component:session-view — session-view
- changed component:session-list — session-list
- changed req:wf2.sessions.plan-doc — Every request that starts work becomes a plan document under the project's Plans page
- changed req:wf2.sessions.plan-result — The plan document ends with the result — the app's section, scoped to the plan
- changed rule:pr-doc — plan-doc
- changed lib:pr-doc — plan-doc
- added component:pr-list — plan-list
- changed ui-test:plan-doc — A palette request makes a plan document; the result lands on it
- changed decision:wf2.plan-is-a-document — A plan is a document of its own — plan-<slug> under the page it was asked on — not a derived session page
- changed question:wf2.plan-doc-parent — wf2.plan-doc-parent
- changed task:plan-doc-lib — lib:pr-doc (pure, vitest):
- changed task:plan-doc-create — createSession and a fresh queue item with `plan:
- changed task:plan-first-prompt — PLAN_FIRST names the plan document (path and node) and says where blocks go:
- changed task:plan-doc-result — the PATCH that sets a session done / failed / cancelled writes the Result section (summary, blocks, paragraphs
- changed task:plan-doc-links — "page ↗" on the session head (component:session-view), the Agents rows (component:session-list) and the consol
- changed task:session-page-retire — `/<product>/sessions/<id>` redirects to the plan document (else to `/changes`);
- changed task:plan-doc-ui-test — Run ui-test:plan-doc in Chrome (playwright-core) against a live palette request;
- changed task:plan-doc-knowledge — After shipping:
- changed page:web/sessions — Agents
- added ui-test:plans — plans

80 paragraphs added or changed — [per document](/waterfall/sessions/07aa6645ad/changes)
