---
node: module:ontology
type: module
title: Ontology
status: proposed
owner: unassigned
last-verified: 2026-09-17
order: 30
part-of: module:domain
order: 31
---

# Ontology

Write here. An `id: kind:slug` inside a yaml block becomes a card; a `kind:slug` in the text becomes a tag.

## Worked example

The types from the idea, as cards this document declares — the product's own ontology on top of the base types
(see the Types page). An instance of `type:team` is `team:<slug>`; `members` is a collection whose inverse `memberOf`
appears on each member without being written; `employee` inherits `name` from `person`. The plan type the app
writes pages of (type:pr) is not declared here: it is a base type in `schema/base-ontology.md`, so every product
parses plan pages (rule:pr-type-base, decision:wf2.plan-type-is-base).

<!-- tasks -->
<!-- /tasks -->


```yaml
- id: module:ontology
  purpose: >
    This is experiment proposal, i would like to follow ontoloy model, where every block in every document is a
    graph node, each node have links, properties and content (can be text or collection?), also each node have
    type, starting from generic node. the idea that each node inherit parent properties and links? like employee
    have type person, and manager is of type employee, manager has property team, team is also type, and it has
    many instances i.e. team1:team, team2:team etc, team has collection of nodes members, and when we have
    collection, it has also a back link i.e. person who member of team, has back link (automatic) memberOf
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
- id: type:bug
  extends: type:task
  purpose: Describes an issue in the system
  props:
    priority: string?
- id: team:platform
  name: Platform
  members: [manager:ana, employee:bo]
- id: manager:ana
  name: Ana
  team: team:platform
```

employee:bo Bo joined in March (name: Bo, startDate: 2026-03-09, manager: manager:ana)


## Types declared elsewhere

```yaml
- id: type:component
  extends: type:node
  purpose: a React component of the web app (packages/web/src/components or a route file)
  home: module:app
  props:
    file: string
    side: enum [client, server]
    purpose: text
    part-of: list of module? -(inverse)-> has
- id: type:lib
  extends: type:node
  purpose: a library module — packages/web/src/lib, lib/ (graph core) or bin/ (CLIs)
  home: module:app
  props:
    file: string
    side: enum [server, shared, client]?
    purpose: text
    part-of: list of module? -(inverse)-> has
- id: type:store
  extends: type:node
  purpose: a place data lives on disk — a file or folder pattern with its format and who writes it
  home: module:app-storage
  props:
    path: string
    format: enum [markdown, json, yaml, excalidraw, binary, sqlite]
    purpose: text
    part-of: list of module? -(inverse)-> has
```

type:node is the root: every type extends it, directly or through a chain. Its properties are the ones every node has today: `title`, `status`, `owner`, `text`, and the generic links `related-to` (inverse `related-to`), `mentions` (inverse `mentioned-by`), `part-of` (inverse `has`).
