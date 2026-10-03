---
node: module:ea-hooks
type: module
title: Assistant hooks
status: active
owner: unassigned
part-of: module:ea-assistant
---

# Assistant hooks

The rhythms that start on their own. Times are in your time zone (Settings). Pause one with `status: paused`; change a
time by editing its `on:` line — `time.weekdays 08:00`, `time.fri 16:00`, `time.mon,thu 09:30` or a cron line
`time.cron 0 8 * * 1-5`. After the app was closed, a missed rhythm runs once when it opens, not once per missed day.

## Hooks

```yaml
- id: hook:ea.daily-brief
  title: The daily brief is written every weekday morning
  on: time.weekdays 08:00
  for: module:ea-briefs
  do: run workflow:ea.daily-brief
  status: active
- id: hook:ea.weekly-review
  title: The weekly execution review is written on Friday afternoon
  on: time.fri 16:00
  for: module:ea-briefs
  do: run workflow:ea.weekly-review
  status: active
- id: hook:ea.one-on-one-prep
  title: A pushed 1:1 is prepared
  on: meeting.created
  where: prop=format:1on1
  do: run workflow:ea.one-on-one
  once: true
  status: active
```
