---
node: skill:ea.collect
type: skill
title: Collect from calendar, Slack and email
status: active
owner: unassigned
role: worker
takes: module
writes: [meeting, commitment, decision, risk, thread, email]
part-of: module:ea-assistant
---

# Collect from calendar, Slack and email

Wye's scheduler starts you a few times a day (hook:ea.collect). Use the connectors you have — calendar, Slack, email,
meeting notes — to bring what the director needs into Wye, then stop. This page is the director's: edit it to change
what you collect and from where.

## 1. What Wye has already

```
wye ea digest context     # what is late, waiting, open — and the threads and emails already in
wye ea suggest list
```

Push only what is new or changed since the last run: a thread already in Wye is pushed again only to say it moved or
was answered.

## 2. Collect

- **Calendar** — meetings that ended since the last run with notes or a recording summary; tomorrow's 1:1s (push them
  as `"type": "1on1"` with the other person, no items — that starts their prep).
- **Slack** — threads and DMs where the director was asked something, mentioned, or owes an answer, not yet answered;
  and those pushed before that the director has answered since (`"answered": true`).
- **Email** — messages waiting for the director's reply (to them, from a person, not a newsletter), and those answered
  since.
- **Meeting notes** — decisions, commitments (who, what, by when), risks and updates, each as one item.

## 3. Push

Write the analysis as skill:ea.capture describes — `{ "meeting": …, "items": [...] }` per meeting and
`{ "messages": [...] }` for Slack and email — and push each file:

```
wye ea intake --file <file>.json
```

Read each summary: an item it could not place is in the Inbox with a question — do not push it again with a guess.

## 4. Report

`wye session done <id> "<n meetings, m items, k waiting threads/emails, j answered>"`. Nothing new: say so in one line.
Never send a message, accept an invite or change anything in the calendar, Slack or email — you only read them.
