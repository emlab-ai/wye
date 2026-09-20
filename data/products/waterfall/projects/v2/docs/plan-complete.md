---
node: plan:plan-complete
type: plan
title: complete this
status: proposed
owner: unassigned
last-verified: 2026-09-20
session: baa6dff786
agent: claude-code
started: 2026-09-20T11:51:45.898Z
part-of: module:v2-plans
---

# complete this

## Request

> complete this

_from: plan:plan-work-req-document-opened-document-opened_

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

The request is the plan plan:plan-work-req-document-opened-document-opened, defined by session a148426dd0: req:document-opened-in-the with decision:wf2.deleted-outside-stays-put and decision:wf2.deleted-outside-drops-edits, and one task to build, task:document-not-found-state. The code it touches: the document page (page:web/node), component:live-document, component:top-bar (the page tabs), the doc write (op:api.docs.read-write) and rule:live-refresh. Before the change the page called Next's notFound(): the default 404 replaced the whole layout — rail, top bar, LiveRefresh — and nothing came back when the file returned (seen in the browser, 2026-09-20).

![[req:document-opened-in-the]]

![[task:document-not-found-state]]

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here; the plan is defined when every one is agreed._

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

![[decision:wf2.not-found-rendered-not-thrown]]

![[rule:doc-gone-in-place]]

![[rule:doc-write-gone]]

![[ui-test:document-not-found]]

![[lesson:wf2.prose-props-id-list]]

## Tasks

_`- [ ] task:` lines, `part of plan:plan-complete`; their check state is what is in progress._

- [ ] task:plan-complete complete this #in-progress (worker: claude-code, session: baa6dff786, produced: module:wf2-test module:app-documents module:components module:benchmarks module:eval-results module:app-agents plan:plan-build plan:plan-work-req-document-opened-document-opened plan:plan-work-task-app-keep-step-regenerate module:req-documents module:v2-work module:req-graph module:app-graph module:api)
  - [x] task:wf2.doc-not-found-page The document page renders component:doc-not-found in place of the content when the file is gone; the top bar keeps a gone document's tab title; the editor drops its pending save on unmount; op:api.docs.read-write refuses a write to a missing file with 404 part of plan:plan-complete
  - [x] task:wf2.doc-not-found-test Browser scenario ui-test:document-not-found run on a scratch copy (delete the file with a typed edit pending, restore it) part of plan:plan-complete
  - [x] task:wf2.prose-props-id-list-fix Trailing-props splitters in lib/parse.js and packages/web/src/lib/props.ts keep commas inside [] (tests in test/prose.js and props.test.ts) part of plan:plan-complete

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
