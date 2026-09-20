---
node: plan:plan-build
type: plan
title: build it
status: building
owner: unassigned
last-verified: 2026-09-19
session: a95bf7bbe0 9f29fa036e
agent: claude-code
started: 2026-09-19T21:45:39.501Z
role: librarian
part-of: module:v2-plans
finished: 2026-09-20T08:47:46.555Z
---

# build it

## Request

> build it

_from: module:benchmarks_

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

The contract: module:benchmarks (the page, `proposed`), built on decision:memory.evaluation and decision:memory.public-benchmarks (both still `proposed`) and the requirements req:memory.eval-benchmarks, req:memory.eval-compare, req:memory.eval-page. What exists: test:verdict-bench only; no `eval/`, no `wf eval`, no page:web/eval, no op:api.eval, no store:eval-results. Prerequisites done: task:memory.constraint-packet, task:memory.verdict-pass, task:memory.benchmark, task:memory.bitemporal-props.

The build's steps, in order (decision:memory.eval-build-scope) — the existing open task lines this plan executes, with task:memory.eval-cli first and task:memory.eval-recordings last:

![[task:memory.eval-truth]]

![[task:memory.eval-suite]]

![[task:memory.eval-judge-set]]

![[task:memory.eval-compare]]

![[task:memory.eval-public]]

![[task:memory.eval-moosedev-import]]

![[task:memory.eval-reqpairs-loader]]

![[task:memory.eval-mab-adapter]]

![[task:memory.eval-page]]

Open questions on the area that do not block the build: question:memory.benchmark-positives (the positive set of test:verdict-bench; task:memory.impl.benchmark-positives), question:memory.eval-judge (fifty pairs, one labeller). Related, not in scope: task:exec.impact-benchmark, LongMemEval-V2 behind task:memory.instructions.

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here; the plan is defined when every one is agreed._

![[decision:memory.eval-build-scope]]

![[decision:memory.eval-tolerance]]

![[decision:memory.eval-first-live-runs]]

![[req:memory.eval-gate]]

![[task:memory.eval-cli]]

![[task:memory.eval-recordings]]

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

Built in the page's order (decision:memory.eval-build-scope): the `wye eval` family and the layout (task:memory.eval-cli), the truth and the five tier-1 suites, the judge set's scaffolding, the tier-2 harness, the three public adapters, the results as cards of the Evaluation project (task:memory.eval-cards replaced task:memory.eval-page mid-build — constraint:wf2.no-custom-pages; the page, its API and the rail entry I had built are removed), then the first live runs on haiku. The code map is on module:benchmarks (lib:eval, test:eval, store:eval-truth, store:eval-recordings, rule:eval-replay-or-fail, rule:eval-gate, rule:eval-arms-offline, rule:eval-cards). The proposed blocks of the Definition were built as written: 5 points (decision:memory.eval-tolerance, req:memory.eval-gate), haiku with the recordings committed (decision:memory.eval-first-live-runs).

```yaml
- id: decision:memory.eval-packet-hides-the-requirement
  title: The packet benchmark hides the requirement it queries with, and scores the governing set on its edges
  context: >
    The packet suite takes a shipped requirement's text as the request. Left in the graph, the requirement is the top
    semantic hit and its one-hop edges hand the packet the whole governing set — the benchmark would measure nothing.
  choice: >
    The requirement's own id is removed from the hits before seeding (the request stands in for a requirement nobody
    wrote yet); the truth is the rules, gates, constraints and decisions on its satisfied-by / governed-by / gated-by /
    affected-by edges, and its tests apart — the packet never carries tests, so `vector.tests-recall@10` is reported
    and not gated. Packet vs vector is then a fair pair: the same hits, with and without the two structural hops.
  alternatives: keep the requirement in the hits (trivial recall); score tests inside the same set (a ceiling the packet cannot reach).
  consequences: >
    The first numbers are honest and low — packet recall 59 % against vector@10 68 % on 62 requirements: the two hops
    over the governing verbs miss rules the plain vector finds directly. That is a finding about the packet, not the harness.
  date: 2026-09-20
  status: proposed
  by: agent:claude-code
  evidence: [session:9f29fa036e, eval/own/suites.js]
  affects: [req:memory.eval-benchmarks, decision:memory.constraint-packet]
- id: decision:memory.eval-arms-offline
  title: Tier-2 arms run without the app; the memory arrives only in the first message
  context: >
    module:benchmarks says the with arm starts a session as the app would and needs a runner online. A run with `wf`
    writes would land in the real product (the app serves the real tree), and an agent with `wf packet` in the
    without arm blurs the arms.
  choice: >
    The harness is the runner: it builds the with arm's first message the way the runner does (refs resolved, the
    packet, the plan's definition) under the full contract, the without arm under the base contract with the
    read-Wye-first section, the constitution and the product instructions cut; both run in a scratch worktree pinned
    to the pair's commit with WF_URL pointing at a closed port, and are told so. Blocks written are the worktree's
    documents against the pinned commit's; nothing reaches the real tree.
  alternatives: sessions through the app with a scratch product per run (a product per worktree does not exist); a live app the runs may write to.
  consequences: >
    "No runner online" becomes "the agent CLI is not installed"; rule:agent-runner is not the mechanism of req:memory.eval-compare's
    arms, lib:eval is. `wf` calls in a run fail fast — the agent reads files and runs ctx offline instead.
  date: 2026-09-20
  status: proposed
  by: agent:claude-code
  evidence: [session:9f29fa036e, eval/compare/index.js]
  affects: [req:memory.eval-compare]
- id: decision:memory.eval-moosedev-released-corpus
  title: MOOSEDev runs on the released corpus; the tasks that need withheld edges are reported not runnable, never zero
  context: >
    bench/release/corpus/codegraph.json carries the 835 records as title, kind, lifecycle status and text; the graph's
    edges (constrains, isMotivatedBy, supersedes) live in a MOOSEDev store the release does not ship and only their
    bootstrap over the CodeGraph repository regenerates.
  choice: >
    The import keeps kind (their two ontologies as base kinds and four type cards), status (accepted → approved,
    deprecated → retired, superseded, proposed), text and provenance; requirements as prose lines so the lint does not
    ask them for a mechanism. Runnable: the seven set-completeness tasks, the two status-based supersession tasks,
    currency and relevance (12 of 17); negation, multi-hop and the two replacement tasks are marked not runnable on
    the report with the reason. Their judge prompt is vendored unchanged and runs on this repo's judge model, not
    GPT-5.4-mini — the report says so.
  alternatives: regenerate their KG with MOOSEDev's bootstrap (their binary, an LLM, hours); score the missing tasks 0.
  consequences: the four numbers are three numbers and a blank until the edges exist (task:memory.eval-moosedev-edges).
  date: 2026-09-20
  status: proposed
  by: agent:claude-code
  evidence: [session:9f29fa036e, eval/public/moosedev/index.js, eval/public/moosedev/data/repo/bench/release/README.md]
  affects: [decision:memory.public-benchmarks]
- id: decision:memory.eval-mab-adjudication-by-subject
  title: The MemoryAgentBench adapter judges only the facts that share a subject
  context: >
    FactConsolidation injects hundreds of facts; the design says a fact that conflicts with an earlier one supersedes
    it through the judge. Every fact against every earlier one is thousands of pairs — hours through the CLI judge.
  choice: >
    Candidates are the earlier facts with the same subject key (the text before its last preposition or copula);
    those pairs go to the judge in batches of ten and a `contradicts` verdict makes the later fact supersede the
    earlier (status superseded, `supersedes:` on the later one); the app's search then hides the superseded ones by
    construction. 455 facts of the 6k tier gave 141 candidate pairs.
  alternatives: every pair (too slow); no judge — same key means supersedes (no adjudication measured).
  consequences: a conflict phrased with a different subject wording is missed; the 6k tier has no published row, the 32k numbers are quoted as the nearest.
  date: 2026-09-20
  status: proposed
  by: agent:claude-code
  evidence: [session:9f29fa036e, eval/public/memoryagentbench/index.js]
  affects: [decision:memory.public-benchmarks]
- id: lesson:memory.eval-pin-the-commit
  statement: >
    A tier-2 pair's worktrees were made from HEAD one by one; a commit landed while the runs went and every later run
    started from a different tree than the baseline, so their "blocks written" were the commit's edits. A pair pins
    the commit it starts from and every worktree, and `--resume`, uses it.
  about: [lib:eval, req:memory.eval-compare]
  status: proposed
  by: agent:claude-code
  evidence: [session:9f29fa036e]
- id: question:memory.eval-judge-through-the-cli
  q: >
    Every judge call goes through `claude -p` (decision:memory.model-calls-via-cli) at 30–50 seconds a call, so the
    consolidation suite is twenty minutes, a MOOSEDev judge pass or a MemoryAgentBench tier an hour, and a 500-pair
    requirement set several hours. Should the harness (only) call the Messages API directly with the same prompts and
    model, or is the CLI's latency accepted for evaluation?
  context: the eval sizes module:benchmarks asks for (three passes, 500-pair samples, five runs per arm) are gated by this more than by cost.
  status: open
  by: agent:claude-code
- id: question:memory.reqpairs-source
  q: >
    Where do the WorldVista / UAV / PURE / OpenCOSS pair files come from? The papers' repositories (Malik et al.
    2301.03709; the S3CDA paper) were not public on 2026-09-20 and no URL serves the CSVs; the loader expects
    eval/public/reqpairs/data/<set>.csv with req_a, req_b, label.
  context: task:memory.eval-reqpairs-loader is built and tested on a fixture; the benchmark itself cannot run until the files are there.
  status: open
  by: agent:claude-code
```


## Tasks

_`- [ ] task:` lines, `part of plan:plan-build`; their check state is what is in progress._

- [ ] task:memory.eval-label-judge-set Label the judge set: `wye eval judge --sample 50` wrote fifty candidate pairs into eval/judge/labels.jsonl with `label: null`; the person fills contradicts | duplicate | refines | consistent, then `wye eval judge --agreement --live` gives the first κ every model-scored number shows (question:memory.eval-judge). Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:memory.eval-reqpairs-data Obtain the WorldVista / UAV / PURE / OpenCOSS pair files (question:memory.reqpairs-source), put them under eval/public/reqpairs/data/, run `wye eval public reqpairs --run --sample 500 --live` per set and quote the macro-F1 on module:benchmarks. Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:memory.eval-moosedev-edges Regenerate the CodeGraph knowledge graph with MOOSEDev's bootstrap (or ask the authors for the graph export) so the negation, multi-hop and replacement tasks become runnable (decision:memory.eval-moosedev-released-corpus); then the four numbers are four. Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:memory.eval-compare-on-a-plan Compare on a plan (req:memory.eval-compare): a Compare action on a plan's request task that runs `wye eval compare` with the plan's request, refs and definition, and the pair embedded on the plan; ui-test:eval-compare. Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:memory.eval-compare-later-scores The tier-2 scores filled in later — reverted change records and tasks bounced from review within seven days of a pair — `wye eval compare --pair <id> --rescore` reads them from the change records and the Work view; today they are null. Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:memory.eval-weekly-numbers Tier 3's weekly product numbers (req:memory.eval-page as it was: sessions, share citing a node, contradictions at write time vs later, Inbox accept / revert, bounced tasks, should-have-known questions, request → defined → done) as cards of a type of the Evaluation project, written by `wye eval weekly`, shown by a view block; the computation existed on the removed page and was dropped with it. Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:memory.eval-consolidation-labels The consolidation suite's second set: eval/own/consolidation-labels.json where the person marks which misses (listed in the results file) were real decisions the prompt should have found; the suite reports recall over that set beside the strict one. Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:memory.eval-mab-in-their-harness Run wye_adapter.py inside MemoryAgentBench's own harness (conda env, GPT-4o-mini reader) on factconsolidation_sh_32k so the number is on their footing; the standalone runner's 6k number is the first one. Part of plan:plan-build, part of goal:memory.validated-asks.
- [ ] task:plan-build build it #in-progress (worker: claude-code, session: a95bf7bbe0 9f29fa036e, produced: module:app module:memory-review module:benchmarks plan:plan-build-2 module:app-work module:prd-execution module:todo module:zz-list-test module:app-documents plan:plan-reply-single-word-pong-nothing-else plan:plan-reply-single-word-pong-nothing-else-2 plan:plan-have-lot-docs-now-about-wye module:wf2-dev module:wf2 module:wf2-prd module:eval-results module:eval-ontology module:app-agents module:eval-runs module:users-and-jobs module:constitution module:experience module:app-shell module:pages module:components module:interaction-rules module:domain module:entities module:stores module:api module:quality module:decisions module:req-documents module:req-knowledge module:req-work module:req-definition module:req-agents module:req-memory module:req-ontology module:req-shell module:req-storage module:req-graph module:req-viewer module:app-knowledge module:librarian module:memory module:ontology-engine module:shell-engine module:app-storage module:app-graph module:viewer module:wf2-test module:ontology module:research module:ontology-design module:archive module:waterfall module:archive-prd module:session-notes module:wf2-plan module:req-wye module:archive-project plan:plan-rename-project-are-working-form-waterfall)

## Result

_Left unfinished — a new request replaced it on 2026-09-20._

Blocks this plan produced:

- added decision:memory.eval-build-scope — The benchmarks harness is built whole, in the page's order — tier 1, judge set, tier 2, public, page
- added decision:memory.eval-tolerance — A suite fails the run when its score drops more than 5 points below the previous file
- added decision:memory.eval-first-live-runs — The build includes the first live runs on haiku, with the recordings committed
- added req:memory.eval-gate — A suite's drop against the previous run fails the eval
- added task:memory.eval-cli — memory.eval-cli
- added task:memory.eval-recordings — memory.eval-recordings
- added verdict:9eb7be978320 — refines decision:memory.evaluation — B provides the implementation plan (specific tasks and order) for what A 
- added verdict:3134614926af — refines decision:memory.public-benchmarks — B specifies the build plan and task order for the public benchmark
- added verdict:759d97044b5d — refines req:memory.eval-benchmarks — B describes building the tier-1 suite (wf eval own) that implements the s
- added verdict:3d99f003dab5 — refines req:memory.eval-compare — B specifies eval-compare as a tier-2 task in the build plan, implementing th
- added verdict:3cdcc0852a84 — refines req:memory.eval-page — B specifies the evaluation page (task:memory.eval-page) as the final task in th
- added verdict:b7a80a33d6ce — refines req:memory.eval-gate — B includes building the tier-1 suite (task:memory.eval-suite) that would implem
- added verdict:b113716e05c2 — refines decision:memory.eval-tolerance — B includes building the tier-1 suite that would apply the 5-point tol
- added verdict:48dadf3257eb — refines decision:memory.benchmark — B specifies building the tier-1 suite (task:memory.eval-suite, wf eval own
- added verdict:2cc18377fc43 — refines req:memory.eval-benchmarks — B specifies the tolerance value (5 points) that A states abstractly as 'm
- added verdict:47219d169a07 — refines decision:memory.evaluation — B specifies the 5-point tolerance threshold that implements the tier-1 be
- added verdict:436617b81803 — refines decision:memory.evaluation — A prescribes a three-tier evaluation framework with a prerequisite (tier-
- added verdict:9b9be5768617 — refines req:memory.eval-benchmarks — A requires benchmarks with specific metrics and tolerance-based failure;

18 paragraphs added or changed — [per document](/waterfall/sessions/a95bf7bbe0/changes)
