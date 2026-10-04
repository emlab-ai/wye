---
node: module:ea-assistant
type: module
title: Executive assistant
status: active
owner: unassigned
---

# Executive assistant

A director's assistant, built from documents you can edit: what you follow (people, projects, commitments, decisions, risks, meetings) is filed here from what your outside tools push, and comes back to you in four rhythms.

| rhythm | when | what you get |
|---|---|---|
| Capture | an outside tool pushes a meeting analysis | its decisions, commitments, risks and updates filed under their project and people, proposed, linked to the meeting |
| Digest | always — a live page, pinned at the top ([Digest](module:ea-digest)) | what is late or due, Slack threads and emails waiting for your reply, important tasks, open decisions, projects, risks — each a live view you can edit |
| Daily summary | weekday mornings (hook:ea.daily-summary) | at the bottom of the Digest: what arrived, changed or closed since yesterday and what it means for your decisions, written by skill:ea.daily-summary (edit it to change what it looks for) |
| Weekly review | Friday afternoon (hook:ea.weekly-review) | each project's pace: done against planned, moved dates and why, blockers, risks, gone-quiet projects first |
| 1:1 prep | a 1:1 is pushed in (hook:ea.one-on-one-prep), or by hand | open threads with the person, what each owes the other, notes from your last 1:1s, their projects |

## How it is fed

Wye pulls nothing (decision:ea.tools-push-through-cli). Cowork, or any agent that reads your calendar, Slack, email and meeting recordings, is handed skill:ea.capture and pushes what it learns through one command — meetings, and the Slack threads and emails waiting on you (`messages`, decision:ea.messages-pushed):

```
wye ea intake --product ea --file analysis.json
```

What it pushes is **proposed** until you approve it (constraint:ea.pushed-is-proposed): a pushed commitment waits in the Inbox and enters the briefs once approved (decision:ea.proposed-commitments-wait-in-inbox). Anything it cannot place for sure — a project it cannot tell, two people with the same name — waits in the Inbox with a question, not filed under a guess.

## What you follow elsewhere

The briefs also read your other products in Wye, never writing into them (constraint:ea.reads-other-products-only): every open task, question, risk or waiting decision you own there, or that you tagged `@follow` (decision:ea.follow-is-owner-or-tag), shows under "You owe a reply or a follow-up".

## Commitments

```shell
wye ea commitment move commitment:ea.<slug> --to 2026-10-20 --why "vendor slipped"
wye ea commitment met  commitment:ea.<slug>
wye ea commitment drop commitment:ea.<slug> --why "no longer needed"
```

A move keeps the old date, the new one, when and why; the weekly review counts how often each project's dates slip.

## By hand

```shell
wye ea brief daily --product ea --write
wye ea brief weekly --product ea --write
wye ea brief 1on1 --person person:ea.<slug> --product ea --write
```

Briefs are pages under [Briefs](module:ea-briefs) — one per day, per week, per 1:1. The daily brief no longer runs
on its own: the Digest shows the same, live, and the daily summary says what changed. Run it by hand when you want the
full list on one page.

```shell
wye ea digest context                       # what the daily summary reads
wye ea digest summary --file entry.md       # an entry written at the top of the Digest's Daily summary
```
