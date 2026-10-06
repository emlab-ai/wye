---
node: {{kind}}:{{slug}}
title: {{title}}
status: proposed
owner: unassigned
last-verified: {{date}}
part-of: {{parent}}
---

# {{title}}

## 0. {{kind}}:{{slug}}

```yaml
id: {{kind}}:{{slug}}
purpose: >
  The implementation plan: what gets built, in which order, and how far along it is.
part-of: {{parent}}
```

## Goal

One sentence.

## Requirements

What must be true for a person, as behaviours they can observe — each a block of this plan.

```yaml
- id: req:{{slug}}.first
  title: <when …, then …>
  status: proposed
  when: <the trigger>
  then: <the outcome>
  unless: <the exception>
  part-of: {{kind}}:{{slug}}
```

## Phases

| phase | delivers | exit criterion |
|---|---|---|
| 1 | … | … |

## Tasks

One task line per thing a session can finish and a person can review, in the order they are done — each a node
with a status: `part of` the requirement it implements, `depends on` what it waits for, `#ready` when a worker
could start it now.

- [ ] task:{{slug}}.first What it delivers, in one sentence, part of req:{{slug}}.first #ready
