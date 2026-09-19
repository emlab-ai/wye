# wye

Product context graph: describe a system **without code** as requirements, entities, state machines, operations,
pages/actions, rules, gates and tests — in markdown that is also a graph. Query it from the terminal, lint it in CI,
browse it from a phone. Built from the YesSensei inventory pilot (2026-09-12).

```
data/products/<product>/projects/<project>/docs/<module>.md     ← the source of truth (one file per module, hand-written by an agent + you)
data/products/<product>/_build/         ← generated: graph.json, data.js, site/ (gitignore or commit, your call)
```

## Data layout

```
data/products/<product>/_product.md                 title, icon, description
data/products/<product>/projects/<project>/_project.md   title, kind (project | goal), status
data/products/<product>/projects/<project>/docs/*.md     the pages (PRD, dev design, test design, plan, …)
data/products/<product>/inbox/                            dropped notes, conversations, files (not processed yet)
data/products/<product>/_build/graph.json                 the product's knowledge, built from every page
```

Wye's own product lives in `data/products/waterfall`; `ctx` defaults to it.

## Install

```bash
cd ~/Projects/waterfall && ./install.sh     # links `ctx` into ~/.local/bin and the two skills into ~/.claude/skills
```

## Commands

| command | what |
|---|---|
| `ctx build [files]` | parse `data/products/<product>/projects/*/docs/*.md` → `_build/graph.json` + `data.js` |
| `ctx check [--strict] [--repo dir]` | lint: rules without source, reqs without satisfied-by, undefined rule/req ids, missing source paths, drift count. Exit 1 on errors |
| `ctx get <id>` | one node with every edge (`ctx get oversell` resolves suffixes) |
| `ctx neighbors <id> [-d N] [--structural] [--kinds a,b]` | neighbourhood by hops |
| `ctx impact <id>` | everything that depends on a node (reverse structural closure, 3 hops) |
| `ctx search <terms>` | ranked search over ids, titles, bodies |
| `ctx packet --task "…" [--budget N]` | a token-budgeted slice: seeds → 2 hops → files cited. An agent's working memory for a task |
| `ctx reqs [--status s]` | requirement tree with status glyphs (● tested ◐ untested/unverified ○ proposed ? question) |
| `ctx site [--out dir]` | build the viewer (index.html + data.js) ready for the Artifact tool |
| `ctx stats` | counts by kind, verb, requirement status |
| `npm run dev` | web app (packages/web, Next.js) at http://localhost:3000: documents with node cards and smart tags, in-place editing (BlockNote for prose, forms for cards, templates for new documents), peek panel, React Flow mind map. Reads `_build/graph.json` and rebuilds it after every save; run `ctx build` once first. Use `npx --workspace=packages/web next dev -p 3456` for another port |

## Writing nodes as prose

A paragraph or list item that starts with an id defines that node; links and ids in its text become edges:

```
req:sale.close When a sale is completed and all [kitchen items](entity:kitchen-item) are completed, et:order is marked Closed. #proposed
rule:close-on-complete Closed only when every kitchen item is done; satisfied by op:close-sale and verified by test:sales#close.
```

A checkbox line is a task: `- [ ] task:kitchen-screen Build the kitchen screen, part of req:sale.close` (open; `[x]` is done).
`#status` sets the status; a trailing `(key: value, …)` group carries other keys; `et:`, `rq:`, `rl:`, `pg:`, `st:`, `dc:`, `qn:`, `tk:` are aliases.
The verb comes from the words before an id ("satisfied by", "verified by", "refines", "part of", …), otherwise `related-to`.
Yaml blocks keep working exactly as before; both forms live in one file.

In the web app: type `@` to insert a tag for any node or document, select a phrase and press “⌁ node” to link it (or create a new document from the same picker), `/` to insert a typed block, and click a task's checkbox to mark it done.

## Skills (Claude Code)

- **waterfall-describe-module** — the repeatable process that produced `inventory.md`: fan out server/client explorers, read the human docs, write the file from the template, `ctx build && ctx check`, publish the viewer, report drift.
- **waterfall-context** — the agent contract: query the graph before code (`packet`, `impact`), write a delta before building, `ctx check` before done.

## Layout

```
bin/ctx.js            CLI
lib/parse.js          markdown → graph (nodes, typed edges, generated field nodes + mentions)
lib/graph.js          queries, packet, lint
viewer/index.html     phone-first viewer: Reqs tree · force graph (canvas, d3) · rendered text; node sheet with edges
schema/base-ontology.md  the base types: every kind as a type: card with its properties and inverses (parser pass 1)
schema/kinds.yaml     kinds, verbs, statuses, conventions in prose (kept in step with base-ontology.md)
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

## Desktop app

`npm run desktop` opens Wye in its own window (Electron). The app starts the web server if none is running
on port 3456 and quits it on exit. Agents started from the app (Send to agent → "Conversation in the app") run as
child processes of that server: Claude Code over its streaming JSON protocol, Codex through `codex exec --json`.
The right column shows the conversation live; you reply from there. `npm run desktop:prod` builds the web app first
and serves the production build.

If Electron's binary is missing after `npm install` (npm's allow-scripts skips its postinstall), run
`cd node_modules/electron && node install.js`, or unpack the cached zip with `ditto -x -k <zip> dist` and write
`Electron.app/Contents/MacOS/Electron` into `node_modules/electron/path.txt`.

