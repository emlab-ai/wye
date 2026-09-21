# Import a document

You are on an import task: one markdown document that a person brought into the product as it was — a PRD, a
design note, meeting notes, a glossary, a list of facts — now a page with `status: imported`. Your job is to turn
what it *states* into the product's knowledge, in place, without losing a sentence of it, and to leave everything you
add for the person to approve.

## Read first

0. The page's front matter may carry `brief:` — the person's own instruction for this import ("only the
   requirements", "treat every bullet as a fact", "these are meeting notes: decisions and tasks, nothing else").
   It comes first: where it narrows or redirects the steps below, follow it.

1. `wye doc <product/project/doc>` — the whole document. Read it twice; note what it asserts (behaviours, rules,
   choices, things, facts, work, open points) and what is only narrative.
2. `wye graph get type:node` and the Types page (`wye graph search "type:"`) — the kinds this product already has,
   with their `purpose`. Base kinds you can always use: `req` (a behaviour a person can observe: when / then /
   unless), `rule` (an invariant the code enforces — needs a `source`), `constraint` (a rule no code enforces),
   `decision` (a choice someone made, with context / alternative / consequence), `entity` (a persisted thing, with
   fields), `value` (an enum or value object), `goal`, `task`, `question`, `lesson`. Product kinds (`fact`, `city`,
   `supplier`, `kpi` …) are `type:` cards on the Ontology page.
3. `wye context "<the document's title and first paragraph>"` and `wye context` on each major section — the
   knowledge nearest to it. What already exists is linked to, refined or superseded, never written again
   (constraint:wf2.one-defining-place).

## Decide the kind of each thing

The test for each statement, in order:

- Could a person check it from outside, without reading code? → `req:` with `when:` / `then:` / `unless:` content.
- Does it say how things are guaranteed, and the code does it? → `rule:` (with `source:` when you know the file;
  else `constraint:`).
- Is it a rule about the product or how it is built that no code enforces? → `constraint:`.
- Did someone choose it among alternatives? → `decision:` with `context:` and `alternative:` where the text gives
  them.
- Is it a thing the product keeps, with fields and states? → `entity:` (and `state:` for a state machine).
- Is it a true statement about the domain that is none of the above — "Bengaluru is in Asia", "the warehouse
  closes at 18:00"? → the product's `fact:` type; propose it if it does not exist.
- Is it something to do? → `task:` line, `#ready` only if it is defined enough for a runner.
- Is it unresolved? → `question:`.
- Is it a kind of thing the text talks about many times and Wye has no type for (cities, suppliers, KPIs, screens
  of a legacy app)? → propose the type first: `wye type add <slug> --extends node --purpose "…"` (proposed, on the
  Ontology page), then its instances with `wye node add <slug>:<instance> --title "…"` — they go to the type's
  collection document; on this page they become tags.

Narrative — background, motivation, the story of how the text came to be — stays as prose. Do not invent: a
statement the text does not make is not knowledge; a guess is a `question:`.

## Rewrite the document in place

`wye doc write <product/project/doc> --file <new.md>` (it checks the hash: read again if it changed under you).

- Keep every sentence. A statement that becomes a block becomes it *where it stood*: a prose node
  (`req:<doc>.<slug> When … #proposed`) or a yaml card followed by its content blocks, in the same section, the
  surrounding prose untouched. Headings stay headings.
- Ids: `<kind>:<doc-slug>.<short-slug>` for base kinds; for product types `<type>:<slug>`. Never reuse an id that
  exists (`wye node <id>` says).
- Every block you add: `status: proposed` (or `#proposed` on a line), `by: agent:<your name>`, `evidence:
  [session:<your session id>]`. Link to what `wye context` found: `refines` an existing requirement rather than
  restating it, `related-to` the module or entity it is about, `part-of` this page's module.
- A statement that contradicts existing knowledge is still written — as a block with a `question:` beside it
  naming the contradiction; the person decides.
- Front matter: set `status: analysed`; keep `source:`. If the page's title is wrong, fix `title:`.
- Then `wye check --root data/products/<product>`; every error you introduced is yours to fix.

## Finish

`wye session done <id> "<summary>"`: how many blocks of which kinds, the types you proposed, the questions you left,
what you did not convert and why. The person sees all of it in the Inbox, block by block.
