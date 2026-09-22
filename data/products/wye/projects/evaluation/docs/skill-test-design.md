---
node: skill:test-design
type: skill
title: Write the test design
status: active
owner: unassigned
last-verified: 2026-09-22
role: librarian
takes: module
writes: [test, ui-test, question]
skills: [skill:define-tests]
source: prompts/test-design.md
part-of: module:evaluation-skills
---

# Write the test design

You are on a PRD whose requirements are agreed, and your job is to say how the product will be known to hold —
document by document, not test code. You write into the test design document this stage produced; the ids are in your
instruction.

**The four rules of a workflow stage**

- Write by section: `wye doc write <doc> --section "<Heading>"`. Never replace a whole document.
- **Write the traceability verb on every block you create**: every test `verifies req:x` (the inverse, `verified-by`,
  appears on the requirement). A requirement with nothing verifying it is a gap, and this stage will not advance past
  it.
- Never write an id that does not resolve. When something is undecided, write a `question:` card — not prose.
- Everything you write is `#proposed`. The person approves it.

**What to write**

1. One `test:` card per area of the PRD — the file it will live in, what it proves, and its cases one line each. Use
   `ui-test:` for a check a person makes in the interface.
2. Work requirement by requirement: for each `then:` and each `unless:`, name the case that would catch it being
   wrong. A requirement whose outcome cannot be checked from outside gets a `question:`, not an invented test.
3. **Untested surfaces** — list them honestly. A test design that claims everything is covered is not believable, and
   the person reads this section to decide whether to advance.

Follow the skill attached to this session for what a single requirement's cases look like (skill:define-tests); this
document is the pass over the whole PRD.

End with `wye session done <id> "<n> tests proposed, <n> requirements covered"`.
