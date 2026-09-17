---
node: module:todo
type: module
title: TODO
status: proposed
owner: unassigned
last-verified: 2026-09-17
---

- [ ] task:new-441 in session window if you can show size of context, and tokens spent already by agent - show it
- [ ] task:new-917 if we have codex or claude process running it must be visible as live/active sessions, and rename sessions to agents
- [ ] task:new-453 we need to add. a section/block which can show us all cards of specific type with filter, i.e. if i want to show all pages, or all manager or all tasks ..
- [ ] task:new-954 ![image](assets/2026-09-17-image-56ba74.png) do not show time stamp, it takes a lot of space #done
- [ ] task:new-226 make sure that each page is also a node, like any other block, and we can set type for it too, to choose properties
- [ ] task:session-knowledge-changes Show which part of the knowledge base a session changed: per turn on the turn-done row (documents and nodes as tags, from the session's artifacts) and a live Knowledge strip in the session header. Part of req:wf2.sessions.knowledge-changes.
for this one we need to show in-memory page, with all blocks added / modified when task completed, for this we need to attach to all such blocks a run id (like commit hash), and filter by it
- [x] task:one-command-box One CommandBox for ⌘P and every Send-to-agent button: union of both dialogs (text, tags, images, to-picker defaulting to the live conversation, agent/folder/plan-first for a new one), Enter runs; remove SendToAgentHost and CommandPalette; refine the knowledge. Part of decision:wf2.one-command-box.
