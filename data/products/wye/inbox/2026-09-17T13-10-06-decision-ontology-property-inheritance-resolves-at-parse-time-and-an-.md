---
type: decision
title: Ontology: property inheritance resolves at parse time and an override may only narrow
from: agent session 7cbfbe5976
added: 2026-09-17T13:10:06.438Z
status: filed
filed-to: data/products/wye/projects/v2/docs/ontology-design.md
refs: module:ontology-design
session: 7cbfbe5976
---
## context
employee extends person; which properties does an employee have and what may the child change?

## choice
Effective properties = union along the extends chain, parent first (Tana order); a child may make a property required or narrow its ref type, never widen; cycles and unknown parents are errors; undeclared properties on instances are warnings (open world).

## alternatives
Strict closed schema (unknown key = error) — punishes writing instances before the type exists; no overrides at all — cannot say a manager's team is required.

## consequences
ctx check validates instances against effective properties; ctx packet includes the type chain.
