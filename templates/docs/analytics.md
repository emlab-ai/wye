---
node: analytics:{{slug}}
type: analytics
title: {{title}}
status: proposed
owner: unassigned
last-verified: {{date}}
query: kind=task y=worker x=status
part-of: {{parent}}
---

# {{title}}

What this page shows is the `query:` line above — the kinds it draws, the filters, and what the rows (`y=`) and the
columns (`x=`) group by. Each is a stack of dimensions, outer first: a property, `kind`, `status`, a path of links
like `worker.part-of` (the team of the worker), or a date with a bucket — `due:month`, `when:week`; `when:span` is a
continuous track, the timeline. Every cell is the cards at that intersection. The strip at the top of the page edits
the line; `x=status` is a kanban, `y=worker.part-of,worker x=when:span` a timeline, `y=worker x=when:month` a planner.
