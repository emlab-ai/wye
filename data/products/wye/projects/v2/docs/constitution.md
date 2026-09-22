---
node: module:constitution
type: module
title: Constitution
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:wf2-prd
order: 12
---

# Constitution

The constraints in force — rules about the product and how it is built that no code enforces. Approved ones go into every worker's prompt.

## Constraints

<!-- list:constraint -->

```yaml
- id: constraint:wf2.local-first
  scope: [module:wf2, req:wf2.serve]
  status: approved
  by: alex
  evidence: [docs/superpowers/specs/2026-09-14-wye-v2-design.md]
  title: Wye runs on the person's machine over the files of this repo.
```

  - statement:wf2.local-first Wye runs on the person's machine over the files of this repo. No hosting surface in v2: no multi-user auth, no remote git sync, no automatic commits. Schema and API may carry the fields for it, unused.

  lesson:new-942 *New lesson*

  test:new-377 *New test*

  decision:new-415 *New decision*

```yaml
- id: constraint:wf2.text-canonical
  scope: [rule:markdown-canonical, module:wf2]
  status: approved
  by: alex
  title: Text files in git are canonical:
```

  - statement:wf2.text-canonical Text files in git are canonical: a product's knowledge is its markdown documents; nothing is stored apart that the documents do not say, and git is the rollback.

```yaml
- id: constraint:wf2.person-approves
  scope: [rule:inbox-review, req:wf2.clerk, decision:memory.write-time-verdict]
  status: approved
  by: alex
  title: Nothing resolves a contradiction, retires a decision or deletes memory without a person:
```

  - statement:wf2.person-approves Nothing resolves a contradiction, retires a decision or deletes memory without a person: agents, the verdict pass and the consolidation run propose blocks; a person approves, resolves or dismisses them in the Inbox.

```yaml
- id: constraint:wf2.pr-is-the-persons
  scope: [rule:pr-doc, type:pr, lib:work-io, decision:wf2.import-code-is-a-session]
  status: approved
  by: alex
  since: 2026-09-21
  title: A Prompt Request is a person's act:
```

  - statement:wf2.pr-is-the-persons A Prompt Request is a person's act: the way a human suggests a change to the knowledge. Only a person's request (⌘P, Ask Wye, a new request typed into a PR conversation) creates one; an agent, a task assignment, a hook, an import or the dispatcher never does — their sessions work on the task's own document and leave proposed blocks for the Inbox.

```yaml
- id: constraint:wf2.blocks-not-prose
  scope: [rule:agent-contract]
  status: approved
  by: alex
  title: >
    Decisions, questions, requirements, rules, constraints and tasks are typed blocks in the document they belong
```

  - statement:wf2.blocks-not-prose Decisions, questions, requirements, rules, constraints and tasks are typed blocks in the document they belong to — never prose, bullets or chat. A follow-up that exists only in a message is lost.

```yaml
- id: constraint:wf2.one-defining-place
  scope: [rule:page-node-line, module:ontology-design]
  status: approved
  by: alex
  title: Every id is defined in exactly one place;
```

  - statement:wf2.one-defining-place Every id is defined in exactly one place; every other occurrence is a reference. Ids are stable; a rename rewrites the references.

```yaml
- id: constraint:wf2.main-branch
  scope: [module:wf2]
  status: approved
  by: alex
  title: While Wye is a prototype, work is committed straight to main — no feature branches, no merge menus.
```

  - statement:wf2.main-branch While Wye is a prototype, work is committed straight to main — no feature branches, no merge menus.

<!-- /list:constraint -->
