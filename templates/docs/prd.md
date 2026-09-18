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

## 11. Open questions

```yaml
- id: question:{{slug}}.first
  q: Something the requirements leave undecided.
```
