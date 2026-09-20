---
type: decision
title: Ontology: every-block-is-a-node is the last phase, hidden by default
from: agent session 7cbfbe5976
added: 2026-09-17T13:10:07.538Z
status: filed
filed-to: data/products/waterfall/projects/v2/docs/ontology-design.md
refs: module:ontology-design,rule:block-links,module:ontology
session: 7cbfbe5976
---
## context
The idea makes every block a node; today anonymous blocks only have anchor hashes (rule:block-links) and phrase links relate the document, not the block.

## choice
Phase 3: block:<doc>.<hash> nodes reusing the anchor hash, document→heading→block has-tree, phrase links owned by the block, hidden from rail/search/site unless asked. Phases 1 (types+inheritance) and 2 (inverses+collections) ship first.

## alternatives
Do it first because it is the idea's headline — least value per line of code and roughly 1 500 extra nodes; never do it — loses per-block properties and block-owned links.

## consequences
Three plan tasks task:ontology.types, task:ontology.inverses, task:ontology.blocks plus a spike task:ontology.spike.
