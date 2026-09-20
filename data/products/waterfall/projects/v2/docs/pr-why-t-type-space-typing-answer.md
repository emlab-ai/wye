---
node: pr:pr-why-t-type-space-typing-answer
type: pr
title: why i can't type space when typing answer??? also no answer in details, it must be like…
status: done
owner: unassigned
last-verified: 2026-09-19
session: 5e84bc193c
agent: claude-code
started: 2026-09-19T13:49:56.575Z
part-of: module:v2-prs
finished: 2026-09-19T14:05:17.265Z
---

# why i can't type space when typing answer??? also no answer in details, it must be like…

## Request

> why i can't type space when typing answer??? also no answer in details, it must be like a content using editor

_from: plan:plan-build-one-too_

## Context

_What the agent found — modules, documents, nodes and code the request touches — as tags and embeds._

The space is lost, not blocked: the answer, q, context, choice and alternatives text areas of component:node-cards are controlled inputs whose value round-trips through `setBodyField` (packages/web/src/lib/yaml-form.ts#fieldsToBody trims the value) and `parseBody` (packages/web/src/lib/graph.ts:84 trims every line of a `>` scalar), so the trailing space the person just typed is gone on the next render — the letter after it lands, the space never does; Enter folds to a space the same way. Playwright reproduced it (`ab cd` → `abcd`); no key handler prevents anything.

The details panel (component:node-editor) shows `q` twice — once as the text field and once as the property type:question declares — and no answer at all, because type:question has no `answer` property and no document carries an `answer:` key. rule:card-essence says the card shows q and answer; rule:card-fold hides a node's content on its card; decision:ontology.uniform-content gives every node the same `content`; the agent contract already says a question is answered with a decision block next to it.

## Plan

_What was understood; questions as `question:` blocks, decisions as `decision:` blocks; the requirements and rules it proposes embedded from the pages they live on._

```yaml
- id: decision:wf2.answer-is-content
  title: A question's answer is its content, edited with the block editor; no `answer:` key
  status: proposed
  date: 2026-09-19
  by: Alex
  evidence: [session:5e84bc193c]
  affects: [rule:card-essence, rule:card-fold, req:wf2.ui.card-preview, decision:wf2.card-shows-no-content, component:node-cards, component:node-editor, type:question]
  context: >
    The card's answer was a plain text area over a yaml key: no spaces survive the round-trip, no newlines, no
    tags, no decision block. The person asked for the answer to be content, edited with the editor, and visible
    in the details. Every node already has content (decision:ontology.uniform-content) and the contract already
    answers a question with a decision block under it.
  choice: >
    The blocks under a question block are its answer. On the page they are never folded (the one exception to
    rule:card-fold) and render under the card as its "answer" section; an unanswered question shows a
    placeholder that inserts the first block and puts the caret there. In the context column the question's
    Content editor is the answer. The `answer:` key is dropped from the card; the other prose sections (q,
    context, choice, alternatives) keep local state while typed so a space is never lost.
  alternatives: >
    keep `answer:` as a yaml key and edit it with a nested BlockNote (a lossy markdown round-trip inside a
    folded scalar, and an editor inside an editor); fix only the text area (spaces, but still no rich answer).
  consequences: >
    a resolving decision block sits under its question, where the Inbox and `wf` already look; an embedded
    question card shows a chip to open the answer instead of the answer itself.
```

## Tasks

_`- [ ] task:` lines, `part of pr:pr-why-t-type-space-typing-answer`; their check state is what is in progress._

- [x] task:pr-why-t-type-space-typing-answer why i can't type space when typing answer??? also no answer in details, it must be like… (worker: claude-code, session: 5e84bc193c, produced: pr:pr-work-task-app-trace-requirements-every module:app-documents module:wf2-dev)
- [x] task:wf2.prose-area Card prose sections keep local state; `sameProse` in yaml-form with a test part of pr:pr-why-t-type-space-typing-answer (session: 5e84bc193c)
- [x] task:wf2.answer-content Question card: answer section is the block's children, unfolded, placeholder inserts the first block part of pr:pr-why-t-type-space-typing-answer (session: 5e84bc193c)
- [x] task:wf2.details-q-once Details panel shows q once and labels a question's content as its answer part of pr:pr-why-t-type-space-typing-answer (session: 5e84bc193c)
- [x] task:wf2.answer-rules rule:card-essence and rule:card-fold updated through `wf impact` part of pr:pr-why-t-type-space-typing-answer (session: 5e84bc193c)
- [ ] task:wf2.prose-newlines A newline typed in a card's prose section (q, context, choice, alternatives) is folded to a space on save (`fieldsToBody` writes a `>` scalar, `parseBody` folds `|` too); keep paragraphs with a `|` scalar read literally part of pr:pr-why-t-type-space-typing-answer

## Result

Space was lost, not blocked: the card's prose text areas were controlled by a value that round-trips through fieldsToBody/parseBody (trim + fold), so the trailing space vanished on the next render. ProseArea keeps the typed text local (sameProse, tested). A question's answer is now its content (decision:wf2.answer-is-content, proposed): the blocks under the question render under the card as the answer section, never folded; a placeholder inserts the first block; the details panel shows q once and labels the Content as the answer. rule:card-essence, rule:card-fold, req:wf2.ui.card-preview updated via wf impact. Follow-up task:wf2.prose-newlines. Commit cdb0d1d.

Blocks this plan produced:

- added task:pr-why-t-type-space-typing-answer — why i can't type space when typing answer???
- added decision:wf2.answer-is-content — A question's answer is its content, edited with the block editor; no `answer:` key
- added task:wf2.prose-area — Card prose sections keep local state;
- added task:wf2.answer-content — Question card:
- added task:wf2.details-q-once — Details panel shows q once and labels a question's content as its answer part of plan:plan-why-t-type-space-ty
- added task:wf2.answer-rules — rule:card-essence and rule:card-fold updated through `wf impact` part of plan:plan-why-t-type-space-typing-ans
- changed task:app.trace-requirements — For every requirement in the PRD that the app satisfies, add the component, lib or op that satisfies it to its
- added pr:pr-work-task-app-trace-requirements-every — Work on task:app.trace-requirements: For every requirement in the PRD that the app…
- changed rule:card-fold — Every card's header carries `FoldToggle` when the node has content — a chip "▸ n blocks" whose click opens the
- changed rule:card-essence — A question card shows q and its answer; the answer is the question's content (decision:wf2.answer-is-content) 
- changed req:wf2.ui.card-preview — A card of a node with content shows only its own first block; the content is in the details
- added task:wf2.prose-newlines — A newline typed in a card's prose section (q, context, choice, alternatives) is folded to a space on save (`fi

29 paragraphs added or changed — [per document](/waterfall/sessions/5e84bc193c/changes)
