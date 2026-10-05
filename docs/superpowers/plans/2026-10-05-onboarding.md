# Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-run welcome, a live Quick start checklist on every product, empty states that teach, and a Help sheet, so a new person reaches a working product and sees every important feature named once.

**Architecture:** A pure step model (`lib/onboarding.ts`) turns a `Signals` object into step states; `lib/onboarding-io.ts` reads the signals from the product's graph, disk and per-machine marks in `_settings.json`; one API route serves it. The Quick start page, the rail item and the Overview card are three views of that one state. Welcome and `/new` share one `AddProduct` component. Empty states are one `EmptyState` component.

**Tech Stack:** Next.js App Router (this repo's version — read `packages/web/AGENTS.md` and the guides in `node_modules/next/dist/docs/` before writing route or page code), React 19, vitest, plain CSS in `packages/web/src/app/globals.css`, `lib/init.js` (CommonJS core).

**Spec:** `docs/superpowers/specs/2026-10-05-onboarding-design.md`

## Global Constraints

- No sample product, no overlay tour or coach marks.
- Marked steps and `dismissed` live in `<data>/_settings.json` under `onboarding`, never in a product file.
- The Quick start is an app route (`/<product>/start`), not a document; nothing is written to `docsDir` or `wyeDir`.
- Progress counts exactly nine steps: `agent document block link remember approve ask pr build`.
- Copy: plain and short, no exclamation marks, no "simply/just/easy"; a PR is a "Prompt Request"; the rail label is "PRs". Agents propose, a person approves.
- Match the surrounding code: dense single-file components, comments that cite `req:` / `decision:` ids, existing class names (`page`, `doc-head`, `lede`, `muted`, `pri`, `tile`, `cards-grid`, `seg-group`, `modal-back`, `modal`, `notice`, `sec-actions`).
- New CSS goes at the end of `globals.css` in a block opened by a comment naming the feature; append with `cat >>` (other agents append to the same file at the same time). Use the existing CSS variables; both themes must work.
- Do not run `git add`, `git commit` or `git stash`; other agents work in this tree. The controller commits.
- Never read or write `data/products/ea` or `data/products/yessensei`.
- The dev server is already running on http://localhost:3456 (do not start another on that port, do not kill it).
- Test products use a fresh slug `zz-onb-<random>` under `data/products/` and are deleted afterwards.

## Review Focus

- A product opened read-only or with no project: the Quick start page and the API answer without throwing (signals default to false).
- `_settings.json` missing, unreadable, or without `onboarding`: state reads as nothing marked; a write keeps `jev`, `agents`, `timezone` intact.
- "From your code" with a folder that does not exist, is a file, or starts with `~`: a 422 with a message in the form, no half-made product left behind; `~` is expanded.
- A product with thousands of nodes: signals are computed in one pass over nodes and edges, no per-step rescans, no model calls.
- Neither `claude` nor `codex` installed: every page still renders; the agent step stays open with the "what works without one" notice.

---

### Task 1: The step model, state, API and shared pieces

**Files:**
- Create: `packages/web/src/lib/onboarding.ts`, `packages/web/src/lib/onboarding.test.ts`
- Create: `packages/web/src/lib/agents-available.ts`, `packages/web/src/lib/agents-available.test.ts`
- Create: `packages/web/src/lib/onboarding-io.ts`, `packages/web/src/lib/onboarding-io.test.ts`
- Create: `packages/web/src/app/api/[product]/onboarding/route.ts`
- Create: `packages/web/src/components/EmptyState.tsx`
- Modify: `packages/web/src/lib/settings.ts` (the `onboarding` field; `writeSettings` merges it per product)
- Modify: the routes that serve Ask and Remember (find them under `app/api/[product]/` — `ask`, and whatever the command box's Remember mode posts to) to call `markStep`
- Modify: `packages/web/src/app/globals.css` (append `.empty-state` block)

**Interfaces — produces (later tasks rely on these exact names):**

```ts
// lib/onboarding.ts — pure
export type StepKey = 'agent' | 'document' | 'block' | 'link' | 'remember' | 'approve' | 'ask' | 'pr' | 'build';
export type StepGroup = 'setup' | 'loop';
export interface Signals { agent: boolean; documents: number; blocks: number; links: number; approved: number; prs: number; built: number; marked: string[] }
export interface StepDef { key: StepKey; group: StepGroup; title: string; why: string; shortcut?: string; done(s: Signals): boolean }
export const STEPS: StepDef[];          // the nine, in the spec's order
export const MARKED: StepKey[];         // ['remember', 'ask'] — the steps only a mark can tick
export interface StepState { key: StepKey; group: StepGroup; title: string; why: string; shortcut?: string; done: boolean }
export interface Onboarding { steps: StepState[]; done: number; total: number; next: StepKey | null; complete: boolean; dismissed: boolean; show: boolean }
export function onboardingOf(s: Signals, dismissed: boolean): Onboarding;   // show = !complete && !dismissed
export const EMPTY_SIGNALS: Signals;

// lib/agents-available.ts
export interface Agents { claude: boolean; codex: boolean }
export function agentsAvailable(env?: NodeJS.ProcessEnv): Promise<Agents>;   // scans PATH for the binaries; cached 60s per PATH value

// lib/onboarding-io.ts
export function signalsOf(scope: Scope, agents: Agents, marked: string[]): Signals;   // one pass over scope.graph.nodes and edges
export function readOnboarding(product: string): Promise<(Onboarding & { agents: Agents }) | null>;   // null: no such product
export function markStep(product: string, key: StepKey): Promise<void>;       // idempotent, never throws
export function setDismissed(product: string, dismissed: boolean): Promise<void>;

// lib/settings.ts
export interface Settings { /* existing */ onboarding?: Record<string, { done?: string[]; dismissed?: boolean }> }

// GET  /api/<product>/onboarding  → Onboarding & { agents }            (404 { error: 'not_found' })
// POST /api/<product>/onboarding  { mark?: StepKey, dismissed?: boolean } → the same body as GET   (422 on an unknown key)

// components/EmptyState.tsx — a server-safe component (no hooks); actions are children so a client button can be passed
export function EmptyState(p: { icon?: string; title: string; children?: ReactNode; actions?: ReactNode; hint?: string }): JSX.Element;
```

Done rules: `agent` → `s.agent`; `document` → `documents > 0`; `block` → `blocks > 0`; `link` → `links > 0`; `remember` → `marked.includes('remember')`; `approve` → `approved > 0`; `ask` → `marked.includes('ask')`; `pr` → `prs > 0`; `build` → `built > 0`.

Signals: `documents` = modules whose file is under `/docs/` and not a system file (`isSystemFile` in `lib/doc`); `blocks` = defined nodes whose kind is not in `HIDDEN_KINDS` (`lib/graph`) and not `module`; `links` = edges whose both ends are such blocks; `approved` = such blocks with `status === 'approved'`; `prs` = PR pages (see how `app/[product]/layout.tsx` collects `prs` from `prsPageId`'s children; reuse or extract that, do not duplicate the walk badly); `built` = PRs whose front matter `status` is `building` or `done`.

- [ ] **Step 1: Write `onboarding.test.ts`** — one test per done rule (false on `EMPTY_SIGNALS`, true when its signal is set), `done/total` (`total === 9`), `next` is the first open step in order and `null` when complete, `show` false when dismissed and false when complete, `STEPS` keys are unique and in the spec's order.
- [ ] **Step 2: Run it** — `npx vitest run src/lib/onboarding.test.ts` from `packages/web`; expected: fails, module not found.
- [ ] **Step 3: Implement `lib/onboarding.ts`** with the titles and whys from the spec's tables (title as written there; `why` one sentence each, in the app's voice).
- [ ] **Step 4: Tests pass.**
- [ ] **Step 5: `agents-available`** — test with a temp dir on PATH holding an executable named `claude` (true/false, both absent, an empty PATH, a PATH entry that does not exist); implement by scanning PATH entries with `access(X_OK)`, no child process.
- [ ] **Step 6: Settings** — extend `Settings`; `writeSettings` merges `onboarding` per product key (a patch for product `a` keeps product `b`, and keeps `jev`/`agents`/`timezone`). Add cases to the existing settings test file if there is one, else to `onboarding-io.test.ts`, using the `root` parameter with a temp dir.
- [ ] **Step 7: `onboarding-io`** — `signalsOf` tested on a hand-built scope-shaped object (two blocks, one edge, one approved, one hidden-kind node that must not count, a `.wye/` module that must not count as a document); `markStep` twice leaves one entry; `readOnboarding('no-such')` is `null`; a missing settings file reads as nothing marked.
- [ ] **Step 8: The route** — GET and POST as above. Follow the shape of a neighbouring route (e.g. `app/api/[product]/pins/route.ts`).
- [ ] **Step 9: Marks** — in the Ask route, after an answer is produced, `void markStep(product, 'ask')`; in the Remember path, when a remember request is accepted, `void markStep(product, 'remember')`. Never let a mark failure fail the request.
- [ ] **Step 10: `EmptyState` + CSS** — centred block, icon, title, body text, actions row, hint in muted small text; looks right in both themes and inside a narrow column.
- [ ] **Step 11: Verify** — `npx vitest run` (whole web suite) and `npx tsc --noEmit -p packages/web` pass; `curl -s localhost:3456/api/wye/onboarding` returns the body with `total: 9`.

### Task 2: Quick start page, rail item, Overview card, Help sheet

**Files:**
- Create: `packages/web/src/app/[product]/start/page.tsx`, `packages/web/src/components/QuickStart.tsx`, `packages/web/src/components/QuickStartCard.tsx`, `packages/web/src/components/Help.tsx`
- Modify: `packages/web/src/components/Rail.tsx` (Quick start item under Overview; `?` in `.rail-ws-tools`; the "No documents yet" line), `packages/web/src/app/[product]/layout.tsx` (pass onboarding to the rail), `packages/web/src/app/[product]/page.tsx` (card on top; documents empty state), `packages/web/src/components/Shell.tsx` (⌘/ and a `wf:help` event open Help; a `wf:search` event opens the search panel if no opener exists), `globals.css` (append)

**Interfaces — consumes:** `readOnboarding`, `Onboarding`, `StepState`, `STEPS` (Task 1); `EmptyState`; the command box's opener (`requestSend` and its mode argument in `components/CommandBox.tsx` — read how ⌘M opens Remember mode and how PR mode is picked); `NewPage` for the new-document sheet.

**Produces:** window events `wf:help` (open Help) and `wf:new-page` with `detail: { import?: boolean }` (the rail opens its New page sheet) — Task 3 and Task 4 buttons dispatch these.

- [ ] **Step 1: Page** — `/[product]/start` is a server page: `readOnboarding`, header ("Quick start", `n of 9`, a progress bar), the two tracked groups ("Set up", "The loop") as step rows — a check mark, title, the why, shortcut chip, the action button (primary on the `next` step only) — then "Go further" as `tile` cards linking to: a new Mind map, Knowledge (tables and SQL, link `docs/query.md` text), Constitution, Types, Work, Hooks, Skills, Packages (`wye packages`), and the CLI + Claude Code skills (`wye-context`, `wye-agent`) with the one command that matters. One sentence each. Dismiss / "Show in the rail again" at the bottom.
- [ ] **Step 2: Actions** — `QuickStart.tsx` (client) wires each step's button per the spec's action column: `agent` → `/settings?from=<product>`; `document` → `wf:new-page` (second button "Import code or Markdown" → `wf:new-page` `{ import: true }`); `block` → the first person document if any, else new page, and the row shows the literal line `req:checkout.fast Checkout should feel instantaneous.` as something to type; `link` → Knowledge; `remember` → command box in Remember mode; `approve` → Inbox; `ask` → search panel; `pr` → command box in PR mode; `build` → newest PR page. The agent step shows what was found ("Claude Code found") or the spec's "what works without one" notice with install links (https://claude.com/claude-code, https://github.com/openai/codex).
- [ ] **Step 3: Live** — the page refreshes its state on the app's `wf:change` event and on window focus (see `LiveRefresh` and how other components listen), so a step ticks without a reload.
- [ ] **Step 4: Rail** — "Quick start" with a `n/9` count directly under Overview while `show`; the layout passes `{ done, total, show }`. The rail count also follows `wf:change`. The rail listens for `wf:new-page`.
- [ ] **Step 5: Overview card** — `QuickStartCard` on top of the Overview while `show`: progress, the next step's title and why, its button, "Open Quick start", and a small dismiss. Replace "No documents yet. Use + in the rail." with an `EmptyState` (what a document is here: prose with ids; actions New document / Import code or Markdown).
- [ ] **Step 6: Help** — `Help.tsx`: a modal sheet (`modal-back`/`modal`, Esc and outside click close — read memory note: React's root is `document`, a close-on-outside handler must check the event target) with Shortcuts, What is where, Quick start (reopen; un-dismiss), and links to the README and docs on GitHub (`https://github.com/emlab-ai/wye`). `?` button in `.rail-ws-tools` and ⌘/ open it.
- [ ] **Step 7: Verify in the browser** with playwright-core (`channel: 'chrome'`, script in the scratchpad, run from `packages/web`; set `localStorage['wf-rail']='1'` in an init script or the rail is hidden): make `zz-onb-<rand>` through `POST /api/products`, open `/zz-onb-…/start`, screenshot; create a document through the API and confirm the `document` step ticks; dismiss and confirm the rail item is gone; open Help from `?` and with ⌘/; reopen Quick start from Help. Look at the screenshots in both themes. Delete the product folder. `npx vitest run` and `npx tsc --noEmit -p packages/web` pass.

### Task 3: Welcome, Add a product, "From your code", CLI next steps

**Files:**
- Create: `packages/web/src/components/AddProduct.tsx` (moved out of `app/new/page.tsx`), `packages/web/src/components/Welcome.tsx`
- Modify: `packages/web/src/app/page.tsx`, `packages/web/src/app/new/page.tsx`, `packages/web/src/app/api/products/route.ts`, `packages/web/src/lib/product-create.ts` (only if needed), `bin/wye.js` (`setup` and `init` output), `globals.css` (append)
- Test: `packages/web/src/lib/product-from-code.test.ts` (+ `lib/product-from-code.ts` holding the logic the route calls)

**Interfaces — consumes:** `agentsAvailable` (Task 1); `lib/init.js` `init(opts)` (read it: lines 123–248, and how `bin/wye.js` calls it for `wye init`); `createProduct`.

**Produces:** `POST /api/products { title, icon?, description?, repo? }` — with `repo`, the product is created from that folder; answers `{ ok, slug }` as today.

- [ ] **Step 1: `productFromCode`** — test first on a temp data root and a temp repo folder with two source files: the product exists, `_product.md` carries `repo:`, at least one document was written, the graph builds; a missing folder, a file path, and an empty string each reject with a message and leave no product folder; `~/x` expands to the home directory. Implement by calling the same code path `wye init` uses (require `lib/init.js` the way `lib/install.ts` requires core modules), then `rebuild`.
- [ ] **Step 2: Route** — `repo` given → `productFromCode`; errors → 422 `{ error: 'invalid', message }`.
- [ ] **Step 3: `AddProduct`** — the existing form as a component with a fourth way, first in the list and the default on Welcome: "From your code" (title, folder; a lede: Wye reads the folder into a first, shallow definition — modules, pages, components, tests — no model is called and nothing in the folder is changed; `Deepen` each module with an agent afterwards). Every way's `done` pushes to `/<slug>/start`. `/new` renders `<AddProduct />` with the same heading as today and `?way=` still works (`code` added).
- [ ] **Step 4: `Welcome`** — `/` with no products: the mark and "Wye", one line (the README's tagline), the three-step loop in one row (Define · Request · Remember, one sentence each), the agent check line (server-side `agentsAvailable`), then `<AddProduct start="code" />`. No rail, centred column, ~640px. With products, `/` still redirects to the first.
- [ ] **Step 5: CLI** — `wye setup` ends with "Next: wye app — or start from your code: wye init --product <slug> --repo <dir>"; `wye init` ends with the product's Quick start URL (`<WYE_URL>/<slug>/start`). Match the file's existing output style.
- [ ] **Step 6: Verify** — vitest and tsc pass. In the browser: `/new?way=code` with this repo's `packages/desktop` folder as the code and a `zz-onb-<rand>` title → lands on `/zz-onb-…/start` with documents ticked; bad folder shows the message. Welcome: render it without touching the real data — start a second dev server on another port with the data root pointed at an empty temp dir (see `lib/products.ts` for `DATA_ROOT`/`WYE_HOME`), screenshot both themes, stop that server. Delete scratch products.

### Task 4: Empty states across the app

**Files:**
- Modify: the pages and lists behind Inbox (`app/[product]/inbox`, `components/InboxList.tsx` / `ReviewList.tsx`), PRs (`app/[product]/prs`, `components/PrList.tsx`, `PrFolder.tsx`), Knowledge (`app/[product]/knowledge`, `knowledge/[kind]`), Work/Tasks (`app/[product]/work`, `tasks`, `WorkList.tsx`), Questions, Goals, Constitution (`ConstitutionList.tsx`), Types (`app/[product]/types`), Sessions (`SessionList.tsx`, `AgentFolder.tsx`), Graph (`GraphView.tsx`), Search (`SearchPanel.tsx` before a query), and the empty tables of the system view pages (`ViewBlock.tsx` / `LiveTable.tsx` / `TrackList.tsx`)
- Do **not** touch: `Rail.tsx`, `app/[product]/page.tsx`, `Shell.tsx` (Task 2 owns them)

**Interfaces — consumes:** `EmptyState` (Task 1); events `wf:help`, `wf:new-page` (Task 2); the command box opener.

- [ ] **Step 1: Inventory** — for each surface, find what it renders with nothing to show (make a `zz-onb-<rand>` product and look), and list it.
- [ ] **Step 2: Replace each** with an `EmptyState`: what this page is for (one or two sentences taken from the README's wording for that feature), and the one action that fills it — Inbox: "Nothing waiting. What agents propose, and what Remember files, lands here for a person to approve." → Remember (⌘M); PRs: what a Prompt Request is (not a pull request) → New Prompt Request (⌘P); Knowledge: blocks with ids, by kind → open/new document, with the example line; a kind with no instances: the line to write for that kind; Work: tasks live in documents, this is a view → the `- [ ] task:…` line; Questions: `question:` blocks and what agents ask; Goals: `goal:` lines; Constitution: product-level constraints that go into every agent's system prompt → add the first; Types: the product's own vocabulary → Add type; Sessions: every agent run with its log → needs Claude Code or Codex; Graph: appears once blocks reference each other; Search: three example questions as clickable chips.
- [ ] **Step 3: Keep filtered-empty apart** from never-had-any: a filter that matches nothing keeps a short "nothing matches" line, not the teaching state.
- [ ] **Step 4: Verify** — playwright screenshots of every surface on the empty scratch product (both themes), and of the same surfaces on `wye` to confirm populated pages are unchanged. vitest and tsc pass. Delete the scratch product.

### Task 5: Wye's own definition, docs, end-to-end check

**Files:**
- Modify: `data/products/wye/projects/v2/docs/` — the page of the area (`app-shell.md` / `requirements-shell.md`; read them and pick where the shell's requirements and decisions live), `README.md` (Getting started: the welcome, Quick start, Help — three or four sentences), `docs/reference.md` (the onboarding route, `_settings.json` `onboarding`, `POST /api/products` `repo`)
- Create: `docs/screenshots/quick-start.png` (from the scratch product)

- [ ] **Step 1: Cards** — proposed `req:` cards for welcome, quick start, empty states, help, product-from-code; `decision:` cards (each in its own ```yaml fence, `status: proposed`, `date: 2026-10-05`, `by: alex`, with indented `context:` / `choice:` / `alternative:` lines) for: live checklist over a seeded document; no sample product; no overlay tour; marks per machine in `_settings.json`, not in the product; Quick start is an app route, not a document. Write with `wye doc` / `wye doc write --section` as the `wye-agent` skill describes. Run `node scripts/cards.js --write` if new source files need cards (see what `npm test`'s cards test demands).
- [ ] **Step 2: `wye build --root data/products/wye && wye check --root data/products/wye`** — clean. `wye get decision:<each>` resolves.
- [ ] **Step 3: `npm test`** (root) — passes; report the output's tail.
- [ ] **Step 4: Walk the whole flow** in a browser as a new person: second server on an empty data root → Welcome → From your code → Quick start → new document → write a `req:` line → steps tick → Help → dismiss. Record what was confusing or broken, with screenshots; fix copy and small defects, report anything larger.
