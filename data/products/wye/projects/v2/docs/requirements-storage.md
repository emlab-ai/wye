---
node: module:req-storage
type: module
title: Storage and serving
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 21
---

# Storage and serving

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Storage and serving); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

```yaml
- id: req:wf2.store.products
  title: A product holds projects and goals, each a set of pages
  status: unverified
  note: shipped 2026-09-15 (decision:wf2.product-model); create product, project and page from the UI or the API
  satisfied-by: [entity:product, op:projects.list, op:projects.register]
  requires-tests: [test:server-services#product-groups-projects]
  refines: req:wf2.store

```

  - when:wf2.store.products a product is created in the app

  - then:wf2.store.products it is a folder in Waterfall's data (data/products/<slug>), projects and goals are folders under it with their pages in docs/, an inbox receives dropped notes and files, and one graph per product is the product's knowledge; the rail switches products and lists projects with their pages

```yaml
- id: req:wf2.ui.live
  title: What an agent changes appears while you look
  status: proposed
  satisfied-by: [rule:sse-refresh, op:events.subscribe]
  requires-tests: [ui-test:edit-node-flow]
  refines: req:wf2.ui

```

  - when:wf2.ui.live the server emits graph.changed or a task, decision or contradiction event

  - then:wf2.ui.live the open views refresh the affected node, list or graph without a reload

<!-- /list:req -->

```yaml
- id: req:wf2.vault-init
  title: A folder of a monorepo gets its own knowledge with one command
  status: proposed
  refines: req:wf2.store
  by: agent:wye
  evidence: [session:fc7ee08157]
```

  - when:wf2.vault-init the person runs `wye init` inside any folder of their repository — a service, a package, the repository root — or picks Init Wye here on that folder in the app

  - then:wf2.vault-init the folder has its own knowledge in `.wye/` beside its code: a first description of what the code in that folder does, its own agent instructions and skills, and a note in the folder telling any agent that works there to read and write this knowledge; the nearest knowledge above it and any below it now know about it, so opening any folder above finds it

  - unless:wf2.vault-init the folder already has its own knowledge — then nothing is overwritten and the person is told where it is

  verdict:4dc0789c83e5 refines rule:init-shallow — A describes how init currently works (walks repo, classifies files into cards); B refines this by specifying that init must also create a `.wye/` vault structure with description, instructions, and skills. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: rule:init-shallow req:wf2.vault-init)

```yaml
- id: req:wf2.workspace-open
  title: Opening any folder shows every knowledge vault inside it, each as its own root
  status: proposed
  refines: req:wf2.ui
  by: agent:wye
  evidence: [session:fc7ee08157]
```

  - when:wf2.workspace-open the person opens a folder in the app — the whole monorepo, one service, any level

  - then:wf2.workspace-open Documents shows one root per vault the folder reaches — the folder's own, the ones nested below it under their parent, and linked ones — each with its pages as children; Goals, Work, Inbox and Pinned show the items of all those vaults together, each item labelled with the vault it belongs to; the app opens on that folder next time

  - unless:wf2.workspace-open the folder holds no vault — then Documents says so and offers to init one there, and Files still shows the folder

```yaml
- id: req:wf2.shared-vault
  title: A service reads company knowledge kept outside its folder
  status: proposed
  refines: req:wf2.store
  by: agent:wye
  evidence: [session:fc7ee08157]
  note: later — designed in this request, not built
```

  - when:wf2.shared-vault the person links a vault to a shared vault they keep elsewhere on their machine — company knowledge cloned from its own git repository

  - then:wf2.shared-vault the shared vault appears as a linked root in Documents, its approved constraints and decisions govern the linked vault's work as if they were its own, and what an agent wants to change in it is proposed there for the person to approve, commit and push themselves

  - unless:wf2.shared-vault the shared vault's folder is missing on this machine — then it is shown as unreachable and nothing else breaks

  verdict:136c6f7819d1 refines decision:wf2.shared-vault-is-a-local-clone — A specifies the implementation choice for B's requirement: shared vaults are local clones linked by Wye, never synced remotely. (kind: refines, model: claude-haiku-4-5-20251001, prompt: 6d31662f, pair: decision:wf2.shared-vault-is-a-local-clone req:wf2.shared-vault)

```yaml
- id: question:wf2.workspace-root-vault
  status: resolved
  q: Is the monorepo root a vault of its own (company- or repo-level knowledge that every service vault below it inherits in its packet), or only a folder that holds service vaults?
  context: decision:wf2.vault-links makes the nearest vault above a parent; whether a parent's approved constraints govern its children decides what an agent in services/payments sees. Assumed so far — a parent's constraints reach its children, its other knowledge does not.
  related-to: [decision:wf2.vault-links, decision:wf2.workspace-is-the-top]
  answer: Only if you init it — decision:wf2.root-vault-only-if-inited
  by: person
```

```yaml
- id: question:wf2.write-back-spanning-vaults
  status: resolved
  q: When one agent session changes files in two services, does each vault get its own share of the proposals, or does the person pick one vault for the whole session?
  context: decision:wf2.write-back-nearest-vault assumes each extracted decision or task goes to the vault of the files it concerns; a cross-cutting decision (an API contract between payments and search) belongs to both or to their common parent.
  related-to: [decision:wf2.write-back-nearest-vault, req:wf2.vault-write-back]
  answer: Each vault its share — decision:wf2.spanning-session-each-vault-its-share
  by: person
```

```yaml
- id: question:wf2.cross-vault-ids
  status: open
  q: >
    Can a page in one vault link to a node in another (search's page citing req&#58;payments.refund), and does that make an edge in both graphs?
  context: constraint:wf2.one-defining-place holds per vault since slugs are unique in a workspace; each vault keeps its own graph (decision:wf2.workspace-is-the-top). Assumed — a cross-vault reference resolves for views and packets in the workspace, makes no edge in the other vault's graph, and shows as unresolved when the vault is opened alone.
  related-to: [decision:wf2.workspace-is-the-top, constraint:wf2.one-defining-place]
```

```yaml
- id: decision:wf2.root-vault-only-if-inited
  title: The monorepo root is a vault only when the person inits it; a parent's approved constraints reach its children, nothing else does
  status: proposed
  date: 2026-10-05
  by: alex
  evidence: session:13bdb849d4
  affects: [question:wf2.workspace-root-vault, decision:wf2.vault-links, decision:wf2.workspace-is-the-top]
  text: >
    The root of a repository is a folder like any other: it has a vault when the person runs wye init there, and opening a workspace never makes one. When it has one it is the parent of the service vaults below, and its approved constraints enter their packets; its other knowledge does not flow down. Chosen over a root vault made on every open, and over vaults that inherit nothing. Answers question:wf2.workspace-root-vault.
```

```yaml
- id: decision:wf2.spanning-session-each-vault-its-share
  title: A session that changes two services leaves each vault its own share of the proposals
  status: proposed
  date: 2026-10-05
  by: alex
  evidence: session:13bdb849d4
  affects: [question:wf2.write-back-spanning-vaults, decision:wf2.write-back-nearest-vault, req:wf2.vault-write-back]
  text: >
    Each decision or task a session leaves goes to the vault of the files it concerns; one that concerns files of two vaults goes to their nearest common parent vault, and the Inbox shows the vault on each. Chosen over the person picking one vault when the session ends, and over everything going to the vault the session started in. Answers question:wf2.write-back-spanning-vaults.
```

```yaml
- id: question:wf2.vault-service-skills
  status: open
  q: Which skills of its own should wye init write into a service's vault?
  context: req:wf2.vault-init promises "its own agent instructions and skills". Built so far — init writes _agent.md (a starter the person fills in) and the app adds its standard skill pages when the vault is opened; no skill is written from the service's code, because rule:init-shallow uses no model and nothing in the request says what a service-level skill contains (how to run and test the service? its conventions?). Until this is answered req:wf2.vault-init is not marked shipped.
  related-to: [req:wf2.vault-init, rule:vault-init, rule:init-shallow]
```
