# Import a module from its code

You are on an import-from-code task: a person pointed at a folder of source and wants its definition in the
product — on the page this task sits on, under the parent they chose. The page exists, empty but for this task;
its front matter says `source: code:<folder>` and may carry `brief:` — the person's own instruction, which comes
first wherever it narrows or redirects what follows. Everything you write is proposed; the person reviews it in the
Inbox.

## Read first

1. The page (`wye doc <product/project/doc>`) and the product's types (`wye graph search "type:"`), then
   `wye context "<the module's name and what its folder is called>"` — what the product already knows about this
   area. What exists is linked to or refined, never written again (constraint:wf2.one-defining-place).
2. The code. Survey the folder before reading files: its layout, entry points, the names of things. Then read what
   matters — the public surface (routes, commands, exported functions), the models and migrations, the tests, the
   comments at the top of files. You have the file system; use it. A big folder is described by its parts: pick the
   five to ten areas a person would name and go area by area.

## Write the page

The page becomes the module's definition, in this order, as blocks (cards or prose nodes) the person can approve
one by one. Ids: `<kind>:<page-slug>.<short-slug>`.

1. **Purpose** — the page's module card: `purpose:` in two or three sentences, for a person: what the module does
   and for whom, not how.
2. **Requirements** — `## Requirements`, one `req:` card per behaviour a person can observe from outside, with
   `when:` / `then:` / `unless:` content lines, in the person's words — no component names, no mechanism in the
   text (decision:exec.kind-by-nature); `status: shipped` when the code does it, `proposed` when it should and does
   not, `question` when you cannot tell; `refines` where one narrows another; `satisfied-by:` the `lib:` / `op:` /
   `component:` cards below that deliver it; `verified-by:` its tests.
3. **Rules** — `## Rules`, `rule:` cards for what the code guarantees — validations, invariants, calculations,
   limits — each with `statement:` and `source: <file>#<symbol>`; `governs:` the requirement or entity it protects.
   A calculation is a rule with the formula in its statement.
4. **Entities and states** — `## Entities`, `entity:` cards for the things the module keeps (`fields:`, `source:`),
   `state:` cards for their state machines (`states:`, `transitions:`), `value:` for enums.
5. **Operations and code** — `## Operations`, `op:` cards for the public surface (`args`, `does`, `source`), and
   `lib:` cards for the files that matter (`file:`, `purpose:` — what that code does and why it exists). Every card
   here is what a requirement's `satisfied-by` points at.
6. **Tests** — `## Tests`, `test:` cards (`file:`, `cases:`) — what the tests verify, so requirements can say
   `verified-by`.
7. **Open questions** — `## Open questions`, `question:` blocks for what the code leaves unclear or contradicts
   the product's knowledge.

Big module: make child pages for the areas (`wye doc create <product/project/<page-slug>-<area>> --title "…"
--parent <page-slug>`) with the same sections, and keep the parent page's Requirements as the module-level
behaviours with `refines` down to the areas.

Write through `wye doc write` (hash-checked; read again if it changed under you). Every block: `status`,
`by: agent:<your name>`, `evidence: [session:<your session id>, <file>]`. `wye check --root data/products/<product>`
before you finish; every error you introduced is yours to fix.

## Finish

Set the page's `status: analysed` (front matter). `wye node set <this task> --status done`. `wye session done <id>
"<summary>"`: what the module is, how many requirements / rules / entities / operations / tests you wrote, the
questions you left, what you did not cover and why.
