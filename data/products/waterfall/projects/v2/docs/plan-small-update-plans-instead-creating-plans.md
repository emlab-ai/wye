---
node: plan:plan-small-update-plans-instead-creating-plans
type: plan
title: small update on plans, instead of creating plans inside plans folder, which is part of…
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: 48c8885cd2
agent: claude-code
started: 2026-09-18T20:40:15.949Z
part-of: module:v2-plans
---

# small update on plans, instead of creating plans inside plans folder, which is part of…

## Request

> small update on plans, instead of creating plans inside plans folder, which is part of documnts, create system folder called Plans, and keep it in top section of navigation not in the documents

_from: plan:plan-work-component-data-table-rule-type_

## Context

The subject is the rail — page:web/sidebar (component:rail, component:doc-tree; rule:documents-tree, rule:app-navigation). Today every plan document (type:plan, one per request — req:wf2.sessions.plan-doc, rule:plan-doc, lib:plan-doc) is written as `plan-<slug>.md` in the project's docs folder, `part-of` the project's Plans page (`plans.md`, module:v2-plans — decision:wf2.plans-folder, task:plans-folder). The Plans page is an ordinary document, so it and its plans sit in the Documents tree, between the product's real documents (the screenshot). The Agents page lists plans per worker (component:plan-list); the Plans page shows them as a `view:plan` table (component:instance-table, lib:instance-table). Goals and Tasks already have product-level pages in the rail's menu (page:web/goals, page:web/tasks).

Code: `packages/web/src/components/Rail.tsx` (the menu and the Documents section), `DocTree.tsx`, `app/[product]/layout.tsx` (builds the tree items per project), `lib/doc.ts#projectTree`, `lib/plan-docs.ts#plansPageId`, `app/[product]/types/[slug]/page.tsx` (the instance table a Plans page can reuse). `ctx` reads every `.md` under the product folder but the document routes, the editor's save, the watcher and links are all `/<product>/<project>/d/<doc>` — a plan cannot leave its project folder without touching all of them.

![[decision:wf2.plans-folder]]

![[component:rail]]

## Plan

Plans become a **system folder** of the rail, like Inbox and Agents are system pages: a "Plans" entry at the end of the menu (Overview … Agents, Plans), with a caret; under it the product's plan documents, newest first, each opening its plan page; the entry itself opens a product-level Plans page, `/<product>/plans`, with every plan of every project as the filterable table (the same table the Plans page's view shows). The project's Plans page and everything under it leave the Documents tree. On disk nothing changes: the app keeps writing `plan-<slug>.md` under `plans.md` in the project's docs folder — the folder page stays the parent the plan's breadcrumbs, links and result exclusion already use.

![[req:wf2.ui.plans-folder]]

![[rule:plans-folder]]

![[page:web/plans]]

![[component:plan-folder]]

```yaml
- id: decision:wf2.plans-system-folder
  title: Plans is a system folder in the rail's menu; the plan files stay in the project's docs folder
  context: >
    decision:wf2.plans-folder made one Plans page per project the parent of every plan document, so the plans
    showed up in the Documents tree next to the product's own documents. The person wants Plans out of Documents:
    a system folder in the top section of the navigation.
  choice: >
    The rail's menu gets a Plans folder (req:wf2.ui.plans-folder): its entry opens /<product>/plans (page:web/plans,
    every plan as a table), its rows are the plan documents newest first, and it collapses. The product layout
    recognises the Plans page by its id (module:<project>-plans) and takes it and its sub-documents out of the
    Documents tree (rule:plans-folder). Files do not move: a plan is still plan-<slug>.md in the project's docs
    folder, part-of the project's Plans page, so routes, the editor, the watcher, links and the plan's result stay
    as they are.
  alternatives: >
    A product-level plans/ folder on disk (data/products/<product>/plans/) like inbox — document routes, the editor's
    save, the file watcher, deep links and `wf doc` refs are all per project; not a small update. Dropping plans.md
    and marking plans by type only — the folder page is what holds the view table and is the parent the app already
    writes; keeping it costs nothing once it is out of the tree. A cap on the rows in the folder — the folder
    collapses, and the page is the full list; add a cap when a product has more plans than the rail can show.
  consequences: >
    refines decision:wf2.plans-folder (the parent stays; only the rail changes); req:wf2.sessions.plan-doc's
    "the document tree shows it under Plans" becomes "the rail's Plans folder shows it"; page:web/sidebar's
    menu order and rule:documents-tree gain the exception; ui-test:plans's "the tree shows Plans" check moves to
    ui-test:plans-folder.
  affects: [req:wf2.ui.plans-folder, rule:plans-folder, page:web/plans, page:web/sidebar, rule:documents-tree, req:wf2.sessions.plan-doc]
  related-to: [decision:wf2.plans-folder, decision:wf2.plan-per-request]
  status: proposed
  date: 2026-09-18
  session: 48c8885cd2
```

While reading the prompt code I found that the "plan documents (follow-ups go here)" line of the agent's system prompt picks the first file whose name contains "plan" in each project — since plan documents exist that is a random `plan-*.md`, not the project's plan (`plan.md`); the last task fixes it.

## Tasks

- [x] task:plans-folder-page `/<product>/plans` (page:web/plans): every plan of the product as the instance table (lib/instance-table#instanceTable for type plan, component:instance-table with the URL filters), header like Goals / Tasks. Part of plan:plan-small-update-plans-instead-creating-plans, part of req:wf2.ui.plans-folder. (session: 48c8885cd2)
- [x] task:plans-folder-rail app/[product]/layout.tsx takes the Plans page (lib/plan-docs#plansPageId) out of every project's roots and collects its sub-documents (slug, project, title, icon, status, started) sorted newest first; Rail.tsx ends the menu with component:plan-folder (PlanFolder.tsx: entry to /<product>/plans, caret, rows, "no plans yet", `wf-plans-open` remembered); styles. Part of plan:plan-small-update-plans-instead-creating-plans, part of rule:plans-folder. (session: 48c8885cd2)
- [x] task:plans-folder-ui-test ui-test:plans-folder in Chrome via playwright-core: the menu ends with Plans; the rows are the plans newest first and open the plan page (the open one marked); the Plans page and the plans are not in the Documents tree; /<product>/plans lists every plan with its status; collapse is remembered over a reload; a product without plans shows "no plans yet". Part of plan:plan-small-update-plans-instead-creating-plans, part of req:wf2.ui.plans-folder. (session: 48c8885cd2)
- [x] task:plans-folder-knowledge req:wf2.ui.plans-folder and rule:plans-folder shipped; component:rail's purpose and page:web/sidebar's menu order and display rules (dev-design) name the Plans folder; rule:documents-tree gains the exception; req:wf2.sessions.plan-doc says "the rail's Plans folder shows it"; ui-test:plans-folder on test-design. Part of plan:plan-small-update-plans-instead-creating-plans. (session: 48c8885cd2)
- [x] task:agent-prompt-plan-file lib/agent-prompt.ts: the "plan documents" line of the system prompt names the project's `plan.md` when it exists (never the first `plan-*.md` request plan). Part of plan:plan-small-update-plans-instead-creating-plans, related to rule:plan-doc. (session: 48c8885cd2)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
