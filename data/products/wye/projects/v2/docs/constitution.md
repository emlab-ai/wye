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
  statement: >
    Wye runs on the person's machine over the files of this repo. No hosting surface in v2: no multi-user auth, no remote git sync, no automatic commits. Schema and API may carry the fields for it, unused.
  scope: [module:wf2, req:wf2.serve]
  status: approved
  by: alex
  evidence: [docs/superpowers/specs/2026-09-14-wye-v2-design.md]
```

  lesson:new-942 *New lesson*

  test:new-377 *New test*

  decision:new-415 *New decision*

```yaml
- id: constraint:wf2.text-canonical
  statement: >
    Text files in git are canonical: a product's knowledge is its markdown documents; nothing is stored apart that
    the documents do not say, and git is the rollback.
  scope: [rule:markdown-canonical, module:wf2]
  status: approved
  by: alex
- id: constraint:wf2.person-approves
  statement: >
    Nothing resolves a contradiction, retires a decision or deletes memory without a person: agents, the verdict
    pass and the consolidation run propose blocks; a person approves, resolves or dismisses them in the Inbox.
  scope: [rule:inbox-review, req:wf2.clerk, decision:memory.write-time-verdict]
  status: proposed
  by: alex
- id: constraint:wf2.blocks-not-prose
  statement: >
    Decisions, questions, requirements, rules, constraints and tasks are typed blocks in the document they belong
    to — never prose, bullets or chat. A follow-up that exists only in a message is lost.
  scope: [rule:agent-contract]
  status: proposed
  by: alex
- id: constraint:wf2.one-defining-place
  statement: >
    Every id is defined in exactly one place; every other occurrence is a reference. Ids are stable; a rename
    rewrites the references.
  scope: [rule:page-node-line, module:ontology-design]
  status: proposed
  by: alex
- id: constraint:wf2.main-branch
  statement: While Wye is a prototype, work is committed straight to main — no feature branches, no merge menus.
  scope: [module:wf2]
  status: proposed
  by: alex
```

<!-- /list:constraint -->
