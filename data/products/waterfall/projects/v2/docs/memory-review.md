---
node: module:memory-review
type: module
title: Memory — review against 2026 research
status: proposed
owner: alex
last-verified: 2026-09-19
sources:
  - prompts/agent-system.md                  # the contract: what an agent is told to read and write
  - packages/web/src/lib/agent-host.ts       # buildPrompt: what a request actually carries to the agent
  - schema/base-ontology.md                  # type:node, type:decision, type:rule as they are today
  - lib/graph.js                             # packet, impact, check
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
part-of: module:research
order: 71
---

# Memory — review against 2026 research

The goal of Wye, restated by the person on 2026-09-19: *not the code — the product definition. Keep every constraint, requirement and decision, whoever made it (a person or an agent), as memory; when a new ask arrives, validate it against the constraints in force and update the memory.* This document reads the project as it is against that goal and against what the 2026 literature on agent memory, temporal knowledge graphs and ontology-grounded project memory found, and proposes what to change. Every proposal is a `decision:` block (proposed, for the Inbox) or a `question:` block; the work is task lines under goal:memory.validated-asks. Nothing here is built.

## Where the project stands

| piece | state on 2026-09-19 |
|---|---|
| semantic memory — the graph | 148 req, 139 rule, 68 decision, 33 question; markdown canonical; open ontology with inheritance and inverses (module:ontology-design). Ahead of most tooling |
| capture of decisions | by convention only: rule:agent-contract tells the agent to write `decision:` blocks. 43 of 68 decisions carry no status; 10 proposed, 15 approved |
| validation of a new ask | **no mechanism.** `buildPrompt` (packages/web/src/lib/agent-host.ts) sends the instruction plus the refs the person attached. Nothing retrieves the rules, decisions or goals that govern the request; it depends on the agent choosing to run `wf context` |
| contradictions | designed (req:wf2.clerk, req:wf2.contradictions, req:wf2.contradictions.semantic, req:wf.lint.semantic-drift) — all proposed, nothing built. `ctx check` warns on 78 `contradicts` edges that have no lifecycle |
| temporal validity | none. type:decision has no `supersedes`, `since` or `until`; a rejected or superseded decision ranks like a current one in `wf context` (op:api.context) |
| episodic memory | 59 session files and 14 `plan-*` documents, kept forever, never consolidated; they compete with knowledge in retrieval |
| procedural memory — lessons, anti-patterns, "how we do X here" | none; `_agent.md` is the informal stand-in |
| governance | approval exists (rule:inbox-review); provenance is per block and session (rule:block-attribution); rollback is git. No evidence link from a decision to the utterance that made it |

## What the research says

- **Adjudicate at write time, not in the prompt.** STALE (Wang et al., 2026) shows the strongest models notice a stale memory ~55% of the time when merely asked; write-side adjudication (decide on each write whether older memories stay active, go stale or are replaced) took the same backbone from 8.7% to 68%. Mem0's ADD / UPDATE / DELETE / NOOP and TOKI's bitemporal operator algebra say the same, with two additions from TOKI: keep the losing fact as an audit row, and log the judge's verdict keyed so it can be replayed. Wye's "proposed → Inbox" is TOKI's *await-confirmation* operator — the right one for a single-person product — but no classification happens before the Inbox.
- **Constraint retrieval must be structural and complete, not top-k vector.** MOOSEDev (ontology-grounded project memory for coding agents, 2026) against mem0: set completeness 1.00 vs 0.18, negation 0.98 vs 0.06, supersession traversal 0.98 vs 0.27, while plain relevance tied. Its engine treats the model as "an unreliable but useful sensor": ontology traversal, evidence fusion and validation are symbolic; the model is consulted at declared points. Wye has both engines (rule:context-panel, `ctx impact`, `ctx packet`) but the contract leads with the vector one.
- **Facts are bitemporal.** Zep / Graphiti and every 2026 survey: a fact carries valid time (`since`, `until`) and transaction time (when the system learned it); a contradiction invalidates, it never deletes; retrieval filters invalid facts by construction. MOOSEDev: "superseded records are excluded from current guidance by construction".
- **Dual-track storage with reconciliation.** SSGM (2026) recommends an append-only episodic log next to a fast semantic graph, with periodic reconciliation that bounds drift; three gates — write validation, read filtering (freshness decay), scoped access. Wye has the two tracks (sessions, documents) and none of the gates.
- **Capture discipline is the adoption risk.** MOOSEDev's main finding: "flat capture degrades the graph to free-text parity, and that discipline imposes friction that a vector store does not". Wye relies entirely on that discipline (the agent writes a block, or the knowledge is lost).
- **Forgetting is the most underrated operation** (Memory for Autonomous LLM Agents, 2026): stale and never-relevant entries accumulate quietly and add noise to every retrieval. Nothing in Wye ever leaves default retrieval.
- **Constraints as a constitution.** Spec Kit's *constitution* and Kiro's *steering* files are a small, stable set of project rules every spec, plan and agent action must respect, present in every prompt. Wye's rule: is a code-enforced invariant that must cite `source:`; product constraints have no type.
- **Provenance per claim.** The 2026 provenance survey and MOOSEDev want author, time and evidence on every record, with supersedes / affects / rationale as typed edges — which Wye's ontology can express and its decisions do not yet fill.
- **Measure.** MOOSEDev nearly shipped three wrong conclusions; MemConflict distinguishes dynamic (time), static (fact) and conditional (context) conflicts and finds every system uneven across them.

## What to keep

Markdown as canonical (rule:markdown-canonical), git as rollback, types as nodes with inverses, every block a node, `packet`, human approval on the write path (never auto-resolve: Mem0's auto-resolve deleting still-needed memories is the cautionary tale), and the clerk as propose-only, budgeted and non-self-triggering (req:wf2.clerk). Karpathy's LLM-wiki pattern (April 2026) is a less typed version of exactly this; its ingest / query / lint loop is what Wye has, minus a semantic `lint --deep`.

## Proposals

### 1. The constraint packet at intake

### 2. Bitemporal nodes and supersession

### 3. Write-time verdicts, and contradictions with a lifecycle

### 4. Constraints, and a constitution in every prompt

The type as it would be declared in `schema/base-ontology.md` once approved (a `markdown` fence, so nothing parses it yet):

```markdown
- id: type:constraint
  extends: type:node
  purpose: a rule about the product or how it is built that no code enforces; approved ones are the constitution
  open: true
  props:
    statement: text
    scope: list of node? -(inverse)-> constrained-by
    rationale: ref decision? -(inverse)-> rationale-for
```

### 5. Consolidation at session end, and forgetting

### 6. Evidence on every claim, shapes in the ontology, and a benchmark

### 7. Procedural memory: sessions → lessons → instructions (WikiSkill, 2026-09-19)

WikiSkill (Tang et al., 2026, arxiv.org/abs/2608.27454) keeps three layers apart and runs a loop between them: raw
execution traces; a persistent wiki of *patterns* — markdown pages of "failure modes or successful strategies, along
with actionable workarounds", an evolution log, and a *skill impact tracker* that records every proposal with its
target, unified diff, validation score and acceptance outcome; and *skills* — concise procedural files (45–128
lines) that a proposer derives from the wiki one atomic patch at a time and that go into the agent's system prompt
in full. A Wiki Maintainer does root-cause analysis on failing traces and strategy extraction on passing ones with
the whole wiki in context, so patterns are refined rather than duplicated; rejected proposals stay in the tracker so
they are not proposed again; every skill carries a PURPOSE file naming the patterns that motivated it. Results: +3.3
to +12.0 points over the strongest skill-evolution baselines across five models and five benchmarks; the ablation
that matters here — the skill proposer without the wiki falls from 63.7% to 48.7% — and one that cuts the other way:
letting the working agent read the wiki directly during evolution *lowered* the resulting skill quality (60.9% vs
63.7%): lessons compiled into a short procedure beat lessons handed over raw. Skills transfer across models, with
negative transfer when a skill encodes a small model's low-level workaround that constrains a stronger one. The
paper has no pruning — its wiki only grows.

Against Wye: the three layers exist — sessions (store:sessions), the documents, and the agent contract with the
product's `_agent.md` (store:agent-instructions) plus the Claude Code skills — but the third is hand-written and
never learns from the first two, and decision:memory.consolidate-sessions only gets as far as `lesson:` blocks. What
WikiSkill adds is the last step and the bookkeeping around it.

The type, once approved (a `markdown` fence, so nothing parses it yet):

```markdown
- id: type:instruction
  extends: type:node
  purpose: a procedure for workers, compiled from lessons; approved ones are injected into the prompt
  open: true
  props:
    statement: text
    applies-to: list of string?
    evidence: list of string?
- id: type:lesson
  extends: type:node
  purpose: a failure mode or a strategy that worked, with its workaround, learned from sessions; retrievable, not injected
  open: true
  props:
    statement: text
    kind: enum [failure, strategy]
    workaround: text?
    scope: list of node?
    evidence: list of string?
```

### 8. Proving it: with and without, scored, shown (2026-09-19)

The person asked how to prove the memory is useful — a result with it and without it, a score, something to show.
Every system paper above measured; MOOSEDev nearly shipped three wrong conclusions and names the safeguards
(immutable transcripts, a validated judge, ground truth from primary sources only). Three tiers, cheapest first,
each answering one claim with ground truth Wye already has: 77 commits to the documents since 2026-09-14, 28
sessions with 3 600 attributed block changes, 75 shipped requirements with satisfied-by / verified-by edges, 78
contradicts edges, 17 approved decisions.

**Tier 1 — offline benchmarks from Wye's own history** (deterministic, run in CI, no agent runs):

| claim | benchmark | ground truth | score |
|---|---|---|---|
| the constraint packet is complete where vector search is not (decision:memory.constraint-packet) | for each shipped requirement, its text is the request; build the packet and the top-k vector hits | the rules, gates, decisions and tests on its satisfied-by / verified-by / governed-by edges | recall of the governing set, packet vs vector, and packet size |
| current knowledge is served, superseded is not (decision:memory.bitemporal) | for each decision with `supersedes`, query with the old decision's title | the superseding decision | rank of the current one; count of superseded ones served |
| contradictions are found at write time (decision:memory.write-time-verdict) | hide each contradicts edge, rebuild, run the verdict pass on one side | the other side | recall, precision on the consistent pairs, by conflict kind (decision:memory.benchmark) |
| impact finds what an edit reaches (decision:exec.impact-run) | replay each commit that changed a typed block together with other blocks; run the candidates step on the first | the blocks co-changed in the same commit or session | recall at k of co-changed nodes; structural vs semantic vs blended |
| consolidation catches what the agent wrote (decision:memory.consolidate-sessions) | for each session with decision blocks, hide them and run the consolidation on the transcript | the blocks the session wrote | recall of the hidden blocks; the misses a person labels are the second set |

**Tier 2 — with and without, on the same request** (the thing to show): the same instruction run twice by the
same agent and model in a scratch worktree, n runs each — *with* the constraint packet, instructions and the
librarian's definition, and *without* (the contract only, the tools it has today) — and scored on the transcript and
the diff: constraint violations (the verdict pass over the blocks the session wrote and over the change it made,
against the constitution); node ids cited; questions the agent asked that the graph already answered ("should have
known"); change records later reverted and tasks bounced from review; tokens and wall time; and one human mark
(1–5, which run is right) on the pair, blind. The app shows it: on a plan, Compare opens two sessions side by side
with their score cards, and the Evaluation page keeps every pair. The judge (the verdict model) is validated once
against a person's labels on 50 pairs and the agreement is printed next to every score.

**Tier 3 — the product over time** (a trend, not a proof): per week, sessions run; share that cited at least one
node; contradictions found at write time versus found later by a person; proposals accepted / rejected in the
Inbox; changes reverted; tasks bounced from review; "should have known" questions per session; request → defined →
done times. Shown on the Evaluation page as sparklines; the same numbers before and after an instruction lands are
the paper's validation score (decision:memory.instructions-compiled).

**Public benchmarks — comparing with other systems** (checked 2026-09-19). The chat-memory leaderboards (LoCoMo,
LongMemEval v1, BEAM) measure recall of a user's conversation and their top scores are self-reported by vendors; they
do not measure what Wye claims. Five do, each for one claim:

| claim | benchmark | what it is | published numbers to beat | fit |
|---|---|---|---|---|
| structured project memory beats vector memory on completeness, absence and currency (decision:memory.constraint-packet, decision:memory.bitemporal) | **MOOSEDev bench** — github.com/Trivyn/moosedev `bench/`, Apache-2.0 | a public corpus of 835 typed records (CodeGraph's documentation), question sets for set completeness, negation, supersession traversal and relevance; GPT-5.4-mini strict judge, mean of three passes; ground truth from primary sources, never from the graph | MOOSEDev 1.00 / 0.98 / 0.98 / 0.82; mem0 0.18 / 0.06 / 0.27 / 0.67–0.90 | best fit: load the corpus as typed cards, answer through `ctx packet` and `wf context`, report the same four numbers with their judge |
| the verdict judge tells contradicting and duplicate requirement pairs from consistent ones (decision:memory.write-time-verdict) | **WorldVista, UAV, PURE, OpenCOSS requirement-pair datasets** (Malik et al. 2022–23; PassionNet 2024) | 10 878 / 6 670 / ~6 800 requirement pairs labelled conflict or neutral (PassionNet adds duplicate); OpenCOSS has 10 conflicts in 6 786 pairs | transformer macro-F1 0.908 (WorldVista), 0.948 (PURE), 0.877 (UAV) | measures the pair judge only, not retrieval; pairs come without graph structure. ALICE's 1 071-pair e-bus set is not public (210 anonymised pairs on request) |
| write-time adjudication keeps memory current under conflicting updates (decision:memory.bitemporal) | **MemoryAgentBench** (ICLR 2026, MIT) — github.com/HUST-AI-HYZ/MemoryAgentBench; **MemConflict**; **STALE** | four competencies — accurate retrieval, test-time learning, long-range understanding, conflict resolution (FactConsolidation, EventQA) — with Mem0, Letta and Cognee adapters in the repo; MemConflict splits dynamic / static / conditional conflicts; STALE has 400 scenarios, 1 200 queries, implicit invalidation | published per adapter in the repo; STALE: best model 55.2%, CUPMem 68.0% | a Wye adapter gives a like-for-like number against Mem0 / Letta / Cognee on conflict resolution; the facts are about a user, the mechanism is the same |
| lessons compiled into instructions make an agent a knowledgeable colleague (decision:memory.instructions-compiled) | **LongMemEval-V2** — xiaowu0162.github.io/longmemeval-v2, CC BY 4.0 | 451 questions over 100–500 agent trajectories per tier (25M–115M tokens) in WebArena / WorkArena: static state, dynamic state, workflow knowledge, environment gotchas, premise awareness | AgentRunbook-C 74.9% (small tier); RAG 42.8%; frontier model without trajectories 14.1% | the right shape (experience → workflow knowledge → gotchas), heavy to run; later |
| the librarian elicits the requirements a request leaves implicit (req:exec.wye-asks) | **ReqElicitGym** — arxiv.org/abs/2602.18306 | simulated stakeholders; implicit-requirement elicitation rate over interaction, content and style | best of seven models 0.32 | fit for the ask turn once it exists; availability of the environment to be checked |

No public benchmark exists for change impact at the requirement level (RIPPLE / ICSE 2026 and the GPT-5 CIA dataset
are seed-change → impacted code entities per commit); Wye's git co-change set (tier 1) is the ground truth there, and
it can be published as one.

## Code as a source: knowledge in the code files (the person's ask, 2026-09-19)

The person's idea: a new class or entity is written in code — why describe it a second time in markdown? Put the knowledge in a comment next to it and let Wye parse code files as well as documents.

The idea is sound and has precedent (Javadoc / JSDoc tags, Doxygen, doctests, traceability tags like `@req` in safety-critical code, docs-as-code), and it fits Wye better than most tools: a `rule:` already *must* cite `source:` (rule:agent-contract), the README already says line numbers in `source:` rot, and MOOSEDev bootstraps its graph by walking the repository. Turning the arrow around — the rule lives at its source — makes `source:` automatic and never stale, and it lowers capture friction where it matters most: the agent writes the rule in the file it is editing, one write instead of two. It also sharpens drift: an entity declared beside its class can be checked against the class.

Three things decide whether it works, and they are the questions below: what lives in code and what stays in documents (intent does not belong in a file: a goal, a decision that touches five modules, a question about the product); one defining place per id (the same id defined in both is an error, the other side is a reference); and writes back (status changes and UI edits to a code-defined node edit the comment — a text edit like any other, reviewed in the product repo's git, not Wye's).

## Work

<!-- tasks -->
<!-- /tasks -->

## Sources

- STALE: Can LLM Agents Know When Their Memories Are No Longer Valid? — arxiv.org/abs/2605.06527 (write-side adjudication, CUPMem; Type I co-referential vs Type II propagated conflicts)
- TOKI: A Bitemporal Operator Algebra for Contradiction Resolution in LLM-Agent Persistent Memory — arxiv.org/abs/2606.06240 (last-writer-wins, evidence-weighted merge, await-confirmation, per-rule policy; keyed judge log)
- Ontology-Grounded Project Memory for Coding Agents (MOOSEDev) — arxiv.org/abs/2608.13662 (graph vs vector: completeness 1.00 / 0.18, negation 0.98 / 0.06, supersession 0.98 / 0.27; capture discipline)
- Zep: A Temporal Knowledge Graph Architecture for Agent Memory — arxiv.org/abs/2501.13956 (bitemporal edges, invalidation not deletion)
- Governing Evolving Memory in LLM Agents (SSGM) — arxiv.org/abs/2603.11768 (write validation, read filtering, scoped access; dual-track storage with reconciliation)
- Always-On Agents: A Survey of Persistent Memory, State, and Governance — arxiv.org/abs/2606.30306 (audit, provenance, approval, rollback)
- Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers — arxiv.org/abs/2603.07670 (forgetting as the underrated operation)
- MemConflict: Evaluating Long-Term Memory Systems Under Memory Conflicts — arxiv.org/abs/2605.20926 (dynamic / static / conditional conflicts)
- From Agent Traces to Trust: Evidence Tracing and Execution Provenance in LLM Agents — arxiv.org/abs/2606.04990
- Knowledge Compounding: Self-Evolving Knowledge Wikis under the Agentic ROI Framework — arxiv.org/abs/2604.11243; Karpathy's LLM wiki gist (April 2026): ingest / query / lint, lint --deep for contradictions
- WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution — arxiv.org/abs/2608.27454 (experience → wiki patterns → skills; skill impact tracker; wiki ablation +15 points; compiled skills beat raw wiki access; cross-model transfer)
- MOOSEDev benchmark harness and public corpus — github.com/Trivyn/moosedev (bench/); MemoryAgentBench (ICLR 2026) — github.com/HUST-AI-HYZ/MemoryAgentBench; LongMemEval-V2 — arxiv.org/abs/2605.12493; requirement-pair conflict datasets (WorldVista, UAV, PURE, OpenCOSS) — Malik et al., arxiv.org/abs/2301.03709, PassionNet arxiv.org/abs/2412.01657; ReqElicitGym — arxiv.org/abs/2602.18306; a dataset for code-change impact analysis — arxiv.org/abs/2512.19481
- SHACL Validation in the Presence of Ontologies — arxiv.org/abs/2507.12286; xpSHACL — arxiv.org/abs/2507.08432
- Spec-driven development: GitHub Spec Kit (constitution), AWS Kiro (steering files) — thebcms.com/blog/spec-driven-development
- Anthropic, Effective context engineering for AI agents — anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Mem0 auto-resolve deleting still-needed memories — dev.to/mukesh_13/mem0-auto-resolves-memory-conflicts-for-you-until-it-silently-deletes-one-you-still-need-4f4m
