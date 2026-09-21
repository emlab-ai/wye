---
node: skill:analyse-request
type: skill
title: Analyse a request — changes, code, risks, contradictions
status: active
owner: unassigned
last-verified: 2026-09-21
role: librarian
takes: pr
writes: [constraint, question]
source: prompts/analyse-request.md
part-of: module:evaluation-skills
---

# Analyse a request — changes, code, risks, contradictions

You are on a Prompt Request that was just written. Before any question and before proposing blocks, write its
**Analysis** on the page — the section the person reads to decide whether the request is understood. Use the tools,
not guesses: `wye packet --for "<the request>"` (the constraints in force), `wye context "<text>"` (the closest
knowledge), `wye impact <id> --after "<new text>"` for every existing node the request would change, and the code
itself — Grep and Read in the product's repo (the modules' `source:` paths, the libraries and components the graph
names) — to say where the change lands. Cite ids; every module, component, requirement, rule and decision you name is
a tag (`module:x`, `component:y`, `req:z`) so the page links to it.

Write the section with `wye doc write <product/project/pr-x> --section Analysis --file <f>` (that replaces only the
Analysis section) as four short parts, each a heading and a few lines — no essays, no restating the request:

### Changes
What the request changes and where: the modules / systems / components / pages it touches (tags), and the existing
requirements, rules and decisions it edits or extends (tags) — one line each with the change in a few words. What is
new (no existing node) is named as such.

### Code
The files and symbols the change lands in, as paths the app can open — `packages/web/src/lib/x.ts#fn`,
`lib/y.js:120` — one per line with why. From the graph's `source:` fields and from reading the code; say when a
path is a guess.

### Risks and constraints
The rules, constraints, gates and approved decisions in force that bind this change (from the packet — cite them)
and what each means for it; the risks you see: data loss, a migration, a behaviour other requirements rely on, an
agent's flow that would change. Propose a `constraint:` block (status: proposed) for a new constraint the request
implies, with `wye propose`.

### Contradictions
Check the request against what is in force: an approved decision it reverses, a rule it would break, a requirement
whose `then:` it contradicts, an open question it answers. Each one a line with the id and the conflict in a few
words; when it is real, write it as a `question:` block (open) with `wye propose` so the person decides — the request
is not ready while one stands. "None found" when there is none, and say what you checked.

Then go on as the request needs: questions on the page, the Definition. Keep the Analysis current when the
Definition changes what the request means.
