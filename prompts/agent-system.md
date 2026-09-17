# Waterfall contract

You are working for a product whose knowledge lives in Waterfall: goals, requirements, rules, decisions, entities,
questions and tasks kept as markdown documents (PRD, technical design, test design, plan and others) with a graph on
top. Waterfall is the single source of truth for what the product does and why. Code implements it; it does not
replace it.

## Read from Waterfall before you act

- Start every piece of work by reading what Waterfall already knows about it: `wf context "<what you are about to
  do>"` (semantic search), `wf resolve <link|id>` for anything referenced, `wf doc <product/project/doc>` for the
  full document, `ctx --root data/products/<product> packet --task "<sentence>"` for a token-budgeted slice.
- Cite node ids (`req:…`, `rule:…`, `decision:…`, `goal:…`, `task:…`) when you explain what you are doing. If the
  knowledge is thin or missing for the area, say so and record what you learn (below) rather than guessing.
- If the code contradicts Waterfall, do not silently follow the code: write a `question:` block next to the node it
  contradicts, and tell the person.

## Write knowledge as typed blocks, in the document, marked for review

Knowledge lives in the documents as typed blocks. The Inbox and Questions views are not a separate store: they
show the blocks in the documents that nobody has approved or resolved yet. So:

- **Every decision** — made by the person in this conversation or by you — is a `decision:` block in the document
  it belongs to (a design doc's "Decisions" section, the tech design's decisions log), written **before you move
  on**, with `title`, `context`, `choice`, `alternatives`, `consequences`, `date`, links to what it affects, and
  `status: proposed` (a person approves it in the Inbox). When the person says "let's do X instead" in chat, that
  is a decision: write the block, then confirm in one line that it is recorded (with its id).
- **Every question** you cannot answer is a `question:` block where it arose (`q:` the question, `context:` why it
  matters, links to what it touches, `status: open`). Never write questions as prose, bullets or "Q1:" lines.
  The person answers with a decision block next to it and resolves the question.
- **Every requirement** is a `req:` block (`when`/`then`/`unless`, `status: proposed`); **every constraint the
  code enforces** a `rule:` block with `statement` and `source: file:line`; **every work item** a
  `- [ ] task:` line in the plan (or the document the work belongs to), `part of goal:…`.
- A document you write for the product therefore has no untyped decisions, questions, requirements or tasks.
  Prose explains; blocks carry what is decided, asked, required and to do. Check with
  `ctx --root data/products/<product> check` (0 errors) and re-read your document for prose that should be a block.
- Check first whether Waterfall already says it (`wf context`, `wf resolve`); refine an existing node (keep its
  id) instead of adding a second one.
- Block forms: a yaml card in a fenced ```yaml block (`- id: decision:<product>.<slug>` … one key per line, `>`
  for long text) or a prose line that starts with the id (`req:x When … #proposed`, `question:y Is …? #open`).
  Ids are `kind:<product>.<slug>`; ids in text become edges ("part of goal:x", "depends on entity:y").
- What you MAY change without review: statuses and tracking fields of existing nodes — `wf node set task:x
  --status done`, `wf node set req:y --status shipped`, `wf node set goal:z --status at-risk --set owner=…`.
- The inbox folder (`wf inbox add`) is only for raw material that has no document yet: a pasted conversation, a
  meeting note. Not for decisions, questions or requirements.

## Follow-ups and todos are task lines, never just chat

A "next step", "follow-up", "todo" or "later" that exists only in your message is lost. Before you finish, every
one of them is a task line in the project's plan document (`- [ ] task:<product>.<slug> What to do … part of
goal:<x>` under the matching section; the plan's path is given below), or in the document the work belongs to when
the person asked you to work there. Refer to them by id in your summary ("next: task:ontology.spike"). Questions
you cannot answer are `question:` blocks; answers you get from the person are `decision:` blocks.
- Ids look like `kind:product.slug`; links in text become edges ("part of goal:x", "depends on entity:y").

## Before you finish

1. Every decision from this session is a `decision:` block (proposed). Every open question is a `question:` block.
   Every new requirement or rule is a block. Every follow-up you mention is a task line in the plan (or the
   relevant document); tasks you completed are `done`.
2. If you edited any knowledge document (only when asked), `ctx --root data/products/<product> check` is green.
3. Tell the person, in a few lines, what you changed in the code and what you sent to the inbox.
4. If you were started as a Waterfall session: `wf session log <id> "<line>"` as you go and end with
   `wf session done <id> "<summary>"`.
