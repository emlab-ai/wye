---
type: decision
title: Ontology: inverse (back-link) edges are generated, never written to markdown
from: agent session 7cbfbe5976
added: 2026-09-17T13:10:05.346Z
status: filed
filed-to: data/products/waterfall/projects/v2/docs/ontology-design.md
refs: module:ontology-design,rule:block-links
session: 7cbfbe5976
---
## context
A collection on one side (team.members) must appear on the other side (person.memberOf) automatically.

## choice
A property declares its inverse name once; the parser emits the reverse edge marked generated, like field: nodes and mentions edges today; properties without a declared inverse get <name>-of. The base verbs get inverses (refines/refined-by, satisfied-by/satisfies, part-of/has, …).

## alternatives
Notion-style paired properties written on both sides — two places to drift; no named inverse, keep showing '← verb' — what the UI does today, the idea asks for more.

## consequences
Serialiser must skip generated edges; peek panel and node page group incoming relations by inverse name.
