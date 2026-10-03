---
node: skill:ea.one-on-one
type: skill
title: Prepare a 1:1
status: active
owner: unassigned
role: librarian
takes: meeting, person
writes: [document]
part-of: module:ea-assistant
---

# Prepare a 1:1

A 1:1 is coming up. The director should walk in knowing what is open with that person (req:ea.one-on-one-prep).

## 1. Find the person

You were started on a meeting (a pushed 1:1: its attendee other than the director) or on a person card. Resolve it:
`wye node <id>`.

## 2. Build the prep

```
wye ea brief 1on1 --person person:ea.<slug> --write
```

It lists the open threads with that person, what each owes the other and by when, the notes, decisions and
commitments from their last 1:1s, and how their projects are doing.

## 3. Suggest the agenda

Under the first line, add **Talk about** — three to five points, most important first: a commitment of theirs that is
late or moved twice, something the director owes them, a project of theirs that went quiet or is slowing, an open
question from last time. Link each point to the line it comes from.

Write only into the assistant's product (constraint:ea.reads-other-products-only).
