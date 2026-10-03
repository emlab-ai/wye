---
node: workflow:ea.capture
type: workflow
title: Meeting capture
status: active
owner: unassigned
takes: meeting
part-of: module:ea-assistant
---

# Meeting capture

The filing happens outside: your agent reads the meeting and pushes it with skill:ea.capture (`wye ea intake`). This
workflow is the part that is yours — run it on a pushed meeting to go through what was filed: approve the commitments,
decisions and risks that are right (only approved commitments enter the briefs), fix an owner or a date, answer the
questions on items it could not place, and advance.

## Stages

```yaml
- id: stage:ea.capture.review
  title: Approve what was filed
  part-of: workflow:ea.capture
  until: manual
  gate: person
```
