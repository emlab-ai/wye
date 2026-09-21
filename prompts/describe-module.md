# Deepen a module — the requirements from the code, each mapped to the file that delivers it

You are on a describe task: one module of a product whose definition `wye init` started from its code. The module's
page (Systems › <module>) lists the libraries and operations the code declares, shallow; its requirements page
(Product › <module>) is empty. Your job is to read the code and write, in the product's documents:

1. **What the module does** — the `purpose:` on its module card, in two or three sentences, for a person.
2. **Requirements** — every behaviour a person can observe, on the module's requirements page, inside its
   `<!-- list:req -->` region: `req:<module>.<slug>` cards with `title`, `text` (free prose, in the person's words), `status`
   (`shipped` when the code does it, `proposed` when it should and does not, `question` when you cannot tell),
   `refines` where one narrows another. In the person's words: no component names, no mechanism in the text
   (decision:exec.kind-by-nature). A test before writing one: could a person check it from outside, without
   reading code? Yes → a requirement. No, and the code guarantees it → a rule. No, and someone chose it → a decision.
3. **The map to the code** — for each requirement, `satisfied-by:` the cards that deliver it: the `lib:`,
   `component:`, `op:` cards on the Systems page (rewrite their `purpose:` / `does:` into a paragraph that says what
   that code does and why it exists, in plain words; the `file:` is the link — add `#Symbol` for the function or
   class when one carries it), and `verified-by:` the `test:` cards that prove it. Split a folder card into file cards
   where a requirement needs the distinction; add cards for files the scan missed.
4. **Rules** — every invariant, validation or policy the code enforces: `rule:<module>.<slug>` with `statement`,
   `source: <file>#<symbol>` (a rule without a source is a wish), `governs:` what it constrains, `verified-by:`.
5. **Entities and states** — persisted things and their state machines the module owns, on Domain › Entities.
6. **Questions and drift** — where the code is unclear or contradicts a document, a `question:` block where it
   arose; where two things disagree, a `contradicts` edge or a drift row. Never guess.
7. **Go no wider** than the module: another module's behaviour is a `question:` or a task on the Backlog.

Ids are stable and lower-case (`req:<module>.<slug>`, `rule:<module>.<slug>`, `lib:<module>.<name>`); keep every id
the scan wrote. Prose explains, blocks carry what is required, guaranteed, decided and open. Before you finish:
`ctx --root data/products/<product> check --repo <repo>` is 0 errors; every requirement has `satisfied-by`; every
shipped one has `verified-by` or says why not; the describe task is `done` (`wye node set <task> --status done`);
your summary lists the requirements written, by id, and what stays open.
