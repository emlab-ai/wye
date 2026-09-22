---
node: run:feature-1
type: run
title: Feature — Implement a feature to install system skills and…
status: waiting
workflow: workflow:feature
runs-on: goal:new-650
stage: stage:feature.research
auto: 0
started: 2026-09-22
part-of: module:v2-workflow-runs
produced: [module:implement-a-feature-to-install-system-skills-and-templates-i]
doc-research: module:implement-a-feature-to-install-system-skills-and-templates-i
sessions: [39b69e4b09]
---

# Feature — Implement a feature to install system skills and…

## Asked

Started on goal:new-650 — the Feature workflow.

## Stages

Each stage starts only when the one before it has met its criterion and you press **Advance**.

1. **Explore the idea — done, waiting for you** · produced module:implement-a-feature-to-install-system-skills-and-templates-i
   - **Gate → Write the PRD:** ✓ every session done — **ready — press Advance**
2. Write the PRD — **next** · produces prd
   - Gate → Tech design and test design: every req in prd is agreed · no open question in prd — then you press Advance
3. Tech design and test design · produces dev-design, test-design
   - Gate → Build the plan: every req in prd has satisfied-by · every req in prd has verified-by · no open contradiction — then you press Advance
4. Build the plan · produces plan
   - Gate → Dispatch the work: every req in prd has a task · every task in plan is ready — then you press Advance
5. Dispatch the work
   - Gate → the run ends: every task in plan is done — then it moves on by itself

## Blocking

**Ready — nothing is missing.** Advance to start **Write the PRD** — the Advance button at the top of this page, or `wye run advance run:feature-1`.

- ✓ every session done

## Log

- started — by person, Feature on goal:new-650
- entered stage:feature.research — by person, 1 action(s), produced module:implement-a-feature-to-install-system-skills-and-templates-i
- ready stage:feature.research — by the engine, every session done
- moved to its own page — by wye, from a card in the Workflow runs document

## Result

_Written when the run ends: what it produced._
