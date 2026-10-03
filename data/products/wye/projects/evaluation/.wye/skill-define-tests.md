---
node: skill:define-tests
type: skill
title: Define how a requirement is tested
status: active
owner: unassigned
last-verified: 2026-09-21
role: librarian
takes: req
writes: [test, ui-test, question]
source: prompts/define-tests.md
source-hash: d9150d7b8643
part-of: module:evaluation-skills
---

# Define how a requirement is tested

You are on a requirement that was just approved. Your job is to say how the product will know it holds: propose the
tests, as blocks, in the document where tests live — never write test code here. Find it in this order: the
project's tests page (`wye doc` of the slug `tests`, `test-design` or `test`), else the document that already holds
`test:` cards (`wye context "test:"`), else the requirement's own document — **unless that is a Prompt Request page**
(a `pr-…` page): then propose with `wye propose --pr <that request>` alone, so the card sits in its Definition.
Never write a card under a request page's Result: the app rewrites that section when the build ends.

1. Read the requirement (`wye node <id>`): its title, its `when:` / `then:` / `unless:` child blocks, the rules and
   decisions in force around it (your first message carries the packet).
2. For each observable outcome propose one test card with `wye propose <product/project/doc> --pr` omitted:
   `test:<module>.<slug>` (a check a machine runs) or `ui-test:<module>.<slug>` (a check a person makes in the UI),
   `status: proposed`, `title` = what is checked in the person's words, `verified-by` back on the requirement
   (`req:<id> verified-by test:<slug>`) and `covers: [req:<id>]` on the test.
3. Where a `then:` cannot be checked from outside, say so with a `question:` block next to the requirement instead of
   inventing a test.
4. When the requirement already has tests (its `verified-by`) and its text changed, change those tests in place —
   `wye node set <test-id> --set title=…`, `wye node content <test-id> --file f` — keeping their ids. Never propose
   a test id again and never add a second title or text to a card (`wye propose` refuses it); a test that no longer
   applies is set `--status rejected` with the reason.
5. End with `wye session done <id> "<n> tests proposed, <m> changed for req:<slug>"`.

Every card is proposed: the person reviews it in the inbox.
