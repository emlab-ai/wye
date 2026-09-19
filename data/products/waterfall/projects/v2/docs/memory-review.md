---
node: module:memory-review
type: module
title: Memory — review against 2026 research
status: proposed
owner: alex
last-verified: 2026-09-19
part-of: module:wf2
order: 35
sources:
  - prompts/agent-system.md                  # the contract: what an agent is told to read and write
  - packages/web/src/lib/agent-host.ts       # buildPrompt: what a request actually carries to the agent
  - schema/base-ontology.md                  # type:node, type:decision, type:rule as they are today
  - lib/graph.js                             # packet, impact, check
  - docs/superpowers/specs/2026-09-14-waterfall-v2-design.md
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

```yaml
- id: goal:memory.validated-asks
  title: Every ask is validated against the constraints in force, and every decision becomes memory
  description: >
    A request that reaches an agent carries the complete set of rules, constraints, approved decisions and goals that
    govern what it touches, with superseded and rejected ones filtered out by construction; every decision, requirement
    and rule written by anyone is classified against its neighbours before a person sees it in the Inbox; decisions carry
    time, supersession and evidence; what a session decided is consolidated into the documents even when the agent
    forgot to write it; and what is done leaves default retrieval.
  status: approved
  owner: alex
  part-of: module:memory-review
  depends-on: [req:wf2.clerk, req:wf2.contradictions, module:ontology-design]
```

### 1. The constraint packet at intake

```yaml
- id: decision:memory.constraint-packet
  title: >
    A request's first message carries the constraints in force, computed structurally, not found by the agent
  context: >
    buildPrompt sends the instruction and the refs the person attached; rule:agent-contract asks the agent to run
    `wf context` first. MOOSEDev measured vector memory at 0.18 completeness and 0.27 on supersession traversal against
    1.00 / 0.98 for graph traversal; STALE measured that models comply with a stale premise even when the update was
    retrieved. Validation that depends on the agent remembering to look is not validation.
  choice: >
    At intake the app computes a constraint packet and puts it under `## Constraints in force` in the first message:
    seeds = the attached refs plus the top semantic hits for the instruction (op:api.context, seeds only); the packet =
    every rule:, constraint:, gate:, approved decision: and goal: (non-goals included) reachable from the seeds over
    governs / governed-by, gated-by, affects, refines, part-of and depends-on within two hops, plus every open
    question: on those nodes — the complete set, ordered by kind, each with id, one-line statement and status;
    superseded, rejected and retired nodes are excluded by construction (decision:memory.bitemporal). The same packet
    is `wf packet --for "<text>"` / op:api.packet for an agent mid-session. The vector search finds seeds; it is never
    the authority on what governs.
  alternatives: >
    Keep the contract as is and trust the agent (measured to fail); send the whole graph (does not fit and buries the
    rules); ask the clerk at intake (a model call where a traversal suffices).
  consequences: >
    Every session starts from the same picture of what it may not break; the agent cites constraints because they are
    in front of it; the packet is the input the write-time verdict pass (decision:memory.write-time-verdict) classifies
    against; the first message grows by the size of the packet (budgeted like ctx packet).
  date: 2026-09-19
  status: approved
  affects: [rule:agent-contract, op:api.context, req:wf2.api.packet-task]
  part-of: goal:memory.validated-asks
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
```

### 2. Bitemporal nodes and supersession

```yaml
- id: decision:memory.bitemporal
  title: >
    Every node can say since when and until when it holds, and what superseded it; current means not ended
  context: >
    type:decision is "immutable, superseded by later decisions" in the v2 design, but type:node has no since, until or
    superseded-by, decision statuses stop at rejected, and op:api.context ranks a superseded decision like a current
    one. Zep / Graphiti, TOKI and MOOSEDev all carry valid time on facts and filter invalid ones by construction.
  choice: >
    type:node gains `since: date?`, `until: date?`, `superseded-by: ref node? -(inverse)-> supersedes`, `by: string?`
    (who wrote it: a person or `agent:<name>`) and `session: string?` (already used on tasks). Statuses gain
    `superseded` for decision, req and rule and `retired` for constraint. A decision that supersedes another sets
    `supersedes:` and the parser fills `until` and `superseded-by` on the old one at build time (generated, never
    written, like inverses). `ctx`, op:api.context and the constraint packet exclude nodes with `until` in the past or
    status superseded / rejected / retired unless asked (`--as-of <date>` or `--all`); the node page shows the chain.
  alternatives: >
    A database row per decision with validFrom / validTo (the v2 design's decision table — a second store for what the
    document already says); deleting superseded blocks (loses the audit trail TOKI and the provenance survey require).
  consequences: >
    Memory becomes honest about time at the cost of five optional properties on type:node; `ctx check` gains a shape
    "a superseded node names its successor"; the Decisions timeline can show supersession chains; the Inbox shows a
    proposed decision's supersedes target so approving it retires the old one in one act.
  date: 2026-09-19
  status: approved
  affects: [type:node, type:decision, op:api.context, req:wf2.decisions]
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
```

### 3. Write-time verdicts, and contradictions with a lifecycle

```yaml
- id: decision:memory.write-time-verdict
  title: >
    A new decision, requirement, rule or constraint is classified against its neighbours when it is written,
    before the Inbox
  context: >
    req:wf2.contradictions.semantic puts classification in a clerk run after a decision is posted to a database. Nothing
    is built, decisions are blocks in documents now, and the research places the gain at the write: STALE's write-side
    adjudication (8.7% → 68%), Mem0's operation classification, TOKI's keyed judge log. The Inbox is where a person
    already looks at every proposed block.
  choice: >
    When the graph rebuilds and a decision:, req:, rule: or constraint: block is new or changed (the diff
    rule:block-attribution already computes), the app runs a verdict pass: for each neighbour of the same kinds within
    two hops (and every approved constraint), one call classifies the pair as duplicate | refines | consistent |
    contradicts with a one-sentence reason; the verdicts are written on the new node as `verdicts:` content blocks
    (verdict:<hash> — pair, kind, reason, model, prompt hash; generated once, kept), and duplicate / contradicts become
    open contradiction: nodes with kind static | dynamic | conditional (MemConflict's split). The Inbox row shows the
    verdicts; approving a block with an open contradicts verdict requires choosing: supersede the other side, refine
    this one, or dismiss with a reason. `ctx check --strict` errors on an open contradiction touching shipped work
    (req:wf2.contradictions.strict, unchanged). The pass is budgeted (pairs per rebuild, tokens) and cached by pair hash.
  alternatives: >
    The v2 clerk as designed (runs on decisions.post to a DB; the DB no longer exists); a lint --deep over all pairs on
    demand (Karpathy's wiki — keep it as the on-demand form, task:memory.lint-deep); no model in the loop (structural
    contradicts edges only, which authors rarely write — 78 today, all from the pilot).
  consequences: >
    Semantic contradictions are found the moment knowledge is written and by whoever wrote it, the person included;
    the judge's output is replayable (TOKI); the 78 existing contradicts edges become contradiction: nodes with a
    status; req:wf2.contradictions.semantic and req:wf2.clerk are refined to this trigger.
  date: 2026-09-19
  status: approved
  affects: [req:wf2.contradictions.semantic, req:wf2.clerk, rule:inbox-review, rule:block-attribution]
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
```

### 4. Constraints, and a constitution in every prompt

```yaml
- id: decision:memory.constraint-type
  title: >
    A constraint is its own type — a product rule without a code source — and the approved ones are the
    constitution every agent sees
  context: >
    rule: is "an invariant the code enforces" and `ctx check` errors on a rule without `source:`; product constraints
    ("local-first", "markdown is canonical", "commit to main while prototyping", "no hosting surface in v2") live in
    _agent.md, the spec's non-goals or nowhere. Spec Kit's constitution and Kiro's steering files exist for this: a
    small, stable set of rules every plan and action must respect, present in every prompt.
  choice: >
    type:constraint extends type:node: `statement: text`, `scope: list of node? -(inverse)-> constrained-by`,
    `rationale: ref decision? -(inverse)-> rationale-for`, status proposed | approved | retired; no source. A
    "Constitution" view lists the approved constraints; the agent system prompt (op:api.agent-prompt) carries them
    verbatim under `## Constitution` (small by design — a constraint that needs a paragraph is a decision); the
    constraint packet (decision:memory.constraint-packet) includes every approved constraint whose scope reaches the
    seeds, and the verdict pass classifies every new block against all of them. _agent.md keeps only instructions,
    not constraints.
  alternatives: >
    Overload rule: with an optional source (blurs the one distinction ctx check enforces well); keep constraints as
    goals with #non-goal (a non-goal is a scope choice, not a rule about how things are done).
  consequences: >
    A new base type; the pilot's existing constraints move out of prose into blocks; the prompt grows by the size of the
    constitution; ctx check gains "a constraint has a rationale or an owner".
  date: 2026-09-19
  status: approved
  affects: [rule:agent-contract, op:api.agent-prompt, schema/base-ontology.md]
  part-of: goal:memory.validated-asks
```

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

```yaml
- id: decision:memory.consolidate-sessions
  title: >
    When a session ends, what it decided is extracted from the transcript and diffed against what was written
  context: >
    Capture depends on the agent's discipline (rule:agent-contract: "write the block before you move on"); 43 of 68
    decisions have no status and many plan-* documents hold the request but not what was decided in the conversation.
    MOOSEDev names capture discipline the adoption barrier; SSGM prescribes reconciliation from the episodic log into
    the semantic graph.
  choice: >
    On `wf session done` (and when a chat goes idle for a day) a consolidation run reads the transcript
    (store:sessions) and lists candidate decisions (the person's "let's do X", "no, Y instead", "always Z"), constraints,
    questions left open and lessons ("this broke because …"); it diffs them against the blocks the session produced
    (rule:task-artifacts) and files the misses as proposed blocks in the plan document — each with `evidence:` pointing
    at the transcript event (`session:<id>#<n>`) and `by:` the speaker — so they reach the Inbox with their source.
    Lessons go to a `lesson:` block (type:lesson extends type:node — statement, scope, evidence) that the constraint
    packet includes when its scope reaches the seeds: the procedural memory the product has none of today.
  alternatives: >
    Trust the contract (measured: it is not followed); consolidate every message live (noisy, and the person is in the
    conversation already); a memory tool the agent calls itself (same discipline problem).
  consequences: >
    Decisions made in chat stop being lost; the Inbox gets a second source of proposed blocks with evidence; a new
    type:lesson; a model call per session end, budgeted; the plan document becomes the session's semantic summary.
  date: 2026-09-19
  status: approved
  affects: [rule:agent-contract, rule:task-artifacts, store:sessions, decision:wf2.plan-is-a-page]
  part-of: goal:memory.validated-asks
- id: decision:memory.forgetting
  title: Done work leaves default retrieval; nothing is deleted
  context: >
    14 plan-* documents and 59 sessions sit in the same retrieval as the PRD; every new one adds noise (the 2026 memory
    surveys call forgetting the most underrated operation; SSGM's read-filter gate).
  choice: >
    A plan document whose tasks are all done and a session that is closed are `archived` for retrieval: op:api.context,
    the constraint packet and search skip them unless `--all`; the rail folds them under "done"; nothing moves on disk.
    Blocks inside an archived plan that are knowledge (decisions, constraints, lessons) are not archived — they were
    consolidated into their documents (decision:memory.consolidate-sessions) or they stay visible where they are.
  alternatives: >
    Delete or move done plans (loses the record); decay scores by age only (a 2026 rule outranks a 2025 constraint, wrong).
  consequences: >
    Retrieval quality stops degrading with use; "archived" is a computed state, not a status anyone sets.
  date: 2026-09-19
  status: approved
  affects: [op:api.context, module:v2-plans]
  part-of: goal:memory.validated-asks
```

  verdict:e0f217651378 contradicts req:wf2.contradictions — A requires contradictions to stay open until resolved; B archives plans (excluding them from default retrieval unless --all), but contradictions are findings, not listed as knowledge blocks that stay visible, risking hidden unresolved contradictions (kind: contradicts, conflict: conditional, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: req:wf2.contradictions decision:memory.forgetting)

  contradiction:waterfall.e0f217651378 decision:memory.forgetting contradicts req:wf2.contradictions — A requires contradictions to stay open until resolved; B archives plans (excluding them from default retrieval unless --all), but contradictions are findings, not listed as knowledge blocks that stay visible, risking hidden unresolved contradictions #open (between: decision:memory.forgetting req:wf2.contradictions, conflict: conditional)

### 6. Evidence on every claim, shapes in the ontology, and a benchmark

```yaml
- id: decision:memory.evidence
  title: A decision, requirement, rule or constraint names its evidence
  context: >
    Provenance is per block and session today (rule:block-attribution); a decision's `context:` is prose. The 2026
    provenance survey wants claim → evidence links; TOKI wants the judge replayable.
  choice: >
    type:node gains `evidence: list of string?` — transcript events (`session:<id>#<n>`), inbox items, documents, URLs,
    commits — rendered as links; the consolidation run and the verdict pass fill it; the agent contract asks for it on
    decisions the person made in chat. Not required (a shape warns when a decision by an agent has none).
  alternatives: >
    Keep evidence in prose (not queryable); a separate provenance store (a second store).
  consequences: >
    One optional property; the decision card shows where it came from; the Inbox can open the evidence beside the block.
  date: 2026-09-19
  status: approved
  affects: [type:node, rule:agent-contract]
  part-of: goal:memory.validated-asks
- id: decision:memory.shapes
  title: The checks ctx enforces per type are declared on the type, not in the linter
  context: >
    "a shipped req has verified-by", "a rule has source", "a superseded node names its successor", "a constraint has a
    rationale" — the first two are code in lib/graph.js; the rest are new. SHACL-style shapes make such checks data of
    the ontology, so a product can add its own and the checker can explain a violation in words.
  choice: >
    A type card may carry `shapes:` — lines of the form `<status or *> requires <prop>[, <prop>]` and
    `<prop> refs status <s>` — read by the parser and enforced by `ctx check` with the type's own wording; the two
    hardcoded checks move into schema/base-ontology.md.
  alternatives: full SHACL / ShEx (heavy for markdown cards); keep checks in code (products cannot add theirs).
  consequences: ctx check reads shapes; req:ontology.check refines to cover them; the base ontology grows a few lines.
  date: 2026-09-19
  status: approved
  affects: [req:ontology.check, schema/base-ontology.md]
  part-of: goal:memory.validated-asks
- id: decision:memory.benchmark
  title: The 78 existing contradicts edges are the regression set for the verdict pass
  context: >
    Nothing measures whether contradiction detection works; every 2026 system paper reports near-shipping a wrong
    conclusion. The pilot's drift rows and contradicts edges are known-true contradictions with both sides in the graph.
  choice: >
    A test hides each contradicts edge in turn, rebuilds, runs the verdict pass on one side, and counts whether the
    other side comes back as contradicts (recall) and how many consistent pairs are flagged (precision); by conflict
    kind. Runs behind WATERFALL_LIVE=1 with recorded verdicts for CI. Reported in test-design.
  alternatives: none — measure or do not build the verdict pass.
  consequences: a recall / precision number per model and prompt hash before the pass is switched on by default.
  date: 2026-09-19
  status: proposed
  affects: [req:wf.describe.drift, req:wf2.contradictions.semantic]
  verified-by: [test:verdict-bench]
  part-of: goal:memory.validated-asks
```

## Code as a source: knowledge in the code files (the person's ask, 2026-09-19)

The person's idea: a new class or entity is written in code — why describe it a second time in markdown? Put the knowledge in a comment next to it and let Wye parse code files as well as documents.

The idea is sound and has precedent (Javadoc / JSDoc tags, Doxygen, doctests, traceability tags like `@req` in safety-critical code, docs-as-code), and it fits Wye better than most tools: a `rule:` already *must* cite `source:` (rule:agent-contract), the README already says line numbers in `source:` rot, and MOOSEDev bootstraps its graph by walking the repository. Turning the arrow around — the rule lives at its source — makes `source:` automatic and never stale, and it lowers capture friction where it matters most: the agent writes the rule in the file it is editing, one write instead of two. It also sharpens drift: an entity declared beside its class can be checked against the class.

Three things decide whether it works, and they are the questions below: what lives in code and what stays in documents (intent does not belong in a file: a goal, a decision that touches five modules, a question about the product); one defining place per id (the same id defined in both is an error, the other side is a reference); and writes back (status changes and UI edits to a code-defined node edit the comment — a text edit like any other, reviewed in the product repo's git, not Wye's).

```yaml
- id: decision:memory.code-source
  title: >
    Code files are a second source of nodes — a comment whose first token is an id defines that node, with the
    same grammar as a prose line
  context: >
    The person asked why an entity written in code is described again in markdown. Today knowledge is documents only
    (rule:markdown-canonical); rule: blocks point at code by `source:`; `source-roots` in a document's frontmatter
    already names the repos a module describes.
  choice: >
    The parser reads, after the documents, every file under the product's `source-roots` matching a per-language
    comment grammar: a comment line whose first token is an id (`// rule&#58;oversell Quantity never goes below zero,
    verified by test&#58;sales#oversell`; `# entity&#58;kitchen-item A line of a ticket (fields: …)`; a `/** … */` or `"""`
    block starting with an id) defines that node exactly as a prose line does (text, #status, trailing (key: value)
    group, ids in text become edges); consecutive comment lines are the node's continuation text and indented comment
    lines under it are its content. The parser sets `source: <path>#<line>` and `defined-in: code` itself. Kinds that
    may be defined in code: entity, value, state, field, op, action, gate, flag, rule, test, component, lib and product
    types that extend them; goal, req, decision, constraint, question and task stay in documents (they are intent, not
    mechanism) — a `// req&#58;x` in code is a reference, not a definition. One defining place per id: an id defined in a
    document and in code is a `ctx check` error naming both. The web app shows a code-defined node like any other,
    with its file and line; edits and `wf node set` rewrite the comment line in the code file through the same writer
    (rule:atomic-file-write), and the product repo's git reviews them. Documents mention code-defined nodes as tags.
  alternatives: >
    Generate documents from code comments (a second store, noisy diffs — rejected in the v2 design for the same
    reason); annotations with their own syntax (`@wye rule …`) — one grammar for prose lines, comment lines and cards is
    the point; letting every kind be defined in code (intent in a file no reader of the PRD sees).
  consequences: >
    The parser gains a comment pass and a language table (//, #, --, /* */, """, <!-- -->); `source:` on
    code-defined nodes is generated and never rots; the drift check can compare an entity's declared fields with the
    class next to it (task:memory.code-drift); the watcher follows source roots too; the constraint packet includes
    code-defined rules with a link into the file; rule:markdown-canonical becomes "text files in git are canonical:
    documents for intent, code for mechanism".
  date: 2026-09-19
  status: proposed
  affects: [rule:markdown-canonical, rule:agent-contract, req:wf.describe.drift]
  part-of: goal:memory.validated-asks
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

## Work

<!-- tasks -->
- [x] task:memory.constraint-packet Build the constraint packet (op:api.packet, `wf packet --for`) and put it in the first message under "Constraints in force"; two hops over governs, gated-by, affects, refines, part-of, depends-on from refs + semantic seeds; superseded filtered. Part of goal:memory.validated-asks (decision:memory.constraint-packet). (session: 9f3d83809b)
- [x] task:memory.bitemporal-props Add since, until, superseded-by, by, session, evidence to type:node; statuses superseded and retired; parser fills until / superseded-by from `supersedes`; retrieval and the packet skip ended nodes unless --as-of or --all. Part of goal:memory.validated-asks (decision:memory.bitemporal, decision:memory.evidence). (session: 9f3d83809b)
- [x] task:memory.decision-statuses Give the 43 status-less decisions a status (approved where the code follows them, superseded where a later one replaced them) and `supersedes` where the prose says so. Part of goal:memory.validated-asks. (session: 9f3d83809b)
- [x] task:memory.constraint-type Declare type:constraint in the base ontology, move the product's constraints out of _agent.md and the spec's non-goals into constraint: blocks, add the Constitution view and the `## Constitution` section of the agent prompt. Part of goal:memory.validated-asks (decision:memory.constraint-type). (session: 9f3d83809b)
- [x] task:memory.verdict-pass The write-time verdict pass on new or changed decision / req / rule / constraint blocks: pair classification with reasons, verdict blocks with model and prompt hash, contradiction: nodes with kind and lifecycle, Inbox rows with verdicts and the supersede / refine / dismiss choice on approval. Part of goal:memory.validated-asks (decision:memory.write-time-verdict). (session: 9f3d83809b)
- [x] task:memory.benchmark The hide-one-edge regression over the 78 contradicts edges: recall and precision per conflict kind, recorded verdicts for CI, live behind WATERFALL_LIVE=1. Part of goal:memory.validated-asks (decision:memory.benchmark). Before task:memory.verdict-pass is on by default. (session: 9f3d83809b)
- [x] task:memory.consolidate The consolidation run on session done: candidates from the transcript, diff against produced blocks, misses filed as proposed blocks with evidence in the plan document; type:lesson. Part of goal:memory.validated-asks (decision:memory.consolidate-sessions). (session: 9f3d83809b)
- [x] task:memory.forgetting Archived-for-retrieval state for done plans and closed sessions; retrieval, packet and search skip them unless --all; the rail folds them. Part of goal:memory.validated-asks (decision:memory.forgetting). (session: 9f3d83809b)
- [x] task:memory.shapes `shapes:` on type cards read by the parser and enforced by ctx check; move the two hardcoded checks into the base ontology. Part of goal:memory.validated-asks (decision:memory.shapes). (session: 9f3d83809b)
- [x] task:memory.lint-deep `ctx check --deep`: the verdict pass over every same-kind pair that shares a neighbour, on demand (Karpathy's lint --deep), reporting new contradictions. Part of goal:memory.validated-asks. (session: 9f3d83809b)
- [ ] task:memory.code-source-spike The comment pass of the parser over source-roots for one language (TypeScript, `//` and `/** */`), read-only, on Wye's own packages/web: entity, op, rule, component, lib nodes defined beside their code; one-defining-place check; the web app shows them with file and line. Part of goal:memory.validated-asks (decision:memory.code-source). Answer question:memory.code-source.kinds and question:memory.code-source.writes first.
- [ ] task:memory.code-drift With code-defined entities: compare declared fields with the class or type next to the comment and report drift. Part of goal:memory.validated-asks. After task:memory.code-source-spike.
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
- SHACL Validation in the Presence of Ontologies — arxiv.org/abs/2507.12286; xpSHACL — arxiv.org/abs/2507.08432
- Spec-driven development: GitHub Spec Kit (constitution), AWS Kiro (steering files) — thebcms.com/blog/spec-driven-development
- Anthropic, Effective context engineering for AI agents — anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Mem0 auto-resolve deleting still-needed memories — dev.to/mukesh_13/mem0-auto-resolves-memory-conflicts-for-you-until-it-silently-deletes-one-you-still-need-4f4m
