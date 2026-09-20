---
node: module:waterfall
type: module
title: Waterfall v0.1 — the self-description (retired)
status: retired
owner: alex
last-verified: 2026-09-14
verified-against: ~/Projects/waterfall (uncommitted, 0.1.0)
source-roots: [., lib, bin, viewer, skills, test, schema, templates, skills/waterfall-context, skills/waterfall-describe-module]
sources:
  - README.md
  - schema/kinds.yaml
  - the design discussion of 2026-09-13 (read/write contract, delta pipeline, status lifecycle, code markers) — recorded here as proposed requirements
  - docs/context-graph/inventory.md in YesSensei/POS — the pilot that shaped every parser rule
part-of: module:archive
order: 92
---

# Waterfall — product context graph (self-description)

Waterfall is developed through its own pipeline. This file is the product's memory: what it does today
(`shipped`, with the test that proves it), what it does without proof (`unverified`), and what it is meant to become
(`proposed`). Node kinds, verbs and statuses are in `schema/kinds.yaml`.

---

## 0. module:waterfall

---

## R. Requirements (behaviour)

### Flags referenced by requirements

### R.1 Describe a module without code

### R.2 Markdown is a graph

### R.3 Agents query, they do not browse

### R.4 The graph is a contract

### R.5 Describe before you build (the control pipeline)

### R.6 Browse from a phone

### R.7 Repeatable by agents

---

## 1. Entities

### entity:module-doc

### entity:node

### entity:edge

### entity:graph

### entity:field

### entity:drift-row

### entity:delta

### entity:packet

---

## 2. Value objects and enums

| id | source | values |
|---|---|---|
| value:node-kind | lib/parse.js:9 | req, rule, entity, value, state, op, page, action, gate, flag, test, ui-test, module, tool, setting→flag, field, drift, question, decision |
| value:edge-verb | lib/parse.js:11-18 | refines, satisfied-by, verified-by, governed-by, gated-by, reads, writes, calls, contradicts, owned-by, owns, embedded-in, set-by, applies-to, governs, see, resolves, has, depends-on, adds, changes, has-action, navigates, typed-as, triggers, edge-to, mentions |
| value:structural-verb | lib/parse.js:18 | the subset of edge-verb that neighbors --structural, impact and packet follow; everything except mentions/see/roles |
| value:req-status | schema/kinds.yaml:41 | shipped, api-only, unverified, proposed, question |
| value:check-severity | lib/graph.js:104-128 | error (exit 1), warning |
| value:viewer-preset | viewer/index.html:282-288 | Requirements, Mechanics, Data, Drift, Everything |
| value:field-stop-list | lib/parse.js:19 | name, notes, status, comment, lines, email, phone, street, city, country, aliases, instructions, code, symbol, quantity, fields, values, computed |

---

## 3. State machines

### state:node-lifecycle

### state:req-verification

---

## 4. Operations (the ctx CLI)

| op | args | does | gate | source |
|---|---|---|---|---|
| op:ctx.build | [files…] [--root dir] | parse module files → _build/graph.json + data.js; prints counts by kind | – | bin/ctx.js:43-51 |
| op:ctx.site | [files…] [--out dir] | build + copy viewer/index.html into out; prints the Artifact call to make | – | bin/ctx.js:52-60 |
| op:ctx.get | <id or suffix> | render one node: title, file:line, body, edges grouped by verb both ways | – | bin/ctx.js:61-65, lib/graph.js:85-95 |
| op:ctx.neighbors | <id> [-d N] [--kinds a,b] [--structural] | the node plus everything within N hops, indented by distance | – | bin/ctx.js:66-73, lib/graph.js:25-37 |
| op:ctx.search | <terms…> [--limit N] | ranked hits: id ×5, title ×3, body ×1+, reqs ×1.5, stubs ×0.5 | – | bin/ctx.js:74-78, lib/graph.js:38-53 |
| op:ctx.impact | <id> [-d N] | reverse structural closure (default 3 hops), grouped by kind | – | bin/ctx.js:79-86, lib/graph.js:55-68 |
| op:ctx.packet | --task "…" [--budget N] [--seeds N] | entity:packet | – | bin/ctx.js:87-91, lib/graph.js:69-84 |
| op:ctx.check | [--repo dir] [--strict] | lint; prints warn/ERROR lines; exit 1 on errors | – | bin/ctx.js:92-98, lib/graph.js:104-129 |
| op:ctx.stats | | counts by kind, verb, req status, modules (JSON) | – | bin/ctx.js:99, lib/graph.js:96-103 |
| op:ctx.reqs | [--status s] | requirement tree with glyphs | – | bin/ctx.js:100-108 |
| op:install | | symlink bin/ctx.js → ~/.local/bin/ctx and skills/* → ~/.claude/skills/ | – | install.sh:1-20 |

---

## 5. Pages and actions

### page:viewer/reqs

### page:viewer/graph

### page:viewer/read

### page:viewer/node-sheet

### page:skill/describe-module and page:skill/context

---

## 6. Rules

### Parsing

### Querying

### Linting

### Viewer

---

## 7. Cross-module edges

```yaml
- module:claude-code -(triggers)-> page:skill/describe-module
  via: skill listing in ~/.claude/skills (install.sh symlinks); the Agent tool runs the explorer prompts; the Artifact tool publishes ctx site output
- module:claude-code -(triggers)-> page:skill/context
  via: the skill description matches "before implementing a feature in a repo with a context graph"
- module:git -(has)-> entity:module-doc
  contract: the module files are reviewed in PRs; _build/ is generated and gitignored in the consumer repo
- module:yessensei-pos -(has)-> entity:module-doc         # docs/context-graph/inventory.md, the pilot
  contract: test/smoke.js reads it from ~/Projects/yessensei/src and skips silently when absent (drift row 7)
- module:cdnjs -(reads)-> page:viewer/graph                # d3 7.9.0, marked 12.0.2
```

---

## 8. Gates

---

## 9. Verification index

| test node | file | count |
|---|---|---|
| test:smoke | test/smoke.js | 10 assertions: reqs-parsed, rules-parsed, fields-generated, typed-edges, req-title-status, refines-edge, field-mentions, impact, packet, check-ok |

**Untested surfaces:** every red path of `ctx check` (missing source, missing satisfied-by, stub rule, strict mode, exit code), `resolve` ambiguity, `neighbors`, `search` scoring, `reqs` tree, `site` output, multi-module builds, the entire viewer (no story, no DOM test, no screenshot), install.sh, both skills.

---

## 10. Drift and contradictions

| # | a | b | what disagrees | where |
|---|---|---|---|---|
| 1 | design of 2026-09-13: one file per node | implementation: one file per module | the README and skills say per-module; the design argued per-node avoids multi-agent merge conflicts. The parser would accept either (any .md in the root), but the template, viewer grouping and drift namespacing assume a module frontmatter per file | README.md, templates/module.md vs the design discussion |
| 2 | design: sources as `file#Symbol` | rule:source-path-resolves | check verifies only that the path exists; a `#Symbol` suffix is stripped and never grepped | lib/graph.js:120-121 |
| 3 | entity:delta, page:skill/context ("delta before build") | op:ctx.build | build reads only `docs/context-graph/*.md` not starting with `_`; `_deltas/*.yaml` are never parsed, so the delta workflow is documentation only | bin/ctx.js:27-31 vs templates/delta.yaml |
| 4 | rule:inventory-gate-shorthand | module:waterfall purpose ("generic") | the generic parser hardcodes inventory's permission gate ids (view / manage / record-ops) | lib/parse.js:143-146 |
| 5 | schema/kinds.yaml lists `question` and `decision` kinds | templates/module.md §11 writes questions as `- q:` lines; inventory.md has none as nodes | open questions are prose, not nodes, so they cannot be linked, resolved by a delta, or counted | schema/kinds.yaml:33-34 vs templates/module.md:190-200 |
| 6 | rule:section-headings-drive-grouping | schema/kinds.yaml conventions | the heading text is load-bearing for parsing and viewer grouping but the schema does not say so | lib/parse.js:123-134, viewer/index.html:262 |
| 7 | test:smoke | module:yessensei-pos | the only test reads a fixture from another repository and exits 0 with zero assertions when it is missing; a fresh checkout of waterfall is "green" without testing anything | test/smoke.js:10 |
| 8 | action:search-graph (viewer) | op:ctx.search (CLI) | the viewer matches id/title only; the CLI also scores body text; the same query returns different sets | viewer/index.html:327 vs lib/graph.js:38-53 |
| 9 | req:wf.query.packet ("ends with the code files those nodes cite") | rule:packet-ranking | only `source:`-style keys feed the file list; requirements rarely have one, so a requirements-heavy packet cites no files | lib/graph.js:131-137 |
| 10 | rule:inline-action-definition | templates/module.md §5 (an inline `actions: [...]` array shown as valid) | inline-array actions are never defined and appear as stubs | lib/parse.js:86-96 vs templates/module.md:130-131 |
| 11 | README ("`ctx site` … ready for the Artifact tool") | op:ctx.site | site also copies graph.json, which the page never loads; harmless but misleading about what must be published | bin/ctx.js:52-60 |
| 12 | schema/kinds.yaml `statuses.node: [proposed, approved, shipped, deprecated]` | state:node-lifecycle | no code reads approved or deprecated; only req statuses are interpreted | lib/graph.js:115-116, viewer/index.html:264-268 |
| 13 | rule:id-syntax | rule:node-detection | any id-shaped token in prose becomes an edge, so an example like "e.g. req:inv.sale…" in a statement created a stub and failed this file's own check. Examples must be written as req:<mod>… or in words; the parser should skip backticked/quoted tokens or accept an explicit `example:` key | lib/parse.js:28-32 (found while linting this file) |

---

## 11. Open questions


```yaml
- id: module:waterfall
  purpose: >
    Let a team describe a software product completely without code — requirements, entities, rules, operations,
    screens, gates, tests — as markdown that is also a graph; let coding agents read that graph as external memory
    and write to it before they write code; lint it so it cannot silently drift from the code it describes; and
    let a human browse it from a phone.
  submodules:
    - parser        # lib/parse.js — markdown → nodes + typed edges + generated fields
    - query         # lib/graph.js — get / neighbors / search / impact / packet
    - lint          # lib/graph.js#check — the rules that make the graph a contract
    - cli           # bin/ctx.js
    - viewer        # viewer/index.html — Reqs · Graph · Read, node sheet
    - skills        # skills/* — how agents use the system (Claude Code)
    - schema        # schema/kinds.yaml, templates/*
  scoping: one graph per repository at docs/context-graph/; one file per module; ids are global within a graph
  edges:
    - module:waterfall -(edge-to)-> module:claude-code       # skills, Agent tool for explorers, Artifact tool for publishing
    - module:waterfall -(edge-to)-> module:git               # the graph lives in the repo and is reviewed in PRs
    - module:waterfall -(edge-to)-> module:yessensei-pos     # first consumer; its inventory.md is the pilot and the smoke-test fixture
```
