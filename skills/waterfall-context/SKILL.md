---
name: waterfall-context
description: The read/write contract between a coding agent and the product context graph (docs/context-graph). Use BEFORE implementing or changing any feature in a repo that has a context graph — query the graph with wye instead of exploring the codebase, describe the change as a delta before coding, and run wye check before claiming done. Also use when asked "what does the system say about X", "what depends on Y", or "is Z already a requirement".
---

# Working with the context graph

The graph in `data/products/<product>/projects/*/docs/*.md` is the product's single source of truth for **what the system does and why**.
Treat it as external memory: read from it before you read code, write to it before you write code.
`wye` is the CLI (`~/Projects/waterfall/bin/wye.js`, on PATH after `install.sh`). Never `cat` the graph files; query.

## Read contract — before touching code

```bash
wye build                                   # cheap; do it once per session so graph.json is current
wye graph packet --task "<the task in one sentence>" --budget 6000   # your working memory for the task
wye get <id>                                # one node, all edges
ctx neighbors <id> -d 2 --structural        # what it is made of / what it hangs off
wye graph impact <id>                             # everything that depends on it — read BEFORE changing an entity, field, rule or op
wye search <terms>                          # find ids from words
wye reqs [--status proposed|question|unverified]   # the requirement tree
```

The packet is what you reason from. It lists the requirements, rules, ops, pages and tests around the task and the
code files they cite. Open those files, not the module at large. If the packet is empty or thin, the graph does not
cover this area yet: stop and say so (offer `waterfall-describe-module`), do not silently fall back to exploring.

Every node id you rely on goes into your plan and your PR description (`req:inv.sale.shortfall.oversell`,
`rule:fifo-oldest-first`). That is how the reviewer checks you built the right thing.

## Write contract — describe, then build

1. **New behaviour ⇒ new or refined `req:` first.** Add it to the module `.md` (or a delta folder, see
   `~/Projects/waterfall/templates/delta.yaml`) with `status: proposed`, when/then/unless, and the `satisfied-by`
   nodes you intend to create. Add the ops/rules/actions it needs as nodes with `status: proposed`.
2. **Changing existing behaviour ⇒ `wye graph impact` first**, then edit the affected nodes' bodies. If your change
   contradicts a rule, do not delete the rule: add a drift row and resolve it explicitly in the PR.
3. **`wye check` must pass** (0 errors) before the delta is reviewed and again before the code PR is done.
   `wye check --strict` additionally fails shipped reqs without tests and unresolvable source paths.
4. **When the code lands**, flip the nodes to `shipped`, replace intended sources with real `file:line` (or
   `file#Symbol`), and replace `requires-tests` with `verified-by` naming the tests you wrote.
5. **Never edit generated things**: `field:` nodes and `_build/` are produced by `wye build`.

## What goes where

| this | goes in |
|---|---|
| a behaviour users can observe | `req:` |
| a constraint the code enforces | `rule:` with source |
| a setting that flips behaviour | `flag:` |
| a decision with alternatives | `decision:` (ADR form) |
| something the code leaves undefined | `question:` in §11 |
| two nodes disagreeing | a row in the drift table |
| agent workflow habits ("run focused tests first") | NOT here — that is agent memory / CLAUDE.md |

## Done means

- packet read, node ids cited in the plan
- delta or node edits merged with `status: approved` before implementation started
- `wye check` green; touched reqs `shipped` with real `verified-by`
- PR description lists the node ids and any drift rows resolved
