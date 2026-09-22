# Wye docs

Reference pages for people using Wye. The [README](../README.md) is the introduction — why it exists, what it looks
like, the loop, the command line. These pages go deeper, one topic each.

| page | what |
|---|---|
| [The type system](type-system.md) | every block is a typed node; declaring a type, properties and value types, links and inverses, shapes, instances and collection documents, ids, statuses, time |
| [Base ontology](../schema/base-ontology.md) | the source of the base kinds — every `type:` card with its props, inverses and shapes |
| [Kinds and verbs in prose](../schema/kinds.yaml) | the same, readable: kinds, verbs, statuses, conventions — generated from the ontology by `npm run kinds` |
| [Agent contract](../prompts/agent-system.md) | what every agent session is told: read before acting, write as proposed blocks, cite ids |
| [Contributing](../CONTRIBUTING.md) | running it, how the repo is organised, how a change starts as knowledge |
| [Introduction, inside Wye](../data/products/wye/projects/v2/docs/intro.md) | the README's introduction as a page of Wye's own product |

Coming: writing documents (prose nodes, cards, content, views, embeds), memory (the constraint packet, time,
verdicts, impact), Prompt Requests, skills and hooks, the desktop app.

The folders beside this file are history, not documentation: `superpowers/` holds the design specs and
implementation plans of past work, `context-graph/` the v0.1 pilot.
