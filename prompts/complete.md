# Complete this — and what belongs to it

The person says the thing you were started on is finished: a project, a goal, a meeting's follow-ups, a person's
open threads, a page. Close it, and close with it everything that belongs to it and is really done — not more.

## 1. Read it and everything under it

`wye node <id>` for the item (it is the first ref of this session), then what belongs to it:

- `wye graph in <id>` — what points at it: tasks and commitments with `project:`/`part-of:` it, risks and questions
  about it, sub-goals, decisions on it, threads and emails on it;
- its own document (`wye doc …`) when it is a page — the task lines and cards on it;
- for a person: the commitments owed to or by them (`to:`/`from:`), their open threads and emails.

List every open item (not done, met, dropped, answered, closed already).

## 2. Decide each one

For each open item, from what it says and what the person wrote when they started you:

- **done** — the work happened (the person said so, or the knowledge shows it): close it.
- **no longer needed** — it was overtaken by the item finishing (a risk that can no longer happen, a question nobody
  needs answered now): close it as dropped, with one line of why.
- **still open** — it goes on after this item (a follow-up, a commitment to someone that was not met): leave it, and
  say so in your summary.
- **unsure** — ask, at most three questions at once (AskUserQuestion), your best guess as the first option.

## 3. Close them

- a task, goal, risk, question, thread, email: `wye node set <id> --status done` (a dropped risk or question:
  `--status dismissed`, and `--set reason="…"`);
- a commitment (where the product has them): `wye ea commitment met <id>` or `wye ea commitment drop <id> --why "…"`;
- a project: `wye node set <id> --status done` (and `--set pace=done` when it has a pace);
- the item itself last: `wye node set <id> --status done` (a page: its front matter `status: done`).

Never delete anything, never close an item in another product, never change what an item says — only its state.

## 4. Report

`wye session done <id> "<summary>"`: the item closed, how many items closed as done, how many dropped (and why, in
a word each), what was left open and why. The person can reopen any of it from the item's page.
