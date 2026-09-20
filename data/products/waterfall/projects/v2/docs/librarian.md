---
node: module:librarian
type: module
title: Definition — the librarian
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:app
order: 44
---

# Definition — the librarian

Definition — the librarian

## Decisions

<!-- list:decision -->

```yaml
- id: decision:exec.wye-is-a-role
  title: Wye is a session role — the librarian — with the clerk's guardrails, not a new runtime
  context: >
    The v2 design has an internal agent, the clerk (req:wf2.clerk): propose-only, budgeted, cannot trigger itself.
    Sessions today host Claude Code and Codex as child processes with the agent contract as system prompt
    (rule:agent-host). The person wants to talk to "the system", which must read the graph, explain it and write
    proposed knowledge — never code.
  choice: >
    A session has a role: worker (today) or librarian. A librarian session runs on the same host with a different
    system prompt (prompts/librarian-system.md: read Wye, explain, ask along the requirement shape, propose blocks,
    never edit code, never mark anything approved) and a closed tool set — the wf read commands, `wf propose`
    (writes proposed blocks into home documents and embeds them on the plan), `wf plan` (the plan's status and
    definition), AskUserQuestion — with no shell, no file writes outside the product's documents, and a budget
    (req:wf2.clerk.budget). "Ask Wye" in the command box starts a librarian session on a new plan (status defining);
    the same role serves the on-demand explain ("what do we know about X") from any node.
  alternatives: >
    The worker agent with plan-first (it is a coding agent reading code; the person wants product state, and it
    would edit the code the moment it is allowed); a hand-rolled tool-use loop over the Messages API (the v2 clerk
    design — a second runtime to maintain when the host already streams, asks questions and records artifacts).
  consequences: >
    A role on the session record and the plan; a second system prompt; a tool allow-list per role on the host; the
    librarian's writes are proposed blocks only, so the Inbox and the verdict pass cover them.
  date: 2026-09-19
  status: proposed
  affects: [req:wf2.clerk, rule:agent-host, rule:agent-contract, component:command-box]
  part-of: goal:exec.define-first
- id: decision:exec.librarian-may-build
  title: "Build it" said to the librarian starts the build — the librarian runs `wf plan build`, it never tells the person to press a button
  context: >
    On 2026-09-20 the person told the librarian "i asked to build this one" on pr:pr-build and got a paragraph
    explaining that Build was theirs to press (decision:exec.wye-is-a-role: the librarian writes no code; rule:build
    lives in the UI; the wf CLI had no Build). Nothing started. The person's word in the conversation is the same
    approval the button gives.
  choice: >
    `wf plan build <plan> [--worker claude-code|codex|runner] [--force]` — the plan's request task assigned with
    `build: <plan>` through op:api.work.assign, exactly what the Build button does (rule:build): the Definition goes
    with it, unagreed blocks listed as such, the plan moves to building. The librarian's tool set includes it, and
    its prompt says: when the person says build / go ahead / do it / implement, run it at once, report the session
    that started and what was still open, and finish. The librarian still writes no code — the worker does. Never
    "that is yours to press".
  alternatives: >
    Keep Build UI-only and have the librarian ask the person to press it (what happened; the person had already said
    it); let the librarian implement (breaks the role).
  consequences: >
    bin/wf.js gains `plan build`; prompts/librarian-system.md and the host's librarian protocol gain the line;
    rule:build's "a librarian's hold does not refuse it" already covers the hand-over.
  date: 2026-09-20
  status: proposed
  refines: decision:exec.wye-is-a-role
  affects: [decision:exec.wye-is-a-role, rule:build, req:exec.build-from-definition]
  by: agent:claude
  part-of: goal:exec.define-first
- id: decision:exec.kind-by-nature
  title: A block's kind is what it is — a requirement is an observable behaviour in the person's words; how the product does it is a rule or a decision
  context: >
    On 2026-09-20 the person read req:exec.wye-proposes in the Inbox — "Wye proposes the definition as blocks in
    their home documents, embedded on the plan" — and said it is not a requirement: it is a statement of system
    behaviour, a decision. Agents (this one included) had been writing mechanism as requirements because the
    contract said what kinds exist, not how to tell them apart.
  choice: >
    Both prompts (prompts/agent-system.md, prompts/librarian-system.md) and the host's librarian protocol carry a
    "Which kind a block is" section with one test: could a person check it from outside the product without reading
    code — yes, a requirement (when / then / unless, outcome in the title, no component ids, no mechanism in `then`);
    no and the code guarantees it — a rule with a source; no and someone chose it — a decision with alternatives.
    req:exec.wye-proposes is rewritten as the example; the other mechanism-shaped requirements of this PRD are
    re-kinded by task:exec.rekind.
  alternatives: >
    Leave the kinds to judgement (what produced the mistake); a linter that rejects ids in requirement titles (a
    later shape on type:req, decision:memory.shapes).
  consequences: >
    Prompts grow by a section; a review of the E.1–E.5 requirements; a candidate shape for type:req.
  date: 2026-09-20
  status: proposed
  affects: [rule:agent-contract, decision:exec.wye-is-a-role, req:exec.wye-proposes]
  by: agent:claude
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
- id: decision:exec.plan-lifecycle
  title: A plan goes proposed → defining → defined → building → done, and its Definition section is the set of blocks it will build
  context: >
    type:plan today: proposed → building (after Proceed) → done | cancelled (rule:plan-doc). The person wants to agree
    on all requirements first, then let it be implemented, and have every proposed change tracked so it can be built
    later — the v0.1 delta (entity:delta, "how a feature enters the graph before code") as a living page.
  choice: >
    A plan document gains a Definition section between Context and Plan: every block the librarian or the person
    proposed for this request — requirements, decisions, constraints, questions, and change records of edits to
    existing nodes — defined in their home documents and embedded here (rule:embed-line), each with its review state.
    Statuses: proposed (created), defining (a librarian session is on it), defined (every block in Definition is
    approved or resolved and no open contradiction touches them — computed, shown as a check), building (a worker
    holds its request task), done, cancelled. "Build" on a defined plan assigns the request task (req:exec.dispatch)
    with the Definition — the approved blocks' text, the change records' before / after, the constraint packet — as
    the instruction's context; a plan that is not defined can still be built, and the button says what is unagreed.
    The Definition is the plan's change set: the Work view and the plan page show it as "n blocks, k approved, j
    open", and a plan can be built weeks later by a different worker from the same page.
  alternatives: >
    Agree in the conversation only (the transcript is not a definition anyone can build from later); a separate
    spec document per request (the plan is that document); statuses on the conversation rather than the plan (a
    plan outlives its sessions).
  consequences: >
    type:plan gains statuses and the Definition section; lib:plan-doc writes and reads it; `defined` is computed from
    the embedded blocks' statuses; Build is a dispatch with the definition as context; rule:plan-doc is refined.
  date: 2026-09-19
  status: proposed
  affects: [type:plan, rule:plan-doc, lib:plan-doc, req:exec.dispatch]
  part-of: goal:exec.define-first
```

<!-- /list:decision -->
