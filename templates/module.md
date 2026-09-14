---
node: module:<slug>
type: module
title: <Module Name>
status: shipped | partial | proposed
owner: unassigned
last-verified: <YYYY-MM-DD>
verified-against: <branch @ sha>
source-roots: [., <server module dir>, <client module dir>, <ui-tests dir>]
sources:
  - <existing PRDs / plans / knowledge-base pages you read>
---

# <Module Name> — product context graph

Node kinds, verbs and statuses are defined in the waterfall schema (`schema/kinds.yaml`). Every heading that
starts with `kind:slug` is a node; every `-(verb)->` line and every typed key (`satisfied-by:`, `verified-by:`, …) is an edge.

---

## 0. module:<slug>

```yaml
id: module:<slug>
purpose: >
  <one paragraph: what this module does for whom>
submodules: [<a>, <b>]
scoping: <tenant / location scoping rule>
edges:
  - module:<slug> -(gated-by)-> gate:feature-<slug>
  - module:<slug> -(edge-to)-> module:<other>
```

---

## R. Requirements (behaviour)

Requirements are the root nodes. Form: **when** trigger, **then** outcome, optional **unless** exception.
Ids are dotted paths: `req:<mod>.<capability>.<detail>` refines `req:<mod>.<capability>`.

### Flags referenced by requirements

```yaml
- id: flag:<name>
  scope: location | item | tenant
  set-by: [page:settings/<x>]
  source: <file:line>
```

### R.1 <Capability>

```yaml
- id: req:<mod>.<capability>
  title: <one line, user's words>
  when: <trigger>
  then: <observable outcome>
  unless: <exception>                 # optional
  status: shipped | api-only | unverified | proposed | question
  satisfied-by: [rule:<x>, op:<y>, action:<z>]
  verified-by: [test:<Class>#<Method>, ui-test:<spec>#<scenario>]
  note: <hazards, caveats, drift references>

- id: req:<mod>.<capability>.<detail>
  title: …
  refines: req:<mod>.<capability>
  …
```

---

## 1. Entities

### entity:<name>

```yaml
id: entity:<name>
collection: <Mongo collection>
key-prefix: <prefix>
source: <file:line>
description: <what it is>
fields:
  <fieldName>:   <type>        # <note>
computed (not stored):
  <name>:        <formula>     (<file:line>)
edges:
  - entity:<name> -(has)-> entity:<child>
  - entity:<name> -(refs)-> entity:<other>
  - entity:<name> -(owns)-> state:<sm>
  - entity:<name> -(governed-by)-> rule:<r>
```

---

## 2. Value objects and enums

| id | source | values |
|---|---|---|
| value:<enum> | <file:line> | A, B, C |

---

## 3. State machines

```yaml
id: state:<name>
owner: entity:<name>
states: [A, B, C]
transitions:
  - A -> B : <trigger>   # <file:line>
terminal: [C]
```

---

## 4. Operations (public API surface)

| op | args | does | gate | source |
|---|---|---|---|---|
| op:<name> | <args> | <one line> | <policy>, F | <file:line> |

---

## 5. Pages and actions (client)

```yaml
id: page:<route>
route: <path>
component: <file>
vm: <file>
roles: [<roles>]
reads: [op:<a>, op:<b>]
actions:
  - action:<slug>:   <what it does> -(calls)-> op:<x>
  - action:<slug>:   <…> -(navigates)-> page:<y>
display-rules:
  - <rule with file:line>
```

---

## 6. Rules (invariants, constraints, policies)

```yaml
- id: rule:<slug>
  statement: <precise, testable>
  source: <file:line>[; <file:line>]
  verified-by: [test:<Class>#<Method>]
  note: <optional>
  contradicts: [drift:<mod>.<n>]        # optional
```

---

## 7. Cross-module edges (boundary contracts)

```yaml
- module:<other> -(triggers)-> rule:<x>
  via: <mechanism>
  contract: <what crosses the boundary>
```

---

## 8. Gates

```yaml
- id: gate:feature-<slug>
  server: <enum member + where checked>
  client: <enum + route gating>
  applies-to: [<ops/pages>]
  NOT-applied-to: [<ops that should be gated but aren't>]
- id: gate:permission-<x>
  applies-to: […]
```

---

## 9. Verification index

| test node | file | count |
|---|---|---|
| test:<Class> | <path> | <n> |

**Untested surfaces:** <list>

---

## 10. Drift and contradictions

| # | a | b | what disagrees | where |
|---|---|---|---|---|
| 1 | <node or doc> | <node or doc> | <one line> | <file:line vs file:line> |

---

## 11. Open questions

```yaml
- q: <behaviour the code leaves unspecified>
```
