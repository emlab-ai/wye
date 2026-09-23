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
  What is true around this idea — what the product already says, what the code does, what the outside claims, what a
  change would reach, and what is still undecided. No requirements here: they are the PRD's.
part-of: {{parent}}
```

## What was asked

The idea in the person's words, with the refs it came with.

## What exists today

What the product already defines that touches this — requirements, rules, decisions, constraints — and what the code
does, cited as `file#Symbol`.

## What the outside says

Sources, each one with what it actually claims and where it is from.

## What this would touch

The modules, documents and nodes a change would reach.

## Open questions

```yaml
- id: question:{{slug}}.first
  q: Something a person must answer before the PRD can be written.
  status: proposed
```
