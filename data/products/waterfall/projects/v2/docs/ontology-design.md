---
node: module:ontology-design
type: module
title: Ontology — design
status: proposed
owner: unassigned
last-verified: 2026-09-17
part-of: module:ontology
sources:
  - lib/parse.js                      # what the graph is today: kinds, verbs, fields, prose nodes
  - schema/kinds.yaml                 # the closed list of kinds and verbs this design opens up
  - packages/web/src/lib/graph.ts     # incoming edges = the back links the UI already shows
  - packages/web/src/lib/anchors.ts   # block hashes = the ids anonymous blocks already have
---

# Ontology — design

Research and a proposal for the idea in module:ontology: every block in every document is a graph node; every node has a type, properties, links and content; types inherit from types; a typed collection on one side is a back link on the other side, automatically. This document says what that means for Waterfall, what other systems do, what to keep from the current graph and what to change, in three phases that each ship on their own.

The decisions this draft makes on its own are blocks in §Decisions and open questions, proposed until a person approves them. All three phases shipped on 2026-09-17 (commits 085892a parser, 7f42579 web and CLI, c513c75 blocks); §Implemented below says what the code does and which rules it enforces, and the worked example lives in module:ontology. The four questions stay open: the implementation follows the design's assumptions and each assumption is a proposed decision that resolves its question.

##

![Annotated image](drawings/drawing-mu5xzn4d.excalidraw)

## The idea in one paragraph

Waterfall today has a fixed vocabulary: fourteen kinds (`req`, `rule`, `entity`, `task`, …), a fixed set of verbs (`refines`, `satisfied-by`, `part-of`, …) and a parser that knows both by heart. That is right for the product-knowledge core, and wrong the moment a product wants to talk about its own things — people, teams, customers, suppliers, venues. The ontology model turns the fixed vocabulary into the *base* of an open one: kinds become **types**, types are **nodes** you can write in a document, a type can **extend** another type and inherit its properties, a property can hold a **reference** (one node) or a **collection** (many nodes) of a given type, and every reference has a named **inverse** the graph shows on the other side without anyone writing it. `person` is a type; `employee` extends `person`; `manager` extends `employee` and adds `team`; `team` has `members: collection of person` with inverse `memberOf`; team:platform and person:ana are instances, and Ana's page shows *memberOf: *team:platform although nobody typed it on her line.

## What other systems do

| System | Unit | Types | Inheritance | Properties | Links and back links | Worth borrowing |
|---|---|---|---|---|---|---|
| Tana | every node is a node (fields, views, tags are nodes too) | supertags | supertag *extends* supertag; a node can carry several tags | fields declared on the tag, inherited and merged; parent fields sort first | field of type "reference"; references show on the target as back references | the "everything is a node" stance, `extends`, and field merging order |
| Notion | pages in databases | a database is the type | none | properties on the database; every row shares the schema | *relation* property to another database, optionally *two-way* — the paired property appears on the other database with its own name; *rollup* reads through a relation | named two-way relations: the inverse has its own name and is a first-class property on the other side |
| Anytype | objects | types | none (types are flat) | relations are global, reusable, typed (text, date, object of type X, …) | object relations, back links section | relations as reusable named things, not per-type keys |
| OWL / RDF | triples | `rdfs:Class` | `rdfs:subClassOf` (multiple) | properties have `domain` and `range` | `owl:inverseOf`; back links are just triples read the other way; open world: unknown facts are not false | domain/range = "a property of type X holding type Y", `inverseOf`, and the open-world attitude (ad-hoc properties allowed) |
| schema.org | items | types in a tree | single-parent tree plus multi-typing | `domainIncludes` / `rangeIncludes` | `inverseOf` on a few properties | a base ontology shipped with the tool that products extend |
| Palantir Foundry | objects | object types | interfaces (shared property sets), no extends | property types (string, date, geo…) | *link types* with cardinality one/many on each side; each side has a name | link types carry cardinality both ways; names on both sides |
| Obsidian / Dataview | notes | none (tags, folder) | none | frontmatter, untyped | wikilinks; back links pane | nothing new — Waterfall already has block links and incoming edges |

Two patterns are constant across the good ones: (1) the schema is data of the same kind as the content — a type is a node, a property is a node (Tana, Anytype, OWL) — and (2) a link has a name on both ends (Notion two-way, Foundry, OWL). The rest is taste.

Sources: Tana [nodes, fields and supertags](https://tana.inc/articles/intro-to-nodes-fields-and-supertags), [when to use extend](https://tana.inc/articles/when-to-use-extend-in-supertags), [nodes and references](https://tana.inc/docs/nodes-and-references), [property inheritance](https://answer-hub.blog/tana-supertag-inheritance-guide); Notion relations and rollups, Anytype relations, OWL 2 primer, schema.org data model, Foundry ontology — from the author's knowledge, not re-checked online this session.

## What Waterfall already has

Read against the idea, the current graph (`lib/parse.js`, `schema/kinds.yaml`) already delivers more than half of it:

- **Node with type, properties, content, links.** A yaml card or a prose node is `{id, kind, title, status, body, edges}`; body keys are the properties; `kind` is the type. Verbs on typed keys become edges (`satisfied-by:`, `part-of:`, …); ids and phrase links in prose become edges with an inferred verb, else `related-to`.
- **Ids are stable and typed.** `kind:slug`; a line that starts with an id defines that node (rule:prose-nodes). The kind prefix is the type.
- **Fields are nodes.** Every entity's `fields:` block generates `field:<entity>.<name>` nodes with `has` and `typed-as` edges (req:wf.graph.fields). That is a property-as-node model, for one kind only.
- **Back links exist, unnamed.** `indexGraph` keeps incoming edges; the peek panel and node page list them under the forward verb ("satisfied-by ← req:x"). What is missing is a name for the inverse (`satisfies`) and the promise that it is a property on the target.
- **Anonymous blocks have ids.** rule:block-links gives every paragraph a stable `#b-<hash>` anchor. They are addressable but not nodes: they carry no type, no properties and no edges of their own (a link in plain prose relates the *document*, not the block).
- **Documents are nodes with a tree.** `module:` nodes; `part-of:` in frontmatter builds the document tree; `has` edges come from `submodules:`.
- **A closed vocabulary.** `KINDS` and `EDGE_KEYS` are constants in the parser; `ID_RE` only recognises those prefixes; `schema/kinds.yaml` documents them. A product cannot add `person:` or `team:` today: the token is not an id, the key is not an edge.

The gaps, in the order the idea names them: (a) user-defined types, (b) inheritance of properties across types, (c) typed collections with a named inverse, (d) every block a node.

## Proposal

### Model

Five words, all of them nodes:

| Term | What it is | Id form | Example |
|---|---|---|---|
| **node** | anything with an id: a card, a prose line, a document, a block, a type, a property | `kind:slug` (kind = type slug) | req:wf2.ui.node-page, person:ana |
| **type** | a kind. Declares which properties instances have and which type it extends | `type:<slug>` | type:person, type:employee |
| **property** | a named, typed slot on a type; instances fill it | `prop:<type>.<name>` (generated, like `field:` today) | prop:team.members |
| **link** | a property whose value type is a node type (one or many); the property name is the verb | edge `from -(name)-> to` | `team:platform -(members)-> person:ana` |
| **inverse** | the name a link has when read from the target; declared once on the property | edge `to -(inverse)-> from`, generated | `person:ana -(memberOf)-> team:platform` |

type:node is the root: every type extends it, directly or through a chain. Its properties are the ones every node has today: `title`, `status`, `owner`, `text`, and the generic links `related-to` (inverse `related-to`), `mentions` (inverse `mentioned-by`), `part-of` (inverse `has`).

### Types are nodes, written in a document

A type is a yaml card like any other. The base types ship with Waterfall as a document, `base-ontology.md`, that any product includes; the fourteen kinds of `schema/kinds.yaml` are its cards, unchanged in name and required keys. A product adds its own types in any document — typically one called `ontology.md`, which is what module:ontology already is.

```markdown
- id: type:person
  extends: type:node
  props:
    name: string          # required
    email: string?
    role: string?

- id: type:employee
  extends: type:person
  props:
    startDate: date
    manager: ref employee   -(inverse)-> reports

- id: type:manager
  extends: type:employee
  props:
    team: ref team          -(inverse)-> leads

- id: type:team
  extends: type:node
  props:
    members: list of person -(inverse)-> memberOf
```

(The fence above is `markdown`, not `yaml`, so the current parser does not read it as cards; the real file would use a yaml fence.)

Property value types: `string`, `text` (multi-line prose), `number`, `date`, `month`, `bool`, `enum [a, b, c]`, `ref <type>`, `list of <type>` (a collection), and `list of string` etc. A trailing `?` marks optional; without it the property is required and `ctx check` warns when an instance lacks it — the same contract required/recommended keys have today.

### Instances keep `kind:slug`

An instance of type:team is team:platform, an instance of type:person is person:ana. The kind prefix *is* the type; the parser's `KINDS` list stops being a constant and becomes "the slugs of all `type:` nodes in the product plus the base ontology". `ID_RE` is built after the type pass, so a second parse pass is needed (types first, then everything else) — cheap, the graph is in memory anyway.

An instance may fill properties the type does not declare (open world, as OWL and Tana allow). `ctx check` reports them as *undeclared property* warnings, never errors: a product learns its schema by writing instances first and lifting the common keys into the type later.

```markdown
- id: team:platform
  name: Platform
  members: [person:ana, person:bo]

- id: person:ana
  name: Ana
  startDate: 2026-02-01

person:bo Bo joined in March (startDate: 2026-03-09, manager: person:ana)
```

The prose form works unchanged: text after the id is `text`, `#tag` is status, the trailing `(key: value)` group carries other properties, and a `ref`-typed key in that group becomes an edge with the property name as verb.

### Inheritance

Resolution is at parse time, per instance:

1. Walk `extends` up to type:node; a cycle or an unknown parent is an *error*.
2. The instance's effective properties are the union of the chain's `props`, parent first (Tana's order), child declarations overriding the parent's for the same name.
3. An override may only *narrow*: make optional required, or narrow `ref person` to `ref employee`. Widening is an error.
4. `ctx check` validates each instance's body against its effective properties: required present, value parses as its type, `ref`/`list of` targets exist and have the right type (transitively: a `person` slot accepts an `employee`).
5. Edges from instances also carry the property name as verb, so `manager: person:ana` is an edge `-(manager)->` — property names are verbs, which is what `EDGE_KEYS` already does by hand for the base kinds.

Type membership is transitive: person:ana is-a person; employee:ana would be an employee *and* a person, so `list of person` accepts her. Which raises the one hard question in this design — see Q1 below: an instance has exactly one kind prefix, so an employee is written employee:ana, never both person:ana and employee:ana. Renaming a person to an employee is an id change, with all that implies for links. The alternative (a `type:` property on a `node:` id, Tana's multiple tags) is listed in the inbox as the rejected alternative.

### Collections and inverses

A `list of <type>` property is a collection: the instance lists the member ids, the parser emits one edge per member with the property name as verb. `-(inverse)-> name` on the property declares the back link's name; the parser generates the reverse edge as a *virtual* edge (present in the graph, never written to markdown, marked `generated: true` so the writer never tries to serialise it — the same way `field:` nodes and `mentions` edges are generated today).

On the target's page the inverse shows as a property: Ana's card lists `memberOf: team:platform`, `reports: person:bo`. In the peek panel "Relations" groups by inverse name instead of "← verb". A property without a declared inverse gets a default inverse `<name>-of` (`manager-of`), so every link has a name on both ends, as Foundry and Notion insist.

The base ontology declares inverses for the existing verbs so nothing changes for the current documents but the labels get better: `refines`/`refined-by`, `satisfied-by`/`satisfies`, `verified-by`/`verifies`, `governed-by`/`governs` (already both exist as separate verbs — the base ontology unifies them into one property with an inverse), `gated-by`/`gates`, `part-of`/`has`, `depends-on`/`depended-on-by`, `contradicts`/`contradicts`, `resolves`/`resolved-by`, `related-to`/`related-to`, `mentions`/`mentioned-by`.

Cardinality on the inverse side is inferred: a `ref` on N instances gives the target a collection (`reports` is many because many employees name one manager); a `list of` gives each member a `ref` or a collection depending on whether the type declares the target unique (`unique` modifier, phase 2).

### Every block is a node

Today a paragraph without an id is an anchored block (rule:block-links) that belongs to the document. The ontology says it is a node of type:block, the document `has` it, and its links are its own. Concretely:

- Every top-level block (paragraph, list item, heading, table, code fence) gets id `block:<doc>.<hash>` where hash is the existing anchor hash (`anchors.ts`); a block whose first token is an id keeps that id — a named node *is* its block.
- The document node `has` its blocks in document order; a heading `has` the blocks under it; a list item `has` its nested items. So the document tree becomes a node tree, and "children" is a property with inverse `parent`.
- A link on a phrase in a plain paragraph becomes an edge from the *block* (today: from the document). The document still reaches it through `has`, so nothing that works today stops working.
- Block nodes are not listed in the rail, search or graph views by default (same as `field:` and `mentions` today): they exist for addressing, links and future per-block properties (comments, a status on a paragraph, a block typed later by adding an id in front of it).

Cost: a graph of 3 344 lines becomes roughly 1 500 more nodes. The parser is linear; the web index is a Map; `ctx packet` and search already filter by kind. The viewer's `data.js` grows — the site build should drop `block:` nodes unless asked. This is the phase with the least value per line of code, which is why it is last.

### The graph editor: where the UI has to get to

The graph already says it (req:ontology.blocks): a document is a node, every block in it is a node, a typed block is a node with properties and edges, and `has` makes the document → heading → block tree a node tree. The editor does not show it yet — a block reads as a node only through its tag or pill, and a plain paragraph has no way to be opened at all. The goal below names the destination; the tasks under it are the steps, each shipping on its own. plan:plan-still-bad-now-need-click-tag does the first (req:wf2.ui.block-select).

```yaml
- id: goal:ontology.graph-editor
  title: The document is a graph editor
  description: >
    Every block of a document behaves as the node it is: a click on any part of it selects it and the context column
    shows the node — its properties, its edges, what is under it; a plain paragraph is a block node with the same
    treatment; any node can carry child nodes — a comment, a question, a decision, an instance of any type — written
    under it in the document and shown under it in the column; links between nodes are edges the person can follow and
    make from either side. Reading and writing stay markdown: the tree is what the parser already builds.
  status: proposed
  owner: unassigned
  part-of: module:ontology-design
  depends-on: [req:ontology.blocks, req:wf2.ui.node-page]
- id: question:ontology.child-nodes
  title: How is a child node — a comment on a block — written in the markdown?
  q: >
    A comment on a paragraph or a typed block is a node the parent `has`. Is it a nested list item under the parent
    (`  - comment:x …`, the form the parser already treats as a child of a list item — but a paragraph has no nested
    items), a yaml card with `on: block:<doc>.<hash>` anywhere in the document, or a sidecar the document does not
    show? The answer decides what the editor draws under a block and what an agent writes.
  context: >
    goal:ontology.graph-editor — "any node can have child nodes, like comments"; the person's request on
    plan:plan-still-bad-now-need-click-tag. Nested list items are the only child form the parser has today
    (req:ontology.blocks); a comment type does not exist yet (type:comment would extend type:node with `on: ref node
    -(inverse)-> comments` and `by`).
  status: resolved
  related-to: [goal:ontology.graph-editor, req:ontology.blocks, type:block]
- id: decision:ontology.uniform-content
  title: Every node has the same `content` field — a list of child blocks — and everything else related is a ref
  context: >
    question:ontology.child-nodes asked how a child node (a comment on a block) is written. The person's answer
    (session 367dedec3c, 2026-09-18): the page's content consists of blocks; each block has the same content
    field, so child blocks are added the same way at every level; anything related that is not a child is a ref.
  choice: >
    One shape for every node, whatever its type: `content` — an ordered list of blocks the node has (inverse
    `parent`), declared once on type:node and inherited by document, block, req, rule, comment and every product
    type — and refs (single `ref` or `list of` properties) for every other relation. A document is a node whose
    content is its top-level blocks; a block is a node whose content is the blocks nested under it; a comment is a
    block of type comment in its parent's content. In the markdown, content is what sits under the node: the
    document's body for a document, the indented blocks under a paragraph, list item or card for a block (the
    nesting the parser already reads for list items); refs are the existing edge properties and inline tags.
  alternatives: >
    A `comment:` card anywhere with `on: <id>` (a ref, not a child — the comment would not live under what it
    comments on); a sidecar store for comments (invisible to the markdown, against the one-store rule); a
    different child form per type.
  consequences: >
    type:node gains `content: list of block -(inverse)-> parent`; the document → heading → block `has` tree of
    req:ontology.blocks becomes the `content` tree (has stays as its alias until the parser and UI moved over);
    the editor lets any block nest child blocks (a comment, a question, a decision, an instance of any type);
    the context column shows a node's content as children; task:ontology.child-nodes-design starts from this.
  date: 2026-09-18
  status: proposed
  resolves: question:ontology.child-nodes
  affects: [goal:ontology.graph-editor, type:block, req:ontology.blocks, task:ontology.child-nodes-design, task:ontology.children-in-column]
  session: 367dedec3c
```

- [x] task:ontology.block-select A click anywhere on a typed block — card, row, embed, text included — selects it and the context column shows the node (req:wf2.ui.block-select, rule:block-select). Part of goal:ontology.graph-editor; done by plan:plan-still-bad-now-need-click-tag. (session: 367dedec3c)
- [ ] task:ontology.paragraph-select A click in a plain paragraph selects its block node: the Context root shows block:<doc>.<hash> — its heading, its links, what it has — instead of only the knowledge nearest to its text. Part of goal:ontology.graph-editor; depends on task:ontology.block-peek and task:ontology.block-select.
- [ ] task:ontology.child-nodes-design type:comment declared as a block type with an author and a date, and a comment written as a nested block under what it comments on — the rest of the uniform content model (decision:ontology.uniform-content) shipped with plan:plan-need-more-work-context-panel-proper: `content` on type:node, the parser reading the blocks under any prose line, list item or card (rule:ontology.content). Part of goal:ontology.graph-editor; depends on req:ontology.content.
- [x] task:ontology.children-in-column The context column shows a node's `content` — its child blocks — in the document's own editor scoped to the node, where any block can be added and a child's card opens the child one level deeper (req:wf2.ui.node-content, rule:content-editor). Part of goal:ontology.graph-editor; done by plan:plan-need-more-work-context-panel-proper. (session: ffab751604)

### Content: how it is written and how deep it goes

decision:ontology.uniform-content says every node has `content` — the blocks under it. plan:plan-need-more-work-context-panel-proper asks for the rest: the markdown form at every level, a content editor on the node itself, and what a card shows when the node has content. The requirement and the two decisions below say what the parser reads and how a person goes deeper; the column's side is req:wf2.ui.node-content on page:web/context-column.

```yaml
- id: req:ontology.content
  title: The blocks indented under a node are its content, at any depth
  when: >
    a node's defining line — a prose line, a list item, a yaml card's closing fence — is followed by blocks
    indented under it (two spaces deeper than the line): list items, paragraphs after a blank line, fenced cards
  then: >
    those blocks are the node's content in document order — each one a node the parent has (inverse `parent`),
    typed when its first token is an id, a block:<doc>.<hash> node otherwise — and the same rule applies inside
    each of them, so a block of content can carry content of its own to any depth; a document's content is its
    body, a heading's the blocks under it (req:ontology.blocks)
  unless: >
    the indented lines are the continuation text of a prose line — no blank line before them, no list marker, no
    id — which stay the line's text (rule:prose-round-trip); or an html comment or a horizontal rule
  status: shipped
  refines: req:ontology.blocks
  depends-on: decision:ontology.uniform-content
  satisfied-by: [rule:ontology.content, rule:content-lines, op:node.content]
  verified-by: [test:blocks, test:import-web, test:serialize-web, test:node-content-web, ui-test:node-content]
  related-to: [goal:ontology.graph-editor, req:wf2.ui.node-content]
- id: decision:ontology.content-markdown
  title: Content is written indented under the defining line — two spaces per level, the same rules at every level
  context: >
    decision:ontology.uniform-content fixed that content is what sits under the node; it left the form for cards
    and for paragraph-form prose nodes open. Today the parser reads nested list items under a list item only, the
    editor writes a node block's children as indented lines, and a yaml fence can hold several cards.
  choice: >
    One form for every node: its content is the markdown indented two spaces under its defining line and is parsed
    with the document's own rules (paragraphs, list items, fences, ids), recursively. A prose node — paragraph or
    list item — has nested list items and, after a blank line, indented paragraphs and fences. A yaml card has its
    content indented after its closing fence; a card with content is alone in its fence (the serializer splits the
    group). Children keep their own ids (a typed child its `kind:slug`, an anonymous one its text hash), so a child
    survives its parent's text changing and a parent survives its children changing.
  alternatives: >
    A `content: |` key on the card holding markdown (one form for cards, another for prose lines, and a second
    parse inside yaml); comment-marker regions (`<!-- content:id -->`) around the children (invisible structure,
    a third marker grammar next to tables and views); a sidecar store (against the one-store rule).
  consequences: >
    lib/parse.js attaches an indented list under a named paragraph line to that node, not to its heading, and reads
    the indented blocks after a fence as the last card's content; type:node declares `content: list of block
    -(inverse)-> parent` and `has` stays its alias until every reader moved; the editor's import keeps a node
    block's nested blocks as its children in both forms and the serializer writes them back at the right depth;
    documents that already nest list items under task lines read the same as before.
  date: 2026-09-18
  status: proposed
  affects: [req:ontology.content, type:node, req:ontology.blocks, rule:prose-round-trip]
  session: ffab751604
- id: rule:ontology.content
  statement: >
    lib/parse.js keeps a stack of open containers — list items, named paragraph lines and the last card of a yaml
    fence, each with the indent of its defining line; a block belongs to the deepest container shallower than its
    own indent, else to the heading, and a heading empties the stack. A prose line's continuation lines (no blank
    line, no list marker, no fence) stay its text; a fence is one block flushed at its closing line; the text of an
    indented block is de-indented before it is hashed, so a child's id does not depend on its depth. Indented yaml
    fences open a yaml region like top-level ones, so a card inside content defines its node. type:node declares
    `content: list of block -(inverse)-> parent`; the parser writes the edge as `has` until every reader moved.
  source: lib/parse.js:368-410 (open, parentFor, flush); lib/parse.js:281; schema/base-ontology.md:23
  status: shipped
- id: decision:ontology.depth-by-navigation
  title: Going deeper is navigation in the column, not nesting inside it
  context: >
    Content can nest to any depth (req:ontology.content). The column is narrow: a tree of editors inside editors
    would run out of width at the third level, and every level would need its own save path.
  choice: >
    The column shows one node at a time: its properties, then its content in one editor whose blocks are the
    node's direct children. A child's card in that editor shows its head and its first block; a click on it opens
    the child in the column (pushed as a chip, ← returns to the parent), which shows the child's properties and
    its own content editor. Depth costs one click per level and nothing in layout; the chips are the path back.
  alternatives: >
    Nested editors expanded in place (unbounded indent and width, one save per level); a modal per level (loses
    the column's stack and the document behind it); showing the whole subtree read-only and editing only on the
    document page.
  consequences: >
    the content editor renders a child node block with its children folded to a preview (req:wf2.ui.card-preview)
    and selecting it opens the child (rule:block-select applies inside the column too); the chip stack is the
    breadcrumb; the document page keeps showing the full tree inline as it does today.
  date: 2026-09-18
  status: proposed
  affects: [req:wf2.ui.node-content, req:wf2.ui.card-preview, rule:block-select]
  session: ffab751604
```

### Where types live and how the parser finds them

- `data/products/<product>/ontology/base-ontology.md` — copied from Waterfall's `schema/` on product creation, or referenced; it defines the fourteen base types and the verbs with their inverses. Replaces `schema/kinds.yaml` as the source of truth; `kinds.yaml` is generated from it during the transition so skills and prompts that read it keep working.
- Any document in the product may define `type:` cards. The parser runs two passes over all files: pass 1 collects `type:` cards and builds `KINDS` and the property tables; pass 2 is today's parse with the open `ID_RE` and per-type `EDGE_KEYS`.
- Types are scoped to the product. A project cannot redefine a type the product has; `ctx check` errors on a duplicate `type:` id, as it does for any duplicate id.

### What the UI gains

- **Type page** — type:team opens as a page: its properties (own and inherited, inherited greyed with the parent's name), then a table of instances with one column per property — the Notion database view, derived, not stored. Adding a row creates `team:<slug>` in the document the type names as its `home:` (default: the document the type is defined in).
- **Properties panel** — the node page already renders body keys as fields; with a type it renders *all* effective properties, empty ones as placeholders with their value type, and the inverses under a divider.
- **Smart tags** — any type:slug id is a tag with the type's icon; the link picker groups targets by type, and a `ref employee` slot only offers employees (and their subtypes).
- **Send to agent / packet** — `ctx packet` includes the type chain for every node in the slice so an agent knows that a `manager` is an `employee` without being told.

### Checks (`ctx check`)

Errors: unknown type in an id prefix; `extends` cycle; unknown parent; widening override; `ref`/`list of` value that is not a node of the declared type (transitively); duplicate `type:` id. Warnings: required property missing; undeclared property on an instance; property whose value does not parse as its type; inverse name that clashes with a declared property on the target type.

### Phases

Each phase is a plan task, ships alone and leaves the documents readable by the previous parser (the markdown never changes shape; only what the parser makes of it grows).

- [x] task:ontology.types Type nodes and inheritance: `type:` cards with `extends` and `props`, two-pass parse with an open kind list, base ontology document replacing schema/kinds.yaml, inherited-property validation in ctx check, type page listing instances. Part of module:ontology-design; depends on req:wf.graph. (session: 94ac3cf3e0)
- [x] task:ontology.inverses Named inverses and collections: the inverse declaration on properties, generated reverse edges, inverse names in the peek panel and node page, base verbs declared with inverses, cardinality inferred. Part of module:ontology-design; depends on task:ontology.types. (session: 94ac3cf3e0)
- [x] task:ontology.blocks Every block a node: `block:` ids from anchor hashes, document→heading→block `has` tree, phrase links owned by the block, hidden by default in rail/search/site. Part of module:ontology-design; depends on task:ontology.inverses and rule:block-links. (session: 94ac3cf3e0)
- [x] task:ontology.add-type Add a type from the Types index: "+ add type" (name, extends, purpose, destination document) writes the `type:` card to the ontology document and opens the new type in the context column for its properties. Implements req:ontology.add-type; part of module:ontology-design; depends on task:ontology.types. (session: 8aa3926e18)
- [x] task:ontology.type-table A "<Type>s table" block for every own type: `<!-- table:<slug> -->` regions of prose instance lines, editable in the editor with a column per declared property. Implements req:ontology.type-table; part of module:ontology-design; depends on task:ontology.add-type. (session: 8aa3926e18)
- [ ] task:ontology.kinds-yaml-generated Generate `schema/kinds.yaml` (kinds, verbs, statuses) from `schema/base-ontology.md` so the two cannot drift; today kinds.yaml is a hand-kept summary with a header pointing at the ontology. Part of module:ontology-design; depends on decision:ontology.base-ontology-referenced.
- [ ] task:ontology.unique Cardinality on the inverse side: a `unique` modifier on a `list of` property makes the target's inverse a single ref instead of a collection; today every inverse renders as a list. Part of module:ontology-design; depends on task:ontology.inverses.
- [ ] task:ontology.ref-slot-picker The editor's link picker filters targets by the property's declared type: a `ref employee` slot only offers employees and their subtypes; the block menu already offers the product's own types. Part of module:ontology-design; depends on task:ontology.types.
- [ ] task:ontology.block-peek Open a block node from its `#b-<hash>` anchor in the peek panel (its links, its heading, a place for per-block properties such as a status or a comment). Part of module:ontology-design; depends on task:ontology.blocks.
- [x] task:ontology.spike Throwaway spike before task:ontology.types: parse the person/employee/manager/team example from module:ontology with a two-pass parser in a branch of lib/parse.js and print the effective properties and inverses; the output is a yes/no on the two-pass approach, not code to keep. Part of module:ontology-design. (result: yes: two-pass works (types then instances); effective props by extends chain, generated inverses, transitive is-a, session: 94ac3cf3e0)

### Implemented

What shipped, as requirements the tests verify and rules the code enforces. Statuses are proposed so the reviewer files them.

| test | file | cases |
|---|---|---|
| test:ontology | test/ontology.js | 30 |
| test:blocks | test/blocks.js | 38 |
| test:types-web | packages/web/src/lib/types.test.ts | 5 |
| test:instances-web | packages/web/src/lib/instances.test.ts | 3 |
| test:type-edit-web | packages/web/src/lib/type-edit.test.ts | 8 |

```yaml
- id: req:ontology.types
  title: A product declares its own types and the kind list is open
  when: a document holds a `type:<slug>` card (optionally `extends`, `props`, `open`, `home`, `purpose`)
  then: >
    `<slug>:<x>` is an id everywhere (cards, prose nodes, tags, links), the type inherits its parent's properties
    parent first, a ref/list-of property becomes an edge named by the property, every declared property is a
    prop:<type>.<name> node the type has, and graph.json carries kinds, types, inverses and problems
  status: proposed
  satisfied-by: [rule:ontology.open-kinds, rule:ontology.narrow-only]
  verified-by: [test:ontology]
  refines: req:wf.graph
- id: req:ontology.inverses
  title: Every link has a name on both ends
  when: a property declares `-(inverse)-> name` (the base ontology does for every base verb)
  then: >
    the parser emits the reverse edge marked generated; the CLI lists it under the inverse name and hides the
    incoming duplicate; the web labels incoming relations by the inverse name and shows a typed node's inverses
    under its properties
  status: proposed
  satisfied-by: [rule:ontology.inverse-generated]
  verified-by: [test:ontology]
- id: req:ontology.check
  title: ctx check validates the ontology and its instances
  when: ctx check runs
  then: >
    an extends cycle, unknown parent, widening override, duplicate type id or a ref to a node of the wrong type is
    an error; a missing required property, an undeclared property on a closed type or a value that does not parse
    as its type is a warning
  status: proposed
  satisfied-by: [rule:ontology.narrow-only, rule:ontology.open-types]
  verified-by: [test:ontology]
- id: req:ontology.type-page
  title: A type opens as a page with its properties and an instance table
  when: a person opens /<product>/types/<slug> (from the Types index, the peek panel of a type: node, or Knowledge)
  then: >
    the page shows the type's properties (own and inherited, the root type's folded into one line), its subtypes
    and every instance as a table with a column per property; "+ add" writes a new instance card into the type's
    home document and rebuilds the graph
  status: proposed
  satisfied-by: [page:web/types, op:types.add]
  verified-by: [test:types-web, test:instances-web]
- id: req:ontology.add-type
  title: A person adds a type from the Types index
  when: a person presses "+ add type" on /<product>/types and gives a name, a parent type and a purpose
  then: >
    a `type:<slug>` card with `extends` and `purpose` is written to the product's ontology document (or the document
    they chose), the graph is rebuilt, the type appears under the product's own types and opens in the context column
    with its (empty) property table, where properties are added and saved to the same card
  unless: the slug already names a type (base types included) — the form says so and does not write
  status: proposed
  satisfied-by: [page:web/types, op:types.create]
  verified-by: [test:type-edit-web]
- id: req:ontology.type-table
  title: A document shows a table of a type's instances
  when: a person types "/<type>" in a document and picks "<Type>s table" (for any type the product declares, e.g. type:bug)
  then: >
    a table block appears with a column for status and one per property of the type; typing into its last row
    creates an instance (`<type>:<slug>` prose line inside `<!-- table:<slug> -->` markers), each cell edits that
    line's trailing property group, and the rows are instances the type page and the graph see
  unless: the type declares no properties — the table still has name and status
  status: proposed
  satisfied-by: [rule:type-tables]
  verified-by: [test:web-lib#import]
- id: req:ontology.blocks
  title: Every block of a document is a node
  when: a document is parsed
  then: >
    each anonymous paragraph, heading, list item, table and fence is a block:<doc>.<hash> node with the web's
    anchor hash; the document has its headings, a heading has its blocks, a list item has its nested items; a prose
    node or yaml card is its own block; a phrase link in plain prose is the block's edge
  unless: the block is an html comment or a horizontal rule
  status: proposed
  satisfied-by: [rule:ontology.block-id, rule:ontology.hidden-kinds]
  verified-by: [test:blocks]
  depends-on: rule:block-links
- id: rule:ontology.open-kinds
  statement: >
    The id regex is built per parse from the base kinds plus the slugs of every type: card in the base ontology
    and the product's documents; the web rebuilds its regex from graph.kinds on the server and in the client
    provider.
  source: lib/parse.js:188; packages/web/src/lib/ids.ts:8
  status: proposed
- id: rule:ontology.narrow-only
  statement: >
    A child type may only narrow an inherited property — make it required or narrow its ref type to a subtype —
    never widen it; widening, an extends cycle and an unknown parent are ctx check errors.
  source: lib/parse.js:168
  status: proposed
- id: rule:ontology.open-types
  statement: >
    A type is closed unless it says `open: true`: instances of a closed type get an "undeclared property" warning
    for keys the type does not declare; all base types are open, so existing documents get no new warnings.
  source: lib/graph.js:157; schema/base-ontology.md
  status: proposed
- id: rule:ontology.inverse-generated
  statement: >
    Inverse edges are generated by the parser (generated: true) and never written to markdown; the CLI graph keeps
    them in out only, the web index drops them and reads inverses from graph.inverses.
  source: lib/parse.js:468; lib/graph.js:14; packages/web/src/lib/graph.ts:24
  status: proposed
- id: rule:ontology.block-id
  statement: >
    A block node's id is block:<document slug>.<hash> where hash is the FNV-1a anchor hash of the decoration-free
    text — identical to the #b-<hash> anchor the web already gives the block.
  source: lib/parse.js:67; packages/web/src/lib/anchors.ts
  status: proposed
- id: rule:ontology.hidden-kinds
  statement: >
    field, prop and block nodes exist for addressing, links and properties; they are hidden from the rail, the
    knowledge pages, search (unless the query names block:), the review queue, the semantic index, the node index
    sent to the browser and the published site (ctx site --blocks keeps them).
  source: packages/web/src/lib/graph.ts:14; lib/graph.js; bin/ctx.js
  status: proposed
```

### Not in scope

Multiple types per instance (Tana's several tags) — one kind prefix per id stays; multi-typing is what `extends` is for, and the cost of dropping `kind:slug` is every link in every product. Rollups and formulas (Notion) — a computed property is a later addition once properties are typed. A schema editor UI — types are cards in a document; the editor already edits cards. Storing the ontology in SQLite — rule:markdown-canonical stands; the ontology is markdown.

## Decisions and open questions

Decisions this draft makes, as decision blocks (proposed until a person approves them in the Inbox):

```yaml
- id: decision:ontology.ids-kind-slug
  title: Ontology: ids stay kind:slug and the kind prefix is the type
  context: >
    module:ontology proposes every node has a type with inheritance; the example writes team1:team (slug first). The parser, links, anchors and every product document use kind:slug.
  choice: >
    Keep kind:slug; an instance of type:team is team:t1; the parser's KINDS list becomes the set of declared type: slugs plus the base kinds (two-pass parse).
  alternatives: >
    slug-first ids (team1:team) — breaks every existing link; a generic node: id with a type: property and Tana-style multiple tags — loses the typed prefix that makes ids readable and tags cheap.
  consequences: >
    One type per instance (subtyping via extends); changing an instance's type is an id change. See question:ontology.q1.
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology,module:ontology-design,rule:prose-nodes]
  session: 7cbfbe5976
- id: decision:ontology.types-are-cards
  title: Ontology: types are yaml cards; a shipped base-ontology document replaces schema/kinds.yaml
  context: >
    Types must live somewhere the parser and people both read; today kinds and verbs are constants in lib/parse.js documented by schema/kinds.yaml.
  choice: >
    type:<slug> cards with extends and props, written in any product document (module:ontology by convention); the fourteen base kinds ship as base-ontology.md that every product includes; kinds.yaml is generated from it during the transition.
  alternatives: >
    keep kinds.yaml global and add a product-level types.yaml — two syntaxes for one thing; store types in SQLite — contradicts rule:markdown-canonical.
  consequences: >
    Two-pass parse (types first); ctx check gains type validation; skills that read kinds.yaml keep working until regenerated.
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology-design,rule:markdown-canonical,req:wf.graph]
  session: 7cbfbe5976
- id: decision:ontology.inverses-generated
  title: Ontology: inverse (back-link) edges are generated, never written to markdown
  context: >
    A collection on one side (team.members) must appear on the other side (person.memberOf) automatically.
  choice: >
    A property declares its inverse name once; the parser emits the reverse edge marked generated, like field: nodes and mentions edges today; properties without a declared inverse get <name>-of. The base verbs get inverses (refines/refined-by, satisfied-by/satisfies, part-of/has, …).
  alternatives: >
    Notion-style paired properties written on both sides — two places to drift; no named inverse, keep showing '← verb' — what the UI does today, the idea asks for more.
  consequences: >
    Serialiser must skip generated edges; peek panel and node page group incoming relations by inverse name.
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology-design,rule:block-links]
  session: 7cbfbe5976
- id: decision:ontology.inheritance-at-parse
  title: Ontology: property inheritance resolves at parse time and an override may only narrow
  context: employee extends person; which properties does an employee have and what may the child change?
  choice: >
    Effective properties = union along the extends chain, parent first (Tana order); a child may make a property required or narrow its ref type, never widen; cycles and unknown parents are errors; undeclared properties on instances are warnings (open world).
  alternatives: >
    Strict closed schema (unknown key = error) — punishes writing instances before the type exists; no overrides at all — cannot say a manager's team is required.
  consequences: ctx check validates instances against effective properties; ctx packet includes the type chain.
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology-design]
  session: 7cbfbe5976
- id: decision:ontology.blocks-last-phase
  title: Ontology: every-block-is-a-node is the last phase, hidden by default
  context: >
    The idea makes every block a node; today anonymous blocks only have anchor hashes (rule:block-links) and phrase links relate the document, not the block.
  choice: >
    Phase 3: block:<doc>.<hash> nodes reusing the anchor hash, document→heading→block has-tree, phrase links owned by the block, hidden from rail/search/site unless asked. Phases 1 (types+inheritance) and 2 (inverses+collections) ship first.
  alternatives: >
    Do it first because it is the idea's headline — least value per line of code and roughly 1 500 extra nodes; never do it — loses per-block properties and block-owned links.
  consequences: >
    Three plan tasks task:ontology.types, task:ontology.inverses, task:ontology.blocks plus a spike task:ontology.spike.
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology-design,rule:block-links,module:ontology]
  session: 7cbfbe5976
```

Decisions made while implementing (2026-09-17, session 94ac3cf3e0), proposed; the ones that answer an open question say so with `resolves`, and the question stays open until a person approves the decision and resolves it:

```yaml
- id: decision:ontology.types-product-local
  title: Ontology: types are product-local; only the base ontology is shared
  context: >
    question:ontology.q2 asks whether a type such as person can be shared across products. The parser reads the base
    ontology plus one product's documents; nothing crosses products today.
  choice: >
    Types are scoped to the product that declares them. The base ontology (schema/base-ontology.md) is the only
    shared part; a product that needs the same type as another declares it again (or a later change adds a shared
    ontology folder the parser reads for every product).
  alternatives: >
    A global ontology folder read for every product — one more place to look and a change there affects every
    product's check; copying types between products by hand — what the choice allows, without a mechanism.
  consequences: The Types page shows "<product>'s types" and "Base types"; duplicate type ids are errors within a product only.
  status: proposed
  date: 2026-09-17
  resolves: [question:ontology.q2]
  related-to: [module:ontology-design]
  session: 94ac3cf3e0
- id: decision:ontology.blocks-all-documents
  title: Ontology: block nodes for every document, hidden by default — no opt-in
  context: >
    question:ontology.q3 asks whether block nodes are created for every document or only when a document opts in.
    Waterfall's eight documents produce about 220 anonymous blocks (most content is cards and prose nodes).
  choice: >
    Every document gets block nodes; they are hidden everywhere by default (rule:ontology.hidden-kinds) and dropped
    from the published site. No frontmatter switch.
  alternatives: >
    `blocks: nodes` opt-in per document — two behaviours for the same markdown, and links from a block in an
    opted-out document would have no owner.
  consequences: graph.json grows (922 nodes for waterfall, from 689); nothing visible changes until a block is addressed.
  status: proposed
  date: 2026-09-17
  resolves: [question:ontology.q3]
  related-to: [module:ontology-design, task:ontology.blocks]
  session: 94ac3cf3e0
- id: decision:ontology.block-owned-links
  title: Ontology: a phrase link in plain prose is the block's edge; the document reads it through has
  context: >
    question:ontology.q4 asks who owns a link on a phrase without a verb. Before phase 3 it was a related-to edge
    from the document.
  choice: >
    The edge is from the block (related-to). The document reaches it through has → block, and the web's relations()
    folds a document's block links into its own so the Connected list is unchanged. related-to stays symmetric;
    mentions has mentioned-by.
  alternatives: >
    Keep the edge on the document and add one on the block — the same fact twice; keep it on the document only —
    the block owns nothing, which defeats every-block-a-node.
  consequences: ctx get module:x no longer lists phrase links directly; ctx neighbors and packet still reach them.
  status: proposed
  date: 2026-09-17
  resolves: [question:ontology.q4]
  related-to: [module:ontology-design, rule:block-links]
  session: 94ac3cf3e0
- id: decision:ontology.open-types
  title: Ontology: a type is closed unless it says open: true; all base types are open
  context: >
    The design wants undeclared-property warnings (open world with a nudge), but base kinds carry many ad-hoc keys
    and would drown ctx check in warnings.
  choice: >
    A type card may say `open: true`; instances of an open type never get undeclared-property warnings. Every base
    type is open; a product's own types are closed by default. `open` does not inherit.
  alternatives: >
    Warn for every type — hundreds of warnings on day one; never warn — a product cannot learn its schema from its
    instances.
  consequences: rule:ontology.open-types; the Types page says "open" on such types.
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology-design, req:ontology.check]
  session: 94ac3cf3e0
- id: decision:ontology.new-type-home
  title: "Ontology: a type added from the UI goes to the product's ontology.md, kept next to its other types"
  context: >
    The Types index was a read-only list; adding a type meant writing a card by hand in some document. The UI needs a
    default place to write the card, and a product may not have an ontology document yet.
  choice: >
    By default the card goes to the product's `ontology.md` (the convention base-ontology.md already names), else the
    document that declares most of its types, else a new `ontology.md` created in the product's first project from
    the blank template. Inside the document it is appended to the fence that declares the last type, so types stay
    together; a fence holding a bare document card never takes a list item. The form still lets the person pick any
    product document. Properties are not part of the form: the new type opens in the context column and its
    property editor writes them (op:types.add PUT).
  alternatives: >
    Ask for a document every time — friction for the common case; a per-product setting naming the ontology
    document — nothing else needs it yet; properties in the create form — duplicates the editor that already exists.
  consequences: op:types.create, action:add-type; req:ontology.add-type
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology-design, decision:ontology.types-product-local, decision:ontology.types-are-cards]
  session: 8aa3926e18
- id: decision:ontology.base-ontology-referenced
  title: >
    Ontology: the base ontology is one file in the repo (schema/base-ontology.md), read for every product;
    kinds.yaml stays hand-kept for now
  context: >
    The design allowed copying base-ontology.md into each product or referencing it, and said kinds.yaml is
    generated during the transition.
  choice: >
    Referenced: lib/parse.js reads schema/base-ontology.md first for every parse. kinds.yaml is not generated yet;
    it carries a header naming base-ontology.md as the source of the kinds and verbs (task:ontology.kinds-yaml-generated).
  alternatives: >
    A copy per product — drifts the moment the base changes; generating kinds.yaml now — its prose (statuses,
    conventions, prose-nodes) has no home in type cards yet.
  consequences: Base types show on every product's Types page as "Base types"; a product cannot change them.
  status: proposed
  date: 2026-09-17
  related-to: [module:ontology-design, decision:ontology.types-are-cards]
  session: 94ac3cf3e0
```

Open questions, as question blocks (answer each with a decision block, then resolve it):

```yaml
- id: question:ontology.q1
  title: Ontology Q1: one type per instance, and what does team1:team mean?
  q: >
    module:ontology writes instances as team1:team (slug first). Is that a wish for slug-first ids or shorthand
    for team:team1? And when an instance needs two types (a person who is also a supplier), is extends enough or
    do we need Tana-style multiple tags on one node?
  status: open
  related-to: [module:ontology, module:ontology-design]
  session: 7cbfbe5976
- id: question:ontology.q2
  title: Ontology Q2: are types product-local or shared across products?
  q: >
    Can a type such as person be defined once and used by yessensei and waterfall, or is every ontology product-local with only the base ontology shared? The design assumes product-local.
  status: open
  related-to: [module:ontology-design]
  session: 7cbfbe5976
- id: question:ontology.q3
  title: Ontology Q3: block nodes for every document or opt-in per document?
  q: >
    Phase 3 creates a block: node for every paragraph. Should that happen for all documents (about 1 500 nodes for waterfall today) or only when a document opts in with blocks: nodes in its frontmatter?
  status: open
  related-to: [module:ontology-design,rule:block-links]
  session: 7cbfbe5976
- id: question:ontology.q4
  title: Ontology Q4: who owns a phrase link without a verb — the block or the document?
  q: >
    Today a link on a phrase in plain prose is a related-to edge from the document. With block nodes, should it move to the block (the document still reaches it through has), and should related-to stay symmetric while mentions gets mentioned-by?
  status: open
  related-to: [module:ontology-design,rule:block-links]
  session: 7cbfbe5976
```
