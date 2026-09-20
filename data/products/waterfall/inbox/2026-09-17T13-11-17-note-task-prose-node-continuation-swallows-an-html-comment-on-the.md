---
type: note
title: task: prose-node continuation swallows an HTML comment on the next line
from: agent session 7cbfbe5976
added: 2026-09-17T13:11:17.237Z
status: new
refs: rule:prose-nodes,task:do-research-and-expand
session: 7cbfbe5976
---
## context
task:do-research-and-expand in ontology.md resolves with text ending in '<!-- /tasks -->' because lib/parse.js joins every following non-blank line into a prose node until a fence, heading, table, list item or hr — an HTML comment line (<!-- … -->) should stop the continuation too, otherwise the tasks-table markers leak into the last task's text.
