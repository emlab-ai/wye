---
node: {{node}}
type: run
title: {{title}}
status: {{status}}
workflow: {{workflow}}
runs-on: {{on}}
stage: {{stage}}
auto: 0
started: {{date}}
part-of: {{parent}}
---

# {{title}}

## Asked

{{asked}}

## Stages

_Written by the engine: every stage of the workflow in order, where this run is, and what each one produced._

## Blocking

_Written by the engine: the current stage's exit criterion, row by row, with the ids that hold each one back. Empty when the stage is ready and only your Advance is missing._

## Log

_What happened, newest last: entered, ready, advanced, reopened, skipped, blocked — and by whom._

## Result

_Written when the run ends: what it produced._
