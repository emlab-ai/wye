---
node: skill:ea.capture
type: skill
title: Capture a meeting into the assistant
status: active
owner: unassigned
role: librarian
takes: meeting
writes: [meeting, decision, commitment, risk, person, question]
part-of: module:ea-assistant
---

# Capture a meeting into the assistant

You are an outside agent (Cowork or similar) that has read a meeting — its recording, transcript, notes or the thread
around it — for an engineering director. Your job is to hand Wye what was said, so it lands under the projects and
people it is about (req:ea.meeting-lands-in-place). You do not decide anything for the director: everything you push is
proposed until they approve it (constraint:ea.pushed-is-proposed).

## 1. Read what Wye already knows

Before you write, learn the names Wye uses, so your items match:

```
wye ask-search "<project or person name>" --product ea --json
wye context "<what the meeting was about>" --product ea
```

Use a project's or person's name as Wye has it. If you are not sure which project an item is about, leave `project`
out rather than guess: Wye will ask the director.

## 2. Take the meeting apart

One item per thing said, each one thing:

- **decision** — a choice that was made: who made it (owner) and the project.
- **commitment** — someone said they will do something by a date: `owner`, `due` (YYYY-MM-DD; turn "by Friday" into
  the date), the project, and `people` it is owed to. No date said → no commitment; make it an update instead.
- **risk** — something that could make a project miss: the project, an owner if one was named.
- **update** — news about a project: progress, a blocker, a change of plan.

Drop small talk and what is already known. Keep the speakers' words where they matter.

## 3. Push it

Write one JSON file and call the intake once per meeting:

```json
{
  "meeting": { "title": "Platform sync", "date": "2026-10-03", "attendees": ["Dana", "Lee"], "source": "cowork",
               "type": "1on1 (only for a 1:1)", "projects": ["Billing migration"] },
  "items": [
    { "kind": "commitment", "text": "Lee ships the billing cutover plan", "owner": "Lee", "due": "2026-10-10",
      "project": "Billing migration", "people": ["Dana"] },
    { "kind": "decision", "text": "We freeze the old billing API on 1 Nov", "owner": "Dana", "project": "Billing migration" },
    { "kind": "risk", "text": "The vendor's sandbox is down most days", "project": "Billing migration" },
    { "kind": "update", "text": "Cutover rehearsal passed on staging", "project": "Billing migration" }
  ]
}
```

```
wye ea intake --product ea --file analysis.json
```

The intake files each item under its project and people, linked to the meeting, as a proposed block. Pushing the same
meeting twice creates nothing new. Read its summary: an item it could not place is in the director's Inbox with a
question — do not push it again with a guessed project.

## 3b. Push what waits for a reply — Slack and email

Push the Slack threads and the emails that wait on the director as `messages` — on their own, or in the same file as
a meeting. Push only what needs them: a question to them, a request, a thread they were asked into and have not
answered. Push the same thread again (same `id`) when it moves, and with `"answered": true` once they replied — it
leaves the Digest.

```json
{ "messages": [
  { "via": "slack", "id": "<channel id>/<thread ts>", "title": "Can we ship the speed-limit fix this week?",
    "channel": "#safety", "from": "Jane Roe", "link": "https://…/archives/…", "at": "2026-10-04T09:12:00Z",
    "waiting": "reply", "project": "Atlas" },
  { "via": "email", "id": "<message-id>", "title": "Q4 budget approval", "from": "Kim Lee",
    "link": "https://mail…/…", "at": "2026-10-03", "waiting": "reply" }
] }
```

`via` slack or email; `waiting` reply (they owe an answer) or look (they should read it); `from` and `project` are
names, matched to the people and projects Wye knows.

## 4. Upcoming 1:1s

When you see a 1:1 on the director's calendar for the next day, push it as a meeting with `"type": "1on1"`, its date
and the other person as attendee, and no items. That starts the 1:1 prep (hook:ea.one-on-one-prep).
