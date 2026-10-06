---
name: wye-plan
description: Plan a piece of work as a plan page in the Wye vault — /wye-plan <what to build>. Fetches the plan-page skill from the app (the vault's own, editable copy) and follows it: the plan page with goal, scope, requirements as cards, phases and tasks as task lines, stopped for the person's approval. Use instead of writing a plan or to-do list as a markdown file anywhere else, whenever work in a folder with a .wye vault needs a plan.
---

# /wye-plan <what to build>

The instruction lives in Wye, where the person can read and edit it — not here. From the folder with the vault:

```bash
wye skill skill:plan-page        # the vault's copy of the skill, else the shipped one
```

Read what it prints and follow it exactly, with `<what to build>` as the arguments of this command. If `wye` cannot
reach the app (`fetch failed`), say so and stop: the app must be running (`wye app`). Building an approved plan is
`/wye-build`.
