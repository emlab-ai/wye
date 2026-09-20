---
node: module:prd-execution
type: module
title: Execution — research notes
status: proposed
owner: alex
last-verified: 2026-09-19
sources:
  - packages/web/src/lib/agent-host.ts        # buildPrompt, pump, restartFresh: how a request reaches a worker today
  - packages/web/src/lib/sessions.ts          # queue, claim, end hook
  - packages/web/src/lib/plan-docs.ts         # a plan document per request
  - packages/web/src/lib/artifacts.ts         # what a session produced; block attribution
  - packages/web/src/lib/node-edit.ts         # PUT node: edits the defining line or card
  - packages/web/src/components/TrackList.tsx # the Tasks and Goals lists
  - lib/graph.js                              # impact (reverse structural closure), packet
part-of: module:research
order: 73
---

# PRD — execution: work, workers, and edits with impact

Three asks from the person on 2026-09-19, after the memory review (module:memory-review):

1. Sending any page or block with an instruction to an agent works. Keep it — and make every such dispatch a work
   item, so nothing that is being worked on is invisible.
2. One view of **all planned work**, whoever is doing it. Agents are workers; the work is the unit, not the agent.
3. When a block is edited — a requirement, a rule, a decision — the app **works out the impact**: what refines it,
   what it is satisfied or verified by, what mentions it, what sits under it, and proposes the updates those need;
   where an update is more than a line, it asks a worker to make it. The edit and its ripple are reviewed the way
   proposed blocks are (the Inbox, validated on write per decision:memory.write-time-verdict), with the **old and
   new value** side by side.

Two more, added the same day (E.4 and E.5):

4. A place to **drop items for a worker to discover** — "maybe it is the inbox" — so work can be captured before
   anyone is asked to do it, and an agent can pick it up.
5. **Talk to Wye.** "I want to improve the editor, to allow stopping a running task" — and the system, not a coding
   agent, finds everything relevant and shows it in the context column, explains the current state, asks what it
   must, proposes the requirements, decisions and tasks, and agrees them with the person **before** anything is
   built; Wye keeps every proposed change of that conversation as one set, so it can be built later, by anyone.

Every behaviour is a `req:` block (`when` / `then` / `unless`, status proposed); the choices this document makes on
its own are `decision:` blocks (proposed); what it cannot decide is a `question:` block. Ids are `exec.<slug>`.

## What exists, and what the research says

**Today.** A request from the command box or a "Send to agent" starts a chat session with a plan document
(rule:plan-doc, decision:wf2.plan-per-request) and a queue (rule:session-queue); runners claim queued sessions
(rule:agent-runner, op:api.sessions.claim); the Agents page lists workers with their plans; the Tasks page
(component:track-list) lists task lines from every document with search and status; a task carries the sessions and
documents it produced (rule:task-artifacts). What is missing: a work item is not a task (a request is a plan page; its
tasks come later, if the agent writes them); there is no place that lists todo, queued, working and blocked work
across plans, documents and workers; a task cannot be handed to a worker from where it is listed; and an edit to a
node is written (op:api.node, rule:block-attribution records that it changed) with no old value kept, no impact
computed and no review.

**Research.**

- *Work assignment.* GitHub's Copilot cloud agent for Linear (GA July 2026): an issue is assigned to the agent like
  to a person; the agent works in its own environment, streams progress to the issue's timeline and asks for review
  when done; per-issue and per-team settings choose model and custom agent. amux and the 2026 orchestration
  guides converge on one primitive — a shared board with atomic claiming, one agent per task with a clear scope,
  human review checkpoints. Wye has claiming at the session level; the board and the task-as-unit are the gap.
- *Change impact analysis.* The 2026 vision paper on semantically-seeded, graph-propagated impact analysis blends
  two signals — cosine similarity to the changed artifact and multi-hop propagation over reversed typed edges with
  geometric decay — and reports semantic-only at 0.87 recall / 0.42 precision, the blend at 1.0 recall on its
  benchmark, with artifacts of zero textual overlap recovered by propagation alone; LLM verification of the ranked
  candidates is its next step. "LLM-Driven Cost-Effective Requirements Change Impact Analysis" (2025) does the
  verification with RAG over requirements plus trace links and a change description. Kiro's specs regenerate only
  what a change reaches (a task change rebuilds tasks; a requirement change rebuilds design and tasks) on an explicit
  "sync", never silently. STALE (memory review) shows the propagated, second-hop conflicts are the ones models miss.
- *Approval UX.* The 2026 agent-approval guidance: show the affected records, the previous state and the proposed
  change, plus the unchanged fields that constrain interpretation; make proposals editable so the reviewer fixes
  rather than re-prompts; require fresh approval when the proposal changed after review; name the states —
  proposed, awaiting approval, running, completed, partially completed, failed, unknown; undo restores state, cancel
  stops work. Suggesting-mode implementations keep the before and after values as a pending proposal that is
  accepted or rejected like a diff.
- *Define before build.* Kiro's specs (requirements → design → tasks, each gated by approval) and Claude Code's
  plan mode (read-only until the person allows writes) are the two shipped shapes; neither knows the product's
  existing requirements, so both start from the request alone. ReqElicitGym (2026) measured seven models
  interviewing for requirements: the best elicited 32% of the implicit requirements, models "overwhelmingly favour
  probing over clarification", and the fix the authors propose is ontology-guided coverage — ask along a taxonomy of
  what a requirement needs, not whatever comes to mind. "From Chat to Interview" (2026) does that with an experience
  ontology steering the questions and stakeholders validating the extracted requirements. Wye has the taxonomy
  already: `when` / `then` / `unless` on type:req, the constraints in force, and the open questions on the nodes the
  request touches.

## Goal

## E.1 Work — the unit, and one view of it

## E.2 An edit keeps its old value and is reviewed like a proposal

## E.3 Impact — what an edit reaches, and the updates it needs

## E.4 Backlog — items dropped for a worker to discover

## E.5 Talk to Wye — define first, then build

## Types this PRD adds (declared once approved; a `markdown` fence, so nothing parses it yet)

```markdown
- id: type:task            # additions to the base type
  props:
    worker: string?        # a person's name or an agent name; who holds the task now
    priority: number?
    blocked-by: list of task? -(inverse)-> blocks
    change: string?        # the change record a follow-up task came from
    ready: bool?           # the person's mark that a backlog task may be taken by a runner (#ready)
- id: type:plan            # additions: statuses proposed | defining | defined | building | done | cancelled
  props:
    role: string?          # the session role that filled it: librarian | worker
    definition: text?      # the Definition section: embedded blocks and change records, computed counts
- id: type:session         # not a document node: additions to the session record
  props:
    role: enum [worker, librarian]
- id: type:change          # not a document node: the shape of a change record in store:changes
  purpose: an edit of a typed node — before, after, who, when, its review state, its impact run
  props:
    node: ref node
    before: text
    after: text
    by: string
    session: string?
    state: enum [pending, accepted, reverted]
    impact: text?          # the impact set: candidate, path, verdict, reason, patch or task
```

## Work

<!-- tasks -->
<!-- /tasks -->

## Sources

- GitHub changelog, "Copilot cloud agent for Linear is now generally available" (2026-07-23) — github.blog/changelog/2026-07-23-copilot-cloud-agent-for-linear-is-now-generally-available; GitHub docs, Integrating Copilot cloud agent with Linear
- amux, AI Agent Orchestration in 2026: patterns, tools, architecture (shared board, atomic claiming) — amux.io/guides/ai-agent-orchestration-2026
- Toward Semantically-Seeded, Graph-Propagated Impact Analysis Across Software Artifacts: A Vision — arxiv.org/abs/2606.18855
- LLM-Driven Cost-Effective Requirements Change Impact Analysis — arxiv.org/abs/2511.00262
- From Seed to Scope: Reasoning to Identify Change Impact Sets (ICSE 2026); TraceLLM — arxiv.org/abs/2602.01253
- Kiro docs, Feature specs: requirements-first workflow and selective regeneration on sync — kiro.dev/docs/specs/feature-specs
- STALE: Can LLM Agents Know When Their Memories Are No Longer Valid? — arxiv.org/abs/2605.06527 (propagated conflicts)
- Humbleteam, AI agent UX: approval, undo, and human handoff (2026) — humbleteam.com/blog/ai-agent-ux-approval-undo-human-handoff
- Velt, Suggestion mode (before / after as a pending proposal) — velt.dev/suggestions
