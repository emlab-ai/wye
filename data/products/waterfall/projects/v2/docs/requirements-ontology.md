---
node: module:req-ontology
type: module
title: Ontology
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 19
---

# Ontology

What Wye must do here, as behaviours a person can observe: when <trigger>, <outcome>, unless <exception>. How it is done is on the Systems page of the same name (Systems › Ontology); what a person sees on the Experience pages. Open questions wait at the end.


## Requirements

<!-- list:req -->

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
```

<!-- /list:req -->

## Open questions

<!-- list:question -->

```yaml
- id: question:ontology.child-nodes
  title: How is a child node — a comment on a block — written in the markdown?
  q: >
    A comment on a paragraph or a typed block is a node the parent `has`. Is it a nested list item under the parent
    (`  - comment:x …`, the form the parser already treats as a child of a list item — but a paragraph has no nested
    items), a yaml card with `on: block:<doc>.<hash>` anywhere in the document, or a sidecar the document does not
    show? The answer decides what the editor draws under a block and what an agent writes.
  context: >
    goal:ontology.graph-editor — "any node can have child nodes, like comments"; the person's request on
    pr:7. Nested list items are the only child form the parser has today
    (req:ontology.blocks); a comment type does not exist yet (type:comment would extend type:node with `on: ref node
    -(inverse)-> comments` and `by`).
  status: resolved
  related-to: [goal:ontology.graph-editor, req:ontology.blocks, type:block]
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

<!-- /list:question -->
