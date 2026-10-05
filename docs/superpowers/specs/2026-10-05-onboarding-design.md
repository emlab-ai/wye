# Onboarding — design

2026-10-05. Alex: "build the best possible onboarding for the app — show/talk about all important features, help
users to start, maybe add a quick start page to every new product".

## What it is for

Someone runs `npm install -g @emlab/wye && wye setup && wye app` and lands in an app that today says
"No products yet. Create data/products/<slug>/_product.md or use the API", and after making a product,
"No documents yet. Use + in the rail". Nothing says what Wye is for, what to do first, or that Inbox, Remember,
Ask, Prompt Requests, maps, tables, the Constitution and agents exist.

Success: a person who has never seen Wye reaches a product with a first document, a first block with an id, and one
pass through the loop (Remember → Inbox approve → Ask → Prompt Request) without reading the README, and has seen
every important feature named once, in the place where it lives.

## Decided with Alex

- The Quick start is a **live checklist**: steps tick themselves from the product's real state.
- **No sample product.** People learn on their own product.
- **No overlay tour / coach marks.** Teaching happens in place.
- Straight to execution after the spec; Alex reviews the result.

## Four parts

### 1. Welcome (first run, `/` with no products)

Replaces the stub in `app/page.tsx`. One screen:

- What Wye is, in three lines (definition in Markdown → agents build from it → what they learn comes back for review).
- **Agent check**: whether `claude` or `codex` is on PATH. Found: a quiet "Claude Code found". Neither: a notice saying
  what works without one (documents, graph, check) and what does not (librarian, builds, Ask's answers, Remember,
  contradiction checks), with the install links. Never blocks.
- **Add a product**, the same component `/new` uses, with a fourth way first: **From your code** — a title and a folder;
  the product is made, `repo:` set, and `lib/init.js` (what `wye init` runs: no model, shallow, nothing overwritten)
  reads the folder into a first definition. Then New (blank), Open a folder, Import a file as today.

`/new` keeps working and gains the same "From your code" way (this is the queued "init from a code folder" feature).
Every way lands on `/<slug>/start`, not the overview.

### 2. Quick start (`/<product>/start`, every product)

An app route like Inbox and Knowledge — not a document, so it cannot collide with a person's page and is not exported.

Steps, in three groups. A step has a title, one sentence of why, an action button, and a done state.

**Set up**
| key | step | done when | action |
|---|---|---|---|
| `agent` | Connect a coding agent | `claude` or `codex` on PATH | opens app Settings › agents |
| `document` | Write or import a first document | ≥1 person document (docs/, not .wye/) | New page sheet; "Import code or Markdown" opens the same sheet on Import |
| `block` | Give something an id | ≥1 defined node of a visible kind other than module | opens the first document; shows the `req:checkout.fast …` line to type |
| `link` | Connect two blocks | ≥1 edge between two such nodes | opens Knowledge |

**The loop**
| key | step | done when | action |
|---|---|---|---|
| `remember` | Remember a note (⌘M) | marked when Remember is sent | opens the command box in Remember mode |
| `approve` | Approve something in the Inbox | ≥1 node with status approved | opens Inbox |
| `ask` | Ask a question (⌘F) | marked when Ask answers | opens the search panel |
| `pr` | Open a Prompt Request (⌘P) | ≥1 PR page | opens the command box in PR mode |
| `build` | Build it with an agent | ≥1 PR with status building/done | opens the newest PR |

**Go further** — not tracked, cards that link: Mind map, Tables and SQL, Constitution, Types, Work board, Hooks and
skills, Packages, the `wye` CLI and the Claude Code skills (`wye-context`, `wye-agent`). One sentence each.

Progress counts Set up + The loop (9 steps). The page has **Dismiss** ("I know my way around") and, once dismissed
or complete, stays reachable from Help.

State:

- Derived steps are computed from the graph and the disk on every request (`lib/onboarding.ts`, pure over a
  `Signals` object, so it is unit-tested without a product).
- Marked steps (`remember`, `ask`) and `dismissed` are per machine, not per product file: `_settings.json` gains
  `onboarding: { [product]: { done: string[], dismissed?: boolean } }`. They never enter Git or an export — onboarding
  is about the person at this machine, and a teammate opening the same product gets their own.
- `GET /api/<product>/onboarding` → `{ steps: [{ key, group, done }], done, total, dismissed, agents: { claude, codex } }`.
  `POST` → `{ mark?: key, dismissed?: boolean }`.
- The agent check (`lib/agents-available.ts`) looks for the binaries on PATH, cached for a minute.

Where it shows:

- **Rail**: "Quick start" with `n/9` directly under Overview while not complete and not dismissed.
- **Overview**: a compact card on top — progress and the next step with its button — under the same condition. The
  "No documents yet" line becomes a proper empty state (part 3).
- A product that is opened or imported with content shows most steps ticked; if all nine are done the rail item and
  card never appear.

### 3. Empty states that teach

One component, `EmptyState` (icon, title, one or two sentences, up to two actions, an optional shortcut hint), used
where a feature page has nothing to show. Each says what the page is for and offers the one action that fills it:

Overview documents · Rail documents · Inbox · PRs · Knowledge (and a kind with no instances) · Work/Tasks · Questions ·
Goals · Constitution · Types (no product types) · Agents/Sessions · Graph · Search/Ask (before the first query).

Copy follows the app's voice (plain, short, no exclamation marks; "a person approves", "the librarian").
Pages that redirect to a system view page (`~goals`, `~work`) get their empty state inside the view's empty table.

### 4. Help

A `?` button in the rail's tools row opens a Help sheet (Esc closes; also `⌘/`):

- **Shortcuts**: ⌘P command box · ⌘M Remember · ⌘F Search and Ask · ⌘\ rail · ⌘. panel · ⌘↵ send / run.
- **What is where**: one line per feature with a link — the same list as "Go further" plus the loop.
- **Quick start**: reopen it (also un-dismisses on request).
- Links: README, docs/reference.md, type-system, query.

CLI: `wye setup` ends by printing the next step (`wye app`, or `wye init --product … --repo …`); `wye init` prints
the product's Quick start URL.

## Out of scope

Sample product, overlay tours, video, accounts/telemetry, onboarding for the desktop shell beyond what the web app
gives it, translating copy.

## Units

| unit | does | depends on |
|---|---|---|
| `lib/onboarding.ts` | step list, `Signals` → step states, progress | nothing (pure) |
| `lib/onboarding-io.ts` | reads signals from scope + disk, reads/writes marks in settings | scope, settings, agents-available |
| `lib/agents-available.ts` | which agent binaries are on PATH | — |
| `api/[product]/onboarding` | GET state, POST mark/dismiss | onboarding-io |
| `components/QuickStart.tsx`, `app/[product]/start/page.tsx` | the page | API, existing openers |
| `components/QuickStartCard.tsx` | Overview card + rail count | same state |
| `components/AddProduct.tsx`, `components/Welcome.tsx` | welcome + add product, "From your code" | `api/products` (+ `repo`), `lib/init.js` |
| `components/EmptyState.tsx` | empty states | — |
| `components/Help.tsx` | help sheet | — |

## Testing

- vitest: `onboarding.test.ts` (every step's done rule, progress, dismissed), `agents-available.test.ts`,
  settings round-trip of `onboarding`, `api/products` with `repo` on a scratch folder.
- By hand with playwright-core against the dev server (port 3456) on a scratch product with a fresh slug:
  welcome with an empty data root (`WYE_HOME`/data root pointed at a temp dir on another port), create → lands on
  Quick start, steps tick as a document and a block appear, dismiss hides the rail item, Help reopens it, each empty
  state renders.
- `npm test` and `wye check --root data/products/wye` pass; the feature is described in Wye's own definition
  (requirements + decisions as proposed cards).
