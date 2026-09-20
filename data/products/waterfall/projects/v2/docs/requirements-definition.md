---
node: module:req-definition
type: module
title: Definition — the librarian
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 16
---

# Definition — the librarian

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Definition — the librarian); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

```yaml
- id: req:exec.ask-wye
  title: A request typed to Wye starts a definition conversation on its own plan
  when: the person types a request in the command box and chooses "Ask Wye" (the default when nothing is selected and no live conversation is chosen)
  then: >
    a plan document is created with the request and status defining, a librarian session opens on it in the content
    column as a chat page, and its first turn is the context search and the explanation (req:exec.wye-context,
    req:exec.wye-explains); the same request from a node's "Ask Wye" carries the node as the subject
  unless: the person chose "Do" or a live worker conversation, which behave as today
  status: shipped
  satisfied-by: [component:command-box, op:api.sessions, lib:plan-doc, decision:exec.wye-is-a-role]
  requires-tests: [test:server-services#ask-wye-creates-plan, ui-test:ask-wye]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.wye-context
  title: Wye finds what the product knows and shows it in the context column while it reads
  when: a librarian session takes a request
  then: >
    it runs the constraint packet for the request (req:memory.intake-packet) and the semantic search, and the context
    column shows a Context card that fills in live — the nodes found, grouped: what exists (pages, actions, ops with
    their status), what is required (requirements with status), what is decided and what constrains, open questions,
    work in progress or done on the same area (tasks, plans) — each a tag that opens the node; the card stays at the
    top of the column for the conversation
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [op:api.packet, component:context-panel, rule:context-panel]
  requires-tests: [test:web-components#wye-context-card]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.wye-explains
  title: Wye explains the current state before it proposes anything
  when: the Context card has filled in
  then: >
    the first reply is the current state in plain language with the nodes as tags — what the product does today in
    this area, what is already decided or constrained, what is in progress, what the request would change — and it
    says plainly when the request is already satisfied, partly satisfied, or contradicts a constraint or decision,
    naming the node
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [decision:exec.wye-is-a-role, component:transcript-markdown]
  requires-tests: [test:librarian#explains-with-tags]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye, ui-test:explain]
- id: req:exec.wye-asks
  title: Wye asks along the requirement shape, few questions, as a form
  when: the request leaves a requirement's when, then or unless unspecified, or a constraint in force makes two readings possible
  then: >
    it asks up to three questions at a time as a question form (rule:agent-questions), each tied to the slot it fills
    or the constraint it resolves, with the reading it would otherwise assume as the first option; a question the
    person skips becomes a question: block in the Definition; it does not ask what the graph already answers
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [component:ask-questions, rule:agent-questions, decision:exec.wye-is-a-role]
  requires-tests: [test:librarian#asks-shape-slots-only]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.wye-proposes
  title: The person gets the definition as reviewable blocks, each where it belongs, before anything is built
  when: the state is explained and the person's answers are in
  then: >
    the person sees the proposed requirements, decisions, constraints, questions and tasks — each a block they can
    approve, edit or reject in the Inbox, on the plan's Definition or by replying — and finds each one in the
    document where that kind of knowledge lives (a requirement in the PRD, a decision in the design), with its
    verdicts against what already exists; an edit to an existing block shows old and new
  unless: the request is already satisfied, in which case the reply says so and proposes nothing
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [op:api.node, lib:plan-doc, rule:embed-line, op:api.verdicts]
  requires-tests: [test:librarian#proposes-in-home-documents, test:web-lib#plan-definition-embeds]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.plan-defined
  title: A plan is defined when its Definition is agreed
  when: every block embedded in a plan's Definition is approved, resolved or rejected, and no open contradiction touches an approved one
  then: the plan's status becomes defined; the plan page and the Work view show "defined" with the counts; a change to any embedded block after that returns the plan to defining and says which block
  status: shipped
  refines: req:exec.ask-wye
  satisfied-by: [lib:plan-doc, decision:exec.plan-lifecycle]
  requires-tests: [test:web-lib#plan-defined-computed]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye, test:web-lib#plan-doc]
- id: req:exec.build-from-definition
  title: A defined plan is built by any worker from its Definition
  when: Build is pressed on a plan, now or weeks later
  then: >
    the plan's request task is assigned (req:exec.dispatch) with the Definition as context — every approved block's
    text and id, every change record's before and after, the constraint packet — and the plan moves to building; the
    worker's tasks nest under the request task; on done the plan's Result lists what was built against each block of
    the Definition (implemented, changed, left) and the requirements the worker marked shipped
  unless: the plan is not defined, in which case Build lists the unagreed blocks and asks to go ahead anyway
  status: shipped
  refines: req:exec.plan-defined
  satisfied-by: [op:api.work.assign, lib:plan-doc, rule:task-artifacts]
  requires-tests: [test:server-services#build-carries-definition, ui-test:build-plan]
  part-of: goal:exec.define-first
  verified-by: [ui-test:build-plan]
- id: req:exec.definition-tracked
  title: Every change a definition conversation proposes is tracked as part of the plan
  when: a librarian session, or the person during it, adds a block or edits a node while the plan is defining
  then: the block or change record is embedded in the Definition automatically (the session id links them), so nothing proposed in the conversation exists only in the transcript; the plan page shows the Definition as a list with status per item and a diff for edits
  status: shipped
  refines: req:exec.plan-defined
  satisfied-by: [lib:plan-doc, rule:block-attribution, store:changes]
  requires-tests: [test:web-lib#definition-tracks-session-blocks]
  part-of: goal:exec.define-first
  verified-by: [ui-test:ask-wye]
- id: req:exec.explain-anywhere
  title: "What do we know about this?" works on any node without starting a request
  when: "Explain" is used on a node or a selection, or `wf explain <id|text>` runs
  then: a librarian turn returns the current state for it — the Context card and the explanation — in the context column or on stdout, and proposes nothing
  status: shipped
  refines: req:exec.wye-explains
  satisfied-by: [decision:exec.wye-is-a-role, op:api.packet]
  requires-tests: [test:cli#wf-explain]
  part-of: goal:exec.define-first
  verified-by: [ui-test:explain]
```

<!-- /list:req -->

## Open questions

<!-- list:question -->

```yaml
- id: question:exec.wye-model
  title: Which model and agent runs the librarian, and does it reuse a worker's conversation or always start clean?
  q: >
    The host runs Claude Code and Codex; the librarian could be either with the librarian prompt and tool
    allow-list, or the Messages API directly. A clean session per request keeps the context honest; a person may
    want to continue defining on the same conversation across days.
  context: decision:exec.wye-is-a-role keeps the host; the model and the continuation policy are not decided.
  status: open
  related-to: [decision:exec.wye-is-a-role, rule:clean-slate]
- id: question:exec.definition-home
  title: When the home document for a proposed block does not exist yet, where does Wye write it?
  q: >
    A requirement for a new area has no PRD section; a constraint has no constitution page until
    decision:memory.constraint-type lands. Does Wye create the document, write into the plan and let the person move it,
    or ask?
  context: rule:embed-line keeps one definition per block; the plan embeds. The Inbox's "file into a document" exists for notes.
  status: open
  related-to: [req:exec.wye-proposes, rule:embed-line]
```

<!-- /list:question -->
