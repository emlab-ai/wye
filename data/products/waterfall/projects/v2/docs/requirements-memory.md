---
node: module:req-memory
type: module
title: Requirements — Memory
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 18
---

# Requirements — Memory

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Memory); what a person sees on the Experience pages. Open questions wait at the end.

<!-- view:req -->

## Requirements

```yaml
- id: req:memory.intake-packet
  title: A request reaches the agent with the constraints that govern it
  when: a session starts, or a queued item with fresh context begins (rule:clean-slate)
  then: >
    the first message carries the constraint packet for the instruction and its refs — every rule, constraint, gate,
    approved decision, goal and open question reachable from the seeds within two hops, complete and current — and the
    agent can ask for the same packet for any text with `wf packet --for`
  unless: the product has no graph yet, in which case the message says so
  status: shipped
  refines: req:wf2.api.packet-task
  satisfied-by: [op:api.packet]
  verified-by: [test:memory#packet, test:packet]
  part-of: goal:memory.validated-asks
- id: req:memory.current-by-construction
  title: >
    Superseded, rejected and retired knowledge leaves current retrieval, should move legacy knowledge to archive
  when: any retrieval runs — op:api.context, ctx packet, the constraint packet, the peek panel's relations
  then: nodes whose `until` has passed or whose status is superseded, rejected or retired are left out and counted ("3 superseded hidden"), and `--as-of` / `--all` brings them back
  status: shipped
  satisfied-by: [op:api.context, op:api.packet]
  verified-by: [test:memory#current]
  part-of: goal:memory.validated-asks
- id: req:memory.verdicts
  title: A proposed block arrives in the Inbox with its verdicts
  when: a decision, requirement, rule or constraint block is added or changed and the graph rebuilds
  then: >
    each same-kind neighbour within two hops and each approved constraint has a verdict on the new node (duplicate,
    refines, consistent, contradicts, with a reason); contradicts and duplicate open a contradiction node; the Inbox
    row lists them and approval with an open contradicts verdict asks for supersede / refine / dismiss-with-reason
  unless: the product has verdicts switched off, or the pass's budget for this rebuild is spent (then the row says "not yet classified")
  status: shipped
  refines: req:wf2.contradictions.semantic
  satisfied-by: [op:api.verdicts]
  verified-by: [test:verdicts, test:memory#verdicts]
  part-of: goal:memory.validated-asks
- id: req:memory.instruction-patch
  title: A session's outcome can propose one instruction patch, with evidence, for review
  when: the consolidation run finishes for a session
  then: >
    with the existing lessons, instructions and rejected proposals in context, it proposes at most one change — a new
    instruction block or a patch to one — as a change record with before and after, the lessons and sessions as
    evidence and a rationale; the Inbox lists it under Changes with the diff; Accept approves the block or applies the
    patch, Reject keeps the proposal with the reason so it is not made again
  unless: the session changed nothing and failed nothing, or the same patch was rejected before
  status: proposed
  satisfied-by: [op:api.changes, store:agent-instructions, op:api.agent-prompt]
  requires-tests: [test:memory#instruction-patch-once, test:memory#rejected-not-reproposed]
  part-of: goal:memory.validated-asks
- id: req:memory.instructions-in-prompt
  title: The prompt carries the approved instructions that apply to the session, in full, within a budget
  when: a session's system prompt is built
  then: >
    every approved instruction whose applies-to matches the session's role, agent and goals is included verbatim
    under Instructions, in document order, and the section stops at the budget with a line saying how many were left
    out; lessons are not included
  status: proposed
  refines: req:wf2.api.skills
  satisfied-by: [op:api.agent-prompt, store:agent-instructions]
  requires-tests: [test:memory#prompt-instructions-scoped]
  part-of: goal:memory.validated-asks
- id: req:memory.eval-benchmarks
  title: Each memory claim has a benchmark on the product's own history
  when: the eval suite runs (CI with recorded outputs, or live)
  then: >
    packet completeness against vector top-k over the shipped requirements, currency over supersessions,
    contradiction recall and precision over the hidden contradicts edges, impact recall over co-changed blocks in
    commits and sessions, and consolidation recall over hidden decision blocks are computed and written with the
    model, prompt hashes and graph sha; a score that drops by more than the tolerance fails the run
  status: proposed
  satisfied-by: [lib:eval, rule:eval-gate, rule:eval-replay-or-fail]
  requires-tests: [test:eval#packet-completeness, test:eval#currency, test:eval#contradictions, test:eval#impact-cochange, test:eval#consolidation]
  part-of: goal:memory.validated-asks
- id: req:memory.eval-compare
  title: The same request runs with and without the memory and the two are shown side by side
  when: `wye eval compare` runs, or Compare is used on a plan
  then: >
    the with arm (packet, instructions, definition) and the without arm (contract only) run the same instruction with
    the same agent and model in scratch worktrees, n times each; transcripts are kept immutable; each run is scored
    — constraint violations, node ids cited, should-have-known questions, reverted changes, bounced tasks, tokens,
    time — and a person can add a blind 1–5 mark per pair; the Evaluation page and the plan show the pair with the
    score cards and the judge's agreement number
  unless: no runner is online for the agent, in which case the harness says so and does nothing
  status: proposed
  refines: req:memory.eval-benchmarks
  satisfied-by: [lib:eval, rule:eval-arms-offline, module:eval-runs]
  requires-tests: [test:eval#compare-harness, ui-test:eval-compare]
  part-of: goal:memory.validated-asks
- id: req:memory.eval-page
  title: The numbers are documents of the Evaluation project, shown with the existing table and view blocks
  when: the person opens the Evaluation project's Results page
  then: >
    every run is an eval-run card with its eval-score cards (type:eval-run, type:eval-score, written by the harness),
    every with-and-without pair an eval-pair card, every public benchmark row an eval-public card with ours beside
    the published number and its source; the page shows them with the data table and instances view blocks —
    filtered, grouped, sorted like any type — and no page of its own exists (constraint:wf2.no-custom-pages)
  status: proposed
  refines: req:memory.eval-benchmarks
  satisfied-by: [module:eval-results, module:eval-ontology, component:instance-table, component:view-block]
  requires-tests: [test:eval#cards-written]
  part-of: goal:memory.validated-asks
- id: req:memory.eval-gate
  title: A suite's drop against the previous run fails the eval
  when: `wye eval own` (or CI running it with recordings) finishes a suite and a previous `_build/eval/<date>-own.json` holds a score for it
  then: >
    the new score, the previous one, the delta and the tolerance (5 points, decision:memory.eval-tolerance) are
    printed and written into the results file; a delta below minus the tolerance makes the run exit non-zero after
    every suite has run, naming the suite and both scores
  unless: >
    no previous file exists, or `--baseline` is given to accept the new scores as the baseline (the reason is
    written into the file) — then the run reports and exits zero
  status: proposed
  refines: req:memory.eval-benchmarks
  satisfied-by: [lib:eval, rule:eval-gate]
  requires-tests: [test:eval#gate]
  part-of: goal:memory.validated-asks
- id: req:wf2.ui.decisions
  title: Decisions are a timeline with apply and reject
  when: the Decisions entry opens
  then: decisions list newest first, filterable by node; each card shows the clerk result and its delta with Apply and Reject and a markdown diff of what apply would change
  status: proposed
  satisfied-by: [page:web/decisions, op:decisions.list, op:deltas.apply, op:deltas.reject]
  requires-tests: [test:web-components#decision-card-diff]
  refines: req:wf2.ui

- id: req:wf2.ui.contradictions
  title: Open findings are one list
  when: the Contradictions entry opens
  then: open findings show both sides with their text and the explanation; Resolve asks for a decision or task, Dismiss asks for a reason
  status: proposed
  satisfied-by: [page:web/contradictions, op:contradictions.list, op:contradictions.resolve, op:contradictions.dismiss]
  requires-tests: [test:web-components#contradiction-actions]
  refines: req:wf2.ui

```

## Open questions

```yaml
- id: question:memory.eval-judge
  title: Who labels the judge's validation set, and how many pairs are enough?
  q: >
    The scores that use a model (contradiction, constraint violation, should-have-known) are only as good as the
    judge; the plan is 50 pairs labelled by the person and an agreement number shown beside every score. Is 50
    enough, and is the person the only labeller?
  context: MOOSEDev's validated-judge safeguard; decision:memory.evaluation prints the agreement next to the score.
  status: open
  related-to: [decision:memory.evaluation, decision:memory.benchmark]
- id: question:memory.code-source.kinds
  title: Which kinds may be defined in code, and may a product widen the list?
  q: >
    decision:memory.code-source draws the line at mechanism (entity, op, rule, gate, state, …) versus intent (goal, req,
    decision, constraint, question, task). Is a decision local to one file (an ADR about that class) allowed in code,
    or does it always belong in the tech design so the Inbox and the timeline see it?
  context: >
    A decision in code is invisible to the Inbox unless the code pass feeds it too; an ADR next to the class it is about
    is the most natural place for it. The v2 design keeps decisions immutable and reviewed.
  status: open
  related-to: [decision:memory.code-source, req:wf2.decisions]
- id: question:memory.code-source.writes
  title: Does Wye write into a product's code files?
  q: >
    A status change on a code-defined rule (`wf node set rule&#58;x --status shipped`) or an edit of its text in the web app
    rewrites a comment line in the product repo. Is that allowed from the app, or is a code-defined node read-only in
    Wye and changed only by editing the file (an agent or a person in the editor)?
  context: >
    Writing into another repo's working tree from the app crosses a boundary the v2 design kept closed (non-goals: git
    sync, automatic commits). Read-only is the safe first step; the agent that edits the code edits the comment.
  status: open
  related-to: [decision:memory.code-source, rule:atomic-file-write]
```
