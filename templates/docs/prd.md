---
node: {{kind}}:{{slug}}
title: {{title}}
status: proposed
owner: unassigned
last-verified: {{date}}
part-of: {{parent}}
---

# {{title}}

## 0. module:{{slug}}

```yaml
id: {{kind}}:{{slug}}
purpose: >
  The product requirements of {{title}}: one node per behaviour, grouped by capability.
part-of: {{parent}}
```

## Problem statement

What problem are we solving, for whom, and how do we know it is solved?

## Goals and non-goals

- Goal: …
- Non-goal: …

## R. Requirements (behaviour)

Requirements are the root nodes. Form: **when** trigger, **then** outcome, optional **unless** exception.
Ids are dotted paths: `req:<mod>.<capability>.<detail>` refines `req:<mod>.<capability>`.

### R.1 First capability

```yaml
- id: req:{{slug}}.first
  title: One line in the user's words
  when: the trigger
  then: the observable outcome
  status: proposed
  satisfied-by: []
  requires-tests: []
```

## Coverage

Every requirement above with what satisfies it, what verifies it and the tasks on it — a gap is a requirement no
decision satisfies or no test verifies, and the design stage of a workflow will not advance past one
(decision:wf2.traceability-is-the-verb). Click a gap to send it to an agent.

<!-- view:req coverage=1 scope=project as=table -->

## 11. Open questions

```yaml
- id: question:{{slug}}.first
  q: Something the requirements leave undecided.
```
