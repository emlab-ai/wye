---
node: workflow:ea.daily-summary
type: workflow
title: Daily summary
status: active
owner: unassigned
takes: module
part-of: module:ea-assistant
---

# Daily summary

Each weekday morning hook:ea.daily-summary runs this on the [Digest](module:ea-digest); run it by hand any time with
`wye workflow run workflow:ea.daily-summary --on module:ea-digest --again`. One stage: an agent reads what changed since
the last summary with skill:ea.daily-summary and writes today's entry into the Digest's Daily summary. It moves on by
itself — nothing waits for you.

## Stages

```yaml
- id: stage:ea.daily-summary.write
  title: Write today's summary
  part-of: workflow:ea.daily-summary
  do: task "Daily summary" --worker agent --skill skill:ea.daily-summary
  until: session done
  gate: auto
```
