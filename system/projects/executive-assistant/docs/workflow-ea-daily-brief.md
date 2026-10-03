---
node: workflow:ea.daily-brief
type: workflow
title: Daily brief
status: active
owner: unassigned
takes: module
part-of: module:ea-assistant
---

# Daily brief

Each weekday morning hook:ea.daily-brief runs this on [Briefs](module:ea-briefs); run it by hand any time with
`wye workflow run workflow:ea.daily-brief --on module:ea-briefs --again`. One stage: an agent builds today's brief with
skill:ea.daily-brief and adds what to do first. It moves on by itself — nothing waits for you but the brief.

## Stages

```yaml
- id: stage:ea.daily-brief.write
  title: Write today's brief
  part-of: workflow:ea.daily-brief
  do: task "Daily brief" --worker agent --skill skill:ea.daily-brief
  until: session done
  gate: auto
```
