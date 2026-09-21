---
type: note
title: task: parser treats https://… markdown links as node ids
from: agent session 7cbfbe5976
added: 2026-09-17T13:10:20.706Z
status: new
refs: rule:block-links,req:wf.graph
session: 7cbfbe5976
---
## context
Seen while building ontology-design.md: [text](https://tana.inc/…) in plain prose becomes a related-to edge to a stub node of kind https (ctx build shows 'https 0+4 stub'). The plain-prose link regex in lib/parse.js matches any [a-z-]+: scheme; it should only accept known kinds (ID_RE). Same in proseRefs for prose nodes.
