# Wye contract

You are working for a product whose knowledge lives in Wye: goals, requirements, rules, decisions, entities,
questions and tasks kept as markdown documents (PRD, technical design, test design, plan and others) with a graph on
top. Wye is the single source of truth for what the product does and why. Code implements it; it does not
replace it.

## Read from Wye before you act

- Your first message carries **Constraints in force**: every rule, constraint, gate, approved decision, goal and open
  question that governs the request, computed from the graph (not a search). Read it first; cite its ids; when the
  request cannot respect one of them, say so with a `question:` block next to it instead of breaking it. The same
  for any text, mid-session: `wye packet --for "<what you are about to do>" [--ref id]`.
- Then read what Wye knows about the area: `wye context "<what you are about to do>"` (semantic search; superseded and
  retired knowledge is hidden unless `--all`), `wye resolve <link|id>` for anything referenced, `wye doc
  <product/project/doc>` for the full document, `ctx --root data/products/<product> packet --task "<sentence>"` for a
  token-budgeted slice.
- Cite node ids (`req:…`, `rule:…`, `decision:…`, `goal:…`, `task:…`) when you explain what you are doing. If the
  knowledge is thin or missing for the area, say so and record what you learn (below) rather than guessing.
- If the code contradicts Wye, do not silently follow the code: write a `question:` block next to the node it
  contradicts, and tell the person.
- Before you edit an approved or shipped node, run `wye impact <id> --after "<the new text>"`: it lists what the edit
  reaches (what refines it, what satisfies it, its content, what mentions it) and what each needs — update, rework,
  contradicts, ask. Make the updates it proposes or leave them as tasks (`wye work add`), and list both in your
  summary. Every edit of a typed node keeps its old value as a change record the person reviews in the Inbox.

## Write knowledge as typed blocks, in the document, marked for review

Knowledge lives in the documents as typed blocks. The Inbox and Questions views are not a separate store: they
show the blocks in the documents that nobody has approved or resolved yet. So:

- **Every decision** — made by the person in this conversation or by you — is a `decision:` block in the document
  it belongs to (a design doc's "Decisions" section, the tech design's decisions log), written **before you move
  on**, with `title`, `context`, `choice`, `alternatives`, `consequences`, `date`, `affects:` (what it touches),
  `by:` (who decided — the person's name, or `agent:<name>`), `evidence:` (where it came from: `session:<id>`, a
  document, a URL, a commit) and `status: proposed` (a person approves it in the Inbox). When it replaces an
  earlier decision, name it in `supersedes:` — approving the new one retires the old one; never edit or delete the
  old block. When the person says "let's do X instead" in chat, that is a decision: write the block, then confirm
  in one line that it is recorded (with its id).
- **Every constraint** — a rule about the product or how it is built that no code enforces ("local-first", "no
  hosting surface") — is a `constraint:` block (`statement`, `scope`, `rationale`, `status: proposed`); the
  approved ones are the Constitution in your system prompt. A **lesson** ("this broke because …") is a `lesson:`
  block (`statement`, `about`).
- **Every question** you cannot answer is a `question:` block where it arose (`q:` the question, `context:` why it
  matters, links to what it touches, `status: open`). Never write questions as prose, bullets or "Q1:" lines.
  The person answers with a decision block next to it and resolves the question.
- **Every requirement** is a `req:` block (`when`/`then`/`unless`, `status: proposed`); **every constraint the
  code enforces** a `rule:` block with `statement` and `source: file:line`; **every work item** a
  `- [ ] task:` line in the plan (or the document the work belongs to), `part of goal:…`.
- A document you write for the product therefore has no untyped decisions, questions, requirements or tasks.
  Prose explains; blocks carry what is decided, asked, required and to do. Check with
  `ctx --root data/products/<product> check` (0 errors) and re-read your document for prose that should be a block.
- Check first whether Wye already says it (`wye context`, `wye resolve`); refine an existing node (keep its
  id) instead of adding a second one.
- Block forms: a yaml card in a fenced ```yaml block (`- id: decision:<product>.<slug>` … one key per line, `>`
  for long text) or a prose line that starts with the id (`req:x When … #proposed`, `question:y Is …? #open`).
  Ids are `kind:<product>.<slug>`; ids in text become edges ("part of goal:x", "depends on entity:y").
- Types: the kinds are open. A product declares its own with a `type:` card (`extends: type:node`, `props:` with
  `name: string`, `manager: ref employee -(inverse)-> reports`, `members: list of person -(inverse)-> memberOf`);
  an instance is `team:<slug>` as a card or a prose line. Properties inherit along `extends`; a ref/list property
  is an edge named by the property and the inverse appears on the other side without being written. Read a
  type with `wye node type:<slug>`; `ctx check` reports missing required, undeclared and mistyped properties.
- What you MAY change without review: statuses and tracking fields of existing nodes — `wye node set task:x
  --status done`, `wye node set req:y --status shipped`, `wye node set goal:z --status at-risk --set owner=…`.
- The inbox folder (`wye inbox add`) is only for raw material that has no document yet: a pasted conversation, a
  meeting note. Not for decisions, questions or requirements.

## Which kind a block is

The kind is decided by what the block *is*, not by where it came from. Getting it wrong is the commonest mistake:

- A **requirement** (`req:`) is a behaviour a person can observe and test, in their words: *when* <trigger>, <the
  person or the product> <outcome>, *unless* <exception>. Its title names the outcome for the person ("A person sees
  the definition before anything is built"), never the mechanism. If the sentence describes how the system works
  inside — "Wye proposes the definition as blocks in their home documents, embedded on the plan" — it is not a
  requirement: it is a **rule** when the code enforces it (with `source:`), or a **decision** when it is a choice
  among ways to do it. A requirement has no component ids in its title and no implementation detail in its `then`.
- A **decision** (`decision:`) is a choice: `context` (what forced it), `choice`, `alternatives` (what was rejected
  and why), `consequences`, `affects:`. "We do X instead of Y because Z." Anything the person said in chat that
  settles a question is a decision.
- A **rule** (`rule:`) is an invariant the code enforces — a validation, a policy, a guarantee — with `statement`
  and `source: file#symbol`. A rule without a source is a wish.
- A **constraint** (`constraint:`) is a rule about the product or how it is built that no code enforces ("local
  first", "markdown is canonical"); approved ones are the constitution.
- A **question** (`question:`) is what the knowledge leaves open, with `q` and `context`; a **task** (`task:`) is a
  unit of work; a **goal** (`goal:`) is what a project sets out to achieve, refined by requirements.

One test before writing: could a person check this from outside the product, without reading code? Yes → a
requirement. No, and the code guarantees it → a rule. No, and someone chose it → a decision.

## Follow-ups and todos are task lines, never just chat

A "next step", "follow-up", "todo" or "later" that exists only in your message is lost. Before you finish, every
one of them is a task line in the project's plan document (`- [ ] task:<product>.<slug> What to do … part of
goal:<x>` under the matching section; the plan's path is given below), or in the document the work belongs to when
the person asked you to work there. Refer to them by id in your summary ("next: task:ontology.spike"). Questions
you cannot answer are `question:` blocks; answers you get from the person are `decision:` blocks.
- `wye work add "<text>" [--part-of <id>] [--ready]` writes such a line for you (under the node when one is named,
  else on the plan's Backlog); `wye work list [--unassigned | --mine <name> | --goal <id>]` is the Work view —
  every task of the product with its state and worker — so you can see what is already planned before adding to it.
  Never take a task that is not assigned to you unless it says `#ready` and you were started with `--take-ready`.
- Ids look like `kind:product.slug`; links in text become edges ("part of goal:x", "depends on entity:y").
- Anything indented two spaces under a node's line is that node's content — blocks of any kind, each a node with
  content of its own, to any depth. A sub-task is a task line indented under its task; no heading is needed.

## Before you finish

1. Every decision from this session is a `decision:` block (proposed). Every open question is a `question:` block.
   Every new requirement or rule is a block. Every follow-up you mention is a task line in the plan (or the
   relevant document); tasks you completed are `done`.
2. If you edited any knowledge document (only when asked), `ctx --root data/products/<product> check` is green.
3. Tell the person, in a few lines, what you changed in the code and what you sent to the inbox.
4. If you were started as a Wye session: `wye session log <id> "<line>"` as you go and end with
   `wye session done <id> "<summary>"`.
