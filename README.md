# waterfall

Product context graph: describe a system **without code** as requirements, entities, state machines, operations,
pages/actions, rules, gates and tests — in markdown that is also a graph. Query it from the terminal, lint it in CI,
browse it from a phone. Built from the YesSensei inventory pilot (2026-09-12).

```
docs/context-graph/<module>.md     ← the source of truth (one file per module, hand-written by an agent + you)
docs/context-graph/_build/         ← generated: graph.json, data.js, site/ (gitignore or commit, your call)
```

## Install

```bash
cd ~/Projects/waterfall && ./install.sh     # links `ctx` into ~/.local/bin and the two skills into ~/.claude/skills
```

## Commands

| command | what |
|---|---|
| `ctx build [files]` | parse `docs/context-graph/*.md` → `_build/graph.json` + `data.js` |
| `ctx check [--strict] [--repo dir]` | lint: rules without source, reqs without satisfied-by, undefined rule/req ids, missing source paths, drift count. Exit 1 on errors |
| `ctx get <id>` | one node with every edge (`ctx get oversell` resolves suffixes) |
| `ctx neighbors <id> [-d N] [--structural] [--kinds a,b]` | neighbourhood by hops |
| `ctx impact <id>` | everything that depends on a node (reverse structural closure, 3 hops) |
| `ctx search <terms>` | ranked search over ids, titles, bodies |
| `ctx packet --task "…" [--budget N]` | a token-budgeted slice: seeds → 2 hops → files cited. An agent's working memory for a task |
| `ctx reqs [--status s]` | requirement tree with status glyphs (● tested ◐ untested/unverified ○ proposed ? question) |
| `ctx site [--out dir]` | build the viewer (index.html + data.js) ready for the Artifact tool |
| `ctx stats` | counts by kind, verb, requirement status |

## Skills (Claude Code)

- **waterfall-describe-module** — the repeatable process that produced `inventory.md`: fan out server/client explorers, read the human docs, write the file from the template, `ctx build && ctx check`, publish the viewer, report drift.
- **waterfall-context** — the agent contract: query the graph before code (`packet`, `impact`), write a delta before building, `ctx check` before done.

## Layout

```
bin/ctx.js            CLI
lib/parse.js          markdown → graph (nodes, typed edges, generated field nodes + mentions)
lib/graph.js          queries, packet, lint
viewer/index.html     phone-first viewer: Reqs tree · force graph (canvas, d3) · rendered text; node sheet with edges
schema/kinds.yaml     node kinds, verbs, statuses, conventions
templates/module.md   skeleton for a new module file
templates/delta.yaml  how a feature enters the graph before code
skills/               Claude Code skills (symlinked by install.sh)
test/smoke.js         parses the pilot and asserts the graph shape
```

## Design notes

- Markdown is canonical, not a graph DB. It lives in git, is reviewed in PRs, and any DB can be loaded from `graph.json` later.
- Node ids are stable slugs; `req:` ids are dotted paths so hierarchy is in the id. Line numbers in `source:` rot; prefer `file#Symbol` where you can.
- `field:` nodes and `mentions` edges are generated: a field name found in another node's text becomes a link, so "where is `receivedQuantity` used?" is one query. Ambiguous field names (same name on several entities) only link when the mentioning node also references the owning entity.
- Requirement status is honest by construction: `shipped` needs a `verified-by`; `ctx check --strict` enforces it.
- The viewer needs no server: `data.js` carries the graph and the markdown; d3 and marked come from cdnjs.
