---
node: module:app
type: module
title: App
status: proposed
owner: unassigned
last-verified: 2026-09-17
submodules: [app-shell, app-documents, app-knowledge, app-graph, app-storage, app-agents]
sources:
  - packages/web/src            # the Next.js app: routes, components, lib
  - lib                          # the graph core the app and ctx share
  - bin                          # ctx and wf CLIs
  - packages/desktop/main.js     # the Electron shell
---

# App

Waterfall the application, as built: what it is made of and where each requirement lands. The PRD (module:wf2-prd) says what the product must do, the dev design (module:wf2-dev) says how; this document and its sub-documents are the map from those to the code — every screen, component, library, store and API route as a node, so a requirement can be traced to the pieces that satisfy it and a change to a piece shows what it touches.

```yaml
- id: module:app
  purpose: >
    The Waterfall app as built — a local-first Next.js app (packages/web) over a folder of markdown products, with a
    graph core (lib/, bin/ctx.js) it shares with CI, an agent host that runs Claude Code and Codex as child processes,
    the wf CLI agents use, and an Electron shell (packages/desktop). Six logical modules: shell and navigation,
    documents and editing, knowledge views, graph core, storage and serving, agents and sessions.
```

## How it is put together

A **product** is a folder (store:product-file) with projects (store:project-file), each a set of markdown documents (store:documents). The **graph core** (module:app-graph) parses those documents into graph.json (store:build) — kinds open through the ontology (module:ontology-design). The **server** (module:app-storage) watches the folder, rebuilds the graph on every change and streams change events; the **UI** reads graph.json per request. The **shell** (module:app-shell) frames every page: rail, top bar, content, context column. **Documents** (module:app-documents) are edited in place as one page and written back by segment with a hash. **Knowledge views** (module:app-knowledge) are read-only projections of the graph — Knowledge, Types, Goals, Tasks, Questions, Inbox, Graph. **Agents** (module:app-agents) work in sessions hosted by the app, read and write through the wf CLI, and get the same contract as a system prompt.

| Module | What it owns | Where |
|---|---|---|
| module:app-shell | rail, tree, top bar, context column, search, live refresh | components/Shell, Rail, TopBar, DocTree, PeekPanel… |
| module:app-documents | editor, reader, markdown round trip, node/card writers, drawings and images | components/DocEditor…, lib/import, serialize, write… |
| module:app-knowledge | Knowledge, Types, Goals, Tasks, Questions, Inbox, Graph, Context mode | app/[product]/*, components/TrackList, TypeView…, lib/graph, semantic |
| module:app-graph | parser, query layer, check, ctx CLI, base ontology | lib/parse.js, lib/graph.js, bin/ctx.js, schema/ |
| module:app-storage | data layout, watcher, rebuild, events, desktop shell | lib/products, watch, write, artifacts; packages/desktop |
| module:app-agents | sessions, agent host, console, runners, wf CLI, contract | lib/agent-host, sessions…, components/Console…, bin/wf.js, prompts/ |

## Types this map uses

Three product types on top of the base kinds (page and op are base kinds): a **component** is a React component file, a **lib** a library module, a **store** a place data lives. Declared here so the Types page shows them and `ctx check` validates every card below.

```yaml
- id: type:component
  extends: type:node
  purpose: a React component of the web app (packages/web/src/components or a route file)
  home: module:app
  props:
    file: string
    side: enum [client, server]
    purpose: text
    part-of: list of module? -(inverse)-> has
- id: type:lib
  extends: type:node
  purpose: a library module — packages/web/src/lib, lib/ (graph core) or bin/ (CLIs)
  home: module:app
  props:
    file: string
    side: enum [server, shared, client]?
    purpose: text
    part-of: list of module? -(inverse)-> has
- id: type:store
  extends: type:node
  purpose: a place data lives on disk — a file or folder pattern with its format and who writes it
  home: module:app-storage
  props:
    path: string
    format: enum [markdown, json, yaml, excalidraw, binary, sqlite]
    purpose: text
    part-of: list of module? -(inverse)-> has
```

## Tasks

- [x] task:new-171 Add desctiption of the app, and all the modules of the app, so we can keep track all requirements about it, i.e. add section UI, add Storage, Navigation etc. add logical modules, create types, like component, page etc, then review entire waterfall app and fill all details. Part of module:app.
- [ ] task:app.trace-requirements For every requirement in the PRD that the app satisfies, add the component, lib or op that satisfies it to its `satisfied-by` (the map here names the pieces; the PRD's edges still point at rules only). Part of module:app.
- [ ] task:app.keep-in-step Regenerate the component, lib and op cards from the code (the header comment is the purpose) whenever a file is added or renamed under packages/web/src; a check that every file has a card and every card a file. Part of module:app.
