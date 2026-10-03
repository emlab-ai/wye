---
node: skill:ea.daily-brief
type: skill
title: Write the director's daily brief
status: active
owner: unassigned
role: librarian
takes: module
writes: [document]
part-of: module:ea-assistant
---

# Write the director's daily brief

It is the start of the director's day. Give them everything open for them, with what needs them today on top
(req:ea.daily-brief).

## 1. Build the brief

```
wye ea brief daily --write
```

This writes today's page under Briefs (one per day; running it again replaces it). It is computed from the graph, not
written by you, so it is complete: late and due-today commitments first, then every other open commitment by project
(decision:ea.daily-brief-lists-all-open), the decisions waiting on the director, what they owe a reply or a follow-up
in their other products (decision:ea.follow-is-owner-or-tag), and the projects that changed since yesterday. Only
approved commitments are in it; pushed ones wait in the Inbox (decision:ea.proposed-commitments-wait-in-inbox).

## 2. Read it and add what only judgment gives

Read the page (`wye doc <product>/<project>/brief-<date>`, the page the command printed). Under its first line, add at most three lines headed **First** —
the things to do first today and why, each linking to the line it is about. Look for: a late commitment on a project
already at risk, a decision others are blocked on, the same person owing several late things, a date that slipped
twice. Do not repeat the list, do not remove lines, do not change the order.

## 3. Point at the Inbox

If the Inbox holds pushed items waiting for approval (`wye inbox list`), end **First** with one line
saying how many and that their dates are not in the brief until approved.

You write only into the assistant's product; never into the director's other products
(constraint:ea.reads-other-products-only).
