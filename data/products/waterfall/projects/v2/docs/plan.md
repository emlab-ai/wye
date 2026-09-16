---
node: module:wf2-plan
type: module
title: Waterfall v2 — plan
status: proposed
owner: alex
last-verified: 2026-09-14
part-of: module:wf2
---

# Waterfall v2 — plan

The running plan. Every task is a checkbox line that starts with a `task:` id; the box is the status, `#in-progress` or `#blocked` override it, and "part of" / "implements" name what the task serves. Progress per document is the number of checked tasks over all tasks.

## Done

- [x] task:reader Documents-first reader with smart tags and a peek panel, implements req:wf2.ui.node-page.
- [x] task:single-page-editor One Notion-style editor per document with typed node blocks, prose nodes and phrase links, implements req:wf2.ui.node-page.
- [x] task:prose-nodes Prose node syntax in the parser with aliases and verb inference, part of rule:prose-nodes.
- [x] task:todo-tasks Checkbox tasks that become task nodes, part of req:wf2.ui.node-page.
- [x] task:create-doc-via-link Create a new document from the link picker and link the selection to it, part of rule:new-document.

## Next

- [ ] task:livestream A live stream view like a console: agents append lines to it over the API and a human follows in real time; the stream is per project, persisted, and filterable by agent and task. #in-progress (note: the UI half shipped 2026-09-16 as sessions — see rule:agent-sessions; the runner that executes a session and streams its log is still open)
- [ ] task:session-runner A runner that picks up queued sessions (`_sessions/*.json`, status queued), launches the chosen agent (Claude Code, Codex) with the instruction plus the referenced nodes as context, streams stdout into the session log over `PATCH /api/<product>/sessions/<id>` and marks done/failed. Depends on rule:agent-sessions.. Not implemented yet; part of req:wf2.ui.live and depends on req:wf2.serve.live.
- [ ] task:plan-progress Show progress per document (checked tasks over all tasks) in the rail and on the plan page, part of req:wf2.ui.
- [ ] task:autolink Suggest links for phrases that match a node's title or aliases (later the clerk does this), part of rule:smart-tags.
- [ ] task:phase-1-server Core + server + MCP so agents read and write the graph, implements req:wf2.serve and req:wf2.api.
- [ ] task:affine-polish Bring the shell closer to the AFFiNE look: journals-style recents, favourites, page cover and icon, part of req:wf2.ui.

## Questions

- question:wf2.tasks-in-markdown Tasks live in documents as task nodes rather than in the database the spec planned; the database can index them later. Is that the final answer? Related to decision:wf2.tasks-replace-delta-files.
