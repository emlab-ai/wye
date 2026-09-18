---
node: plan:plan-plan-system-type-waterflow-project-specific
type: plan
title: plan must be system type, not waterflow project specific
status: done
owner: unassigned
last-verified: 2026-09-18
session: 3805823665
agent: claude-code
started: 2026-09-18T12:38:15.225Z
part-of: module:v2-plans
finished: 2026-09-18T12:44:33.000Z
---

# plan must be system type, not waterflow project specific

## Request

> plan must be system type, not waterflow project specific

## Context

The app writes a plan document for every request that starts work (rule:plan-doc, req:wf2.sessions.plan-doc,
decision:wf2.plan-is-a-document) with `node: plan:<slug>` in its frontmatter — for any product (lib:plan-doc,
`packages/web/src/lib/plan-docs.ts#createPlanDoc`, `templates/docs/plan-request.md`). But type:plan is declared as a
card in module:ontology, the waterfall product's own ontology document (`ontology.md:61`, inside the worked example).
`lib/parse.js#parseFiles` reads `schema/base-ontology.md` first and then the product's documents, so only the
waterfall product knows the `plan` kind (rule:ontology.open-kinds, decision:ontology.types-product-local). A plan
page in any other product hits rule:page-node-line's error branch: `node plan:… — plan is not a declared type`, and
the page is not in the graph (reproduced with lib/parse on a file with only the base ontology).

![[type:plan]]

![[decision:ontology.types-product-local]]

Related: `schema/kinds.yaml` is the prose summary of the base ontology and must stay in step; `packages/web/src/lib/types.ts#isBaseType`
treats a type from `schema/` as a base type (Types page, doc-props type picker). Open tasks that touch the card:
task:plan-type-agent-prop, task:plan-type-props.

## Plan

The plan type is part of the app, not of one product's knowledge: the app itself writes `plan:` pages, so the type
must be where every product's parse begins — the base ontology. Move the card from `ontology.md` to
`schema/base-ontology.md` (same id, same properties, `agent` and `finished` optional so old pages stay clean),
add `plan` to `schema/kinds.yaml`, and cover it with a parser test so a product with no ontology document parses a
plan page. The waterfall ontology's worked example keeps its people/team types and a sentence pointing at the base
type; app-agents' prose that says "type:plan (ontology, proposed)" points at the base ontology instead.

```yaml
- id: decision:wf2.plan-type-is-base
  title: type:plan is a base type in schema/base-ontology.md, not a card of the waterfall product
  context: >
    The app writes a plan document (node: plan:<slug>) for every request that starts work, in whichever product
    the request was made. type:plan was declared in the waterfall product's ontology.md, so a plan page in any
    other product failed rule:page-node-line ("plan is not a declared type") and fell out of the graph.
  choice: >
    type:plan moves to schema/base-ontology.md, extends type:module, props session: string, agent: string?,
    started: string?, finished: string?; schema/kinds.yaml lists plan; ontology.md drops the card. Types the app
    itself writes instances of belong to the base ontology; a product's ontology only declares what the product
    talks about.
  alternatives: >
    Have createPlanDoc write a type:plan card into each product's ontology on first use — copies of one shipped
    type in every product, drift between them; keep type:plan product-local and refuse plans outside waterfall —
    plans are an app feature, every product needs them.
  consequences: >
    Every product parses plan pages; Types page shows plan among the base types; the doc-props type picker
    offers it after the product's own types; task:plan-type-agent-prop is closed by the declared props.
    kinds.yaml and base-ontology.md carry one more kind each. Governs rule:plan-type-base.
  status: proposed
  date: 2026-09-18
  related-to: [type:plan, decision:ontology.types-product-local, rule:page-node-line, rule:plan-doc]
```

![[rule:plan-type-base]]

## Tasks

- [x] task:wf2.plan-type-move-base Move the type:plan card from data/products/waterfall/projects/v2/docs/ontology.md to schema/base-ontology.md (agent and finished optional; started optional); leave a sentence in the worked example saying the plan type is a base type. Part of plan:plan-plan-system-type-waterflow-project-specific. (session: 3805823665)
- [x] task:wf2.plan-type-kinds-yaml Add `plan` to schema/kinds.yaml (purpose, required: [session]) so the summary stays in step with the base ontology. Part of plan:plan-plan-system-type-waterflow-project-specific. (session: 3805823665)
- [x] task:wf2.plan-type-test test/page-node.js: a document with only the base ontology and a `plan:<slug>` node line parses with no error and the node is kind plan with session as a property. Part of plan:plan-plan-system-type-waterflow-project-specific. (session: 3805823665)
- [x] task:wf2.plan-type-knowledge app-agents.md "type:plan (ontology, proposed)" → base ontology; rule:plan-type-base next to rule:plan-doc with source schema/base-ontology.md; close task:plan-type-agent-prop; ctx check green for waterfall and yessensei. Part of plan:plan-plan-system-type-waterflow-project-specific. (session: 3805823665)

## Result

type:plan moved from waterfall/v2/ontology.md to schema/base-ontology.md (extends module; session, agent?, started?, finished?), plan listed in schema/kinds.yaml — a plan page now parses in every product (was: 'plan is not a declared type' outside waterfall). test/page-node.js covers it; ctx check green for waterfall and yessensei; all tests pass. Knowledge: decision:wf2.plan-type-is-base (proposed, on this plan), rule:plan-type-base (shipped, app-agents), task:plan-type-agent-prop closed. Commit ffe2df6.

Blocks this plan produced:

- removed plan:plan-probe-plans-list-open-questions-module — Probe plans: list the open questions of module app-agents
- added rule:plan-type-base — plan-type-base
- added decision:wf2.plan-type-is-base — type:plan is a base type in schema/base-ontology.md, not a card of the waterfall product
- added task:wf2.plan-type-move-base — Move the type:plan card from data/products/waterfall/projects/v2/docs/ontology.md to schema/base-ontology.md (
- added task:wf2.plan-type-kinds-yaml — Add `plan` to schema/kinds.yaml (purpose, required:
- added task:wf2.plan-type-test — test/page-node.js:
- added task:wf2.plan-type-knowledge — app-agents.md "type:plan (ontology, proposed)" → base ontology;
- changed type:plan — plan
- changed task:plan-type-agent-prop — The plan pages the app writes (plan:plan-…, type:plan) carry `agent:` and `session:` in their frontmatter;
- changed component:session-view — session-view
- changed component:session-list — session-list
- changed req:wf2.sessions.plan-doc — Every request that starts work becomes a plan document under the project's Plans page
- changed req:wf2.sessions.plan-result — The plan document ends with the result — the app's section, scoped to the plan
- changed rule:plan-doc — plan-doc
- changed lib:plan-doc — plan-doc
- added component:plan-list — plan-list
- changed ui-test:plan-doc — A palette request makes a plan document; the result lands on it
- changed decision:wf2.plan-is-a-document — A plan is a document of its own — plan-<slug> under the page it was asked on — not a derived session page
- changed question:wf2.plan-doc-parent — wf2.plan-doc-parent
- changed task:plan-doc-lib — lib:plan-doc (pure, vitest):
- changed task:plan-doc-create — createSession and a fresh queue item with `plan:
- changed task:plan-first-prompt — PLAN_FIRST names the plan document (path and node) and says where blocks go:
- changed task:plan-doc-result — the PATCH that sets a session done / failed / cancelled writes the Result section (summary, blocks, paragraphs
- changed task:plan-doc-links — "page ↗" on the session head (component:session-view), the Agents rows (component:session-list) and the consol
- changed task:session-page-retire — `/<product>/sessions/<id>` redirects to the plan document (else to `/changes`);
- changed task:plan-doc-ui-test — Run ui-test:plan-doc in Chrome (playwright-core) against a live palette request;
- changed task:plan-doc-knowledge — After shipping:
- changed page:web/sessions — Agents
- added ui-test:plans — plans

27 paragraphs added or changed — [per document](/waterfall/sessions/3805823665/changes)
