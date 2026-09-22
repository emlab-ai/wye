---
node: run:feature-1
type: run
title: Feature — Implement a feature to install system skills and…
status: running
workflow: workflow:feature
runs-on: goal:new-650
stage: stage:feature.prd
auto: 0
started: 2026-09-22
part-of: module:v2-workflow-runs
produced: [module:implement-a-feature-to-install-system-skills-and-templates-i]
doc-research: module:implement-a-feature-to-install-system-skills-and-templates-i
sessions: [39b69e4b09, dfb890d304]
doc-prd: module:implement-a-feature-to-install-system-skills-and-templates-i
---

# Feature — Implement a feature to install system skills and…

## Asked

Started on goal:new-650 — the Feature workflow.

## Stages

The stages of this run, in order — each one starts only when the one before it has met its `needs`. **To move the run on: press Advance on the strip at the top of this page, or set the stage's status below to `done`** (or `wye run advance run:feature-1`). A stage whose gate is automatic moves on by itself.

```yaml
- id: step:feature-1.research
  title: 1. Explore the idea
  status: done
  stage: stage:feature.research
  part-of: run:feature-1
  needs: every session done
  then: Write the PRD
  produced: [module:implement-a-feature-to-install-system-skills-and-templates-i]
  session: session:39b69e4b09
- id: step:feature-1.prd
  title: 2. Write the PRD
  status: running
  stage: stage:feature.prd
  part-of: run:feature-1
  needs: ○ every req in prd is agreed (req:install.library, req:install.library.templates, req:install.library.new-template, req:install.fresh, req:install.fresh.from-template, req:install.install and 6 more) · ○ no open question in prd (question:install.opt-in-or-opt-out, question:install.unit, question:install.record-home, question:install.update-vs-edits, question:install.where-it-lands, question:install.edit-linked and 4 more)
  then: Tech design and test design
  produced: [module:implement-a-feature-to-install-system-skills-and-templates-i]
  session: session:dfb890d304
- id: step:feature-1.design
  title: 3. Tech design and test design
  status: todo
  stage: stage:feature.design
  part-of: run:feature-1
  needs: every req in prd has satisfied-by · every req in prd has verified-by · no open contradiction
  then: Build the plan
  produces: dev-design, test-design
- id: step:feature-1.plan
  title: 4. Build the plan
  status: todo
  stage: stage:feature.plan
  part-of: run:feature-1
  needs: every req in prd has a task · every task in plan is ready
  then: Dispatch the work
  produces: plan
- id: step:feature-1.dispatch
  title: 5. Dispatch the work
  status: todo
  stage: stage:feature.dispatch
  part-of: run:feature-1
  needs: every task in plan is done
  then: the run ends — automatic
```

## Blocking

**Waiting on 2 of 2** — **Tech design and test design** cannot start until these hold:

- ○ every req in prd is agreed — req:install.library, req:install.library.templates, req:install.library.new-template, req:install.fresh, req:install.fresh.from-template, req:install.install, req:install.install.preview, req:install.install.other-projects, req:install.update, req:install.uninstall, req:install.picker, req:install.cli
- ○ no open question in prd — question:install.opt-in-or-opt-out, question:install.unit, question:install.record-home, question:install.update-vs-edits, question:install.where-it-lands, question:install.edit-linked, question:install.duplicate-ids, question:install.existing-products, question:install.system-library-home, question:install.package-definition

## Log

- started — by person, Feature on goal:new-650
- entered stage:feature.research — by person, 1 action(s), produced module:implement-a-feature-to-install-system-skills-and-templates-i
- ready stage:feature.research — by the engine, every session done
- moved to its own page — by wye, from a card in the Workflow runs document
- advanced stage:feature.research — by person, every session done
- entered stage:feature.prd — by person, 1 action(s), produced module:implement-a-feature-to-install-system-skills-and-templates-i
- ready stage:feature.prd — by the engine, every req in prd is agreed; no open question in prd
- not ready stage:feature.prd — by the engine, every req in prd is agreed; no open question in prd

## Result

_Written when the run ends: what it produced._
