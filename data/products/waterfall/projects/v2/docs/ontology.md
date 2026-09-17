---
node: module:ontology
type: module
title: Ontology
status: proposed
owner: unassigned
last-verified: 2026-09-17
---

# Ontology

Write here. An `id: kind:slug` inside a yaml block becomes a card; a `kind:slug` in the text becomes a tag.

```yaml
- id: module:ontology
  purpose: >
    This is experiment proposal, i would like to follow ontoloy model, where every block in every document is a
    graph node, each node have links, properties and content (can be text or collection?), also each node have
    type, starting from generic node. the idea that each node inherit parent properties and links? like employee
    have type person, and manager is of type employee, manager has property team, team is also type, and it has
    many instances i.e. team1:team, team2:team etc, team has collection of nodes members, and when we have
    collection, it has also a back link i.e. person who member of team, has back link (automatic) memberOf
```

## Worked example

The types from the idea, as cards this document declares — the product's own ontology on top of the base types
(see the Types page). An instance of `type:team` is `team:<slug>`; `members` is a collection whose inverse `memberOf`
appears on each member without being written; `employee` inherits `name` from `person`.

```yaml
- id: type:person
  extends: type:node
  purpose: a person the product talks about
  props:
    name: string
    email: string?
    role: string?
- id: type:employee
  extends: type:person
  purpose: a person employed here; reports to a manager
  props:
    startDate: date?
    manager: ref employee? -(inverse)-> reports
- id: type:manager
  extends: type:employee
  purpose: an employee who leads a team
  props:
    team: ref team? -(inverse)-> leads
- id: type:team
  extends: type:node
  purpose: a group of people with a shared purpose
  props:
    name: string
    members: list of person? -(inverse)-> memberOf
```

```yaml
- id: team:platform
  name: Platform
  members: [manager:ana, employee:bo]
- id: manager:ana
  name: Ana
  team: team:platform
```

employee:bo Bo joined in March (name: Bo, startDate: 2026-03-09, manager: manager:ana)

<!-- tasks -->
- [x] task:do-research-and-expand Do research and expand on the ontology ideas, add desgin doc as child to this doc
<!-- /tasks -->
