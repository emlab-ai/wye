---
node: module:benchmarks
type: module
title: Benchmarks — set up, run, compare
status: proposed
owner: alex
last-verified: 2026-09-19
order: 10
sources:
  - lib/graph.js                       # packet, impact, check — the functions tier 1 scores
  - packages/web/src/lib/artifacts.ts  # block attribution — the session ground truth
  - test/smoke.js                      # the test runner the eval suite joins
---

# Benchmarks — set up, run, compare

How Wye's memory is measured: the suite decided in decision:memory.evaluation and decision:memory.public-benchmarks, as the person runs it. One piece exists — the verdict-pass benchmark, `node test/verdict-bench.js` (test:verdict-bench, decision:memory.benchmark): 12 drift-row pairs as positives, 30 same-kind neighbour pairs as negatives, verdicts recorded in `test/fixtures/verdict-bench.json` for CI, `WATERFALL_LIVE=1` for a new model or prompt; first live numbers on 2026-09-19 with haiku: recall 17 %, precision 100 % — low recall because the drift rows are document-versus- reality findings, not two nodes that contradict each other (question:memory.benchmark-positives). The rest of this page is the contract the harness is built to (task:memory.eval-suite, task:memory.eval-compare, task:memory.eval-public, task:memory.eval-page): every command is the one the harness must provide, in the shape of the one that exists, and the numbers quoted for other systems are theirs, with the source.

Three rules, from the papers' near-misses (MOOSEDev nearly shipped three wrong conclusions):

1. **Ground truth never comes from the thing being measured.** Tier 1 takes it from edges, commits, sessions and the Inbox; public benchmarks bring their own; a model never labels its own test.
2. **Everything a score depends on is recorded with it**: graph sha, model, prompt hashes, judge, date. A score without them is not a score.
3. **Transcripts are immutable.** A with-and-without pair is kept as it ran; re-grading is allowed, re-running replaces nothing.

## Layout

```
eval/
  own/            tier 1: benchmarks on the product's own history (one file per claim)
  compare/        tier 2: the with-and-without harness
  public/         public benchmarks, one folder per adapter, each with its licence and source
    moosedev/     corpus import, question runner, their judge prompt (vendored), published baselines
    reqpairs/     WorldVista / UAV / PURE / OpenCOSS loaders and the pair-judge runner
    memoryagentbench/   the Wye adapter for the conflict-resolution competency
  judge/          the judge prompts, the 50-pair human label set, the agreement script
  recorded/       recorded model outputs so CI runs without a model
data/products/<product>/_build/eval/<date>-<suite>.json    results (store:eval-results)
```

```yaml
- id: store:eval-results
  path: data/products/<product>/_build/eval/<date>-<suite>.json
  format: json
  purpose: >
    One run of one suite: `{ suite, date, graphSha, model, promptHashes, judge, scores: { <benchmark>: { value, n,
    ci?, baseline?, previous? } }, runs: [...] }`. Derived, never edited; the Evaluation page reads the folder.
  part-of: module:benchmarks
```

## Prerequisites

- A built graph: `wye build` (tier 1 reads `_build/graph.json` and the embeddings, `_build/embeddings.json`).
- For live runs, a model key in the environment and `WATERFALL_LIVE=1`; without it every suite replays `eval/recorded/` and fails if a recording is missing.
- For tier 2, a runner online for the agent under test (`wye agent listen --product <p> --agent claude-code`) and a clean working tree — the harness makes scratch worktrees from HEAD.
- For public benchmarks, the corpus downloaded once into `eval/public/<adapter>/data/` (each adapter's README says where from and under which licence; nothing is committed).

## Tier 1 — the product's own history

```
wye eval own [--product <p>] [--suite packet|currency|contradictions|impact|consolidation|all] [--live]
```

| suite | what it does | ground truth | score |
|---|---|---|---|
| `packet` | for every shipped requirement, takes its text as a request, builds the constraint packet and the top-k vector hits | the rules, gates, decisions and tests on its satisfied-by / verified-by / governed-by edges | recall of that set — packet vs vector; median packet size |
| `currency` | for every node with `supersedes`, queries with the superseded one's title | the superseding node | rank of the current one; superseded ones served (should be 0) |
| `contradictions` | exists: `node test/verdict-bench.js [--negatives 30] [--json]` — the drift-row pairs to the judge, a fixed sample of same-kind neighbour pairs as negatives | the drift rows (positives); pairs in no drift row (negatives) | recall by conflict kind; precision proxy — the share of negatives left alone. 17 % / 100 % on 2026-09-19 (haiku); the positive set needs true node-vs-node contradictions (question:memory.benchmark-positives) |
| `impact` | for every commit (and every session) that changed a typed block together with other blocks, runs the candidate step on the first block | the co-changed blocks | recall@5 / @10 — structural, semantic, blended |
| `consolidation` | for every session that wrote decision blocks, hides them and runs the consolidation on the transcript | the hidden blocks | recall; the misses a person labelled as real are the second set |

The run writes `_build/eval/<date>-own.json`; `--live` (WATERFALL_LIVE=1, as test:verdict-bench does) calls the model, otherwise recordings under `test/fixtures/` or `eval/recorded/`. A suite whose score drops by more than its tolerance against the previous file exits non-zero — that is the CI gate for the memory features (decision:memory.evaluation: nothing in the memory review is switched on by default before its number is on the page).

Building the ground truth once, so runs are cheap and repeatable:

```
wye eval own --build-truth          # writes eval/own/truth-<product>-<graphSha>.json
```

— the requirement → governing-set table, the supersession pairs, the hidden-edge list, the commit and session co-change sets (from `git log --name-only` over the documents and from each session's attributed blocks), and the session → decision-block list. The file names the graph sha it was built from; a run against a different graph rebuilds it.

## Tier 2 — with and without, on the same request

```
wye eval compare --product <p> --request "<text>" [--ref <id>...] --agent claude-code --runs 5 [--arms with,without]
```

What the harness does, per run:

1. Makes a scratch worktree from HEAD (`git worktree add`), one per run, so nothing lands in the real tree.
2. **with**: starts a session as the app would — constraint packet, approved instructions, the plan's definition if `--plan <id>` is given. **without**: the same instruction with the base contract only; `wye context`, `wye packet` and the instructions section are withheld from the prompt (the agent can still read files).
3. Keeps the transcript, the diff and the blocks the session wrote, immutable, under `_build/eval/compare/<pair-id>/<arm>-<n>/`.
4. Scores each run (`eval/compare/score.ts`):

| score | how |
|---|---|
| constraint violations | the verdict pass over the blocks the session wrote and over a summary of its diff, against the approved constraints (constitution) |
| node ids cited | count of graph ids in the transcript's assistant turns that resolve |
| should-have-known questions | the agent's questions to the person that the packet answers (judge, with the packet as evidence) |
| reverted / bounced | change records reverted and tasks bounced from review within 7 days — filled in later, the pair stays open until then |
| tokens, wall time | from the session's usage events |
| human mark | a blind 1–5 per pair on the Evaluation page (which run is right; arms hidden until marked) |

1. Writes `_build/eval/<date>-compare.json` with the pair, the two arms' scores, n, and the judge's agreement number from `eval/judge/`.

Read it as: the same agent, the same model, the same request; the only difference is the memory. Five runs per arm is the floor — agents are not deterministic, and a single pair proves nothing. Compare on a plan (req:memory.eval-compare) is this command with the plan's request task and refs.

## Public benchmarks

### MOOSEDev bench — structured memory vs vector memory

Source: github.com/Trivyn/moosedev, `bench/` (Apache-2.0). Published: MOOSEDev 1.00 set completeness / 0.98 negation / 0.98 supersession / 0.82 relevance; mem0 0.18 / 0.06 / 0.27 / 0.67–0.90 (arxiv.org/abs/2608.13662, Table: public-corpus run). Judge: GPT-5.4-mini, strict — "allowed paraphrase but rejected answers on the correct topic with the wrong facts" — mean of three passes; ground truth authored from primary sources or SPARQL-derived sets.

```
wye eval public moosedev --fetch                  # clones bench/ into eval/public/moosedev/data (read its README first: file names below are to be confirmed against it)
wye eval public moosedev --import                 # corpus → data/products/eval-moosedev/projects/codegraph/docs/*.md
wye eval public moosedev --run [--live] [--judge-passes 3]
wye eval public moosedev --report                 # the four numbers beside theirs
```

Import: each typed record becomes a yaml card of a type declared in `ontology.md` of the scratch product (their two ontologies — software-engineering, software-architecture — map to `type:` cards with `extends`, the lifecycle status to `status`, supersession to `supersedes`, so decision:memory.bitemporal is what is being tested); provenance keeps the record id. `wye check` must be green on the import before any run — an import error would be scored as a memory error.

Run: each question is answered by an agent turn whose only tools are `wye packet --for`, `wye context`, `wye node`, `wye resolve` (no file reads: the benchmark is the memory, not the agent's ability to read the corpus), with the same token budget the paper reports (~35k agent tokens). Answers go to their judge prompt, vendored unchanged; three passes, mean. Report: four numbers, ours beside theirs and mem0's, with model, date, graph sha, judge.

What a result means: relevance at parity with theirs is expected (the paper found none between structured and vector systems); completeness, negation and supersession near 1.0 say the packet and the currency filter work; below mem0's on any of them says a structural query is missing, and the failing questions name which.

### Requirement pairs — the verdict judge

Source: WorldVista (10 878 pairs), UAV (6 670), PURE, OpenCOSS (6 786, 10 conflicts) — labelled conflict / neutral, from Malik et al. (arxiv.org/abs/2301.03709; loaders in that paper's repository) with duplicate labels from PassionNet (arxiv.org/abs/2412.01657). Published: macro-F1 0.908 WorldVista, 0.948 PURE, 0.877 UAV (fine-tuned transformers).

```
wye eval public reqpairs --fetch                  # the CSVs into eval/public/reqpairs/data (columns: req_a, req_b, label)
wye eval public reqpairs --run --set worldvista|uav|pure|opencoss [--sample 500] [--live]
wye eval public reqpairs --report
```

Run: the pair judge of decision:memory.write-time-verdict (the same prompt, the same model) classifies each pair as contradicts | duplicate | consistent; `conflict` ↔ contradicts, `neutral` ↔ consistent or duplicate (PassionNet's duplicate label separately where present). Score: macro-F1 per set, plus the confusion matrix. `--sample` stratifies by label so OpenCOSS's ten conflicts are all in. This measures the judge alone — the pairs come with no graph — which is the point: the judge gates the Inbox, and it should not gate anything below the published range.

### MemoryAgentBench — conflict resolution against Mem0, Letta, Cognee

Source: github.com/HUST-AI-HYZ/MemoryAgentBench (ICLR 2026, MIT). Four competencies; Wye enters one, conflict resolution (FactConsolidation, EventQA), where the repo's own adapters give the numbers for Mem0, Letta and Cognee.

```
wye eval public memoryagentbench --fetch
wye eval public memoryagentbench --run --competency cr [--live]
wye eval public memoryagentbench --report
```

Adapter (`eval/public/memoryagentbench/wye_adapter.py`, the repo's adapter interface): *add* writes each injected text as a prose node with `since` the injection order and runs write-time adjudication — a fact that conflicts with an earlier one supersedes it (decision:memory.bitemporal, decision:memory.write-time-verdict); *query* answers from `wye packet --for` with the currency filter on. The metric is the repo's (substring exact match / LLM-judge F1 per task); report ours beside the three adapters', same split, same judge.

### LongMemEval-V2 — later

Source: xiaowu0162.github.io/longmemeval-v2 (CC BY 4.0); 451 questions over 100–500 agent trajectories per tier (25M–115M tokens). Enters when the instruction layer exists (decision:memory.instructions-compiled): trajectories → consolidation → lessons → instructions, questions answered from instructions plus packet. Published: AgentRunbook-C 74.9% small tier, RAG 42.8%, no memory 14.1%. Not before task:memory.instructions; the cost is the trajectories.

## The judge

Every model-scored number (contradictions, constraint violations, should-have-known) is only as good as the judge. `eval/judge/labels.jsonl` holds 50 pairs the person labelled (question:memory.eval-judge: is fifty enough, and is the person the only labeller); `wye eval judge --agreement` runs the judge over them and prints Cohen's κ, which the Evaluation page shows next to every score that used it. A judge change (model or prompt hash) reruns the agreement before any suite accepts it.

## Reading and showing results

`wye eval report [--suite …] [--since <date>]` prints the latest scores, the previous ones and the delta. In the app the results are documents of this project, not a page of their own (constraint:wf2.no-custom-pages): every run is an `eval-run:` card with its `eval-score:` cards (type:eval-run, type:eval-score in this project's ontology page), written by the harness into the runs document; results.md shows them with the existing data table and instances view blocks — filtered, grouped and sorted like any other type — and the same for tier-2 pairs (type:eval-pair) and the public benchmarks (type:eval-public, ours beside the published number with source, date, model, judge).

How to say it outside Wye: quote the public numbers with their source and date; quote ours with model, judge and graph sha; never a with-and-without pair with fewer than five runs per arm; never a judge-scored number without its κ.

## First numbers — 2026-09-20

Live on claude-haiku-4-5-20251001, graph `b781bf999603`, git `881041e`; judge κ not measured yet (the fifty pairs of eval/judge/labels.jsonl wait for their labels — task:memory.eval-label-judge-set), so every model-scored number below is unqualified. The cards are on the Runs page (module:eval-runs); `wye eval report` prints the same.

| suite | score | value | n | read |
|---|---|---|---|---|
| packet | packet.recall | 61.2 % | 64 | the constraint packet (top-6 seeds, two hops) holds 61 % of the governing set on a shipped requirement's edges — with the requirement itself hidden from the hits (decision:memory.eval-packet-hides-the-requirement) |
| packet | vector.recall@10 / @20 | 69.7 % / 75.7 % | 64 | the plain top-k finds more of the same set than the packet: the two structural hops lose rules the vector reaches directly — the first thing to fix in the packet |
| packet | packet.size-median | 53 nodes | 64 | not gated |
| currency | currency.mrr; superseded-served | 1.0; 0 | 1 | one supersession in the product: the current node ranks first, nothing ended is served — n is too small to mean much yet |
| contradictions | recall / precision | 16.7 % / 100 % | 12 / 30 | unchanged from test:verdict-bench: two of twelve drift pairs come back as contradicts (question:memory.benchmark-positives) |
| impact | blended.recall@10 (structural / semantic) | 30.4 % (25.7 / 26.5) | 86 | of the blocks a commit or a session changed together, the candidate step reaches 30 % in its top ten from the first block; 86 co-change sets from 68 commits and 18 sessions |
| compare | pair 2026-09-20-42c63c, 5 runs per arm | violations 1.2 vs 3.8; ids cited 1.4 vs 0; files changed 0.6 vs 2.4 | 5 / 5 | the request "after a session ends with status done, automatically commit the documents it changed" — which constraint:wf2.local-first forbids. With the packet haiku mostly refused and wrote a decision or a question instead (1.2 constitution violations per run, judged); without it, it built the auto-commit (3.8 violations, 2.4 files). Blind mark not given yet; κ n/a |
| consolidation | recall (strict / loose) | 19.1 % / 27.7 % | 94 | 18 of 94 hidden decision blocks over 24 sessions come back as candidates of the consolidation prompt (word overlap ≥ 0.5 / ≥ 0.35); the misses a person marks real are the second set (task:memory.eval-consolidation-labels) |
| public: MemoryAgentBench | FactConsolidation SH, 6k tier | 92 % | 100 | substring exact match, standalone runner, haiku reader over the app's search with the currency filter (141 candidate pairs judged, 140 facts superseded at write time); their Table 3 (GPT-4o-mini backbone, main tier): Mem0 18, MemGPT 28, Cognee 28, BM25 48; the 6k tier has no published row — the 32k numbers (Mem0 22, Cognee 39) are the nearest |

## Code

Built 2026-09-20 (pr:18). `wye eval` runs in the CLI process: it parses the product's documents itself (lib/parse, lib/graph), asks the running app only for what needs a model — semantic hits, packets — and records those answers, so a replay needs neither.

```yaml
- id: lib:eval
  file: eval/cli.js
  side: server
  part-of: module:benchmarks
  purpose: >
    The harness: eval/cli.js dispatches `wye eval own | compare | public <adapter> | judge | report | cards`;
    eval/lib/results.js is store:eval-results with the gate (req:memory.eval-gate) and the report;
    eval/lib/record.js the recordings; eval/lib/product.js the product as a lib/graph Graph with its graph sha
    (sha1 over the documents), git sha, sessions and change records; eval/lib/app.js the app client;
    eval/lib/cards.js the results as cards of module:eval-ontology; eval/own/truth.js the ground truth,
    eval/own/suites.js the five tier-1 suites; eval/compare the tier-2 harness and its scorer; eval/judge the
    label set and κ; eval/public the three adapters. Satisfies req:memory.eval-benchmarks,
    req:memory.eval-compare, req:memory.eval-page; verified by test:eval.
- id: test:eval
  file: test/eval.js
  purpose: >
    The gate and the results files (#packet-completeness, #currency, #contradictions, #impact-cochange replay the
    recordings on the product's own history; #consolidation replays when its recording covers every session), the
    recordings' replay-or-fail rule, Cohen's κ, the without arm's contract (#compare-harness), the
    requirement-pairs pipeline on a ten-pair fixture, and the cards written for a run (#cards-written). No model,
    no app. In `npm test`.
- id: store:eval-truth
  path: eval/own/truth-<product>-<graphSha>.json
  format: json
  purpose: >
    Tier 1's ground truth, built once per graph sha and never committed: every shipped requirement with the
    governing set on its edges and its tests, the supersession pairs, the commits and sessions that changed typed
    blocks together, the sessions whose decision blocks the consolidation suite hides. Running or finished
    sessions only.
- id: store:eval-recordings
  path: eval/recorded/<name>.json
  format: json
  purpose: >
    Every model or embedding answer a suite needed, keyed by what was asked (a text, a pair, a session and its
    excerpt) with the model and prompt hash: semantic-<product>, consolidation, judge, compare-shk, public-*.
    Committed; CI replays them and a suite whose recording is missing fails (rule:eval-replay-or-fail).
- id: rule:eval-replay-or-fail
  statement: >
    Without `--live` (WATERFALL_LIVE=1) a suite is served only by its recording; an answer the recording lacks
    throws MissingRecording and the suite fails — it never silently shrinks to what was recorded.
  source: eval/lib/record.js:22
  status: shipped
- id: rule:eval-gate
  statement: >
    Every gated score carries its tolerance (5 points unless the score says otherwise); a run compares each score
    with the latest previous file of the same suite, writes previous and delta beside it, and exits 2 after every
    suite ran when a delta is below minus the tolerance (a lower-is-better score flips); `--baseline "<why>"`
    accepts the new scores and writes the reason into the file; sizes and counts marked `gated: false` are never
    gated.
  source: eval/lib/results.js:24
  status: shipped
- id: rule:eval-arms-offline
  statement: >
    A tier-2 run cannot reach the app (WYE_URL points at a closed port) and works in a scratch worktree pinned to
    the commit the pair started from; the with arm's memory — the packet, the constitution, the product
    instructions, the plan's definition — arrives only in its first message, the without arm gets the base
    contract only; a kept run is never re-run, `--resume` makes the missing ones.
  source: eval/compare/index.js:26
  status: shipped
- id: rule:eval-cards
  statement: >
    After every results file is written the Evaluation project's runs document is regenerated from all of them: an
    eval-run per file, an eval-score per number (not for compare, whose numbers live on the pair), an eval-pair
    per pair with its arms hidden until every run is marked, an eval-public per public row.
  source: eval/lib/cards.js:50
  status: shipped
```

## Work

<!-- tasks -->
- [x] task:memory.eval-truth `wye eval own --build-truth`: the ground-truth file from edges, supersessions, hidden edges, git and session co-changes, session decision blocks; keyed by graph sha. Part of goal:memory.validated-asks (decision:memory.evaluation). First step of task:memory.eval-suite. (session: 9f29fa036e)
- [ ] task:memory.eval-judge-set `eval/judge/labels.jsonl` (50 pairs labelled by the person), `wye eval judge --agreement` (Cohen's κ), rerun on judge change. Part of goal:memory.validated-asks (question:memory.eval-judge).
- [x] task:memory.eval-moosedev-import The MOOSEDev corpus importer: their two ontologies as type cards, records as yaml cards with status and supersedes, provenance kept, wye check green; their judge prompt vendored with licence. Part of goal:memory.validated-asks (decision:memory.public-benchmarks). Part of task:memory.eval-public. (session: 9f29fa036e)
- [x] task:memory.eval-reqpairs-loader Loaders for WorldVista / UAV / PURE / OpenCOSS and the stratified sample; label mapping to the verdict classes; macro-F1 and confusion matrix. Part of goal:memory.validated-asks. Part of task:memory.eval-public. (session: 9f29fa036e)
- [x] task:memory.eval-mab-adapter The Wye adapter for MemoryAgentBench (add with write-time adjudication, query through the packet with currency), run on conflict resolution, report beside Mem0 / Letta / Cognee. Part of goal:memory.validated-asks. Part of task:memory.eval-public. After task:memory.bitemporal-props. (session: 9f29fa036e)
<!-- /tasks -->

```yaml
- id: task:memory.eval-cli
  text: >
    The `wye eval` command family and the `eval/` layout as the page gives them — `wye eval own | compare | public
    <adapter> | judge | report` with the flags shown, `eval/{own,compare,public,judge,recorded}`, lib:eval writing
    store:eval-results (`{ suite, date, graphSha, model, promptHashes, judge, scores, runs }`) with the tolerance
    and the gate of req:memory.eval-gate, `wye eval report` printing latest / previous / delta; test/smoke.js runs
    the suites on recordings. First step of the build, before task:memory.eval-truth. Part of
    goal:memory.validated-asks (decision:memory.eval-build-scope).
  status: done
  part-of: pr:18
  session: 9f29fa036e
- id: task:memory.eval-recordings
  text: >
    The first live runs (decision:memory.eval-first-live-runs): every tier-1 suite, `wye eval judge --agreement`,
    one tier-2 pair with five runs per arm, each public adapter on its sample, with WATERFALL_LIVE=1 on haiku;
    eval/recorded/ and the first `_build/eval/<date>-*.json` committed; the numbers quoted on module:benchmarks
    with model, judge, graph sha and date. Last step of the build, after task:memory.eval-page. Part of
    goal:memory.validated-asks.
  status: open
  part-of: pr:18
```
