---
node: module:evaluation-hooks
type: module
title: Hooks
status: active
owner: unassigned
last-verified: 2026-09-21
part-of: module:benchmarks
---

# Hooks

A hook is "when this happens to that kind of node, do this" (type:hook): `on: <kind>.<event>` — created, status:<x>, linked:<verb>, pr.approved, pr.built, session.done (kind may be `*`) — an optional `where:` (document=<glob>, type=<slug>, status=<x>, prop=<key>:<value>), and `do:` lines: `run skill:<id>` starts a session with that skill on the node, `add <template>` appends a template's blocks under it. A hook fires once per node unless `once: false`; `status: paused` switches it off. Everything a hook writes is proposed and goes through review. Templates (type:template) live here too: markdown with {{node}}, {{slug}}, {{title}}, {{kind}}.

## Hooks

```yaml
- id: hook:req-approved-tests
  title: An approved requirement gets its tests defined
  on: req.status:approved
  do: run skill:define-tests
  once: true
  status: active
```

## Templates

```yaml
- id: template:test-card
  title: A proposed test card for a node
  body: |
    - test:{{slug}}-test {{title}} — checked #proposed
```
