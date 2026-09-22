---
node: {{id}}
type: module
title: Workflow runs
status: active
owner: unassigned
last-verified: {{date}}
{{root}}---

# Workflow runs

One card per run of a workflow (type:run, decision:wf2.run-holds-the-state): which workflow, what it runs `on`, the
stage it is at, its status, the documents it produced, the sessions it started and its `log` — what was entered,
advanced, reopened, skipped or blocked, and by whom. Readiness is computed from the graph and shown on the document
the run started from; it is never stored here. The person's moves are Advance, Reopen, Skip, Retry and Cancel, on that
strip, in a node's column or through `wye run`.

<!-- view:run -->
