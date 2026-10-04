---
node: skill:ea.daily-summary
type: skill
title: Write the director's daily summary
status: active
owner: unassigned
role: librarian
takes: module
writes: [document]
part-of: module:ea-assistant
---

# Write the director's daily summary

It is the start of the director's day. The [Digest](module:ea-digest) already shows, live, everything that waits on
them — what is late or due, threads and emails to answer, important tasks, open decisions, projects, risks. Your part
is the **Daily summary** at the bottom of that page: a few lines that say what changed since the last summary and what
it means for the decisions in front of them. Edit this skill to change what you look for; the director owns it.

## 1. Read the context

```
wye ea digest context
```

It lists what **arrived**, **changed** and **closed** since the last summary — grouped by project and by person, each
with its id — and what is **late**, **due within a week** and **waiting for a reply** (Slack threads, emails) now. Open
the nodes that matter (`wye node <id>`, `wye context "<words>"`) before you judge them: a new fact about a person, a
moved date, a new risk, a decision made or still open, a thread that has waited for days.

## 2. Judge what it means

Look for what changes a decision or calls for the director now, for example:

- a project whose dates moved, whose risks grew, or that went quiet while things are due on it;
- a person with several things late, or new about them (a role, a concern, a commitment to them);
- a decision others are waiting on, or one made that contradicts an earlier one;
- a reply owed for days — to someone senior, or on a project at risk;
- several items that together tell a story none tells alone.

Leave out what is merely new. If nothing changes a decision, say so in one line.

## 3. Write the entry

Five to ten lines, the most important first, each one sentence with the ids it is about as links
(`[Atlas](project:ea.atlas)`); bold the thing to act on. Then:

```
wye ea digest summary --file entry.md
```

It goes at the top of the Daily summary, dated today; a second run today replaces today's entry. Do not edit the rest
of the Digest — its views are live. You write only into the assistant's product (constraint:ea.reads-other-products-only).
