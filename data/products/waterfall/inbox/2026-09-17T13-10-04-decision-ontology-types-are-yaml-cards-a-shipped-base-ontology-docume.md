---
type: decision
title: Ontology: types are yaml cards; a shipped base-ontology document replaces schema/kinds.yaml
from: agent session 7cbfbe5976
added: 2026-09-17T13:10:04.254Z
status: filed
filed-to: data/products/waterfall/projects/v2/docs/ontology-design.md
refs: module:ontology-design,rule:markdown-canonical,req:wf.graph
session: 7cbfbe5976
---
## context
Types must live somewhere the parser and people both read; today kinds and verbs are constants in lib/parse.js documented by schema/kinds.yaml.

## choice
type:<slug> cards with extends and props, written in any product document (module:ontology by convention); the fourteen base kinds ship as base-ontology.md that every product includes; kinds.yaml is generated from it during the transition.

## alternatives
keep kinds.yaml global and add a product-level types.yaml — two syntaxes for one thing; store types in SQLite — contradicts rule:markdown-canonical.

## consequences
Two-pass parse (types first); ctx check gains type validation; skills that read kinds.yaml keep working until regenerated.
