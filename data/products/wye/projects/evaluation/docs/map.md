---
node: map:map
type: map
title: Map
status: proposed
owner: unassigned
last-verified: 2026-09-24
---

# Map

The cards below are this map's nodes and the links they carry are its edges. Add a node on the canvas, hover one to
grow a child, drag from one to another to link them, click a link to name it.

```yaml
- id: req:test
  title: testasdasdf
```

  - when:test

  - then:test

  - unless:test

  ## Tests

  <!-- view:test part-of=req:test -->

```yaml
- id: req:test-asdf-asdf-f
  title: test asdf asdf f
  related-to: req:test
  produced: req:asdfd
- id: req:asdfd
  title: asdfd
  refines: req:test
- id: req:asdfasd
  title: asdfasd
  related-to: req:test
- id: req:asdf
  title: asdf
  part-of: req:test-asdf-asdf-f
```

## Layout

```text
req:test 543,-87
req:test-asdf-asdf-f -104,-261 open
req:asdfd 591,178
req:asdfasd 393,-266
req:asdf 17,180
when:test 20,173 ref
then:test 20,223 ref
unless:test 20,273 ref
```
