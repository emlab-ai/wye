---
node: workflow:ea.suggest-actions
type: workflow
title: Suggest actions
status: active
owner: unassigned
takes: module
part-of: module:ea-assistant
---

# Suggest actions

Runs on the [Digest](module:ea-digest) each weekday morning (hook:ea.suggest-actions) and after an outside tool pushes
new information (hook:ea.suggest-on-new-information); by hand: `wye workflow run workflow:ea.suggest-actions --on
module:ea-digest --again`. One stage: an agent with skill:ea.suggest-actions renews, adds and closes the Suggested
actions at the top of the Digest. Nothing waits for you.

## Stages

```yaml
- id: stage:ea.suggest-actions.write
  title: Suggest actions
  part-of: workflow:ea.suggest-actions
  do: task "Suggest actions" --worker agent --skill skill:ea.suggest-actions
  until: session done
  gate: auto
```
