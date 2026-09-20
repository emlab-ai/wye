---
node: module:users-and-jobs
type: module
title: Users and jobs
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 11
---

# Users and jobs

Who Wye is for and what they come to do; the goals the product sets out to reach.

<!-- view:goal -->

## Goals

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
  part-of: module:users-and-jobs
  depends-on: [req:wf2.clerk, req:wf2.contradictions, module:ontology-design]
- id: goal:ontology.graph-editor
  title: The document is a graph editor
  description: >
    Every block of a document behaves as the node it is: a click on any part of it selects it and the context column
    shows the node — its properties, its edges, what is under it; a plain paragraph is a block node with the same
    treatment; any node can carry child nodes — a comment, a question, a decision, an instance of any type — written
    under it in the document and shown under it in the column; links between nodes are edges the person can follow and
    make from either side. Reading and writing stay markdown: the tree is what the parser already builds.
  status: proposed
  owner: unassigned
  part-of: module:users-and-jobs
  depends-on: [req:ontology.blocks, req:wf2.ui.node-page]
- id: goal:exec.work-and-impact
  title: All work is one list, any worker can take any item, and an edit shows what it changes before it lands
  description: >
    Every request, task and ripple edit is a work item on one Work view with its state, its worker (a person or an
    agent) and what it serves; an item is dispatched to a worker from that view and comes back with what it produced;
    an edit to a typed node keeps its old value, computes the nodes it reaches, proposes the updates they need — as a
    patch when it is a line, as a work item when it is more — and everything waits in the Inbox with old and new side
    by side, validated on write.
  status: proposed
  owner: alex
  part-of: module:users-and-jobs
  depends-on: [goal:memory.validated-asks, req:wf2.sessions.plan-doc, rule:task-artifacts]
- id: goal:exec.define-first
  title: A request is understood, explained and agreed as knowledge before anyone builds it
  description: >
    The person tells Wye what they want in their own words; Wye finds what the product already knows about it and
    shows it in the context column, explains the current state in plain language with the nodes as tags, asks the
    few questions the requirement shape needs, proposes requirements, decisions, questions and tasks as blocks, and
    keeps them as one definition on the request's plan until every block is agreed; then the plan is built by any
    worker from that definition, and every change the conversation proposed is tracked as part of it.
  status: proposed
  owner: alex
  part-of: module:users-and-jobs
  depends-on: [goal:memory.validated-asks, goal:exec.work-and-impact, req:wf2.clerk]
```
