---
node: run:feature-1
type: run
title: Feature — Implement a feature to install system skills and…
status: running
workflow: workflow:feature
runs-on: goal:new-650
stage: stage:feature.design
auto: 0
started: 2026-09-22
part-of: module:v2-workflow-runs
produced: [module:implement-a-feature-to-install-system-skills-and-templates-i, module:implement-a-feature-to-install-system-skills-and-dev-design, module:implement-a-feature-to-install-system-skills-and-test-design]
doc-research: module:implement-a-feature-to-install-system-skills-and-templates-i
sessions: [39b69e4b09, dfb890d304, 5340e4ddaa, 786a99f913]
doc-prd: module:implement-a-feature-to-install-system-skills-and-templates-i
doc-dev-design: module:implement-a-feature-to-install-system-skills-and-dev-design
doc-test-design: module:implement-a-feature-to-install-system-skills-and-test-design
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
  status: done
  stage: stage:feature.prd
  part-of: run:feature-1
  depends-on: step:feature-1.research
  needs: every req in prd is agreed · no open question in prd
  then: Tech design and test design
  produced: [module:implement-a-feature-to-install-system-skills-and-templates-i]
  session: session:dfb890d304
- id: step:feature-1.design
  title: 3. Tech design and test design
  status: review
  stage: stage:feature.design
  part-of: run:feature-1
  depends-on: step:feature-1.prd
  needs: ○ every req in prd has satisfied-by (req:install.library, req:install.library.templates, req:install.library.new-template, req:install.fresh, req:install.fresh.from-template, req:install.install and 6 more) · ○ every req in prd has verified-by (req:install.library, req:install.library.templates, req:install.library.new-template, req:install.fresh, req:install.fresh.from-template, req:install.install and 6 more) · ○ no open contradiction (contradiction:wye.e0f217651378, contradiction:wye.a4ab2c5826d6, contradiction:wye.344704eb5ce7, contradiction:wye.3b8dc8b9d832, contradiction:wye.3e8a0f2aadb1)
  then: Build the plan
  produced: [module:implement-a-feature-to-install-system-skills-and-dev-design, module:implement-a-feature-to-install-system-skills-and-test-design]
  session: session:786a99f913, session:5340e4ddaa
- id: step:feature-1.plan
  title: 4. Build the plan
  status: todo
  stage: stage:feature.plan
  part-of: run:feature-1
  depends-on: step:feature-1.design
  needs: every req in prd has a task · every task in plan is ready
  then: Dispatch the work
  produces: plan
- id: step:feature-1.dispatch
  title: 5. Dispatch the work
  status: todo
  stage: stage:feature.dispatch
  part-of: run:feature-1
  depends-on: step:feature-1.plan
  needs: every task in plan is done
  then: the run ends — automatic
```

## Blocking

**Waiting on 3 of 3** — **Build the plan** cannot start until these hold:

- ○ every req in prd has satisfied-by — req:install.library, req:install.library.templates, req:install.library.new-template, req:install.fresh, req:install.fresh.from-template, req:install.install, req:install.install.preview, req:install.install.other-projects, req:install.update, req:install.uninstall, req:install.picker, req:install.cli
- ○ every req in prd has verified-by — req:install.library, req:install.library.templates, req:install.library.new-template, req:install.fresh, req:install.fresh.from-template, req:install.install, req:install.install.preview, req:install.install.other-projects, req:install.update, req:install.uninstall, req:install.picker, req:install.cli
- ○ no open contradiction — contradiction:wye.e0f217651378, contradiction:wye.a4ab2c5826d6, contradiction:wye.344704eb5ce7, contradiction:wye.3b8dc8b9d832, contradiction:wye.3e8a0f2aadb1

## Log

- started — by person, Feature on goal:new-650
- entered stage:feature.research — by person, 1 action(s), produced module:implement-a-feature-to-install-system-skills-and-templates-i
- ready stage:feature.research — by the engine, every session done
- moved to its own page — by wye, from a card in the Workflow runs document
- advanced stage:feature.research — by person, every session done
- entered stage:feature.prd — by person, 1 action(s), produced module:implement-a-feature-to-install-system-skills-and-templates-i
- ready stage:feature.prd — by the engine, every req in prd is agreed; no open question in prd
- not ready stage:feature.prd — by the engine, every req in prd is agreed; no open question in prd
- ready stage:feature.prd — by the engine, every req in prd is agreed; no open question in prd
- advanced stage:feature.prd — by person, every req in prd is agreed; no open question in prd
- entered stage:feature.design — by person, 2 action(s), produced module:implement-a-feature-to-install-system-skills-and-dev-design, module:implement-a-feature-to-install-system-skills-and-test-design

## Result

_Written when the run ends: what it produced._

## Layout

```text
step:feature-1.research 0,0
module:implement-a-feature-to-install-system-skills-and-templates-i 0,150 ref
step:feature-1.prd 340,0
step:feature-1.design 680,0
module:implement-a-feature-to-install-system-skills-and-dev-design 680,150 ref
module:implement-a-feature-to-install-system-skills-and-test-design 680,220 ref
step:feature-1.plan 1020,0
step:feature-1.dispatch 1360,0
```
