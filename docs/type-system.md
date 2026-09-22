# The type system

Everything in a Wye product is a **node** with a **type**, **properties**, **links** and **content**, and every node
lives in a markdown document. This page is the reference: what a type is, how you declare one, how properties become
links, how inheritance and inverses work, what `wye check` enforces, and where instances live.

## Everything is a block, every block has a type

A document is made of blocks. A block that starts with an id — `req:sale.close`, `decision:memory.bitemporal`,
`city:london` — is a typed node; its id says its type (`req`, `decision`, `city`) and its slug. A block without an id
(a paragraph, a heading, a list item, a table) is still a node — `block:<doc>.<hash>`, type `block` — so it can be
linked, commented on, embedded and moved. Whether a node is a prose line or a yaml card is a matter of writing;
the graph does not care.

```markdown
req:sale.close When a sale is completed and all [kitchen items](entity:kitchen-item) are done, et:order is marked Closed. #proposed
```

```yaml
- id: req:sale.close
  title: A completed sale closes the order
  status: proposed
  satisfied-by: [op:close-sale]
  verified-by: [test:sales#close]
```

Both define the same node. The first form reads as a sentence; the ids and links in the sentence are edges, the
words before an id are the verb (*satisfied by op:x*, *refines req:y*, *part of module:z*), `#proposed` is the
status and a trailing `(key: value, …)` group carries properties. The second form is explicit. They can be mixed in
one file and a node can be written either way.

Under a node, indented blocks are its **content** — nodes of their own that belong to it: `when:` / `then:` /
`unless:` under a requirement, `context:` / `alternative:` / `choice:` / `consequence:` under a decision, task lines
under a PR, or any prose. `content` and its inverse `parent` are ordinary links.

## Types are cards

Every kind of node is a `type:` card. The base kinds ship in [`schema/base-ontology.md`](../schema/base-ontology.md);
a product adds its own in any of its documents (by convention the project's *Ontology* page) with the same card:

```yaml
- id: type:employee
  extends: type:person
  purpose: a person employed here; reports to a manager
  props:
    startDate: date?
    manager: ref employee? -(inverse)-> reports
  shapes:
    active requires manager
```

- **`extends`** — the parent type; properties and shapes accumulate along the chain, and every type ends at
  `type:node`, which gives every node `title`, `status`, `owner`, `text`, `since`, `until`, `by`, `evidence`,
  `supersedes`, `content`, `related-to`, `mentions`, `part-of`, `depends-on`, `contradicts`, `see`, `resolves`,
  `produced`.
- **`purpose`** — what the type is for, in a sentence. The Types page shows it; agents read it to choose a kind.
- **`open: true`** — instances may carry properties the type does not declare without a warning. All base types
  are open; a product type is closed unless it says so.
- **`home`** and **`plural`** — where new instances are written and what that page is called (see *Instances*).
- **`props`** — one line per property: `name: <value type>[?] [-(inverse)-> <name>]`.
- **`shapes`** — the checks `wye check` runs on the type's instances.

An instance of `type:employee` is `employee:<slug>`. The parser reads the base ontology first (pass 1), then every
document of the product, so the set of kinds is open: declare `type:city` and `city:london` parses the moment the
graph rebuilds.

## Properties and value types

| value type | meaning | example |
|---|---|---|
| `string`, `text` | a value; `text` is prose (rendered as markdown, can hold links) | `name: string` |
| `number`, `bool`, `date`, `month` | scalars; `date` is `YYYY-MM-DD`, `month` is `YYYY-MM` | `progress: number?` |
| `enum [a, b, c]` | one word among the listed ones | `role: enum [librarian, worker]?` |
| `ref <type>` | a link to one node of that type | `manager: ref employee?` |
| `list of <type>` | links to several nodes of that type; `list of string` for plain lists | `members: list of person` |
| `oneOf[<type>]` / `manyOf[<type>]` | the same as `ref` / `list of` (one name in the brackets that is a type) | `depends-on: manyOf[task]?` |
| `oneOf[a, b, c]` / `manyOf[a, b, c]` | a single-select / multi-select enum | `size: oneOf[s, m, l]` |

A trailing `?` marks the property optional; without it `wye check` warns when an instance lacks it. A property
whose value type is a node type is a **link**: `manager: ref employee` means an `employee:` card may say
`manager: employee:ada`, and the graph gets an edge named `manager` from the one to the other.

## Links and inverses

`-(inverse)-> <name>` names the back link. `manager: ref employee? -(inverse)-> reports` puts a `reports` edge on
`employee:ada` towards everyone whose `manager` she is — generated at build time, never written by hand. The base
ontology declares the inverses you meet everywhere:

| forward | inverse | between |
|---|---|---|
| `refines` | `refined-by` | req → req |
| `satisfied-by` | `satisfies` | req → rule, op, action, page, entity, component, lib |
| `verified-by` | `verifies` | req, rule → test, ui-test |
| `governs` | `governed-by` | rule, decision → anything |
| `gated-by` | `gates` | op, page, action, module → gate |
| `part-of` | `has` | any → module (the document tree) |
| `depends-on` | `depended-on-by` | task → task, any → any |
| `supersedes` | `superseded-by` | decision → decision (the parser also fills `until` on the old one) |
| `affects` | `affected-by` | decision → anything |
| `content` | `parent` | a node → its child blocks |
| `mentions` | `mentioned-by` | generated: a node whose text names another node or a field |

Some links are **structural** — `refines`, `satisfied-by`, `verified-by`, `governs`, `governed-by`, `gated-by`,
`part-of`, `depends-on`, `affects`, `supersedes`, `contradicts`, `has`, `owns`, `refs`, `calls`, `reads`, `writes` —
and these are what the constraint packet and the impact run walk. `related-to` (a link with no verb) and
`mentions` (found in text) are weak: shown, not walked.

## Shapes: what `wye check` enforces

A shape is a check in the type's own words, one per line under `shapes:`:

```
<status or *> requires <prop>[, <prop>] [| <alternative>] [as error]
<prop> refs status <s>
```

- `shipped requires verified-by` — a shipped requirement names its test.
- `* requires source as error` — every rule has a `source:`; an error, not a warning.
- `approved requires rationale | owner | by` — an approved constraint says who or why.
- `superseded requires superseded-by | until` — a superseded node names its successor.

A shape warns; `as error` or `wye check --strict` makes it an error and fails CI; a prose node (a one-line
definition) only ever warns. Shapes accumulate along `extends`, so a shape on `type:node` holds for everything.
`wye check` also reports dangling references (an id used but never defined), duplicate types, a type that extends an
unknown one, unknown kinds, missing required properties and open contradictions.

## Instances and where they live

Every id is defined in exactly one place; everywhere else it is a reference (a tag, a link, an embed, a row of a
view). The Types page lists every type with its instance count and where it was declared.

- **Base kinds** (`req`, `rule`, `decision`, …) are written wherever they belong — a requirement on its
  requirements page, a decision on the page whose area it decides.
- **Product types** get a **collection document**: the first `city:` instance creates *Cities* in the project that
  declares `type:city` (the type's `plural:` if set, else the English plural of its name), holding one
  `<!-- table:city -->` block, and writes `home:` on the type card so that every later path — *⌁ node* on a
  selected phrase, `+ add` on the table, `wye node add city:paris` — lands there. A card can still be written in
  any document by hand; the table shows it wherever it is.
- **Views** show instances of a kind wherever they are defined: `<!-- view:goal -->`,
  `<!-- view:constraint status=approved -->`, `<!-- table:city -->`, `<!-- list:decision -->` — filterable,
  groupable, editable in place. Overview pages are views, never lists kept by hand.

## Ids

`kind:slug`. Slugs are kebab-case; `req:` slugs are dotted paths so hierarchy is in the id (`req:sale.close`
refines `req:sale`). Aliases in prose: `et:` entity, `rq:` req, `rl:` rule, `pg:` page, `st:` state, `dc:` decision,
`qn:` question, `tk:` task. `wye get oversell` resolves a suffix to the node. Ids never change; a rename in the app
rewrites every reference.

## Statuses

Status is a property every node has; the type says which values mean what:

| kind | statuses |
|---|---|
| req | shipped · api-only · unverified · proposed · question · superseded |
| decision | proposed · approved · rejected · superseded |
| constraint | proposed · approved · retired |
| goal | proposed · on-track · at-risk · off-track · paused · complete · non-goal |
| task | todo · open · in-progress · blocked · review · done (a checkbox line sets open/done; `#ready` marks it for a runner) |
| question | open · resolved · rejected |
| pr | draft · refining · approved · building · done · failed · cancelled |
| hook | active · paused |

An agent writes as *proposed*; a person approves. `wye check` keeps status honest: `shipped` needs a `verified-by`.

## Time on every node

`since` and `until` say from when and until when a node holds; `superseded-by` and `supersedes` link the chain;
`by` says who wrote it (a person or `agent:<name>`), `evidence` where it came from (a session, a document, a URL, a
commit). *Current* means not ended: superseded, rejected and retired nodes are excluded from context and from the
constraint packet unless asked for (`--all`, `--as-of <date>`). A decision that `supersedes:` another retires the
old one in one act — the parser fills `until` and `superseded-by` on the old node at build time.

## From the terminal

```bash
wye graph get type:employee          # the card and every edge: extends, extended-by, its instances
wye type add city --product wye --extends node --purpose "a city the product talks about"
wye node add city:london --product wye --title "London"     # a row in the type's collection document
wye check --root data/products/wye   # shapes, references, duplicates, contradictions
```

## Reading the base ontology

`schema/base-ontology.md` is the source: every base kind as a card with its props, inverses and shapes.
`schema/kinds.yaml` says the same in prose — kinds, verbs, statuses and conventions. Its `kinds:`, `verbs:` and
`statuses:` blocks are generated from the ontology (`npm run kinds`); `npm test` fails when they drift, so the
summary cannot fall behind the cards. The rest of the file (conventions, aliases, prose nodes) is hand-written.
The Types page in the app renders both plus the product's own types.
