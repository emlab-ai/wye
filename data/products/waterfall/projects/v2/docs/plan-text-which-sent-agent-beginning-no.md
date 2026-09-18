---
node: plan:plan-text-which-sent-agent-beginning-no
type: plan
title: this text, which is sent to agent at the beginning, can you no show it, it is kind of…
status: done
owner: unassigned
last-verified: 2026-09-18
session: c2bbac979d
agent: claude-code
started: 2026-09-18T11:59:17.596Z
finished: 2026-09-18T12:14:24.419Z
part-of: module:v2-plans
---

# this text, which is sent to agent at the beginning, can you no show it, it is kind of…

## Request

> this text, which is sent to agent at the beginning, can you no show it, it is kind of system prompt no need to show to user

_from: module:wf2-plan_

## Context

The "text sent to the agent at the beginning" is the first message lib:agent-host builds (`buildPrompt`,
packages/web/src/lib/agent-host.ts): a product line, "## Instruction" with the request, "## Context" with the refs,
the plan-first protocol (rule:plan-first, decision:wf2.plan-first-is-a-prompt) for palette requests, and "## How to
work". `startProcess` emits that whole text as the `user` event, and component:console shows it as the person's
message. Module module:app-agents; the same happens on a fresh restart (agent-host#restartFresh). The Waterfall
contract itself (lib:agent-prompt) already goes as the system prompt and is not shown — only a note says so.

![[component:console]]

## Plan

The message the agent gets stays as it is — it needs the wrapper. What changes is what the console shows: the user
row shows the request (text and images) as the person wrote it; the full prompt stays on the event, behind a
collapsed "what the agent received" fold, so a person can still see what the agent was told. Transcripts recorded
before keep their rows.

![[req:wf2.console.first-message-is-the-request]]

![[decision:wf2.first-message-shown-as-request]]

## Tasks

![[task:first-message-shown]]

![[task:first-message-fold]]

![[task:first-message-knowledge]]

## Result

The console's first user row now shows only the request (text + images); the Waterfall wrapper the agent received (product line, Context, plan-first, How to work) sits behind a collapsed 'what the agent received' fold. The message to the agent is unchanged. lib/transcript firstUserEvent (tested), ChatEvent.prompt, agent-host on both Claude and Codex paths and on fresh restarts, Console <details>. Verified in Chrome (ui-test:first-message-fold). Old transcripts keep their rows. Commit 8952936. Knowledge: decision:wf2.first-message-shown-as-request (proposed, for the inbox), req:wf2.console.first-message-is-the-request shipped, task:first-message-shown / -fold / -knowledge done.

Blocks this plan produced:

- removed req:wf2.probe-team — Probe
- removed module:probe-team-links — Probe team links
- changed page:web/context-column — web/context-column
- added req:wf2.ui.column-frame — The context column's bar and message box stay put; only its content scrolls
- added rule:column-frame — column-frame
- added ui-test:column-frame — column-frame
- added decision:wf2.column-frame-header-scrolls — A session's header scrolls with the conversation; only the bar and the message box are pinned
- added task:column-frame-layout — `.peek` becomes a flex column:
- added task:column-frame-follow — component:console finds its nearest scroll ancestor, reads "at the end" from its scroll and scrolls it to the 
- added task:column-frame-ui-test — ui-test:column-frame run in Chrome with playwright-core against the dev server:
- added task:column-frame-knowledge — req:wf2.ui.column-frame and rule:column-frame shipped;
- changed component:doc-props — doc-props
- changed req:wf2.page.node — Every page is a node of the type it declares
- changed req:wf2.page.header-card — The page header is the page node's card with the type's properties
- changed req:wf2.page.retype — Choosing another type for a page moves its node and every link to it
- changed req:wf2.page.create-typed — A new page can be created as an instance of a type
- changed rule:page-node-line — page-node-line
- changed rule:doc-retype — doc-retype
- added test:page-node — The page as a typed node — parser and check
- added test:retype — rewriteId and retypeFrontmatter
- added ui-test:page-node — A page created as a team, filled in the header, listed in the team table, retyped to person with its links following
- changed task:page-node-parse — lib/parse.js:
- changed task:page-node-web-helper — packages/web/src/lib/doc.ts:
- changed task:page-node-header — component:doc-props becomes the page node's card:
- changed task:page-node-retype — packages/web/src/lib/retype.ts (pure, tested):
- changed task:page-node-create — component:new-doc and `wf doc create --type <slug>`:
- changed task:page-node-types-page — page:web/types:
- changed task:page-node-ui-test — ui-test:page-node in Chrome:
- changed task:page-node-knowledge — After shipping:
- changed store:documents — documents
- changed task:new-226 — make sure that each page is also a node, like any other block, and we can set type for it too, to choose prope
- added req:wf2.console.first-message-is-the-request — a conversation's first message goes to the agent (a new session, or a fresh restart with a queued item)
- added decision:wf2.first-message-shown-as-request — The user row shows the instruction; the full prompt rides on the event behind a fold
- added task:first-message-shown — lib:agent-host:
- added task:first-message-fold — component:console:
- added task:first-message-knowledge — After shipping:
- added task:plan-type-agent-prop — The plan pages the app writes (plan:plan-…, type:plan) carry `agent:` and `session:` in their frontmatter;
- changed component:console — console
- added ui-test:first-message-fold — The console's first user row is the request; the wrapper opens from a fold

34 paragraphs added or changed — [per document](/waterfall/sessions/c2bbac979d/changes)
