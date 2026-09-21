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
    On 2026-09-20 the person told the librarian "i asked to build this one" on pr:18 and got a paragraph
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
  status: superseded
  superseded-by: decision:wf2.pr-approval-is-the-persons-click
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
    type:pr today: proposed → building (after Proceed) → done | cancelled (rule:pr-doc). The person wants to agree
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
    type:pr gains statuses and the Definition section; lib:pr-doc writes and reads it; `defined` is computed from
    the embedded blocks' statuses; Build is a dispatch with the definition as context; rule:pr-doc is refined.
  date: 2026-09-19
  status: superseded
  superseded-by: decision:wf2.pr-lifecycle
  affects: [type:pr, rule:pr-doc, lib:pr-doc, req:exec.dispatch]
  part-of: goal:exec.define-first
- id: decision:wf2.pr-lifecycle
  title: The plan document is the Prompt Request — draft → refining → approved → building → done | failed | cancelled, readiness computed
  context: >
    decision:exec.plan-lifecycle had a plan go proposed → defining → defined → building with `defined` computed from
    the Definition. alex wanted a request to be one thing from typing it to its build: refined until it is clear,
    approved explicitly, then built by an agent — and several built in parallel when they do not overlap.
  choice: >
    type:pr becomes type:pr (`pr:<slug>`, `pr-<slug>.md` under the project's PRs page), the same page renamed and
    sharpened: Request / Context / Definition / Impact / Tasks / Result (the Plan section goes — prose to Context,
    decisions and questions are blocks in Definition; Impact is new, for the scheduler). Statuses: draft (nobody on
    it), refining (a librarian session is on it; back to draft when it leaves), approved (the person's click),
    building (a worker session runs), done | failed | cancelled. Readiness is computed, never a status — definition ·
    agreed · impact · no contradiction · tasks — shown as a list on the PR's head. Existing plan documents were
    migrated in place (scripts/plans-to-prs).
  alternatives: >
    A PR next to plans (two folders, two types) — rejected: one concept. A UI rename only — rejected: the documents
    and the CLI would say plan while the UI says PR. `queued` as a status — folded into approved: the approved PRs
    are the queue, in order of approved-at.
  consequences: >
    lib:pr-doc / lib:pr-docs, op:api.pr, component:pr-head, component:pr-folder, page:web/prs; wye pr (plan as an
    alias); type:pr in the base ontology; rule:pr-doc, rule:prs-folder, rule:pr-type-base refined. The scheduler
    (scope from Definition + impact, N parallel runners from Settings) is the next deliverable.
  date: 2026-09-20
  status: approved
  affects: [type:pr, rule:pr-doc, lib:pr-doc, lib:pr-docs, req:wf2.pr, op:api.pr, component:pr-head]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
- id: decision:wf2.pr-approval-is-the-persons-click
  title: A PR is approved by the person's click on its page — the librarian never approves and never builds
  context: >
    decision:exec.librarian-may-build let "build it" said to the librarian start the build. With PRs the build is
    started by the scheduler from an approved PR; approval has to be one explicit act by the person.
  choice: >
    Approve on the PR's head (and wye pr approve): sets `status: approved`, `approved-by`, `approved-at`; when the
    readiness list is not green the button names what is unagreed and a second click approves anyway. A live refining
    session on the PR is told once and stopped (lib:pr-sessions). Cancel and Reopen are the person's too. The
    librarian's brief says: when the person says build it, tell them the request is approved by the button on its
    page and whether the readiness list is green.
  alternatives: >
    Automatic approval when the Definition is fully agreed — rejected: the person decides. Approve only when fully
    agreed — rejected: building on proposals stays possible, said out loud.
  consequences: >
    decision:exec.librarian-may-build is superseded; Build on a task shows only when its PR is approved (until the
    scheduler takes over).
  date: 2026-09-20
  status: approved
  affects: [decision:exec.librarian-may-build, op:api.pr, component:pr-head, rule:build]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
- id: decision:wf2.req-free-text
  title: A requirement is free text in the person's words — when / then / unless is not a template
  context: >
    type:req was defined as "when <trigger>, <actor> <outcome> [unless <exception>]" and every prompt (the librarian,
    the worker, describe-module) made the agents fill those three slots. alex: requirements must be free-form text.
  choice: >
    A requirement is a `title` and free prose in `text` — a paragraph or a few: who it is for, what they get, what it
    replaces, what must never happen — in the person's words, no mechanism. `when`, `then`, `unless` stay as optional
    keys for the ones a person chose to write that way; nothing asks for them. The card renders `text` as prose
    under the title (component:node-cards); the inbox files a requirement's body as `text`; the prompts and the base
    ontology say so. Existing when / then / unless requirements stay as they are.
  alternatives: >
    Drop the three keys and rewrite the 200 existing requirements — rejected: they read fine and nothing depends on
    the keys. Keep the template — rejected by alex.
  consequences: >
    Questions from the librarian no longer come "along the requirement shape" but for what the request leaves
    unsaid; describe-module writes free-text requirements from code.
  date: 2026-09-21
  status: approved
  affects: [type:req, prompt:librarian-system, prompt:agent-system, component:node-cards, lib:inbox]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
- id: decision:wf2.pr-scheduler
  title: Approved PRs are built by the app — a dispatcher, N parallel runners, no two overlapping scopes at once
  context: >
    Under D1 an approved PR waited for a manual Build; alex approved #27 and asked why nothing started. The spec's
    second deliverable: the app runs the builds itself, several at once when they cannot collide.
  choice: >
    A PR's scope (lib:pr-scope) is its Definition ids, the ids its request tags and what lib/impact's structural
    candidates reach from them (two hops, weight ≥ 0.5) — written to the page as `scope` with `scope-of` (the hash
    of the Definition ids) after intake and whenever the Definition moves; readiness's impact check is that
    freshness. The dispatcher (lib:dispatch) runs on approve, on every session end and every 30 s: the PRs building
    (status building with a queued or live worker session; a stale one goes back to approved), the free slots
    (Settings › Agents, parallel runners, default 1), and the approved PRs in approval order — each whose scope does
    not overlap a building PR's starts through assignTask(build) with the Definition as context; the rest wait with
    the reason on the head and in the PRs folder (overlaps #12 (ids) / no free slot). No head-of-line blocking.
    Build now stays as the manual override. External wye runner processes keep taking backlog tasks; they do not
    take PRs.
  alternatives: >
    External runners only — rejected: nothing would run unless a runner was started by hand. Scope by document or
    module — rejected as too coarse for a first cut; the ids can be widened later.
  consequences: >
    The build agent runs in the product's repo — the same working tree a person may be editing; two builds never
    share a scope but may share files. lib:settings gains agents; op:api.pr gains rescope and the waiting reason.
  date: 2026-09-20
  status: approved
  affects: [req:wf2.pr, lib:dispatch, lib:pr-scope, lib:settings, op:api.pr, component:pr-head, component:pr-folder]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
- id: decision:wf2.cmd-modes
  title: ⌘P has two modes — PR (a request page with a refining session) and Ad-hoc (a conversation, no page)
  context: >
    The command box offered Task / Plan / Proposal and a "plan first" tick; every new conversation got a plan
    document. With PRs the distinction that matters is whether a page exists at all.
  choice: >
    A mode row, remembered per browser: PR (default) — the page is created as draft, set refining, and a librarian
    session refines it on the host with the refining brief (agent-host#refiningNote); the person lands on the page
    with the conversation in the column. Ad-hoc — a conversation with a coding agent on what you are looking at, no
    page; its blocks are still artifacts and consolidation still runs. A message into an existing conversation is
    unchanged. Plan-first, the Wye target and the intent chips go.
  alternatives: >
    Ad-hoc as a quick PR that skips refining — rejected: a page nobody refines is noise. PR mode creating the page
    only, refined by hand — rejected: the librarian is the point.
  consequences: >
    sessions POST takes `pr: true | false`; createPrDoc runs only for a librarian (refining) or an assigned task's
    worker (building); restartFresh makes a new PR only on a PR conversation.
  date: 2026-09-20
  status: approved
  affects: [component:command-box, op:api.sessions, rule:pr-doc]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

<!-- /list:decision -->
