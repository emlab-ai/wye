---
node: module:memory
type: module
title: Memory
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:app
order: 46
---

# Memory

Memory

## Decisions

<!-- list:decision -->

```yaml
- id: decision:memory.constraint-packet
  title: >
    A request's first message carries the constraints in force, computed structurally, not found by the agent
  date: 2026-09-19
  status: approved
  affects: [rule:agent-contract, op:api.context, req:wf2.api.packet-task]
  part-of: goal:memory.validated-asks
```

  - choice:memory.constraint-packet At intake the app computes a constraint packet and puts it under `## Constraints in force` in the first message: seeds = the attached refs plus the top semantic hits for the instruction (op:api.context, seeds only); the packet = every rule:, constraint:, gate:, approved decision: and goal: (non-goals included) reachable from the seeds over governs / governed-by, gated-by, affects, refines, part-of and depends-on within two hops, plus every open question: on those nodes — the complete set, ordered by kind, each with id, one-line statement and status; superseded, rejected and retired nodes are excluded by construction (decision:memory.bitemporal). The same packet is `wye packet --for "<text>"` / op:api.packet for an agent mid-session. The vector search finds seeds; it is never the authority on what governs.

  - context:memory.constraint-packet buildPrompt sends the instruction and the refs the person attached; rule:agent-contract asks the agent to run `wye context` first. MOOSEDev measured vector memory at 0.18 completeness and 0.27 on supersession traversal against 1.00 / 0.98 for graph traversal; STALE measured that models comply with a stale premise even when the update was retrieved. Validation that depends on the agent remembering to look is not validation.

  - alternative:memory.constraint-packet Keep the contract as is and trust the agent (measured to fail); send the whole graph (does not fit and buries the rules); ask the clerk at intake (a model call where a traversal suffices).

  - consequence:memory.constraint-packet Every session starts from the same picture of what it may not break; the agent cites constraints because they are in front of it; the packet is the input the write-time verdict pass (decision:memory.write-time-verdict) classifies against; the first message grows by the size of the packet (budgeted like wye graph packet).

```yaml
- id: decision:memory.bitemporal
  title: >
    Every node can say since when and until when it holds, and what superseded it; current means not ended
  date: 2026-09-19
  status: approved
  affects: [type:node, type:decision, op:api.context, req:wf2.decisions]
  part-of: goal:memory.validated-asks
```

  - choice:memory.bitemporal type:node gains `since: date?`, `until: date?`, `superseded-by: ref node? -(inverse)-> supersedes`, `by: string?` (who wrote it: a person or `agent:<name>`) and `session: string?` (already used on tasks). Statuses gain `superseded` for decision, req and rule and `retired` for constraint. A decision that supersedes another sets `supersedes:` and the parser fills `until` and `superseded-by` on the old one at build time (generated, never written, like inverses). `ctx`, op:api.context and the constraint packet exclude nodes with `until` in the past or status superseded / rejected / retired unless asked (`--as-of <date>` or `--all`); the node page shows the chain.

  - context:memory.bitemporal type:decision is "immutable, superseded by later decisions" in the v2 design, but type:node has no since, until or superseded-by, decision statuses stop at rejected, and op:api.context ranks a superseded decision like a current one. Zep / Graphiti, TOKI and MOOSEDev all carry valid time on facts and filter invalid ones by construction.

  - alternative:memory.bitemporal A database row per decision with validFrom / validTo (the v2 design's decision table — a second store for what the document already says); deleting superseded blocks (loses the audit trail TOKI and the provenance survey require).

  - consequence:memory.bitemporal Memory becomes honest about time at the cost of five optional properties on type:node; `wye check` gains a shape "a superseded node names its successor"; the Decisions timeline can show supersession chains; the Inbox shows a proposed decision's supersedes target so approving it retires the old one in one act.

```yaml
- id: decision:memory.write-time-verdict
  title: >
    A new decision, requirement, rule or constraint is classified against its neighbours when it is written,
    before the Inbox
  date: 2026-09-19
  status: approved
  affects: [req:wf2.contradictions.semantic, req:wf2.clerk, rule:inbox-review, rule:block-attribution]
  part-of: goal:memory.validated-asks
```

  - choice:memory.write-time-verdict When the graph rebuilds and a decision:, req:, rule: or constraint: block is new or changed (the diff rule:block-attribution already computes), the app runs a verdict pass: for each neighbour of the same kinds within two hops (and every approved constraint), one call classifies the pair as duplicate | refines | consistent | contradicts with a one-sentence reason; the verdicts are written on the new node as `verdicts:` content blocks (verdict:<hash> — pair, kind, reason, model, prompt hash; generated once, kept), and duplicate / contradicts become open contradiction: nodes with kind static | dynamic | conditional (MemConflict's split). The Inbox row shows the verdicts; approving a block with an open contradicts verdict requires choosing: supersede the other side, refine this one, or dismiss with a reason. `wye check --strict` errors on an open contradiction touching shipped work (req:wf2.contradictions.strict, unchanged). The pass is budgeted (pairs per rebuild, tokens) and cached by pair hash.

  - context:memory.write-time-verdict req:wf2.contradictions.semantic puts classification in a clerk run after a decision is posted to a database. Nothing is built, decisions are blocks in documents now, and the research places the gain at the write: STALE's write-side adjudication (8.7% → 68%), Mem0's operation classification, TOKI's keyed judge log. The Inbox is where a person already looks at every proposed block.

  - alternative:memory.write-time-verdict The v2 clerk as designed (runs on decisions.post to a DB; the DB no longer exists); a lint --deep over all pairs on demand (Karpathy's wiki — keep it as the on-demand form, task:memory.lint-deep); no model in the loop (structural contradicts edges only, which authors rarely write — 78 today, all from the pilot).

  - consequence:memory.write-time-verdict Semantic contradictions are found the moment knowledge is written and by whoever wrote it, the person included; the judge's output is replayable (TOKI); the 78 existing contradicts edges become contradiction: nodes with a status; req:wf2.contradictions.semantic and req:wf2.clerk are refined to this trigger.

```yaml
- id: decision:memory.constraint-type
  title: >
    A constraint is its own type — a product rule without a code source — and the approved ones are the
    constitution every agent sees
  date: 2026-09-19
  status: approved
  affects: [rule:agent-contract, op:api.agent-prompt, schema/base-ontology.md]
  part-of: goal:memory.validated-asks
```

  - choice:memory.constraint-type type:constraint extends type:node: `statement: text`, `scope: list of node? -(inverse)-> constrained-by`, `rationale: ref decision? -(inverse)-> rationale-for`, status proposed | approved | retired; no source. A "Constitution" view lists the approved constraints; the agent system prompt (op:api.agent-prompt) carries them verbatim under `## Constitution` (small by design — a constraint that needs a paragraph is a decision); the constraint packet (decision:memory.constraint-packet) includes every approved constraint whose scope reaches the seeds, and the verdict pass classifies every new block against all of them. _agent.md keeps only instructions, not constraints.

  - context:memory.constraint-type rule: is "an invariant the code enforces" and `wye check` errors on a rule without `source:`; product constraints ("local-first", "markdown is canonical", "commit to main while prototyping", "no hosting surface in v2") live in _agent.md, the spec's non-goals or nowhere. Spec Kit's constitution and Kiro's steering files exist for this: a small, stable set of rules every plan and action must respect, present in every prompt.

  - alternative:memory.constraint-type Overload rule: with an optional source (blurs the one distinction wye check enforces well); keep constraints as goals with #non-goal (a non-goal is a scope choice, not a rule about how things are done).

  - consequence:memory.constraint-type A new base type; the pilot's existing constraints move out of prose into blocks; the prompt grows by the size of the constitution; wye check gains "a constraint has a rationale or an owner".

```yaml
- id: decision:memory.consolidate-sessions
  title: >
    When a session ends, what it decided is extracted from the transcript and diffed against what was written
  date: 2026-09-19
  status: approved
  affects: [rule:agent-contract, rule:task-artifacts, store:sessions, decision:wf2.plan-is-a-page]
  part-of: goal:memory.validated-asks
```

  - choice:memory.consolidate-sessions On `wye session done` (and when a chat goes idle for a day) a consolidation run reads the transcript (store:sessions) and lists candidate decisions (the person's "let's do X", "no, Y instead", "always Z"), constraints, questions left open and lessons ("this broke because …"); it diffs them against the blocks the session produced (rule:task-artifacts) and files the misses as proposed blocks in the plan document — each with `evidence:` pointing at the transcript event (`session:<id>#<n>`) and `by:` the speaker — so they reach the Inbox with their source. Lessons go to a `lesson:` block (type:lesson extends type:node — statement, scope, evidence) that the constraint packet includes when its scope reaches the seeds: the procedural memory the product has none of today.

  - context:memory.consolidate-sessions Capture depends on the agent's discipline (rule:agent-contract: "write the block before you move on"); 43 of 68 decisions have no status and many plan-* documents hold the request but not what was decided in the conversation. MOOSEDev names capture discipline the adoption barrier; SSGM prescribes reconciliation from the episodic log into the semantic graph.

  - alternative:memory.consolidate-sessions Trust the contract (measured: it is not followed); consolidate every message live (noisy, and the person is in the conversation already); a memory tool the agent calls itself (same discipline problem).

  - consequence:memory.consolidate-sessions Decisions made in chat stop being lost; the Inbox gets a second source of proposed blocks with evidence; a new type:lesson; a model call per session end, budgeted; the plan document becomes the session's semantic summary.

```yaml
- id: decision:memory.forgetting
  title: Done work leaves default retrieval; nothing is deleted
  date: 2026-09-19
  status: approved
  affects: [op:api.context, module:v2-prs]
  part-of: goal:memory.validated-asks
```

  - choice:memory.forgetting A plan document whose tasks are all done and a session that is closed are `archived` for retrieval: op:api.context, the constraint packet and search skip them unless `--all`; the rail folds them under "done"; nothing moves on disk. Blocks inside an archived plan that are knowledge (decisions, constraints, lessons) are not archived — they were consolidated into their documents (decision:memory.consolidate-sessions) or they stay visible where they are.

  - context:memory.forgetting 14 plan-* documents and 59 sessions sit in the same retrieval as the PRD; every new one adds noise (the 2026 memory surveys call forgetting the most underrated operation; SSGM's read-filter gate).

  - alternative:memory.forgetting Delete or move done plans (loses the record); decay scores by age only (a 2026 rule outranks a 2025 constraint, wrong).

  - consequence:memory.forgetting Retrieval quality stops degrading with use; "archived" is a computed state, not a status anyone sets.

  verdict:e0f217651378 contradicts req:wf2.contradictions — A requires contradictions to stay open until resolved; B archives plans (excluding them from default retrieval unless --all), but contradictions are findings, not listed as knowledge blocks that stay visible, risking hidden unresolved contradictions (kind: contradicts, conflict: conditional, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:wf2.contradictions decision:memory.forgetting)

  contradiction:wye.e0f217651378 decision:memory.forgetting contradicts req:wf2.contradictions — A requires contradictions to stay open until resolved; B archives plans (excluding them from default retrieval unless --all), but contradictions are findings, not listed as knowledge blocks that stay visible, risking hidden unresolved contradictions #approved (between: decision:memory.forgetting req:wf2.contradictions, conflict: conditional)

```yaml
- id: decision:memory.evidence
  title: A decision, requirement, rule or constraint names its evidence
  date: 2026-09-19
  status: approved
  affects: [type:node, rule:agent-contract]
  part-of: goal:memory.validated-asks
```

  - choice:memory.evidence type:node gains `evidence: list of string?` — transcript events (`session:<id>#<n>`), inbox items, documents, URLs, commits — rendered as links; the consolidation run and the verdict pass fill it; the agent contract asks for it on decisions the person made in chat. Not required (a shape warns when a decision by an agent has none).

  - context:memory.evidence Provenance is per block and session today (rule:block-attribution); a decision's `context:` is prose. The 2026 provenance survey wants claim → evidence links; TOKI wants the judge replayable.

  - alternative:memory.evidence Keep evidence in prose (not queryable); a separate provenance store (a second store).

  - consequence:memory.evidence One optional property; the decision card shows where it came from; the Inbox can open the evidence beside the block.

```yaml
- id: decision:memory.shapes
  title: The checks ctx enforces per type are declared on the type, not in the linter
  date: 2026-09-19
  status: approved
  affects: [req:ontology.check, schema/base-ontology.md]
  part-of: goal:memory.validated-asks
```

  - choice:memory.shapes A type card may carry `shapes:` — lines of the form `<status or *> requires <prop>[, <prop>]` and `<prop> refs status <s>` — read by the parser and enforced by `wye check` with the type's own wording; the two hardcoded checks move into schema/base-ontology.md.

  - context:memory.shapes "a shipped req has verified-by", "a rule has source", "a superseded node names its successor", "a constraint has a rationale" — the first two are code in lib/graph.js; the rest are new. SHACL-style shapes make such checks data of the ontology, so a product can add its own and the checker can explain a violation in words.

  - alternative:memory.shapes full SHACL / ShEx (heavy for markdown cards); keep checks in code (products cannot add theirs).

  - consequence:memory.shapes wye check reads shapes; req:ontology.check refines to cover them; the base ontology grows a few lines.

```yaml
- id: decision:memory.benchmark
  title: The 78 existing contradicts edges are the regression set for the verdict pass
  date: 2026-09-19
  status: approved
  affects: [req:wf.describe.drift, req:wf2.contradictions.semantic]
  verified-by: [test:verdict-bench]
  part-of: goal:memory.validated-asks
```

  - choice:memory.benchmark A test hides each contradicts edge in turn, rebuilds, runs the verdict pass on one side, and counts whether the other side comes back as contradicts (recall) and how many consistent pairs are flagged (precision); by conflict kind. Runs behind WATERFALL_LIVE=1 with recorded verdicts for CI. Reported in test-design.

  - context:memory.benchmark Nothing measures whether contradiction detection works; every 2026 system paper reports near-shipping a wrong conclusion. The pilot's drift rows and contradicts edges are known-true contradictions with both sides in the graph.

  - alternative:memory.benchmark none — measure or do not build the verdict pass.

  - consequence:memory.benchmark a recall / precision number per model and prompt hash before the pass is switched on by default.

```yaml
- id: decision:memory.instructions-compiled
  title: Agent instructions are typed blocks compiled from lessons, proposed as patches with evidence, reviewed like any change, and injected in full
  date: 2026-09-19
  status: approved
  refines: decision:memory.consolidate-sessions
  affects: [store:agent-instructions, op:api.agent-prompt, rule:agent-contract, decision:memory.consolidate-sessions, decision:exec.change-record]
  part-of: goal:memory.validated-asks
```

  - choice:memory.instructions-compiled type:instruction extends type:node — `statement: text`, `applies-to: list of string?` (worker roles, agent names, goals; empty = every worker), `evidence: list of string?` (the lessons and sessions behind it), status proposed | approved | retired. `_agent.md` becomes a document of instruction blocks (the prose it has today is the first ones, approved). The agent system prompt (op:api.agent-prompt) carries every approved instruction whose applies-to matches the session, verbatim, under `## Instructions`, capped (a budget in lines; over it the consolidation run proposes merges before it proposes additions). The consolidation run (decision:memory.consolidate-sessions) reads the existing lessons and instructions first, then the session's outcome — done, failed, cancelled, tasks bounced back from review, change records reverted, blocks rejected — and proposes at most one instruction patch per run: a new block or a patch to one existing block, as a change record with before / after (decision:exec.change-record), the lessons it rests on as evidence, and a one-line rationale; the Inbox reviews it with the diff. Rejected proposals are kept (state rejected, with the reason) and the run sees them, so the same patch is not proposed twice. Lessons stay retrievable (`wye context`, the packet when their scope reaches the seeds) but are not injected: the instruction is the compiled form.

  - context:memory.instructions-compiled `_agent.md` is free prose nobody proposes changes to; decision:memory.consolidate-sessions extracts lessons from transcripts and puts them in the constraint packet when their scope reaches the seeds. WikiSkill's ablations say the wiki (lessons) is what makes skill evolution work (+15 points) and that a compiled procedure in the prompt beats raw wiki access for the working agent; its tracker keeps every proposal's diff and outcome so rejected ones are not re-proposed.

  - alternative:memory.instructions-compiled Keep `_agent.md` as prose and let the consolidation run append to it (no review, no evidence, unbounded — the paper's own missing pruning); inject lessons into every prompt (the ablation argues against, and the packet already carries what matches); a skills directory per product generated by the app (Claude Code skills are the right place for tool procedure, not for product-specific lessons; keep them hand-written).

  - consequence:memory.instructions-compiled A base type; `_agent.md` parses into blocks; the prompt section is assembled, capped and scoped by agent (the negative-transfer finding: an instruction written for Codex's failure mode does not reach Claude Code unless it applies to both); the consolidation run gains inputs (outcomes) and an output (one patch); the Inbox gains instruction patches with diffs; the benchmark of decision:memory.benchmark gets a second number — reverted changes and bounced tasks per session before and after an instruction lands, the closest thing Wye has to the paper's validation score.

```yaml
- id: decision:memory.public-benchmarks
  title: Two public benchmarks now — MOOSEDev bench and the requirement-pair conflict sets — a MemoryAgentBench adapter next, LongMemEval-V2 later
  date: 2026-09-19
  status: approved
  refines: decision:memory.evaluation
  affects: [req:memory.eval-page, decision:memory.write-time-verdict, decision:memory.constraint-packet]
  part-of: goal:memory.validated-asks
```

  - choice:memory.public-benchmarks The eval suite (decision:memory.evaluation) gains a public tier: MOOSEDev bench run through Wye (the corpus imported as typed cards under a scratch product, its questions answered by `wye graph packet` and `wye context`, its judge and three-pass mean, the four numbers reported beside MOOSEDev's and mem0's); the verdict judge run over WorldVista, UAV and PURE pairs with macro-F1 beside the published 0.88–0.95; then a Wye adapter for MemoryAgentBench's conflict-resolution competency; LongMemEval-V2 when the instruction layer exists. The Results page of the Evaluation project lists eval-public cards: Wye's number, the published numbers, the date, model and prompt hashes. Numbers from other systems are quoted with their source and never re-run by us unless the harness is public.

  - context:memory.public-benchmarks The person asked for a public benchmark to compare Wye with other systems. The chat-memory leaderboards do not measure product constraints; MOOSEDev bench measures exactly the structured-versus-vector claim and publishes its corpus, judge and baselines; the requirement-pair sets measure the pair judge against published transformer baselines; MemoryAgentBench ships adapters for the systems people compare against.

  - alternative:memory.public-benchmarks LoCoMo / LongMemEval v1 (measure user-chat recall; self-reported vendor scores); ALICE's set (not public); building a public requirement-level impact benchmark first (publish Wye's co-change set instead, after tier 1).

  - consequence:memory.public-benchmarks A scratch product per public corpus; the MOOSEDev judge prompt and question sets vendored under eval/public with their licences; a harness that fits Wye to each benchmark's interface; the Public tab on page:web/eval.

```yaml
- id: decision:memory.evaluation
  title: Every memory claim has a benchmark on Wye's own history, a with-and-without run, and a page that shows both
  date: 2026-09-19
  status: approved
  affects: [decision:memory.benchmark, decision:memory.constraint-packet, decision:exec.impact-run, decision:memory.consolidate-sessions, decision:memory.instructions-compiled]
  part-of: goal:memory.validated-asks
```

  - choice:memory.evaluation An `eval/` suite in the repo: tier-1 benchmarks as tests with recorded model outputs for CI and a live mode (WATERFALL_LIVE=1), each writing its scores to `_build/eval/<date>.json` with the model, prompt hashes and graph sha; a tier-2 harness (`wye eval compare --request "…" --runs 5`) that runs the with and without arms in scratch worktrees, keeps the transcripts immutable, scores them, and stores the pair; a tier-3 collector that computes the weekly numbers from sessions, change records and the Inbox. The Evaluation project's Results page shows the runs, scores, pairs and public rows as cards through the existing table and view blocks (constraint:wf2.no-custom-pages). No feature of §1–§7 is switched on by default before its tier-1 benchmark exists and its number is on the page.

  - context:memory.evaluation The person asked how to prove the memory is useful and how to show it. The literature's systems all report a number and most report a near-miss on measurement; Wye has enough history for ground truth without labelling.

  - alternative:memory.evaluation Anecdotes (a good session with the packet) — the paper's near-misses are exactly that; public benchmarks (LoCoMo, MemConflict, STALE) — they measure chat-user memory, not product constraints, and Wye's history is the better ground truth; a human study only (expensive, and it does not run in CI).

  - consequence:memory.evaluation An eval suite and a page; scratch worktrees for the with-and-without arms; recorded judge outputs; a judge agreement number; each memory task gains a benchmark sub-task; ground truth grows with use (every approval, supersession and revert is a new label).

```yaml
- id: decision:memory.code-source
  title: >
    Code files are a second source of nodes — a comment whose first token is an id defines that node, with the
    same grammar as a prose line
  date: 2026-09-19
  status: approved
  affects: [rule:markdown-canonical, rule:agent-contract, req:wf.describe.drift]
  part-of: goal:memory.validated-asks
```

  - choice:memory.code-source The parser reads, after the documents, every file under the product's `source-roots` matching a per-language comment grammar: a comment line whose first token is an id (`// rule&#58;oversell Quantity never goes below zero, verified by test&#58;sales#oversell`; `# entity&#58;kitchen-item A line of a ticket (fields: …)`; a `/** … */` or `"""` block starting with an id) defines that node exactly as a prose line does (text, #status, trailing (key: value) group, ids in text become edges); consecutive comment lines are the node's continuation text and indented comment lines under it are its content. The parser sets `source: <path>#<line>` and `defined-in: code` itself. Kinds that may be defined in code: entity, value, state, field, op, action, gate, flag, rule, test, component, lib and product types that extend them; goal, req, decision, constraint, question and task stay in documents (they are intent, not mechanism) — a `// req&#58;x` in code is a reference, not a definition. One defining place per id: an id defined in a document and in code is a `wye check` error naming both. The web app shows a code-defined node like any other, with its file and line; edits and `wye node set` rewrite the comment line in the code file through the same writer (rule:atomic-file-write), and the product repo's git reviews them. Documents mention code-defined nodes as tags.

  - context:memory.code-source The person asked why an entity written in code is described again in markdown. Today knowledge is documents only (rule:markdown-canonical); rule: blocks point at code by `source:`; `source-roots` in a document's frontmatter already names the repos a module describes.

  - alternative:memory.code-source Generate documents from code comments (a second store, noisy diffs — rejected in the v2 design for the same reason); annotations with their own syntax (`@wye rule …`) — one grammar for prose lines, comment lines and cards is the point; letting every kind be defined in code (intent in a file no reader of the PRD sees).

  - consequence:memory.code-source The parser gains a comment pass and a language table (//, #, --, /* */, """, <!-- -->); `source:` on code-defined nodes is generated and never rots; the drift check can compare an entity's declared fields with the class next to it (task:memory.code-drift); the watcher follows source roots too; the constraint packet includes code-defined rules with a link into the file; rule:markdown-canonical becomes "text files in git are canonical: documents for intent, code for mechanism".

```yaml
- id: decision:memory.eval-build-scope
  title: The benchmarks harness is built whole, in the page's order — tier 1, judge set, tier 2, public, page
  date: 2026-09-20
  status: approved
  by: alex
  evidence: [session:a95bf7bbe0]
  refines: decision:memory.evaluation
  affects: [module:benchmarks, task:memory.eval-suite, task:memory.eval-public, task:memory.eval-page]
  part-of: goal:memory.validated-asks
```

  - choice:memory.eval-build-scope One plan builds everything the page says except LongMemEval-V2, in this order and each step a checked task line as it lands: task:memory.eval-truth and task:memory.eval-suite (tier 1, all five suites, `wye eval own`), task:memory.eval-judge-set (`eval/judge`, `wye eval judge --agreement`), task:memory.eval-compare (tier 2), task:memory.eval-public with task:memory.eval-moosedev-import, task:memory.eval-reqpairs-loader and task:memory.eval-mab-adapter, then task:memory.eval-page (page:web/eval, op:api.eval, the Public tab). Every command has the shape the page gives it; `store:eval-results` is the one results format for all tiers.

  - context:memory.eval-build-scope The person asked to build module:benchmarks. The page defines a harness of three tiers, three public adapters, a judge set and a page, written as nine open task lines; a worker could build a slice or all of it.

  - alternative:memory.eval-build-scope Tier 1 and the judge set only (the CI gate first, comparison later); tier 1 plus MOOSEDev only (the one public comparison first). Rejected by the person: the page is one contract and the numbers are wanted together.

  - consequence:memory.eval-build-scope A long build in one plan — the worker checks each task line as it lands and the Work view shows progress; LongMemEval-V2 stays behind task:memory.instructions; decision:memory.evaluation and decision:memory.public-benchmarks, still proposed, are what this build implements and want approving with it.

  verdict:9eb7be978320 refines decision:memory.evaluation — B provides the implementation plan (specific tasks and order) for what A describes conceptually (three-tier benchmark system with an Evaluation page). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:memory.evaluation decision:memory.eval-build-scope)

  verdict:3134614926af refines decision:memory.public-benchmarks — B specifies the build plan and task order for the public benchmarks that A describes (MOOSEDev, requirement-pair sets, MemoryAgentBench, excluding LongMemEval-V2). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:memory.public-benchmarks decision:memory.eval-build-scope)

  verdict:759d97044b5d refines req:memory.eval-benchmarks — B describes building the tier-1 suite (wye eval own) that implements the specific metrics A requires (packet completeness, currency, contradiction/impact/consolidation recall). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:memory.eval-benchmarks decision:memory.eval-build-scope)

  verdict:3d99f003dab5 refines req:memory.eval-compare — B specifies eval-compare as a tier-2 task in the build plan, implementing the with-and-without comparison behavior that A requires. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:memory.eval-compare decision:memory.eval-build-scope)

  verdict:3cdcc0852a84 refines req:memory.eval-page — B specifies the evaluation page (task:memory.eval-page) as the final task in the harness, implementing the display requirements that A describes (tier-1 scores, comparison pairs, sparklines). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:memory.eval-page decision:memory.eval-build-scope)

  verdict:b7a80a33d6ce refines req:memory.eval-gate — B includes building the tier-1 suite (task:memory.eval-suite) that would implement the gating logic and failure criteria that A specifies. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:memory.eval-gate decision:memory.eval-build-scope)

  verdict:b113716e05c2 refines decision:memory.eval-tolerance — B includes building the tier-1 suite that would apply the 5-point tolerance value and logic that A specifies. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:memory.eval-tolerance decision:memory.eval-build-scope)

  verdict:48dadf3257eb refines decision:memory.benchmark — B specifies building the tier-1 suite (task:memory.eval-suite, wye eval own) that would implement the contradiction detection regression test that A describes. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:memory.benchmark decision:memory.eval-build-scope)

```yaml
- id: decision:memory.eval-tolerance
  title: A suite fails the run when its score drops more than 5 points below the previous file
  date: 2026-09-20
  status: approved
  by: alex
  evidence: [session:a95bf7bbe0]
  refines: decision:memory.evaluation
  affects: [req:memory.eval-benchmarks, store:eval-results]
  part-of: goal:memory.validated-asks
```

  - choice:memory.eval-tolerance The tolerance is 5 percentage points per suite, the same for every tier-1 suite to start; it is written into store:eval-results next to each score (`tolerance: 5`) so a score carries its own gate, and the comparison is against the latest previous `<date>-own.json` for the same graph sha lineage. No previous file: the run reports and exits zero.

  - context:memory.eval-tolerance req:memory.eval-benchmarks and module:benchmarks say a suite that drops by more than its tolerance exits non-zero, without a number. The first live numbers are few and noisy (test:verdict-bench: 17 % recall on twelve pairs).

  - alternative:memory.eval-tolerance Report only, no gate until two or three runs exist (rejected: the gate is the point of decision:memory.evaluation); any drop fails (rejected: a twelve-pair suite moves 8 points on one pair).

  - consequence:memory.eval-tolerance `wye eval own` needs the previous file; a suite may later carry its own tolerance in the results file without a format change; a deliberate drop (a new positive set, question:memory.benchmark-positives) is accepted by re-baselining, not by widening the tolerance.

  verdict:2cc18377fc43 refines req:memory.eval-benchmarks — B specifies the tolerance value (5 points) that A states abstractly as 'more than the tolerance', narrowing the requirement. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:memory.eval-benchmarks decision:memory.eval-tolerance)

  verdict:47219d169a07 refines decision:memory.evaluation — B specifies the 5-point tolerance threshold that implements the tier-1 benchmark gating mechanism A's evaluation framework requires. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:memory.evaluation decision:memory.eval-tolerance)

```yaml
- id: decision:memory.eval-first-live-runs
  title: The build includes the first live runs on haiku, with the recordings committed
  date: 2026-09-20
  status: approved
  by: alex
  evidence: [session:a95bf7bbe0]
  refines: decision:memory.evaluation
  affects: [req:memory.eval-benchmarks, test:verdict-bench]
  part-of: goal:memory.validated-asks
```

  - choice:memory.eval-first-live-runs The worker runs each suite once live with WATERFALL_LIVE=1 on claude-haiku-4-5-20251001 — the tier-1 suites, the judge agreement, one tier-2 pair (five runs per arm), each public adapter on its sample — commits eval/recorded/ and the first `_build/eval/<date>-*.json`, and records model, prompt hashes, judge and graph sha with them. Public corpora are downloaded, never committed.

  - context:memory.eval-first-live-runs Every suite replays eval/recorded/ in CI and fails when a recording is missing, so a harness without a live run cannot pass CI. test:verdict-bench set the pattern: WATERFALL_LIVE=1, haiku, recordings under test/fixtures/.

  - alternative:memory.eval-first-live-runs A stronger model (sonnet) — better judge, more cost, and the number is a baseline to beat, not a result; harness only with fake judges and the person runs live — leaves CI skipping every suite.

  - consequence:memory.eval-first-live-runs A model key in the worker's environment; the first numbers are haiku numbers and are quoted as such; a judge change reruns `wye eval judge --agreement` before any suite accepts it, as the page says.

  verdict:436617b81803 refines decision:memory.evaluation — A prescribes a three-tier evaluation framework with a prerequisite (tier-1 exists before features switch on); B specifies the concrete first step (live runs on haiku with committed recordings). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:memory.evaluation decision:memory.eval-first-live-runs)

  verdict:9b9be5768617 refines req:memory.eval-benchmarks — A requires benchmarks with specific metrics and tolerance-based failure; B specifies how to implement the first instance (live runs on haiku with recordings). (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:memory.eval-benchmarks decision:memory.eval-first-live-runs)

<!-- /list:decision -->
