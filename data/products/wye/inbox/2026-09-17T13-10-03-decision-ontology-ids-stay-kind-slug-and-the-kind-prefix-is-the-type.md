---
type: decision
title: Ontology: ids stay kind:slug and the kind prefix is the type
from: agent session 7cbfbe5976
added: 2026-09-17T13:10:03.145Z
status: filed
filed-to: data/products/wye/projects/v2/docs/ontology-design.md
refs: module:ontology,module:ontology-design,rule:prose-nodes
session: 7cbfbe5976
---
## context
module:ontology proposes every node has a type with inheritance; the example writes team1:team (slug first). The parser, links, anchors and every product document use kind:slug.

## choice
Keep kind:slug; an instance of type:team is team:t1; the parser's KINDS list becomes the set of declared type: slugs plus the base kinds (two-pass parse).

## alternatives
slug-first ids (team1:team) — breaks every existing link; a generic node: id with a type: property and Tana-style multiple tags — loses the typed prefix that makes ids readable and tags cheap.

## consequences
One type per instance (subtyping via extends); changing an instance's type is an id change. See question Q1 in the inbox.
