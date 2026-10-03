---
node: workflow:ea.one-on-one
type: workflow
title: 1:1 prep
status: active
owner: unassigned
takes: meeting, person
part-of: module:ea-assistant
---

# 1:1 prep

Run on a pushed 1:1 (hook:ea.one-on-one-prep does it when one arrives) or on a person card. An agent prepares the 1:1
with skill:ea.one-on-one. After the 1:1, push its analysis through the intake as any meeting, and advance.

## Stages

```yaml
- id: stage:ea.one-on-one.prep
  title: Prepare the 1:1
  part-of: workflow:ea.one-on-one
  do: task "1:1 prep for {{title}}" --worker agent --skill skill:ea.one-on-one
  until: session done
  gate: auto
- id: stage:ea.one-on-one.after
  title: After the 1:1
  part-of: workflow:ea.one-on-one
  until: manual
  gate: person
```
