---
name: waterfall-describe-module
description: Build the product context graph for one module — requirements, entities, state machines, ops, pages/actions, rules with sources, gates, tests, drift — as data/products/<product>/projects/<project>/docs/<module>.md, then build/check it with ctx and publish the phone viewer. Use when asked to "describe module X", "graph the Y feature", "add Z to the context graph", or to repeat the inventory pilot for another area.
---

# Describe a module as a context graph

You are producing `data/products/<product>/projects/<project>/docs/<module>.md`: a code-free, graph-shaped description of one module that a
script can parse (`ctx build`) and lint (`ctx check`). The inventory pilot (`data/products/waterfall/projects/v2/docs/inventory.md`) is the
reference example. The schema is `~/Projects/waterfall/schema/kinds.yaml`; the skeleton is `~/Projects/waterfall/templates/module.md`.

Rules that are not negotiable:
- **Requirements first.** Every behaviour is a `req:` node in when/then/unless form. Everything else exists to satisfy one.
- **Every rule cites a source** (`file:line` or `file#Symbol`). No source ⇒ it is a wish, and `ctx check` fails.
- **Status reflects evidence.** `shipped` only with a test you actually found. Otherwise `unverified`, `api-only`, `proposed` or `question`.
- **The drift table is mandatory.** You compared PRD vs server vs client vs tests; write down every disagreement.
- **Never invent behaviour.** If the code is silent, write a `question`, not a guess.

## Process

1. **Locate the module.** `find` dirs matching the module name in server, client, tests, docs, docs-site knowledge base, `docs/plans/*`. Note the Feature enum member and permission policies.
2. **Fan out two Explore agents in parallel**, using the prompts in `references/explore-server.md` and `references/explore-client.md` with the module name substituted. Ask for structured output with file:line citations. Do not explore the same files yourself while they run.
3. **Read the human documents yourself** while they run: existing PRD, plan folders, knowledge-base pages. These give you the requirement wording and the intended behaviour to compare against.
4. **Spot-check before you write.** Pick 3–5 surprising claims from the agents (a hardcoded number, a missing gate, a contradiction) and grep them. Only cite what you verified or what an agent cited with file:line.
5. **Write the file** from the template, in this order: frontmatter (with `source-roots`), module node, **R. Requirements** (grouped by capability, dotted ids, refines edges), entities (fields blocks — the parser turns each field into a node), values/enums table, state machines, ops tables, pages with inline actions, rules, cross-module edges, gates, verification index, drift table, open questions.
6. **Build and lint:**
   ```bash
   ctx build && ctx check
   ```
   Fix every ERROR (rules without source, reqs without satisfied-by, referenced-but-undefined rule/req ids). Read the warnings: stubs for ops/actions you named but never described mean the doc is incomplete; decide whether to describe them or drop the reference.
7. **Publish the viewer:** `ctx site --out <dir>` then call the Artifact tool with `file_path=<dir>/index.html` and `files={"data.js": "<dir>/data.js"}`. The Artifact tool only reads files under the current working directory or the session scratchpad, so when the graph lives in another repo build into the scratchpad (`ctx site --out $SCRATCHPAD/<module>-site`). Favicon 🧭 on first publish; reuse the artifact URL on republish.
8. **Report** in the final message: counts by kind, requirement status breakdown, the drift rows that look like product bugs (not just doc rot), and the untested surfaces. Give the file path and the artifact link.

## Writing requirements well

- Title in the user's words ("Selling more than we have is an error"), not the mechanism's.
- `when` is one trigger. If there are two, write two reqs or use `when-2`/`then-2` and say so.
- `unless` carries the flag or role exception, and the flag becomes a `flag:` node.
- `satisfied-by` points at rules/ops/actions/pages that deliver it. `verified-by` points at tests you found (class#method).
- Hazards go in `note:` ("the silent skip is a money hazard").
- A req for something that exists only server-side is `api-only`. A req you wanted but could not find is `proposed`.

## Sizing

A module the size of inventory (10 submodules, ~20k server LOC) produced ~60 reqs, ~55 rules, ~45 ops, ~14 pages, 17 drift rows and 1,850 lines. Smaller modules are proportionally smaller; do not pad.
