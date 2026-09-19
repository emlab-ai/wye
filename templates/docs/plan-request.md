---
node: plan:{{slug}}
type: plan
title: {{title}}
status: proposed
owner: unassigned
last-verified: {{date}}
session: {{session}}
agent: {{agent}}
started: {{started}}
task: {{task}}
role: {{role}}
part-of: {{parent}}
---

# {{title}}

## Request

{{request}}

{{from}}

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here; the plan is defined when every one is agreed._

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

## Tasks

_`- [ ] task:` lines, `part of plan:{{slug}}`; their check state is what is in progress._

{{requesttask}}

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
