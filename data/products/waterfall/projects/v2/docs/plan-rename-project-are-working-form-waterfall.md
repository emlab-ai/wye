---
node: plan:plan-rename-project-are-working-form-waterfall
type: plan
title: rename project we are working on form waterfall to wye and push changes to remove repo…
status: proposed
owner: unassigned
last-verified: 2026-09-19
session: f92e5b9b59
agent: claude-code
started: 2026-09-19T10:26:15.252Z
part-of: module:v2-plans
---

# rename project we are working on form waterfall to wye and push changes to remove repo…

## Request

> rename project we are working on form waterfall to wye and push changes to remove repo https://github.com/emlab-ai/wye

## Context

The repo has no git remote; https://github.com/emlab-ai/wye exists, is empty and **public**. The name lives in three
layers: the code (`package.json` names `waterfall`, `@waterfall/web`, `@waterfall/desktop`; brand strings "Waterfall" in
the app shell, slash menu, desktop window, README, prompts/agent-system.md, the skills), the CLIs (`wf`, `ctx`, `WF_URL`,
`WF_PRODUCT` — names that do not spell the product), and the knowledge itself (product:waterfall, the folder
`data/products/waterfall`, every URL `/waterfall/…`, node ids `req:wf2.*`). Related: decision:wf2.product-model,
req:wf.self, rule:agent-contract.

## Plan

```yaml
- id: decision:waterfall.rename-scope
  title: Rename to Wye in code and brand; keep the CLIs and the product slug
  context: >
    "Rename the project to wye" can reach the package names and the brand, the CLI names, or the knowledge folder and
    every node id and URL. The last breaks the running app, this session and every link ever written.
  choice: >
    Rename the package names (wye, @wye/web, @wye/desktop), every user-facing "Waterfall" (app title, rail, slash menu
    groups, desktop window and tray, README, the agent contract, the skills' text) and the git remote. Keep `wf`, `ctx`,
    WF_URL, WF_PRODUCT as they are, keep product:waterfall and data/products/waterfall until question:waterfall.rename-slug
    is answered.
  alternatives: >
    Rename everything at once, including the product slug and the folder — rejected for now: it rewrites node ids and
    URLs and breaks the live session. Rename only the git remote — rejected: the request says rename the project.
  consequences: >
    The app calls itself Wye; the repo pushes to emlab-ai/wye; the knowledge keeps its ids. A second pass can move the
    slug and folder when approved.
  date: 2026-09-19
  status: proposed
  affects: product:waterfall
  part-of: plan:plan-rename-project-are-working-form-waterfall
```

question:waterfall.rename-slug Should the product slug and folder move too — `data/products/waterfall` → `data/products/wye`, `product:waterfall` → `product:wye`, URLs `/waterfall/…` → `/wye/…`, and the `waterfall-*` skill names? It rewrites every link and node reference and the installed skills; the running app and this session live on the old slug. part of plan:plan-rename-project-are-working-form-waterfall #open

question:waterfall.public-repo-data The target repo is public and the repo tracks `data/products/yessensei` (YesSensei's PRD, tech design, source docs — 30 files) next to Waterfall's own knowledge. Push it as is, drop yessensei from the repo first, or make the repo private? Once pushed it is public history. part of plan:plan-rename-project-are-working-form-waterfall #open

## Tasks

- [ ] task:waterfall.rename-code Rename the package names and every user-facing "Waterfall" to Wye in the code, README, prompts and skills; tests green. part of plan:plan-rename-project-are-working-form-waterfall
- [ ] task:waterfall.rename-remote Add origin https://github.com/emlab-ai/wye and push main (after question:waterfall.public-repo-data). part of plan:plan-rename-project-are-working-form-waterfall
- [ ] task:waterfall.rename-slug Move the product slug, folder, URLs and skill names to wye once question:waterfall.rename-slug is answered. part of plan:plan-rename-project-are-working-form-waterfall
- [ ] task:waterfall.rename-folder Rename the checkout ~/Projects/waterfall → ~/Projects/wye and re-run install.sh (skill links, ctx path); the app's cwd and the memory folder follow the path. part of plan:plan-rename-project-are-working-form-waterfall

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
