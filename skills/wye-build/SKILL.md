---
name: wye-build
description: Build an approved plan page from the Wye vault — /wye-build <link or plan:<slug>>. Fetches the build-plan skill from the app and follows it: joins as a session, continues from the plan's Progress and task statuses (restartable at any time), one task at a time with its status, commit and log, the Progress per phase written back after every task, decisions and questions proposed as they come. Use when a plan made with /wye-plan is approved and the person says to build it, or to continue an interrupted build.
---

# /wye-build <link or plan:<slug>>

The instruction lives in Wye, where the person can read and edit it — not here. From the folder with the vault:

```bash
wye skill skill:build-plan       # the vault's copy of the skill, else the shipped one
```

Read what it prints and follow it exactly, with the link or id given to this command as the plan. If `wye` cannot
reach the app (`fetch failed`), say so and stop: the app must be running (`wye app`).
