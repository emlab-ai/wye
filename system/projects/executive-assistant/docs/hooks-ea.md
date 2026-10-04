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
- id: hook:ea.daily-summary
  title: The Digest's daily summary is written every weekday morning
  on: time.weekdays 08:00
  for: module:ea-digest
  do: run workflow:ea.daily-summary
  status: active
- id: hook:ea.suggest-actions
  title: The suggested actions are renewed every weekday morning
  on: time.weekdays 07:50
  for: module:ea-digest
  do: run workflow:ea.suggest-actions
  status: active
- id: hook:ea.suggest-on-new-information
  title: New information pushed in renews the suggested actions
  on: intake.done
  do: run workflow:ea.suggest-actions
  once: false
  status: active
- id: hook:ea.weekly-review
  title: The weekly execution review is written on Friday afternoon
  on: time.fri 16:00
  for: module:ea-briefs
  do: run workflow:ea.weekly-review
  status: active
- id: hook:ea.one-on-one-prep
  title: A pushed 1:1 is prepared — only one still to come (not a past 1:1 from an import of old notes)
  on: meeting.created
  where: prop=format:1on1 upcoming=date
  do: run workflow:ea.one-on-one
  once: true
  status: active
```
