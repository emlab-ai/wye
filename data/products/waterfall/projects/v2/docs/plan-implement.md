---
node: plan:plan-implement
type: plan
title: implement this
status: proposed
owner: unassigned
last-verified: 2026-09-19
session: 9f3d83809b
agent: claude-code
started: 2026-09-19T11:17:38.825Z
part-of: module:v2-plans
---

# implement this

## Request

> implement this

_from: module:memory-review_

## Context

module:memory-review carries goal:memory.validated-asks and six approved decisions (decision:memory.constraint-packet, decision:memory.bitemporal, decision:memory.write-time-verdict, decision:memory.constraint-type, decision:memory.consolidate-sessions, decision:memory.forgetting, decision:memory.evidence, decision:memory.shapes) plus two proposed ones (decision:memory.benchmark, decision:memory.code-source with question:memory.code-source.kinds and question:memory.code-source.writes open).

Code the work touches: `schema/base-ontology.md` (type:node, type:decision, a new type:constraint, type:lesson, type:contradiction), `lib/parse.js` (supersedes → until / superseded-by, shapes on type cards, new statuses), `lib/graph.js` (constraints traversal, current-by-construction filter, shapes in check), `bin/ctx.js` (`ctx constraints`, `--as-of`, `--all`, `check --deep`), `packages/web/src/lib/graph.ts` + `semantic.ts` (op:api.context filters ended nodes, archived plans), a new `packages/web/src/lib/packet.ts` + `app/api/[product]/packet/route.ts` (op:api.packet), `agent-host.ts#buildPrompt` (`## Constraints in force`), `agent-prompt.ts` (`## Constitution`), `bin/wf.js` (`wf packet --for`), `watch.ts` (the verdict pass hook), `sessions.ts` (consolidation on done).

## Plan

Order follows dependencies: the bitemporal properties and type:constraint first (everything else filters by them), then the packet (structural traversal, in the first message), then shapes, forgetting, the data pass over status-less decisions, then the two model-in-the-loop pieces (verdict pass with its benchmark, consolidation on session done) which call the local `claude -p` the app already spawns for chat — no new provider. The code-source spike waits for its two open questions and is not built here.

```yaml
- id: decision:memory.model-calls-via-cli
  title: The verdict pass and the consolidation run call the agent CLI the app already runs, one-shot
  context: >
    decision:memory.write-time-verdict and decision:memory.consolidate-sessions need a model call; the app has no
    provider client — it spawns `claude` / `codex` as child processes for chat (packages/web/src/lib/agent-host.ts).
  choice: >
    A small `lib/judge.js` runs `claude -p --output-format json` (or `codex exec`) with a fixed prompt and parses the
    JSON answer; ctx (offline) and the web app share it; the model and prompt hash are recorded on every verdict so it
    can be replayed. Off unless the product's `_product.md` sets `verdicts: on` (or WF_VERDICTS=1) — the benchmark
    (decision:memory.benchmark) runs before it is on by default.
  alternatives: an SDK client with an API key (a second credential to manage); a model in-process (transformers.js — too small to classify contradictions).
  consequences: no new dependency; a verdict costs one process spawn; the pass is budgeted per rebuild.
  date: 2026-09-19
  status: proposed
  part-of: plan:plan-implement
  affects: [decision:memory.write-time-verdict, decision:memory.consolidate-sessions]
```

```yaml
- id: decision:memory.statuses-stay-with-the-person
  title: The decision-status pass adds supersedes links; approving the 60 proposed decisions stays with the person
  context: >
    task:memory.decision-statuses asked for a status on the 43 status-less decisions. By the time this session ran
    every decision carried one (60 proposed, 23 approved). What remained was supersession named in prose:
    decision:wf2.plan-is-a-document says it supersedes decision:wf2.session-page-derived.
  choice: >
    `supersedes:` is written where the prose says so (one case); the proposed decisions are left for the person to
    approve in the Inbox — an agent deciding which decisions the code "follows" would be the agent approving
    decisions, which constraint:wf2.person-approves forbids. Approving a decision that names `supersedes:` retires
    the old one in the same act.
  alternatives: mark every decision the code visibly implements approved (fast, but approval is the person's act).
  consequences: the Inbox keeps 60 proposed decisions to approve; superseded ones drop out of retrieval as they are approved.
  date: 2026-09-19
  status: proposed
  part-of: plan:plan-implement
  affects: [task:memory.decision-statuses]
```

```yaml
- id: decision:memory.consistent-verdicts-in-the-log
  title: Only verdicts that are not "consistent" are written under the node; consistent ones stay in the judge log
  context: >
    decision:memory.write-time-verdict says the verdicts are written on the new node as content blocks. A new decision is
    judged against up to twelve neighbours plus every approved constraint; most verdicts are "consistent". Twelve
    "consistent" lines under every new block would bury the block and churn every document on every rebuild.
  choice: >
    duplicate, refines and contradicts verdicts are written under the node (verdict: line; contradicts and duplicate
    also open a contradiction: line); consistent verdicts are kept only in _build/verdicts.json — the replayable judge
    log with model and prompt hash — and the Inbox row says "checked against n neighbours". `ctx verdicts <id>` and
    `wf verdicts <id>` print all of them.
  alternatives: write every verdict (noise, churn); write none and keep everything in the log (the document no longer says what was found).
  consequences: documents carry only what a person must look at; the full log stays replayable; the verdict pass never edits a node's own text.
  date: 2026-09-19
  status: proposed
  part-of: plan:plan-implement
  affects: [decision:memory.write-time-verdict, req:memory.verdicts]
```

## Tasks

- [x] task:memory.impl.bitemporal since, until, superseded-by / supersedes, by, evidence on type:node; statuses superseded and retired; parser fills until and superseded-by from supersedes; `isCurrent` in lib/graph.js and packages/web graph.ts; op:api.context, ctx packet and search skip ended nodes unless --as-of / --all. part of plan:plan-implement, part of goal:memory.validated-asks (task: memory.bitemporal-props, session: 9f3d83809b)
- [x] task:memory.impl.constraint-type type:constraint and type:lesson in the base ontology; `## Constitution` in the agent system prompt; a Constitution view. part of plan:plan-implement (task: memory.constraint-type, session: 9f3d83809b)
- [x] task:memory.impl.packet the constraint packet: lib/graph.js#constraints, `ctx constraints --task`, packages/web packet.ts, op:api.packet, `wf packet --for`, `## Constraints in force` in buildPrompt. part of plan:plan-implement (task: memory.constraint-packet, session: 9f3d83809b)
- [x] task:memory.impl.shapes `shapes:` on type cards read by the parser and enforced by ctx check; the two hardcoded checks move to the base ontology. part of plan:plan-implement (task: memory.shapes, session: 9f3d83809b)
- [x] task:memory.impl.forgetting archived-for-retrieval: done plans and closed sessions leave op:api.context, the packet and search unless --all. part of plan:plan-implement (task: memory.forgetting, session: 9f3d83809b)
- [x] task:memory.impl.decision-statuses statuses on the status-less decisions in waterfall's documents. part of plan:plan-implement (task: memory.decision-statuses, session: 9f3d83809b)
- [ ] task:memory.impl.verdicts the write-time verdict pass: lib/judge.js, pair classification on rebuild diff, verdict blocks, contradiction: nodes, Inbox rows. part of plan:plan-implement (task:memory.verdict-pass)
- [ ] task:memory.impl.benchmark the hide-one-edge regression over the contradicts edges, behind WATERFALL_LIVE=1. part of plan:plan-implement (task:memory.benchmark)
- [ ] task:memory.impl.consolidate consolidation on session done: candidates from the transcript diffed against produced blocks, misses filed with evidence. part of plan:plan-implement (task:memory.consolidate)
- [ ] task:memory.impl.lint-deep `ctx check --deep` over same-kind pairs sharing a neighbour. part of plan:plan-implement (task:memory.lint-deep)

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
