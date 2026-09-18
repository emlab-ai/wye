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

- [x] task:livestream A live stream view like a console: agents append lines to it over the API and a human follows in real time; the stream is per project, persisted, and filterable by agent and task. (note: shipped 2026-09-16 as sessions + runner — see rule:agent-sessions and rule:agent-runner; polling, not push, for now)
- [x] task:session-runner A runner that picks up queued sessions (`_sessions/*.json`, status queued), launches the chosen agent (Claude Code, Codex) with the instruction plus the referenced nodes as context, streams stdout into the session log over `PATCH /api/<product>/sessions/<id>` and marks done/failed. Depends on rule:agent-sessions.. Not implemented yet; part of req:wf2.ui.live and depends on req:wf2.serve.live.
- [x] task:duplicate-user-event Every user message in a chat session was recorded twice (a second `user` event 5–15 s after the first, same text, no images). Root cause, not the two-pumps guess: from 09:12 to 16:15 on 2026-09-17 the host spawned Claude with `--replay-user-messages` and emitted a user event on the replay on top of its own; e9a6ba8 removed both, but a process spawned before that keeps its old args and stdout closure until it restarts (session 94ac3cf3e0 did). Verified on a fresh session (one user event per message); appendTranscript now drops a same-turn repeat (`dedupeUserEvents`, tested) and the stored transcripts were cleaned (6 files, 20 events). Part of req:wf2.sessions.quiet-console. (session: 94ac3cf3e0)
- [x] task:image-annotation Annotate images for agents: an Annotate action on an image block opens it as a locked Excalidraw image with shapes, labels and arrows on top; saving exports SVG, a flattened PNG and a text description (regions with positions, arrows from→to, labels) that `wf resolve` appends to the block so an agent reads the annotations and can look at the PNG. Implements req:wf2.ui.annotate-images; part of req:wf2.ui.
- [x] task:plan-as-page Plan-first as a page: PLAN_FIRST names the subject, makes type + card + page exist, writes the plan as proposed blocks on the page, `wf session open` navigates the person there; `wf doc create`, `wf type add`, `wf session open` in bin/wf.js. Part of req:wf2.ui.command-palette; follows decision:wf2.plan-is-a-page. (session: 0e07e8fd53)
- [x] task:clean-slate-default The command box opens on "New conversation" with the remembered agent and folder (localStorage), live conversations as an explicit choice; rule:agent-sessions, action:command-palette and component:command-box refined. Part of req:wf2.sessions.clean-slate; follows decision:wf2.clean-slate. (session: 64813dfdab)
- [x] task:clear-context "Clear context first" tick when a live conversation is chosen in the command box: `fresh: true` on the message route, agent-host#restartFresh (stop, forget agentSessionId / codex thread, divider note, first message built like a new session's with plan-first when ticked), startChat reuses the Live entry and guards the replaced process's close handler. Part of req:wf2.sessions.clean-slate. (session: 64813dfdab)
- [x] task:idle-stop Stop a live-and-idle claude conversation after WF_AGENT_IDLE_MIN minutes (default 30, 0 disables): timer armed on `result`, cleared on a written message; stdin closed, session done with a line saying so; Resume / next message come back with --resume. Part of req:wf2.sessions.idle-stop; closes task:idle-agent-timeout. (session: 64813dfdab)
- [x] task:decision-card DecisionNode in DocEditor: context, choice and alternatives as prose sections (editable text areas via setBodyField, like the question card), everything else behind "details" with the id and the yaml editor. Implements req:wf2.cards.decision-essence; follows decision:wf2.card-essence. (session: 843b0e1f2c)
- [x] task:decision-card-ui-test Run ui-test:decision-card in Chrome and record the result on rule:card-essence. Part of req:wf2.cards.decision-essence. (session: 843b0e1f2c)
- [ ] task:open-from-runner A session run by `wf agent listen` (no live console in the app) should also navigate the person on `wf session open` — the sessions SSE stream would need to carry log-derived events. Part of req:wf2.ui.command-palette.
- [ ] task:plan-page-comments Comments on a plan page reach the agent without the person retyping them: on Adjust the agent diffs the page against what it wrote and reads the person's edits as feedback. Part of req:wf2.ui.command-palette.
- [ ] task:palette-recent-commands The command palette remembers the last commands per product and offers them when it opens (rerun, or edit and run). Part of req:wf2.ui.command-palette.
- [ ] task:ui-tests-in-ci The browser scenarios (ui-test:edit-node-flow, ui-test:table-rows) as a runnable e2e suite: playwright-core with the installed Chrome (channel chrome), packages/web/e2e/*.spec.ts, against the dev server; today they are run by hand. Part of req:wf2.ui.
- [ ] task:plan-progress Show progress per document (checked tasks over all tasks) in the rail and on the plan page, part of req:wf2.ui.
- [ ] task:autolink Suggest links for phrases that match a node's title or aliases (later the clerk does this), part of rule:smart-tags.
- [ ] task:phase-1-server Core + server + MCP so agents read and write the graph, implements req:wf2.serve and req:wf2.api.
- [ ] task:affine-polish Bring the shell closer to the AFFiNE look: journals-style recents, favourites, page cover and icon, part of req:wf2.ui.

## Questions

- question:wf2.tasks-in-markdown Tasks live in documents as task nodes rather than in the database the spec planned; the database can index them later. Is that the final answer? Related to decision:wf2.tasks-replace-delta-files.
