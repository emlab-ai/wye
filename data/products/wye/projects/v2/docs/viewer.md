---
node: module:viewer
type: module
title: The static viewer
status: proposed
owner: alex
last-verified: 2026-09-20
part-of: module:app
order: 49
---

# The static viewer

The static viewer

## Rules

<!-- list:rule -->

```yaml
- id: rule:graph-presets
  source: viewer/index.html:282-288, :319-334
  verified-by: []
  title: Requirements shows req nodes and refines edges only;

```

  - statement:graph-presets Requirements shows req nodes and refines edges only; Mechanics shows req/rule/entity/op/page/action/state/flag/gate with structural verbs; Data shows entity/field/value/flag/state with has/typed-as/refs/owns/embedded-in; Drift shows only nodes touching a drift node with contradicts edges; Everything shows all kinds and verbs. Focus overrides presets with a two-hop neighbourhood of one node.

```yaml
- id: rule:viewer-linkify
  source: viewer/index.html:222-226, :410-421, :442
  verified-by: []
  title: >
    One regex (ids ∪ unambiguous field names, longest first) linkifies text nodes in Read and node bodies in the s

```

  - statement:viewer-linkify One regex (ids ∪ unambiguous field names, longest first) linkifies text nodes in Read and node bodies in the sheet; a field name resolves through fieldIndex, trying the lower-camel form when the text is PascalCase.

```yaml
- id: rule:viewer-no-server
  source: viewer/index.html:203-205
  verified-by: []
  title: The page is static:
```

  - statement:viewer-no-server The page is static: data.js carries the graph and the markdown; only marked and d3 load from cdnjs; there is no fetch.

<!-- /list:rule -->
