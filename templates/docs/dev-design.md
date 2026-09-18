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
  The technical design that satisfies the requirements: entities, values, states, operations, pages, rules.
part-of: {{parent}}
```

## Overview

How the pieces fit, in a few paragraphs.

## 1. Entities

```yaml
- id: entity:{{slug}}-thing
  description: What it is.
  source: path/to/file.ts
  fields:
    name: string
```

## 2. Value objects and enums

| id | source | values |
|---|---|---|
| value:{{slug}}-status | path/to/file.ts | a, b, c |

## 3. State machines

```yaml
- id: state:{{slug}}-lifecycle
  owner: entity:{{slug}}-thing
  states: [a, b]
  transitions:
    - a -> b : the trigger
```

## 4. Operations

| op | args | does | gate | source |
|---|---|---|---|---|
| op:{{slug}}.first | args | one line | – | path/to/file.ts |

## 5. Pages and actions

```yaml
- id: page:{{slug}}/home
  route: /
  component: path/to/page.tsx
  actions:
    - action:{{slug}}-do: what it does -(calls)-> op:{{slug}}.first
```

## 6. Rules

```yaml
- id: rule:{{slug}}-first
  statement: A precise, testable constraint.
  source: path/to/file.ts
  status: proposed
  requires-tests: []
```
