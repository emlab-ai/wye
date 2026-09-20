---
node: pr:{{num}}
type: pr
title: {{title}}
status: draft
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

_What the request touches — modules, documents, nodes and code — as tags and embeds; what was understood, in prose._

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here. The request is ready when every one is agreed._

## Impact

_What the change reaches — computed from the Definition — and the other PRs it overlaps._

## Tasks

_`- [ ] task:` lines, `part of pr:{{num}}`; their check state is what is in progress._

{{requesttask}}

## Result

_Written by the app when the build ends: the summary and the blocks this request produced._
