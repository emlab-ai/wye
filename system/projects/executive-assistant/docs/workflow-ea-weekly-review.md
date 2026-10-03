---
node: workflow:ea.weekly-review
type: workflow
title: Weekly execution review
status: active
owner: unassigned
takes: module
part-of: module:ea-assistant
---

# Weekly execution review

On Friday afternoon hook:ea.weekly-review runs this on [Briefs](module:ea-briefs). An agent writes the review with
skill:ea.weekly-review; then it waits for you to go through it — answer the questions it left on projects whose pace no
longer matches, move or drop what is no longer real — and advance.

## Stages

```yaml
- id: stage:ea.weekly-review.write
  title: Write the review
  part-of: workflow:ea.weekly-review
  do: task "Weekly execution review" --worker agent --skill skill:ea.weekly-review
  until: session done
  gate: auto
- id: stage:ea.weekly-review.go-through
  title: Go through it
  part-of: workflow:ea.weekly-review
  until: manual
  gate: person
```
