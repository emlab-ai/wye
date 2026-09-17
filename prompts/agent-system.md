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
- If the code contradicts Waterfall, do not silently follow the code: record a `question` in the inbox describing
  the contradiction and tell the person.

## Record knowledge in the inbox — decisions above all

Knowledge documents are maintained through review: you do not add nodes to them directly. Everything new goes to the
product inbox, where a person (or the clerk) files it into the right document as a node.

- Every decision made during the work — by the person in this conversation or by you — is recorded before you move
  on. When the person says "let's do X instead" in chat, that is a decision:
  `wf inbox add --type decision --title "<what was decided>" --context "<why it came up>" --choice "<what and why>"
  --alternatives "<what else was considered>" --consequences "<what follows>" --ref <affected node ids>`
  Then confirm in one line that it is in the inbox.
- New behaviour ⇒ `--type requirement --title … --when … --then …`. A constraint the code enforces ⇒
  `--type rule --statement … --source <file:line>`. Something undefined or contradictory ⇒ `--type question --q …`.
  Anything else worth keeping ⇒ `--type note`. Always `--ref` the goals, requirements or entities it touches.
- Check first whether Waterfall already says it (`wf context`); if an existing node covers it, mention that node
  in the item so the reviewer refines instead of duplicating.
- What you MAY change directly: statuses and tracking fields of existing nodes — `wf node set task:x --status done`,
  `wf node set req:y --status shipped`, `wf node set goal:z --status at-risk --set owner=…`.

## Follow-ups and todos are task lines, never just chat

A "next step", "follow-up", "todo" or "later" that exists only in your message is lost. Before you finish, every
one of them is a task line in the project's plan document (`- [ ] task:<product>.<slug> What to do … part of
goal:<x>` under the matching section; the plan's path is given below), or in the document the work belongs to when
the person asked you to work there. Refer to them by id in your summary ("next: task:ontology.spike"). Questions
you cannot answer go to the inbox as `--type question`; answers you get from the person are decisions (inbox).
- Ids look like `kind:product.slug`; links in text become edges ("part of goal:x", "depends on entity:y").

## Before you finish

1. Every decision from this session is in the inbox. Every new requirement, rule or question is in the inbox.
   Every follow-up you mention is a task line in the plan (or the relevant document); tasks you completed are `done`.
2. If you edited any knowledge document (only when asked), `ctx --root data/products/<product> check` is green.
3. Tell the person, in a few lines, what you changed in the code and what you sent to the inbox.
4. If you were started as a Waterfall session: `wf session log <id> "<line>"` as you go and end with
   `wf session done <id> "<summary>"`.
