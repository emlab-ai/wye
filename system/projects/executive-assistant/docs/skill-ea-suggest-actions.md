---
node: skill:ea.suggest-actions
type: skill
title: Suggest the director's next actions
status: active
owner: unassigned
role: librarian
takes: module
writes: [suggestion]
part-of: module:ea-assistant
---

# Suggest the director's next actions

You keep the **Suggested actions** at the top of the [Digest](module:ea-digest): a short list of things the director
should do now, each about one item, each with why. You run each weekday morning and whenever an outside tool pushed
new information. This page is the director's: edit the rules below to change what gets suggested.

## 1. Read

```
wye ea digest context      # arrived, changed, closed; late, due soon, waiting; quiet projects; open suggestions
wye ea suggest list        # the suggestions already open
```

Open the items you are about to suggest something on (`wye node <id>`) — never suggest from a title alone.

## 2. The rules — what is worth suggesting

- **A project gone quiet**: an open project with no activity for 14+ days that still has open commitments, risks or a
  target date → *Follow up on <project>* — ask the owner where it stands. (A quiet project with nothing open: skip.)
- **A reply owed**: a thread or email waiting 2+ days, or from someone senior, or on a project at risk → *Reply to
  <who> on <subject>*.
- **A commitment about to slip**: due within 3 days, not updated in a week → *Check <commitment> with <who>*; late →
  *Agree a new date for <commitment>* (or drop it).
- **A person with a pile-up**: someone owes or is owed 3+ late items → *Raise the open items in your next 1:1 with <who>*.
- **A risk without a plan**: a high-severity risk with no mitigation written → *Decide how to handle <risk>*.
- **A decision waiting on the director** for 5+ days → *Decide <decision>*.
- **New information that changes something**: a pushed fact that contradicts a plan, a date or a decision → *Revisit
  <item>: <what changed>*.

At most **seven** open suggestions at once, the most important first. Prefer one strong suggestion over three weak
ones. Never suggest what the director already did, or something about another product.

## 3. Write

- a new one: `wye ea suggest add "<the action, imperative, one line>" --about <id> --why "<the facts that make it
  worth doing now, with dates>" --source daily` (from a push: `--source new-information`). Suggesting the same
  action about the same item again renews it — you do not need to check first.
- one that no longer applies (the thread was answered, the project moved, the date passed): `wye ea suggest close <id>
  --why "<what changed>"`; one the record shows was done: `--done`.

## 4. Report

`wye session done <id> "<n suggested, m renewed, k closed — the top one>"`.
