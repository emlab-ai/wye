---
node: module:librarian
type: module
title: Definition — the librarian
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:app
order: 44
---

# Definition — the librarian

Definition — the librarian

## Decisions

<!-- list:decision -->

```yaml
- id: decision:exec.wye-is-a-role
  title: Wye is a session role — the librarian — with the clerk's guardrails, not a new runtime
  date: 2026-09-19
  status: approved
  affects: [req:wf2.clerk, rule:agent-host, rule:agent-contract, component:command-box]
  part-of: goal:exec.define-first
```

  - choice:exec.wye-is-a-role A session has a role: worker (today) or librarian. A librarian session runs on the same host with a different system prompt (prompts/librarian-system.md: read Wye, explain, ask along the requirement shape, propose blocks, never edit code, never mark anything approved) and a closed tool set — the wf read commands, `wye propose` (writes proposed blocks into home documents and embeds them on the plan), `wye plan` (the plan's status and definition), AskUserQuestion — with no shell, no file writes outside the product's documents, and a budget (req:wf2.clerk.budget). "Ask Wye" in the command box starts a librarian session on a new plan (status defining); the same role serves the on-demand explain ("what do we know about X") from any node.

  - context:exec.wye-is-a-role The v2 design has an internal agent, the clerk (req:wf2.clerk): propose-only, budgeted, cannot trigger itself. Sessions today host Claude Code and Codex as child processes with the agent contract as system prompt (rule:agent-host). The person wants to talk to "the system", which must read the graph, explain it and write proposed knowledge — never code.

  - alternative:exec.wye-is-a-role The worker agent with plan-first (it is a coding agent reading code; the person wants product state, and it would edit the code the moment it is allowed); a hand-rolled tool-use loop over the Messages API (the v2 clerk design — a second runtime to maintain when the host already streams, asks questions and records artifacts).

  - consequence:exec.wye-is-a-role A role on the session record and the plan; a second system prompt; a tool allow-list per role on the host; the librarian's writes are proposed blocks only, so the Inbox and the verdict pass cover them.

```yaml
- id: decision:exec.librarian-may-build
  title: "Build it" said to the librarian starts the build — the librarian runs `wye plan build`, it never tells the person to press a button
  date: 2026-09-20
  status: superseded
  superseded-by: decision:wf2.pr-approval-is-the-persons-click
  refines: decision:exec.wye-is-a-role
  affects: [decision:exec.wye-is-a-role, rule:build, req:exec.build-from-definition]
  by: agent:claude
  part-of: goal:exec.define-first
```

  - choice:exec.librarian-may-build `wye plan build <plan> [--worker claude-code|codex|runner] [--force]` — the plan's request task assigned with `build: <plan>` through op:api.work.assign, exactly what the Build button does (rule:build): the Definition goes with it, unagreed blocks listed as such, the plan moves to building. The librarian's tool set includes it, and its prompt says: when the person says build / go ahead / do it / implement, run it at once, report the session that started and what was still open, and finish. The librarian still writes no code — the worker does. Never "that is yours to press".

  - context:exec.librarian-may-build On 2026-09-20 the person told the librarian "i asked to build this one" on pr:18 and got a paragraph explaining that Build was theirs to press (decision:exec.wye-is-a-role: the librarian writes no code; rule:build lives in the UI; the wf CLI had no Build). Nothing started. The person's word in the conversation is the same approval the button gives.

  - alternative:exec.librarian-may-build Keep Build UI-only and have the librarian ask the person to press it (what happened; the person had already said it); let the librarian implement (breaks the role).

  - consequence:exec.librarian-may-build bin/wye.js gains `plan build`; prompts/librarian-system.md and the host's librarian protocol gain the line; rule:build's "a librarian's hold does not refuse it" already covers the hand-over.

```yaml
- id: decision:exec.kind-by-nature
  title: A block's kind is what it is — a requirement is an observable behaviour in the person's words; how the product does it is a rule or a decision
  date: 2026-09-20
  status: approved
  affects: [rule:agent-contract, decision:exec.wye-is-a-role, req:exec.wye-proposes]
  by: agent:claude
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:exec.kind-by-nature Both prompts (prompts/agent-system.md, prompts/librarian-system.md) and the host's librarian protocol carry a "Which kind a block is" section with one test: could a person check it from outside the product without reading code — yes, a requirement (when / then / unless, outcome in the title, no component ids, no mechanism in `then`); no and the code guarantees it — a rule with a source; no and someone chose it — a decision with alternatives. req:exec.wye-proposes is rewritten as the example; the other mechanism-shaped requirements of this PRD are re-kinded by task:exec.rekind.

  - context:exec.kind-by-nature On 2026-09-20 the person read req:exec.wye-proposes in the Inbox — "Wye proposes the definition as blocks in their home documents, embedded on the plan" — and said it is not a requirement: it is a statement of system behaviour, a decision. Agents (this one included) had been writing mechanism as requirements because the contract said what kinds exist, not how to tell them apart.

  - alternative:exec.kind-by-nature Leave the kinds to judgement (what produced the mistake); a linter that rejects ids in requirement titles (a later shape on type:req, decision:memory.shapes).

  - consequence:exec.kind-by-nature Prompts grow by a section; a review of the E.1–E.5 requirements; a candidate shape for type:req.

```yaml
- id: decision:exec.plan-lifecycle
  title: A plan goes proposed → defining → defined → building → done, and its Definition section is the set of blocks it will build
  date: 2026-09-19
  status: superseded
  superseded-by: decision:wf2.pr-lifecycle
  affects: [type:pr, rule:pr-doc, lib:pr-doc, req:exec.dispatch]
  part-of: goal:exec.define-first
```

  - choice:exec.plan-lifecycle A plan document gains a Definition section between Context and Plan: every block the librarian or the person proposed for this request — requirements, decisions, constraints, questions, and change records of edits to existing nodes — defined in their home documents and embedded here (rule:embed-line), each with its review state. Statuses: proposed (created), defining (a librarian session is on it), defined (every block in Definition is approved or resolved and no open contradiction touches them — computed, shown as a check), building (a worker holds its request task), done, cancelled. "Build" on a defined plan assigns the request task (req:exec.dispatch) with the Definition — the approved blocks' text, the change records' before / after, the constraint packet — as the instruction's context; a plan that is not defined can still be built, and the button says what is unagreed. The Definition is the plan's change set: the Work view and the plan page show it as "n blocks, k approved, j open", and a plan can be built weeks later by a different worker from the same page.

  - context:exec.plan-lifecycle type:pr today: proposed → building (after Proceed) → done | cancelled (rule:pr-doc). The person wants to agree on all requirements first, then let it be implemented, and have every proposed change tracked so it can be built later — the v0.1 delta (entity:delta, "how a feature enters the graph before code") as a living page.

  - alternative:exec.plan-lifecycle Agree in the conversation only (the transcript is not a definition anyone can build from later); a separate spec document per request (the plan is that document); statuses on the conversation rather than the plan (a plan outlives its sessions).

  - consequence:exec.plan-lifecycle type:pr gains statuses and the Definition section; lib:pr-doc writes and reads it; `defined` is computed from the embedded blocks' statuses; Build is a dispatch with the definition as context; rule:pr-doc is refined.

```yaml
- id: decision:wf2.pr-lifecycle
  title: The plan document is the Prompt Request — draft → refining → approved → building → done | failed | cancelled, readiness computed
  date: 2026-09-20
  status: approved
  affects: [type:pr, rule:pr-doc, lib:pr-doc, lib:pr-docs, req:wf2.pr, op:api.pr, component:pr-head]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.pr-lifecycle type:pr becomes type:pr (`pr:<slug>`, `pr-<slug>.md` under the project's PRs page), the same page renamed and sharpened: Request / Context / Definition / Impact / Tasks / Result (the Plan section goes — prose to Context, decisions and questions are blocks in Definition; Impact is new, for the scheduler). Statuses: draft (nobody on it), refining (a librarian session is on it; back to draft when it leaves), approved (the person's click), building (a worker session runs), done | failed | cancelled. Readiness is computed, never a status — definition · agreed · impact · no contradiction · tasks — shown as a list on the PR's head. Existing plan documents were migrated in place (scripts/plans-to-prs).

  - context:wf2.pr-lifecycle decision:exec.plan-lifecycle had a plan go proposed → defining → defined → building with `defined` computed from the Definition. alex wanted a request to be one thing from typing it to its build: refined until it is clear, approved explicitly, then built by an agent — and several built in parallel when they do not overlap.

  - alternative:wf2.pr-lifecycle A PR next to plans (two folders, two types) — rejected: one concept. A UI rename only — rejected: the documents and the CLI would say plan while the UI says PR. `queued` as a status — folded into approved: the approved PRs are the queue, in order of approved-at.

  - consequence:wf2.pr-lifecycle lib:pr-doc / lib:pr-docs, op:api.pr, component:pr-head, component:pr-folder, page:web/prs; wye pr (plan as an alias); type:pr in the base ontology; rule:pr-doc, rule:prs-folder, rule:pr-type-base refined. The scheduler (scope from Definition + impact, N parallel runners from Settings) is the next deliverable.

```yaml
- id: decision:wf2.pr-approval-is-the-persons-click
  title: A PR is approved by the person's click on its page — the librarian never approves and never builds
  date: 2026-09-20
  status: approved
  affects: [decision:exec.librarian-may-build, op:api.pr, component:pr-head, rule:build]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.pr-approval-is-the-persons-click Approve on the PR's head (and wye pr approve): sets `status: approved`, `approved-by`, `approved-at`; when the readiness list is not green the button names what is unagreed and a second click approves anyway. A live refining session on the PR is told once and stopped (lib:pr-sessions). Cancel and Reopen are the person's too. The librarian's brief says: when the person says build it, tell them the request is approved by the button on its page and whether the readiness list is green.

  - context:wf2.pr-approval-is-the-persons-click decision:exec.librarian-may-build let "build it" said to the librarian start the build. With PRs the build is started by the scheduler from an approved PR; approval has to be one explicit act by the person.

  - alternative:wf2.pr-approval-is-the-persons-click Automatic approval when the Definition is fully agreed — rejected: the person decides. Approve only when fully agreed — rejected: building on proposals stays possible, said out loud.

  - consequence:wf2.pr-approval-is-the-persons-click decision:exec.librarian-may-build is superseded; Build on a task shows only when its PR is approved (until the scheduler takes over).

```yaml
- id: decision:ontology.one-of-many-of
  title: >
    A property is one of / many of a type or of values — oneOf[...] and manyOf[...] beside ref, list of and enum
  date: 2026-09-21
  status: approved
  affects: [type:node, lib:parse, component:type-view, component:node-editor, component:doc-props]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:ontology.one-of-many-of Two spellings for the same things: `oneOf[manager]` = `ref manager`, `manyOf[team]` = `list of team` when the one name in the brackets is a declared type; `oneOf[junior, senior]` = `enum [junior, senior]`; `manyOf[js, go]` is new — a multi-select of values (`enum` with `many`), checked item by item. The type page picks the value type from a list (string · text · number · date · month · yes / no · one of type → · many of type → · one of values · many of values · list of strings) with the target type or the values beside it; an instance edits one of type as a select, many of type as tags with × and an "+ add" picker of that type's instances, one of values as a select, many of values as toggles — on cards in the column and on a document's properties alike.
  - context:ontology.one-of-many-of The property grammar had `ref <type>`, `list of <type>` and `enum [a, b]`; a multi-select of values did not exist, the type page took the value type as free text, and a many-link was edited as comma-separated text. alex: types need enums and links — an employee's manager is oneOf[manager], manyOf for a multi-select.
  - alternative:ontology.one-of-many-of Only the new spellings — rejected: the base ontology and every product card use the old ones. A JSON schema for properties — rejected: the yaml card is the type.
  - consequence:ontology.one-of-many-of lib/parse.js reads the type names first so oneOf[x] can tell a type from a value; lib/graph.js validates a multi-select item by item; component:type-view, component:node-editor, component:doc-props.

```yaml
- id: decision:wf2.card-is-name-and-properties
  title: A block in a document is its name and properties; its description is content, read and edited in the column
  status: approved
  date: 2026-09-21
  affects: [component:node-cards, component:doc-editor, component:peek-panel, decision:wf2.decision-free-text, decision:wf2.req-free-text]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - context:wf2.card-is-name-and-properties Every block is by design a name and a content / description (alex, 2026-09-21). Cards rendered their description inline — a requirement's text, a decision's parts, a goal's description under the card as child blocks — so the content sat visually outside the card and the card read as a form.

  - choice:wf2.card-is-name-and-properties In the document a card shows its name (the text line) and its properties; the content — text and child blocks — is folded away behind "▸ n blocks" and the kind pill, and is read and edited in the column's Content editor, an md block editor. A question is the exception: its answer shows under it. The document editor never unfolds a card's children.

  - consequence:wf2.card-is-name-and-properties component:node-cards renders no text or prose on a card; useFold in component:doc-editor is always folded; the column is where descriptions live.

```yaml
- id: decision:wf2.decision-free-text
  title: A decision is a title and free text — its content blocks are the description; alternatives and consequences are child blocks, not a form
  date: 2026-09-21
  status: approved
  affects: [type:decision, component:node-cards, lib:consolidate, lib:inbox, prompt:librarian-system, prompt:agent-system]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.decision-free-text A decision is its title and its content — the blocks indented under the card, edited in place in the document and in the column (req:ontology.content). Four child block types in the base ontology — context, choice, alternative, consequence — and a new decision is born with all four under it as `- context:<slug> …` lines the person edits or deletes, so they are optional by being blocks. Every existing decision's context / choice / alternatives / consequences keys were moved into exactly those child blocks (scripts/decisions-to-content, then a pass turning the paragraphs into typed lines); no card carries the keys. Goals the same: description moved into the content. The librarian, the worker, consolidation and the inbox write the card and the child lines under it; decisions and goals show their content unfolded, and a card's text is editable on every kind; in the column a goal's tasks are the task data table under its content.

  - context:wf2.decision-free-text The decision card was an ADR form — context, choice, alternatives, consequences as fields. alex: a card should be a name and a description, the description a markdown block editor like a page, and where structure is wanted, typed child blocks.

  - alternative:wf2.decision-free-text Rewrite the 130 existing decisions into text — rejected: they read fine as prose. Keep the form as optional fields on new cards — rejected by alex.

  - consequence:wf2.decision-free-text type:decision's context / choice / alternatives / consequences are optional keys nothing asks for; type:alternative, type:choice, type:consequence in schema/base-ontology.md and kinds.yaml.

```yaml
- id: decision:wf2.parts-are-content
  title: A node's text properties are its content — statement, scope, rationale, note as child blocks, like a requirement's when / then / unless
  date: 2026-09-22
  status: approved
  refines: decision:wf2.req-free-text
  affects: [type:constraint, type:rule, type:statement, type:scope, type:rationale, type:note, lib:parse, component:node-cards, component:node-editor, lib:node-blocks, lib:embed]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.parts-are-content What a constraint or a rule says is content under its card: `statement:`, `scope:` (in words), `rationale:` and `note:` child blocks — four part types in the base ontology beside when / then / unless and context / choice / alternative / consequence — each a block the person edits, moves or deletes; a new constraint or rule is born with its parts (the slash menu), and the column offers the missing ones. A key with ids (`scope: [module:x]`, `rationale: decision:y`) is a link and stays on the card. The parser reads every part back into the old key as a generated value and marks it in `partKeys`, so the constraint packet, the constitution, the judge and search keep reading `statement` while the card and the column never show a part twice; a card with no title reads as its statement. scripts/parts-to-content.js moves what exists.

  - context:wf2.parts-are-content A constraint card showed statement, scope and rationale as property rows — the person asked for it to be built like a requirement and a goal, where the text is blocks (2026-09-22). Requirements and decisions had already moved (decision:wf2.req-free-text, decision:wf2.decision-free-text); constraints and rules had not, and eight readers depend on `statement` on the body.

  - alternative:wf2.parts-are-content Rewrite the eight readers to walk content — more code for the same result and every future reader would have to know; keep property rows for constraints — the inconsistency the person objected to.

  - consequence:wf2.parts-are-content type:statement, type:scope, type:rationale, type:note; `partKeys` on a node; Wye's 8 constraints and 163 rules migrated; an agent that reads a rule with `wye node` still sees `statement:` in the body (read back), and the prompts still say "a rule with statement and source" — the write form for new rules is the part block.

```yaml
- id: decision:wf2.req-free-text
  title: A requirement is free text in the person's words — when / then / unless is not a template
  date: 2026-09-21
  status: approved
  affects: [type:req, prompt:librarian-system, prompt:agent-system, component:node-cards, lib:inbox]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.req-free-text A requirement is its title and its content — under the card, child blocks of three types in the base ontology, when / then / unless (the trigger, the outcome, the exception), plus any prose paragraph; a new requirement is born with the three under it, blocks the person edits or deletes. Every existing requirement's text / when / then / unless keys were moved into those child blocks (205 cards); no card carries them. The librarian, the worker, describe-module and the inbox write the card and its child lines; the card shows the name and the properties, the content is read and edited in the column (decision:wf2.card-is-name-and-properties).

  - context:wf2.req-free-text type:req was defined as "when <trigger>, <actor> <outcome> [unless <exception>]" and every prompt (the librarian, the worker, describe-module) made the agents fill those three slots. alex: requirements must be free-form text.

  - alternative:wf2.req-free-text Drop the three keys and rewrite the 200 existing requirements — rejected: they read fine and nothing depends on the keys. Keep the template — rejected by alex.

  - consequence:wf2.req-free-text Questions from the librarian no longer come "along the requirement shape" but for what the request leaves unsaid; describe-module writes free-text requirements from code.

```yaml
- id: decision:wf2.pr-scheduler
  title: Approved PRs are built by the app — a dispatcher, N parallel runners, no two overlapping scopes at once
  date: 2026-09-20
  status: approved
  affects: [req:wf2.pr, lib:dispatch, lib:pr-scope, lib:settings, op:api.pr, component:pr-head, component:pr-folder]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.pr-scheduler A PR's scope (lib:pr-scope) is its Definition ids, the ids its request tags and what lib/impact's structural candidates reach from them (two hops, weight ≥ 0.5) — written to the page as `scope` with `scope-of` (the hash of the Definition ids) after intake and whenever the Definition moves; readiness's impact check is that freshness. The dispatcher (lib:dispatch) runs on approve, on every session end and every 30 s: the PRs building (status building with a queued or live worker session; a stale one goes back to approved), the free slots (Settings › Agents, parallel runners, default 1), and the approved PRs in approval order — each whose scope does not overlap a building PR's starts through assignTask(build) with the Definition as context; the rest wait with the reason on the head and in the PRs folder (overlaps #12 (ids) / no free slot). No head-of-line blocking. Build now stays as the manual override. External wye runner processes keep taking backlog tasks; they do not take PRs.

  - context:wf2.pr-scheduler Under D1 an approved PR waited for a manual Build; alex approved #27 and asked why nothing started. The spec's second deliverable: the app runs the builds itself, several at once when they cannot collide.

  - alternative:wf2.pr-scheduler External runners only — rejected: nothing would run unless a runner was started by hand. Scope by document or module — rejected as too coarse for a first cut; the ids can be widened later.

  - consequence:wf2.pr-scheduler The build agent runs in the product's repo — the same working tree a person may be editing; two builds never share a scope but may share files. lib:settings gains agents; op:api.pr gains rescope and the waiting reason.

```yaml
- id: decision:wf2.hooks-and-skills
  title: Skills are documents under a Skills page, hooks are cards in a Hooks document, the engine fires on the rebuild diff and everything goes through review
  date: 2026-09-21
  status: approved
  affects: [req:wf2.hooks, lib:skills, lib:hooks, lib:hooks-run, lib:watch, lib:agent-host, lib:agent-prompt, type:skill, type:hook, type:template]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.hooks-and-skills A skill (type:skill, extends module) is `skill-<slug>.md` under the project's Skills page: `role` (librarian | worker), `takes`, `writes`, and the body is the instruction. The shipped prompts are written there as skill:refine, skill:build, skill:describe-module (plus skill:define-tests) the first time a product opens; the host reads the librarian's and the worker's system prompt from those documents when present, else the prompt files — so a person edits what the agents follow, and nothing breaks without the documents. A hook (type:hook) is a yaml card in `hooks.md`: `on: <kind>.<event>` (created, status:<x>, linked:<verb>, pr.approved, pr.built, session.done; kind may be *), `where:` filters, `do:` lines (run skill:<id>, add <template>; assign / notify later), `once` (default true), status active | paused. Events come from where changes already surface — the watcher's rebuild diff (lib:hooks, eventsFromDiff), Approve, the session end — never from a poll. A firing is a record in `_hooks/` (once holds through it; wye hooks lists them); a session a hook starts carries the firing (Session.hook) so its changes carry depth + 1, capped at 3, and the same hook never fires twice on one node. `add` is deterministic (a template card's body or templates/hooks/<name>.md with {{node}} {{slug}} {{title}} {{kind}}, appended as the node's content, proposed, by: hook:<slug>); `run` is a session like any other, its blocks reviewed in the inbox. `skills:` on a PR, a type card or a hook attaches skills to the sessions it starts (## Skills in the first message).

  - context:wf2.hooks-and-skills alex: "if I have a new requirement I need to trigger action (when requirement approved) I want to go and define how to test it, and this should be automatic — I want to be able to define complex harnesses with my tool". Prompts were files in the repo a person could not see from the app; nothing in Wye ran on its own except the dispatcher.

  - alternative:wf2.hooks-and-skills Hooks as code (a plugin folder) — rejected: the person defines the harness in the same documents as the rest. A visual hook builder — not now; the card is the builder. Cron-like hooks — no: time is not an event here. Hooks firing agents that write directly without review — rejected: review is the safety net for anything automatic.

  - consequence:wf2.hooks-and-skills Later the same day: a request carries `skills:` and `hooks:` on its page — chosen in ⌘P (PR mode) or on the PR head (a live librarian gets a newly attached skill's body as its next message); an attached hook fires on the request's events even when paused. Every request is born with skill:analyse-request: before questions or blocks the librarian writes the page's **Analysis** — what changes and where (modules, components, the nodes edited), the code it lands in (paths the app opens), the risks and the constraints in force, and the contradictions it found (a `question:` block for each real one) — with `wye doc write <pr> --section Analysis`; the Jev-ranked Impact stays beside it as the structural candidates. H2 (2026-09-21, same day): the `task` action — the shipped example became `req.status:approved → task "Define test cases for {{title}}" --worker agent --skill skill:define-tests`, so approving a requirement writes a tracked task under it and an agent starts on it with the skill (verified live: two tests and a question proposed, verified-by set, the task done); `assign` and `notify`; sessions carry `skills:`; the column's Hooks section with Run now; Settings › Agents › hooks fire. type:task gained `depends-on: manyOf[task]` (a dependency graph; a task with an unfinished dependency is blocked like blocked-by). Every product gets a Skills folder and a Hooks link in the rail (in the project that holds PRs), five system documents written on first open. A hook's session appears on the Agents page with a hook pill. Block ids of non-module pages (pr:28, skill:build) now keep their slug — they were truncated before. H2: assign / notify, the column's Hooks section, a Settings switch.

```yaml
- id: decision:wf2.parse-cache
  title: A save builds the graph in the app's process with a per-file parse cache, keeps it in memory, and a refresh carries neither the node index nor the server-rendered reader
  date: 2026-09-21
  status: approved
  affects: [lib:build, lib:parse, lib:watch, lib:scope, lib:write, lib:request, lib:changes, op:api.index, op:api.sessions, component:peek-provider, component:live-document, component:live-refresh, component:embedded-card]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - context:wf2.parse-cache alex: "test and improve performance of editing and saving, do we need to build some indexes?". Measured on the wye product (101 documents, 6.6k nodes): a save took 560 ms — `wye build` spawned as a process (a full parse, 330 ms, plus a 7.5 MB pretty-printed graph.json and an unused data.js), `wye check` spawned again, then the watcher rebuilt a second time — and every save re-rendered the page three or four times at 700 ms each (react-markdown rendering the 64 KB document for a reader nobody sees once the editor is up, and a 1.4 MB RSC payload with the whole node index), while the column's requests read 1,152 change-record files (570 ms) and the session list carried every session's block attribution (1.7 MB every 20 s).

  - choice:wf2.parse-cache The index is a parse cache, not a database: `parseFiles(files, { cache })` (lib:parse) runs the per-file pass through a local view that records what the file produced (its nodes' written keys, edges, module, problems) and what it read from the other files (a node's existence, whether it was defined, its state when touched); a file whose text, ontology and reads are unchanged replays its record — the result is byte-identical to a cold parse, and the field-mention pass runs one regex per body instead of one per field per node. lib:build (`buildProduct`) builds in the app's process with that cache, keeps the graph and its indexes in memory (`graphFor`, validated against graph.json's mtime so a CLI build is still seen), runs the check in-process, and runs the change pipeline — the watcher's listener (`onBuilt`) — after the reply; the watcher skips its own rebuild for a change the app already built. lib/build.js is the one build path (`wye build` too; graph.json compact, data.js only from `wye site`). A refresh (an RSC request, told by the fetch metadata — lib:request) carries no node index (component:peek-provider fetches op:api.index, ETag = the graph's build time, and again on graph events) and no server-rendered reader (component:live-document shows a skeleton while the editor loads); the save no longer refreshes on its own, component:live-refresh coalesces a burst into one refresh. lib:changes keeps records parsed per file mtime; op:api.sessions lists sessions without their blocks (a count instead).

  - alternative:wf2.parse-cache A database (SQLite) for nodes and edges — rejected: the graph is derived from markdown and fits in memory; the cost was re-parsing and re-shipping it, not querying it. Incremental edges without the recorded reads — rejected: a prose line that names an id defined in an earlier file is a mention, not a definition, so a file's parse depends on the others; recording those reads keeps the replay exact. Keeping the reader on refresh — rejected: 500 ms per refresh for markup the editor replaces at once.

  - consequence:wf2.parse-cache A save is ~170 ms (build ~100 ms of it), a refresh ~60 ms and 350 KB, a full page load ~600 ms with the reader and the index in the HTML; the column's change list 60 ms; the session list 200 KB. `wye build` is 0.24 s cold. Found on the way and fixed: a yaml card without a title inside a list region was dropped by the editor's save (lib:serialize wrote only rows with text) — every document of the product now round-trips with no id lost; and the dev server's "Duplicate use of selection JSON ID" 500 came from @blocknote/react evaluated on the server through EmbedBlock — component:embedded-card is its own file now.

```yaml
- id: decision:wf2.cmd-modes
  title: ⌘P has two modes — PR (a request page with a refining session) and Ad-hoc (a conversation, no page)
  date: 2026-09-20
  status: approved
  affects: [component:command-box, op:api.sessions, rule:pr-doc]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.cmd-modes A mode row, remembered per browser: PR (default) — the page is created as draft, set refining, and a librarian session refines it on the host with the refining brief (agent-host#refiningNote); the person lands on the page with the conversation in the column. Ad-hoc — a conversation with a coding agent on what you are looking at, no page; its blocks are still artifacts and consolidation still runs. A message into an existing conversation is unchanged. Plan-first, the Wye target and the intent chips go.

  - context:wf2.cmd-modes The command box offered Task / Plan / Proposal and a "plan first" tick; every new conversation got a plan document. With PRs the distinction that matters is whether a page exists at all.

  - alternative:wf2.cmd-modes Ad-hoc as a quick PR that skips refining — rejected: a page nobody refines is noise. PR mode creating the page only, refined by hand — rejected: the librarian is the point.

  - consequence:wf2.cmd-modes sessions POST takes `pr: true | false`; createPrDoc runs only for a librarian (refining) or an assigned task's worker (building); restartFresh makes a new PR only on a PR conversation.

<!-- /list:decision -->

```yaml
- id: decision:wf2.workflow-is-a-skill
  title: A workflow is a skill that declares stages — one registry, executed by the app, never pasted into a prompt
  date: 2026-09-22
  status: approved
  affects: [req:wf2.workflows, type:workflow, type:stage, type:run, lib:runs, lib:runs-run, lib:hooks, lib:hooks-run, lib:skills, lib:watch, lib:doc-create, op:api.workflows, op:api.runs, component:run-panel, component:run-strip, component:workflows-section, component:command-box]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - context:wf2.workflow-is-a-skill alex: "new thing i would like to be able to design - is workflow management for docs/prd research… i got an idea and i set it as a goal/prompt, next agent should start exploration/research and produce a prd document, at some point when i'm happy with prd i want to use another skill to write test design and tech design docs, i want to link requirement to implementation decisions and tests cases automatically, then build implementation plan and dispatch the work to agents — all of this needs to be configurable with skills and hooks". Hooks (decision:wf2.hooks-and-skills) could already chain one action to another, but a chain of hooks is invisible: nothing says you are at stage 2 of 5, what the exit criterion is, or what comes next, and it cannot be named, reused or started on demand. Asked where the arc should live, alex: "any document should be able to be a starting point, maybe i just want to run workflow??? for it i.e. predefined workflow of actions"; and on the shape: "maybe workflow should be part of the skill system?".

  - choice:wf2.workflow-is-a-skill `type:workflow extends type:skill`: a document `workflow-<slug>.md` under the project's existing Skills page whose `stage:` cards are its steps, in document order. It inherits everything a skill has — editable in the app, `role`, `takes`, `wye skills` — and adds stages; a skill that declares stages is executed by the engine and **never** pasted into a session's prompt, or one agent would do all five stages in one pass. A stage carries the same `do:` vocabulary a hook runs (`task`, `run skill:`, `add`, `assign`, `notify`, and the two new ones: `run workflow:<id>` starts a run, `dispatch <doc> [--workers N]` hands a document's ready tasks to workers), `produces:` the documents it creates from templates/docs when they are absent, `until:` its exit criterion and `gate:` person (the default) or auto. The runner itself is the hook engine's, generalised from a HookDef to an Actor ({ id, title, skills }), and a stage's firing is a record in the same `_hooks/` store with `by: { run, stage }` — one action language, one runner, one store.

  - alternative:wf2.workflow-is-a-skill A workflow as its own concept beside skills — rejected: a second registry, a second way to attach, a second door to run it, and one more thing to learn. Chains of hooks on statuses with no new type — rejected: it works today but the arc is invisible, unnamed and cannot be started on demand. Stretching type:pr into the long arc — rejected: a PR is one change and is the person's alone (constraint:wf2.pr-is-the-persons); a feature arc spans many documents and many sessions.

  - consequence:wf2.workflow-is-a-skill Shipped with workflow:feature — research → PRD → tech design and test design → plan → dispatch — as five editable skills (skill:research, skill:prd, skill:tech-design, skill:test-design which composes skill:define-tests, skill:plan) and one workflow document; every product gets them on first open. ⌘P has a third mode, a node's column a Workflows section, and the document a run strip. Found while running the first one: `cardValue` stripped a single leading-or-trailing quote, so `do: task "…"` with no trailing flags parsed as no action at all.

```yaml
- id: decision:wf2.run-holds-the-state
  title: The state of a run is a run: card, never properties on the thing it runs on
  date: 2026-09-22
  status: approved
  affects: [type:run, lib:runs, lib:runs-run, component:run-strip]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.run-holds-the-state A run is a card in the project's Workflow runs document (`workflow-runs.md`; `runs.md` is already eval runs): the workflow, what it runs `on`, the stage it is at, its status (running | waiting | blocked | done | cancelled), the documents it produced, the sessions it started, and `log:` — entered, ready, advanced, reopened, skipped, blocked, and by whom. So any document can be a starting point without being polluted with stage properties, and the same document can be run twice. Readiness is **computed on demand and never written**: a derived value in markdown is rewritten by every rebuild, and every rewrite is another rebuild. The sweep after each build writes only a transition.

```yaml
- id: decision:wf2.until-is-closed
  title: A stage's exit criterion comes from a closed set of predicates, so it can be computed, shown and checked before it runs
  date: 2026-09-22
  status: approved
  affects: [type:stage, lib:runs, op:api.workflows]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.until-is-closed Eleven forms, comma separated, all of which must hold: `session done`, `<doc> exists`, `every req in <doc> is agreed`, `every req in <doc> has <verb>`, `every req in <doc> has a task`, `no open question in <doc>`, `no open contradiction`, `every task in <doc> is done`, `every task in <doc> is ready`, `check passes`, `manual`. Each renders as one readiness row naming the ids that hold it back, as a PR's readiness does. Free text is not accepted: a criterion only a person can read can gate nothing, and an `until` line that does not parse is shown — by the API, `wye workflow list|show` and the column — before it is ever relied on, and is red rather than silently true. The predicates live in the workflow, not in `wye check`'s global shapes: a product that does not run this workflow must not start failing its build.

```yaml
- id: decision:wf2.gate-is-the-persons
  title: The person advances each stage; gate: auto is opt-in, because no predicate can see a thin PRD
  date: 2026-09-22
  status: approved
  affects: [type:stage, lib:runs-run, component:run-panel]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.gate-is-the-persons A stage's readiness is computed and shown, but the run waits at `waiting` until the person's Advance; `gate: auto` moves on by itself, and consecutive auto advances stop at MAX_DEPTH, the cap hooks already use. Skip advances without the criterion and is recorded in the log as an override, never silently; Reopen goes back to a stage and keeps both passes; a session that ends anything but done blocks the run until the person retries, skips or cancels. The reason for the default: an agent that writes four requirements where forty were needed produces a perfectly green design stage — no predicate sees it, so the person's gate is the only defence.

```yaml
- id: decision:wf2.traceability-is-the-verb
  title: A requirement's links to its decisions and tests are written by the stage's skill; the criterion notices when one is missing
  date: 2026-09-22
  status: approved
  affects: [req:wf2.workflows, lib:runs, lib:instance-table, component:instance-table, skill:tech-design, skill:test-design, skill:plan]
  by: alex
  evidence: [session:017wTEs8Jy8fzwycEec3ktJC]
  part-of: goal:exec.define-first
```

  - choice:wf2.traceability-is-the-verb Nothing is derived or guessed. The stage's skill writes the verb — a decision or an operation `satisfies <the req>`, a test `verifies <the req>`, a task is `part-of <the req>` — and the parser generates the inverse, so traceability needs no new edge machinery; what it needs is something to notice when the verb was not written, and that is the stage's `until` (`every req in prd has satisfied-by, every req in prd has verified-by`), which refuses to advance and names the bare requirements. `<!-- view:req coverage=1 -->` is what the person reads while deciding: a cell per requirement, ✓ covered with its task count or the gap as a button that opens ⌘P prefilled for it.

  - alternative:wf2.traceability-is-the-verb Deriving the links (same-session provenance, semantic matching) — rejected: a guessed traceability link is worse than a missing one, because it reads as verified when nothing checked it. One session per requirement — rejected: a 30-requirement PRD would mean 60 sessions, and the designs lose the coherence of being written together.
