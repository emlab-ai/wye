---
node: map:memory-map
type: map
title: How Wye remembers
status: proposed
owner: alex
last-verified: 2026-10-04
order: 61
part-of: module:decisions
---

# How Wye remembers

The decisions behind Wye's memory: a verdict on every write, the constraints in force computed for each request, what a
session decided consolidated when it ends, a person approving, and a benchmark for each claim. Every card is a node
defined in its own document; the links are the graph's.

## Layout

```text
decision:memory.model-calls-via-cli 0,0 ref
decision:memory.consistent-verdicts-in-the-log 0,143 ref
decision:memory.write-time-verdict 400,72 ref
rule:inbox-review 800,-66 ref
constraint:wf2.person-approves 800,72 ref
decision:memory.public-benchmarks 400,286 ref
decision:memory.evaluation 400,462 ref
decision:memory.constraint-packet 800,286 ref
rule:agent-contract 1200,286 ref
decision:memory.consolidate-sessions 800,462 ref
decision:memory.instructions-compiled 1200,462 ref
decision:memory.benchmark 0,462 ref
```
