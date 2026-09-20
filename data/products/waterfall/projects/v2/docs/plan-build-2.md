---
node: plan:plan-build-2
type: plan
title: build it
status: cancelled
owner: unassigned
last-verified: 2026-09-20
session: a95bf7bbe0
agent: claude-code
started: 2026-09-20T09:16:06.146Z
role: librarian
part-of: module:v2-plans
---

# build it

## Request

> build it

_from: module:benchmarks_

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

The same request was defined once already, on plan:plan-build (2026-09-20, this session), and that plan was cancelled when this one replaced it. Its Definition is the whole contract of module:benchmarks as a build: decision:memory.eval-build-scope (everything but LongMemEval-V2, in the page's order), decision:memory.eval-tolerance (5 points per suite), decision:memory.eval-first-live-runs (haiku, recordings committed), req:memory.eval-gate, and the two task lines task:memory.eval-cli (first) and task:memory.eval-recordings (last) around the nine open tasks task:memory.eval-truth, task:memory.eval-suite, task:memory.eval-judge-set, task:memory.eval-compare, task:memory.eval-public, task:memory.eval-moosedev-import, task:memory.eval-reqpairs-loader, task:memory.eval-mab-adapter, task:memory.eval-page. The two tasks are agreed; the four decision and requirement blocks are still `proposed` — that is all that keeps plan:plan-build from `defined`. Every verdict on them came back `refines` (decision:memory.evaluation, decision:memory.public-benchmarks, req:memory.eval-benchmarks), no contradiction.

What exists in code: test:verdict-bench only. No `eval/`, no `wf eval`, no lib:eval, no op:api.eval, no page:web/eval, no store:eval-results. The nine eval tasks are all open and unassigned on the Work view.

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here; the plan is defined when every one is agreed._

![[task:plan-build]]

```yaml
- id: decision:memory.eval-build-plan
  title: The benchmarks build runs from plan:plan-build, reopened; plan-build-2 is the same request and is cancelled
  context: >
    "Build it" on module:benchmarks was sent twice. The first request's plan, plan:plan-build, holds the whole
    definition (decision:memory.eval-build-scope, decision:memory.eval-tolerance, decision:memory.eval-first-live-runs,
    req:memory.eval-gate, task:memory.eval-cli, task:memory.eval-recordings) and was cancelled when the second
    request opened plan:plan-build-2 with an empty definition.
  choice: >
    plan:plan-build is set back to defining and is the plan the build runs from — the four proposed blocks are
    approved in the Inbox or Build is pressed over the hold; plan:plan-build-2 is cancelled as a duplicate and
    defines nothing of its own.
  alternatives: >
    Re-propose the six blocks on plan-build-2 (duplicate verdicts to dismiss, two copies of each decision);
    Build from plan-build while it stays cancelled.
  consequences: >
    One plan per request even when the request is re-sent; a librarian who finds an earlier plan with the same
    definition points at it instead of proposing again.
  date: 2026-09-20
  status: proposed
  by: alex
  evidence: [session:a95bf7bbe0]
  affects: [plan:plan-build, plan:plan-build-2]
  home: none yet — move this block to the document where its kind lives
```

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

## Tasks

_`- [ ] task:` lines, `part of plan:plan-build-2`; their check state is what is in progress._

- [ ] task:plan-build-2 build it #review (worker: claude-code, session: a95bf7bbe0, produced: module:app module:memory-review plan:plan-build module:benchmarks)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
