---
node: workflow:feature
type: workflow
title: Feature
status: active
owner: unassigned
last-verified: 2026-09-22
takes: module, goal, req
part-of: module:evaluation-skills
---

# Feature

An idea becomes shipped work in five stages (decision:wf2.workflow-is-a-skill). Run it on any document or node — ⌘P ›
Workflow, the Workflows section of a node's column, or `wye workflow run workflow:feature --on <node>` — and each stage
produces its document, hands the work to an agent with the skill named below, and then **waits for you**: the readiness
rows under the run say what is still missing, and Advance is yours.

Edit this document to change the pipeline: the stages are cards, their `until:` lines are the criteria the engine
computes, and `gate: auto` on a stage lets it move on by itself. Edit the skills to change what each agent is told.

| stage | what it does | you advance when |
|---|---|---|
| Explore the idea | an agent reads the knowledge, the code and the outside, and writes the research | the session is done and you have read it |
| Write the PRD | requirements in the person's words, one behaviour per node | every requirement is agreed and no question is open |
| Tech design and test design | decisions that satisfy the requirements, tests that verify them — in parallel | every requirement has both |
| Build the plan | phases and tasks, each part of the requirement it implements | every requirement has a task and every task is ready |
| Dispatch the work | the ready tasks handed to workers | the work is done |

## Stages

```yaml
- id: stage:feature.research
  title: Explore the idea
  part-of: workflow:feature
  do: task "Research {{title}} and write it up in {{research}}" --worker agent --skill skill:research
  produces: research
  until: session done
  gate: person
- id: stage:feature.prd
  title: Write the PRD
  part-of: workflow:feature
  do: task "Write the PRD for {{title}} in {{prd}}, from {{research}}" --worker agent --skill skill:prd
  produces: prd
  until: every req in prd is agreed, no open question in prd
  gate: person
- id: stage:feature.design
  title: Tech design and test design
  part-of: workflow:feature
  do: |
    task "Tech design for {{title}} in {{dev-design}}, satisfying every req in {{prd}}" --worker agent --skill skill:tech-design
    task "Test design for {{title}} in {{test-design}}, verifying every req in {{prd}}" --worker agent --skill skill:test-design
  produces: dev-design, test-design
  until: every req in prd has satisfied-by, every req in prd has verified-by, no open contradiction
  gate: person
- id: stage:feature.plan
  title: Build the plan
  part-of: workflow:feature
  do: task "Implementation plan for {{title}} in {{plan}}: phases and tasks, each part of the req it implements" --worker agent --skill skill:plan
  produces: plan
  until: every req in prd has a task, every task in plan is ready
  gate: person
- id: stage:feature.dispatch
  title: Dispatch the work
  part-of: workflow:feature
  do: dispatch plan
  until: every task in plan is done
  gate: auto
```
