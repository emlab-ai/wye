---
node: package:executive-assistant
title: Executive assistant
description: A director's assistant — people, projects, commitments, decisions, risks and meetings, filed from what outside tools push and followed on a live Digest with a daily summary, a weekly execution review and 1:1 prep.
---

# Executive assistant

Install it into a project of its own product (decision:ea.own-product-as-package): notes about people are sensitive and
stay apart from other work.

```
wye install executive-assistant --product ea --project assistant --create-product "Executive assistant"
```

It brings:

- **Kinds** (types.md, declared in the product on install, decision:ea.packages-carry-types): person, project,
  commitment, meeting, risk. Decisions are Wye's own, with an owner and a project.
- **Kinds** also: thread (Slack) and email — what waits for your reply, pushed by your outside agent.
- **Pages** (seeded once, yours to edit): the Digest — live views of what needs you, and a daily summary.
- **Skills**: capture (handed to Cowork or any outside agent), daily summary, daily brief, weekly review, 1:1 prep.
- **Workflows**: capture → approve, daily summary, daily brief, weekly review, 1:1 prep.
- **Hooks**: the Digest's daily summary on weekday mornings and the weekly review on Friday afternoon (time hooks,
  decision:ea.time-based-hooks), 1:1 prep when a 1:1 is pushed in.

After installing, set yourself as the director: add your person card (`wye node add person:ea.<you> --product ea`) with
the names you go by in your other products as `aliases`, and put `director: person:ea.<you>` on the product card
(`data/products/ea/_product.md`). Then hand skill:ea.capture to your outside agent.
