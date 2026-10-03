---
node: {{id}}
type: module
title: Hooks
status: active
owner: unassigned
last-verified: {{date}}
{{root}}---

# Hooks

A hook is "when this happens to that kind of node, do this" (type:hook): `on: <kind>.<event>` — created,
status:<x>, linked:<verb>, pr.approved, pr.built, session.done (kind may be `*`) — an optional `where:`
(document=<glob>, type=<slug>, status=<x>, prop=<key>:<value>), and `do:` lines: `task "<text>" --worker agent|<name>
--skill skill:<id>` writes a task under the node (Work lists it) and hands it to a worker — `agent` is the default
agent of Settings › Agents, a person's name just assigns; `run skill:<id>` starts a session with that skill on the
node; `add <template>` appends a template's blocks under it; `assign task:<id> --worker w`; `notify "<text>"` puts a
note in the inbox and a toast on every page. `{{title}}`, `{{node}}`, `{{slug}}`, `{{kind}}` name the node. A hook fires
once per node unless `once: false`; `status: paused` switches it off; the node's column has a Hooks section with
"Run now". Everything a hook writes is proposed and goes through review. Templates (type:template) live here too.

A hook can also keep time: `on: time.<schedule>` — `time.daily 08:00`, `time.weekdays 08:00` (Mon–Fri),
`time.fri 16:00` or `time.mon,thu 09:30` (days: mon tue wed thu fri sat sun), or `time.cron <min> <hour> <dom> <mon>
<dow>` (numbers, `*`, lists, ranges, `*/15`; dow 0 or 7 is Sunday) — in your time zone (Settings, `timezone`). `for:
<node id>` names the node it fires on (its `{{title}}`, where a `run workflow:` starts; the hook's own node when
absent). It fires once per scheduled time — once in all, not once per missed time, when the app was closed through
several — and never for a time before the hook first appeared; `once` does not stop tomorrow's run. `wye hooks tick`
runs the clock now.

## Hooks

```yaml
- id: hook:req-approved-tests
  title: An approved requirement gets a task to define its test cases, and an agent starts on it
  on: req.status:approved
  do: task "Define test cases for {{title}}" --worker agent --skill skill:define-tests
  once: true
  status: active
- id: hook:import-analyse
  title: An imported document is read by an agent and rewritten into typed blocks, all proposed
  on: module.created
  where: status=imported
  do: task "Import {{title}}" --worker agent --skill skill:import
  once: true
  status: active
- id: hook:test-proposed-note
  title: A proposed test is announced
  on: test.created
  do: notify "A test was proposed: {{title}}"
  once: true
  status: paused
```

## Templates

```yaml
- id: template:test-card
  title: A proposed test card for a node
  body: |
    - test:{{slug}}-test {{title}} — checked #proposed
```
