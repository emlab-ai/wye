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
part-of: {{parent}}
---

# {{title}}

## Request

{{request}}

{{from}}

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

## Tasks

_`- [ ] task:` lines, `part of plan:{{slug}}`; their check state is what is in progress._

## Result

_Written by the app when the session ends: the summary and the blocks this plan produced._
