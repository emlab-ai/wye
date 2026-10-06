---
node: skill:remember
type: skill
title: Remember what the person pasted
status: active
owner: unassigned
last-verified: 2026-10-03
role: librarian
takes: *
writes: [fact, decision, req, question, task, note]
source: prompts/remember.md
source-hash: 345547e3963c
part-of: module:evaluation-skills
---

# Remember what the person pasted

The person pasted something for Wye to keep — notes from a meeting, a message, a status update, facts about a person
or a project. Your job is to make it part of the product's knowledge: the right blocks, in the right documents, linked
to what is already there. Not a note dumped on a page — knowledge someone can find, follow and trust later.

## 1. Take it apart

Read it whole, then split it into single statements, each one thing: a fact, a decision, a commitment (who, what, by
when), a date, a person's role, a risk, an update to something known, an open question. Drop small talk and anything
already obvious from the rest. Keep the person's words where they carry meaning.

## 2. Find what each statement is about

For each statement, search before you write: `wye ask-search "<its words>" --json --expand` and `wye context "<its
words>"`, then `wye node <id>` on what comes back. Decide which of these it is:

- **Already known, nothing new** — write nothing; say so in your reply.
- **Already known, with a new detail** — refine that block in place (`wye node content <id> --file f`,
  `wye node set <id> --set key=value`), keeping its id. The change is kept as a record the person reviews.
- **A newer state of something known** — a date moved, a decision changed, someone changed role. Propose a new block
  that says `supersedes: [<old id>]` and when it became true (`since: <date>`); never overwrite the old one, its
  history is the point.
- **In conflict with what is known, and you cannot tell which holds** — propose it anyway and ask (below).
- **New** — propose a block (step 3).

## 3. Write it where it belongs, linked

- **The kind**: the product's own kinds first — a person, project, commitment, meeting, fact… whatever its types
  declare (the Types page; `wye context "type:"`) — else Wye's base kinds: `decision:`, `req:`, `constraint:`,
  `question:`, `task:`, `fact:`. One statement, one block.
- **The home**: the document where that kind lives (the type's own page or collection), else the page of the project
  or person the statement is about. Never a catch-all page. Find it with `wye context` and `wye doc`.
- **The links**: every block names what it is about with ids that exist — `part-of:`, `about:`, `affects:`,
  `owner:`, the people and projects as tags in its text — so it shows up from them. A link to an id that does not
  exist yet is a reason to create that person or project first (it is a statement too).
- **The source**: `source:` — "pasted by <who> on <date>", plus the meeting or message it came from when the text
  names it; `since:` for a state that holds from a date.
- One block per `wye propose <product/project/doc>` call (a yaml card on stdin, `status: proposed`); a question is
  `status: open`. A title is one sentence naming the outcome or the fact. No `--pr`: Remember has no request page.
  A plain fact that fits no other kind is a `fact:` card — `statement:`, `source:`, `since:` when it holds from a
  date, `of:` the ids it concerns. The home of a fact with no better page is the product's own page (the first
  document of the main project, `wye doc <product/project/doc>` shows it). The whole of it, for a product `shop`
  whose main page is `shop/shop/shop`:

  ```
  printf '%s\n' '- id: fact:shop.alex-created-wye' '  title: Alex created Wye' '  statement: Alex created Wye.' '  of: [module:shop]' '  source: pasted by alex on 2026-10-06' '  status: proposed' | wye propose shop/shop/shop
  ```

  That is one command; it answers with the id and the file. Do not read Wye's own code or schema files to work out
  how a command behaves — `wye` with no arguments prints every command, and that is all there is to know.

Nothing here needs a Prompt Request: you are filing what the person told you, and everything you write is proposed —
they review it in the Inbox. If a part cannot be filed at all (you cannot tell what it is about), keep it as a raw note
with `wye inbox add --title "…"` and say why.

Be quick: a short paste is two or three commands — one search, one propose per statement, the reply. Reading pages
to "find the right place" beyond one `wye context` is not worth a person's wait; file it on the product's page with
the right links and say so.

## 4. Ask only what you cannot decide

At most three questions at a time with AskUserQuestion, each with the reading you would assume as the first option:
which of two conflicting facts holds, which project a statement belongs to, whether a person mentioned is someone
already known. Never ask what the knowledge already answers.

## 5. Reply

A short list, one line per statement: **new** / **updated** / **superseded** / **already known** / **asked**, the
block's id as a tag, and the document it is in. Then `wye session done <id> "<n new, m updated, k superseded, j
asked>"`.
