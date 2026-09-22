---
node: module:v2-workflow-runs
type: module
title: Workflow runs
status: active
owner: unassigned
last-verified: 2026-09-22
---

# Workflow runs

One page per run of a workflow (type:run, decision:wf2.run-is-a-page), listed below. The page is the state: its
frontmatter says which workflow, what it `runs-on`, the stage it is at and its status; **Stages** says what is done
and where it has got to; **Blocking** says what the next stage is waiting for and which nodes hold it back; **Log**
says what happened and by whom. The engine writes them, and only when they change. The person's moves are Advance,
Reopen, Skip, Retry and Cancel — on the run's page, on the document it runs on, in a node's column or through
`wye run`.

<!-- view:run -->

```yaml
```
