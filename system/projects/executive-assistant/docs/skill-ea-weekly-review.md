---
node: skill:ea.weekly-review
type: skill
title: Write the weekly execution review
status: active
owner: unassigned
role: librarian
takes: module
writes: [document, question]
part-of: module:ea-assistant
---

# Write the weekly execution review

The week is ending. Show the director every project's pace (req:ea.weekly-pace).

## 1. Build the review

```
wye ea brief weekly --write
```

Per project, the projects that need the director first: done against planned this week, the dates that moved and why,
blockers and open risks, whether it is speeding up, holding or slowing down, and how often its dates slipped. A project
with no news all week is flagged **gone quiet**, never shown as on track.

## 2. Add the read-out

Under the first line, add a short **This week** paragraph: which projects need the director and what you would ask
each owner. For a project that has gone quiet, name its owner and suggest asking them for an update.

Where a project's pace prop no longer matches what the week shows (marked holding but three dates moved), do not change
it: write an open `question:` under the project card asking the director whether its pace changed.

Write only into the assistant's product (constraint:ea.reads-other-products-only).
