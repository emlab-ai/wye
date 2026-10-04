---
title: Executive assistant — kinds
---

# Kinds

The kinds the assistant files and follows (decision:ea.kinds). Every kind has Wye's own `owner` (a person's id, e.g.
`owner: person:ea.lee`). Installing the package declares each one in the product;
a kind the product already has is kept as it is.

```yaml
- id: type:person
  extends: type:node
  purpose: someone the director works with; the hub every commitment, meeting and project links to
  open: true
  props:
    name: string
    role: string?
    aliases: list of string?                  # the names this person goes by in other products and tools
    reports-to: ref person? -(inverse)-> reports
```

```yaml
- id: type:project
  extends: type:node
  purpose: an initiative the director is accountable for, with an owner, a target date and a pace
  open: true
  props:
    target: date?
    pace: string?                             # speeding | holding | slowing
    people: list of person? -(inverse)-> works-on
```

```yaml
- id: type:commitment
  extends: type:node
  purpose: a thing someone said they will do by a date; followed until it is met, moved or dropped
  open: true
  props:
    due: date
    state: string                             # open | met | moved | dropped
    project: ref project?
    from: ref meeting? -(inverse)-> yielded
    to: list of person? -(inverse)-> owed
    met-on: date?
    reason: string?                           # why it was dropped
```

```yaml
- id: type:meeting
  extends: type:node
  purpose: the record of a meeting an outside tool pushed, linked to who attended and to every block filed from it
  open: true
  props:
    date: date
    attendees: list of person? -(inverse)-> attended
    projects: list of project? -(inverse)-> discussed-in
    source: string?                           # the tool that pushed it, e.g. cowork
    format: string?                           # 1on1 for a 1:1
```

```yaml
- id: type:risk
  extends: type:node
  purpose: something that could make a project miss; open until resolved
  open: true
  props:
    project: ref project
    severity: string?                         # low | medium | high
    from: ref meeting? -(inverse)-> yielded
```

```yaml
- id: type:thread
  extends: type:node
  purpose: a Slack thread an outside tool pushed because it may need the director — open while a reply or a look is owed, answered once given
  open: true
  props:
    channel: string                           # #channel, or dm for a direct message
    from: ref person?                         # who is waiting
    link: string                              # where to answer it
    at: date                                  # when it last moved
    waiting: string?                          # reply | look — what it needs from the director
    project: ref project?
    source-id: string                         # the tool's own id, so a second push updates the same thread
```

```yaml
- id: type:email
  extends: type:node
  purpose: an email an outside tool pushed because it waits for the director's answer — open until answered
  open: true
  props:
    from: ref person?
    link: string
    at: date
    waiting: string?                          # reply | look
    project: ref project?
    source-id: string
```

```yaml
- id: type:suggestion
  extends: type:node
  purpose: an action the assistant suggests to the director — follow up, reply, check in — with why, about one item; open until done or dismissed
  open: true
  props:
    about: ref node?                          # the project, person, commitment, thread … it is about
    why: string                               # what made it worth doing now
    suggested: date                           # when it was suggested (last renewed)
    source: string?                           # daily | new-information | person
```
