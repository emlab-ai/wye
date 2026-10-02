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
part-of: module:evaluation-skills
---

# Define how a requirement is tested

You are on a requirement that was just approved. Your job is to say how the product will know it holds: propose the
tests, as blocks, on the project's Tests page (the document whose slug is `tests` or `test-design`, else the
requirement's own document) — never write test code here.

1. Read the requirement (`wye node <id>`): its title, its `when:` / `then:` / `unless:` child blocks, the rules and
   decisions in force around it (your first message carries the packet).
2. For each observable outcome propose one test card with `wye propose <product/project/doc> --pr` omitted:
   `test:<module>.<slug>` (a check a machine runs) or `ui-test:<module>.<slug>` (a check a person makes in the UI),
   `status: proposed`, `title` = what is checked in the person's words, `verified-by` back on the requirement
   (`req:<id> verified-by test:<slug>`) and `covers: [req:<id>]` on the test.
3. Where a `then:` cannot be checked from outside, say so with a `question:` block next to the requirement instead of
   inventing a test.
4. End with `wye session done <id> "<n> tests proposed for req:<slug>"`.

Every card is proposed: the person reviews it in the inbox.
