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

Nothing here is decided. The decisions this draft makes on its own are in the inbox for review (see §Decisions and open questions); the graph keeps working exactly as it does until phase 1 lands.

## The idea in one paragraph

Waterfall today has a fixed vocabulary: fourteen kinds (`req`, `rule`, `entity`, `task`, …), a fixed set of verbs (`refines`, `satisfied-by`, `part-of`, …) and a parser that knows both by heart. That is right for the product-knowledge core, and wrong the moment a product wants to talk about its own things — people, teams, customers, suppliers, venues. The ontology model turns the fixed vocabulary into the *base* of an open one: kinds become **types**, types are **nodes** you can write in a document, a type can **extend** another type and inherit its properties, a property can hold a **reference** (one node) or a **collection** (many nodes) of a given type, and every reference has a named **inverse** the graph shows on the other side without anyone writing it. `person` is a type; `employee` extends `person`; `manager` extends `employee` and adds `team`; `team` has `members: collection of person` with inverse `memberOf`; `team:platform` and `person:ana` are instances, and Ana's page shows *memberOf: team:platform* although nobody typed it on her line.

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
| **node** | anything with an id: a card, a prose line, a document, a block, a type, a property | `kind:slug` (kind = type slug) | `req:wf2.ui.node-page`, `person:ana` |
| **type** | a kind. Declares which properties instances have and which type it extends | `type:<slug>` | `type:person`, `type:employee` |
| **property** | a named, typed slot on a type; instances fill it | `prop:<type>.<name>` (generated, like `field:` today) | `prop:team.members` |
| **link** | a property whose value type is a node type (one or many); the property name is the verb | edge `from -(name)-> to` | `team:platform -(members)-> person:ana` |
| **inverse** | the name a link has when read from the target; declared once on the property | edge `to -(inverse)-> from`, generated | `person:ana -(memberOf)-> team:platform` |

`type:node` is the root: every type extends it, directly or through a chain. Its properties are the ones every node has today: `title`, `status`, `owner`, `text`, and the generic links `related-to` (inverse `related-to`), `mentions` (inverse `mentioned-by`), `part-of` (inverse `has`).

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

An instance of `type:team` is `team:platform`, an instance of `type:person` is `person:ana`. The kind prefix *is* the type; the parser's `KINDS` list stops being a constant and becomes "the slugs of all `type:` nodes in the product plus the base ontology". `ID_RE` is built after the type pass, so a second parse pass is needed (types first, then everything else) — cheap, the graph is in memory anyway.

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

1. Walk `extends` up to `type:node`; a cycle or an unknown parent is an *error*.
2. The instance's effective properties are the union of the chain's `props`, parent first (Tana's order), child declarations overriding the parent's for the same name.
3. An override may only *narrow*: make optional required, or narrow `ref person` to `ref employee`. Widening is an error.
4. `ctx check` validates each instance's body against its effective properties: required present, value parses as its type, `ref`/`list of` targets exist and have the right type (transitively: a `person` slot accepts an `employee`).
5. Edges from instances also carry the property name as verb, so `manager: person:ana` is an edge `-(manager)->` — property names are verbs, which is what `EDGE_KEYS` already does by hand for the base kinds.

Type membership is transitive: `person:ana` is-a person; `employee:ana` would be an employee *and* a person, so `list of person` accepts her. Which raises the one hard question in this design — see Q1 below: an instance has exactly one kind prefix, so an employee is written `employee:ana`, never both `person:ana` and `employee:ana`. Renaming a person to an employee is an id change, with all that implies for links. The alternative (a `type:` property on a `node:` id, Tana's multiple tags) is listed in the inbox as the rejected alternative.

### Collections and inverses

A `list of <type>` property is a collection: the instance lists the member ids, the parser emits one edge per member with the property name as verb. `-(inverse)-> name` on the property declares the back link's name; the parser generates the reverse edge as a *virtual* edge (present in the graph, never written to markdown, marked `generated: true` so the writer never tries to serialise it — the same way `field:` nodes and `mentions` edges are generated today).

On the target's page the inverse shows as a property: Ana's card lists `memberOf: team:platform`, `reports: person:bo`. In the peek panel "Relations" groups by inverse name instead of "← verb". A property without a declared inverse gets a default inverse `<name>-of` (`manager-of`), so every link has a name on both ends, as Foundry and Notion insist.

The base ontology declares inverses for the existing verbs so nothing changes for the current documents but the labels get better: `refines`/`refined-by`, `satisfied-by`/`satisfies`, `verified-by`/`verifies`, `governed-by`/`governs` (already both exist as separate verbs — the base ontology unifies them into one property with an inverse), `gated-by`/`gates`, `part-of`/`has`, `depends-on`/`depended-on-by`, `contradicts`/`contradicts`, `resolves`/`resolved-by`, `related-to`/`related-to`, `mentions`/`mentioned-by`.

Cardinality on the inverse side is inferred: a `ref` on N instances gives the target a collection (`reports` is many because many employees name one manager); a `list of` gives each member a `ref` or a collection depending on whether the type declares the target unique (`unique` modifier, phase 2).

### Every block is a node

Today a paragraph without an id is an anchored block (rule:block-links) that belongs to the document. The ontology says it is a node of `type:block`, the document `has` it, and its links are its own. Concretely:

- Every top-level block (paragraph, list item, heading, table, code fence) gets id `block:<doc>.<hash>` where hash is the existing anchor hash (`anchors.ts`); a block whose first token is an id keeps that id — a named node *is* its block.
- The document node `has` its blocks in document order; a heading `has` the blocks under it; a list item `has` its nested items. So the document tree becomes a node tree, and "children" is a property with inverse `parent`.
- A link on a phrase in a plain paragraph becomes an edge from the *block* (today: from the document). The document still reaches it through `has`, so nothing that works today stops working.
- Block nodes are not listed in the rail, search or graph views by default (same as `field:` and `mentions` today): they exist for addressing, links and future per-block properties (comments, a status on a paragraph, a block typed later by adding an id in front of it).

Cost: a graph of 3 344 lines becomes roughly 1 500 more nodes. The parser is linear; the web index is a Map; `ctx packet` and search already filter by kind. The viewer's `data.js` grows — the site build should drop `block:` nodes unless asked. This is the phase with the least value per line of code, which is why it is last.

### Where types live and how the parser finds them

- `data/products/<product>/ontology/base-ontology.md` — copied from Waterfall's `schema/` on product creation, or referenced; it defines the fourteen base types and the verbs with their inverses. Replaces `schema/kinds.yaml` as the source of truth; `kinds.yaml` is generated from it during the transition so skills and prompts that read it keep working.
- Any document in the product may define `type:` cards. The parser runs two passes over all files: pass 1 collects `type:` cards and builds `KINDS` and the property tables; pass 2 is today's parse with the open `ID_RE` and per-type `EDGE_KEYS`.
- Types are scoped to the product. A project cannot redefine a type the product has; `ctx check` errors on a duplicate `type:` id, as it does for any duplicate id.

### What the UI gains

- **Type page** — `type:team` opens as a page: its properties (own and inherited, inherited greyed with the parent's name), then a table of instances with one column per property — the Notion database view, derived, not stored. Adding a row creates `team:<slug>` in the document the type names as its `home:` (default: the document the type is defined in).
- **Properties panel** — the node page already renders body keys as fields; with a type it renders *all* effective properties, empty ones as placeholders with their value type, and the inverses under a divider.
- **Smart tags** — any `type:slug` id is a tag with the type's icon; the link picker groups targets by type, and a `ref employee` slot only offers employees (and their subtypes).
- **Send to agent / packet** — `ctx packet` includes the type chain for every node in the slice so an agent knows that a `manager` is an `employee` without being told.

### Checks (`ctx check`)

Errors: unknown type in an id prefix; `extends` cycle; unknown parent; widening override; `ref`/`list of` value that is not a node of the declared type (transitively); duplicate `type:` id.
Warnings: required property missing; undeclared property on an instance; property whose value does not parse as its type; inverse name that clashes with a declared property on the target type.

### Phases

Each phase is a plan task, ships alone and leaves the documents readable by the previous parser (the markdown never changes shape; only what the parser makes of it grows).

- [ ] task:ontology.types Type nodes and inheritance: `type:` cards with `extends` and `props`, two-pass parse with an open kind list, base ontology document replacing schema/kinds.yaml, inherited-property validation in ctx check, type page listing instances. Part of module:ontology-design; depends on req:wf.graph.
- [ ] task:ontology.inverses Named inverses and collections: the inverse declaration on properties, generated reverse edges, inverse names in the peek panel and node page, base verbs declared with inverses, cardinality inferred. Part of module:ontology-design; depends on task:ontology.types.
- [ ] task:ontology.blocks Every block a node: `block:` ids from anchor hashes, document→heading→block `has` tree, phrase links owned by the block, hidden by default in rail/search/site. Part of module:ontology-design; depends on task:ontology.inverses and rule:block-links.
- [ ] task:ontology.spike Throwaway spike before task:ontology.types: parse the person/employee/manager/team example from module:ontology with a two-pass parser in a branch of lib/parse.js and print the effective properties and inverses; the output is a yes/no on the two-pass approach, not code to keep. Part of module:ontology-design.

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

Open questions, as question blocks (answer each with a decision block, then resolve it):

```yaml
- id: question:ontology.q1
  title: Ontology Q1: one type per instance, and what does team1:team mean?
  q: >
    module:ontology writes instances as team1:team (slug first). Is that a wish for slug-first ids or shorthand for team:team1? And when an instance needs two types (a person who is also a supplier), is extends enough or do we need Tana-style multiple tags on one node?
  status: open
  related-to: [module:ontology,module:ontology-design]
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
