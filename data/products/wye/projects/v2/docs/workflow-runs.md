---
node: module:v2-workflow-runs
type: module
title: Workflow runs
status: active
owner: unassigned
last-verified: 2026-09-22
---

# Workflow runs

One card per run of a workflow (type:run, decision:wf2.run-holds-the-state): which workflow, what it runs `on`, the
stage it is at, its status, the documents it produced, the sessions it started and its `log` — what was entered,
advanced, reopened, skipped or blocked, and by whom. Readiness is computed from the graph and shown on the document
the run started from; it is never stored here. The person's moves are Advance, Reopen, Skip, Retry and Cancel, on that
strip, in a node's column or through `wye run`.

<!-- view:run -->

```yaml
- id: run:feature-1
  workflow: workflow:feature
  on: goal:new-650
  stage: stage:feature.research
  status: waiting
  produced: [module:implement-a-feature-to-install-system-skills-and-templates-i]
  sessions: [39b69e4b09]
  started: 2026-09-22
  log: |
    - started — by person, Feature on goal:new-650
    - entered stage:feature.research — by person, 1 action(s), produced module:implement-a-feature-to-install-system-skills-and-templates-i
    - ready stage:feature.research — by the engine, every session done
```
