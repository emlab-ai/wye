---
node: module:todo
type: module
title: TODO
status: proposed
owner: unassigned
last-verified: 2026-09-17
order: 40
---

- [x] task:new-441 in session window if you can show size of context, and tokens spent already by agent - show it (session: 53f99bfd98 c8eadd53da, produced: pr:12 module:wf2-dev module:app-documents module:wf2-test pr:11 module:app-agents)
  - [ ] task:new-687 subtask

    bug:new-732 test

- [x] task:new-917 if we have codex or claude process running it must be visible as live/active sessions, and rename sessions to agents /tabl (session: 6ca1fd641c ffab751604, produced: pr:9 module:ontology-design module:wf2-dev module:app module:ontology pr:6 pr:1 pr:4 pr:2 pr:5 pr:3 module:v2-prs module:wf2 module:wye module:bugs module:app-documents module:wf2-test)
- [x] task:new-453 we need to add. a section/block or page which can show us all cards of specific type with filter, i.e. if i want to show all pages, or all manager or all tasks .. (session: 53f99bfd98, produced: module:app-knowledge module:dev-design module:test-design module:app-documents module:app-graph module:app-shell module:app module:ontology module:scratch-view-block-test, progress: 90)
- [ ] task:new-954 ![image](assets/2026-09-17-image-56ba74.png) do not show time stamp, it takes a lot of space #done
- [x] task:new-226 make sure that each page is also a node, like any other block, and we can set type for it too, to choose properties (session: 64813dfdab a4dbc39398, produced: pr:11 module:wf2-dev module:app-knowledge module:wf2-test pr:9 pr:12 module:app-documents)
  - [ ] task:new-428 childe task
- [x] task:new-286 ctrl c/v is not working if i edit current block![image](assets/2026-09-17-image-709717.png) , so i can't copy text inside blcok, and can't paste
- [x] task:session-knowledge-changes Show which part of the knowledge base a session changed: per turn on the turn-done row (documents and nodes as tags, from the session's artifacts) and a live Knowledge strip in the session header. Part of req:wf2.sessions.knowledge-changes. Or this one we need to show in-memory page, with all blocks added / modified when task completed, for this we need to attach to all such blocks a run id (like commit hash), and filter by it (session: 6fdfc7ab9d 53f99bfd98, produced: module:scratch-attribution module:app-agents)
- [x] task:one-command-box One CommandBox for ⌘P and every Send-to-agent button: union of both dialogs (text, tags, images, to-picker defaulting to the live conversation, agent/folder/plan-first for a new one), Enter runs; remove SendToAgentHost and CommandPalette; refine the knowledge. Part of decision:wf2.one-command-box.
- [x] task:idle-agent-timeout because the goal of the wye is to be a memory of all agents and a knowldge, we must start every task from clear slate? if task has nothing to do with previouse task, we no need to reuse the same context, so clear state of execution agent (make a checkbox, smth clear context before next run), but if we chat with agent in context window keep context (session: 64813dfdab, produced: module:scratch-view-block-test module:app-knowledge module:dev-design module:test-design module:app-agents module:probe-team-links module:app-documents module:app-storage)

goal:new-650 Implement a feature to install system skills and templates, i would like to store templates in the system, and install them optionally to the project, think about update, unisnstall etc
  - [ ] task:new-202 Implement a feature to install system skills and templates, i would like to store templates in the system, and install them optionally to the project, think about update, unisnstall etc
  - [x] task:wye.research-implement-a-feature-to-install Research Implement a feature to install system skills and templates, i would like to store templates in the system, and and write it up in module:implement-a-feature-to-install-system-skills-and-templates-i (by: stage:feature.research, since: 2026-09-22, part-of: goal:new-650, worker: claude-code, session: 39b69e4b09, produced: module:implement-a-feature-to-install-system-skills-and-templates-i module:v2-workflow-runs module:components module:eval-ontology module:constitution module:app-documents module:memory module:req-ontology module:wf2 module:app-agents module:app-knowledge module:app-work module:bugs module:librarian module:ontology-engine pr:1 pr:11 pr:12 pr:13 pr:14 pr:15 pr:16 pr:18 pr:19 pr:24 pr:3 pr:4 pr:5 pr:6 pr:7 pr:8 pr:9 module:req-shell module:shell-engine module:evaluation-plan module:wf2-plan)
  - [ ] task:wye.every-product-s-installed-skill-refine Every product's installed skill:refine is frozen at the pre-40e115e wording of how to write a rule, and the librarian follows the document over prompts/librarian-system.md — re-sync the five installed sets wye/evaluation, eval-mab/cr, yessensei/inventory, yessensei/offline, zz-import/main once question:install.update-vs-edits is answered (by: agent:39b69e4b09, since: 2026-09-22, part-of: goal:new-650)
  - [ ] task:wye.yessensei-carries-two-installed-skill-sets yessensei carries two installed skill sets, 7 in projects/inventory and 12 in projects/offline, with the same ids — decide which survives and migrate, once question:install.where-it-lands is answered (by: agent:39b69e4b09, since: 2026-09-22, part-of: goal:new-650)
  - [x] task:wye.write-the-prd-for-implement-a Write the PRD for Implement a feature to install system skills and templates, i would like to store templates in the system, and in module:implement-a-feature-to-install-system-skills-and-templates-i, from module:implement-a-feature-to-install-system-skills-and-templates-i (by: stage:feature.prd, since: 2026-09-22, part-of: goal:new-650, worker: claude-code, session: dfb890d304, produced: run:feature-1 module:eval-runs module:librarian module:wf2-test module:implement-a-feature-to-install-system-skills-and-templates-i)
    - [ ] task:wye.run-produces-slug-collision A stage whose produced document's title is truncated by slugify binds to an existing document with the same slug: run:feature-1 bound prd to the research document, so the PRD was written into it. lib/runs-run.ts `already` lookup and the slug guess in `bindings` must not match a document another name is bound to. part of goal:new-650
    - [ ] task:wye.split-install-prd Move the PRD sections (Problem statement to Coverage) of module:implement-a-feature-to-install-system-skills-and-templates-i into a PRD document of their own, once task:wye.run-produces-slug-collision lets the run bind one. part of goal:new-650
