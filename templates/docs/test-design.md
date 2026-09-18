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
  The verification plan: test nodes per area, their cases, and what stays untested.
part-of: {{parent}}
```

## 9. Verification index

```yaml
- id: test:{{slug}}-first
  file: path/to/first.test.ts
  description: What this file proves.
  cases:
    - case-one: what it asserts
  count: 1
```

**Untested surfaces:** list them honestly.
