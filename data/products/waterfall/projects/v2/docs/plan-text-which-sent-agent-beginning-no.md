---
node: plan:plan-text-which-sent-agent-beginning-no
type: plan
title: this text, which is sent to agent at the beginning, can you no show it, it is kind of…
status: proposed
owner: unassigned
last-verified: 2026-09-18
session: c2bbac979d
agent: claude-code
part-of: module:wf2-plan
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

_Written by the app when the session ends._
