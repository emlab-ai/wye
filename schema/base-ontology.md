# Base ontology

The types every product starts with. Each base kind of the graph is a `type:` card here; a product adds its own
types in any of its documents (by convention `ontology.md`) with the same card form. `lib/parse.js` reads this file
first (pass 1), then the product's documents, so the set of kinds is open: an instance of `type:team` is `team:<slug>`.

A `shapes:` block lists the checks `wye check` enforces on the type's instances, in the type's own words
(decision:memory.shapes): `<status or *> requires <prop>[, <prop>] [| <alternative>] [as error]` — an instance in that
status has the property (a body key or an outgoing edge of that name; commas mean all, `|` any of); `<prop> refs
status <s>` — what the property points at has that status. A shape warns; `as error` or `wye check --strict` makes it
an error; a prose node only ever warns. Shapes accumulate along `extends`.

A property line is `name: <value type>[?] [-(inverse)-> <name>]`. Value types: `string`, `text`, `number`, `date`,
`month`, `bool`, `enum [a, b]`, `ref <type>`, `list of <type>` (or `list of string`). A trailing `?` marks the
property optional; without it `wye check` warns when an instance lacks it. `ref`/`list of` properties are edges
named by the property; `-(inverse)-> name` is the name of the generated back link on the target. `open: true` on a
type means instances may carry properties the type does not declare without a warning (all base types are open;
`schema/kinds.yaml`, generated from this file, still lists their required and recommended keys in prose).

```yaml
- id: type:node
  purpose: the root type; every node has these
  open: true
  statuses: [proposed, approved, shipped, deprecated, superseded, retired]
  props:
    title: string?
    status: string?
    owner: string?
    text: text?
    icon: string?                                     # a page's emoji, shown large above its title and in the tree (req:wf2.page.head-notion)
    cover: string?                                    # a page's cover image: assets/<file> or a URL, the band above the head
    tags: list of string?                             # free labels on a page; a type may narrow them with `tags: manyOf[a, b]`
    since: date?                                      # valid time: from when the node holds (decision:memory.bitemporal)
    until: date?                                      # valid time: when it stopped holding; filled by the parser when superseded
    by: string?                                       # who wrote it — a person, or agent:<name>
    session: string?                                  # the session(s) that wrote or completed it
    evidence: list of string?                         # where it came from: session:<id>#<n>, a document, a URL, a commit (decision:memory.evidence)
    supersedes: list of node? -(inverse)-> superseded-by
    content: list of block? -(inverse)-> parent
    related-to: list of node? -(inverse)-> related-to
    mentions: list of node? -(inverse)-> mentioned-by
    part-of: list of node? -(inverse)-> has
    depends-on: list of node? -(inverse)-> depended-on-by
    contradicts: list of node? -(inverse)-> contradicts
    see: list of node? -(inverse)-> seen-from
    resolves: list of node? -(inverse)-> resolved-by
    produced: list of node? -(inverse)-> produced-by
  shapes:
    superseded requires superseded-by | until
- id: type:product
  extends: type:node
  purpose: a thing being built; groups projects
  open: true
  props:
    description: text?
    projects: list of string?
- id: type:module
  extends: type:node
  purpose: a bounded area of the product; one document per module
  open: true
  props:
    purpose: text?
    submodules: list of module? -(inverse)-> part-of
    gated-by: list of gate? -(inverse)-> gates
- id: type:req
  extends: type:node
  purpose: >
    what the product must do for someone, in the person's own words — a title, and its content: born with `when:`,
    `then:` and `unless:` child blocks (each a block the person keeps, edits or deletes) and any prose
    (decision:wf2.req-free-text, decision:wf2.card-is-name-and-properties). text / when / then / unless as keys on the
    card are the old form, read but never written
  open: true
  statuses: [shipped, api-only, unverified, proposed, question, superseded]
  props:
    text: text?
    when: text?
    then: text?
    unless: text?
    note: text?
    refines: list of req? -(inverse)-> refined-by
    satisfied-by: list of node? -(inverse)-> satisfies
    verified-by: list of node? -(inverse)-> verifies
  shapes:
    shipped requires verified-by
- id: type:rule
  extends: type:node
  purpose: >
    an invariant, constraint, validation or policy — how a behaviour is guaranteed. Its text is content: a
    `statement:` child block (and `note:` ones) under the card (decision:wf2.parts-are-content); `statement` as a
    key is the old form, read but never written
  open: true
  statuses: [proposed, shipped, deprecated, superseded]
  props:
    statement: text?
    source: string?
    note: text?
    verified-by: list of node? -(inverse)-> verifies
    governs: list of node? -(inverse)-> governed-by
  shapes:
    * requires source as error
- id: type:entity
  extends: type:node
  purpose: a persisted thing
  open: true
  props:
    description: text?
    source: string?
    fields: text?
    governed-by: list of rule? -(inverse)-> governs
    refs: list of entity? -(inverse)-> referenced-by
    owns: list of state? -(inverse)-> owned-by
    embedded-in: list of entity? -(inverse)-> embeds
- id: type:value
  extends: type:node
  purpose: a value object or enum never persisted on its own
  open: true
  props:
    source: string?
    values: list of string?
- id: type:state
  extends: type:node
  purpose: a state machine owned by an entity
  open: true
  props:
    states: list of string?
    transitions: text?
    set-by: list of node? -(inverse)-> sets
- id: type:op
  extends: type:node
  purpose: a query, mutation, endpoint or tool — the public API surface
  open: true
  props:
    args: text?
    does: text?
    gate: string?
    source: string?
    gated-by: list of gate? -(inverse)-> gates
    governed-by: list of rule? -(inverse)-> governs
    reads: list of node? -(inverse)-> read-by
    writes: list of node? -(inverse)-> written-by
    calls: list of op? -(inverse)-> called-by
- id: type:page
  extends: type:node
  purpose: a screen the user can navigate to
  open: true
  props:
    route: string?
    component: string?
    actions: text?
    gated-by: list of gate? -(inverse)-> gates
    governed-by: list of rule? -(inverse)-> governs
    reads: list of node? -(inverse)-> read-by
- id: type:action
  extends: type:node
  purpose: something a user can do on a page
  open: true
  props:
    does: text?
    calls: list of op? -(inverse)-> called-by
    navigates: list of page? -(inverse)-> reached-from
    writes: list of node? -(inverse)-> written-by
- id: type:gate
  extends: type:node
  purpose: a feature flag, permission policy or role check
  open: true
  props:
    statement: text?
    applies-to: list of node? -(inverse)-> gated-by
- id: type:flag
  extends: type:node
  purpose: a runtime setting that changes behaviour
  open: true
  props:
    scope: string?
    source: string?
- id: type:setting
  extends: type:flag
  purpose: alias of flag; the parser normalises setting: ids to flag:
  open: true
- id: type:test
  extends: type:node
  purpose: a verification, usually referenced as test:Class#Method
  open: true
  props:
    file: string?
    count: string?
- id: type:ui-test
  extends: type:test
  purpose: an end-to-end spec
  open: true
- id: type:tool
  extends: type:op
  purpose: an MCP tool or CLI command an agent can call
  open: true
- id: type:drift
  extends: type:node
  purpose: a contradiction between two nodes
  open: true
  statuses: [drift]
- id: type:question
  extends: type:node
  purpose: something the knowledge leaves unspecified; open until a person resolves it with a decision
  open: true
  statuses: [open, resolved, rejected]
  props:
    q: text?
    context: text?
- id: type:decision
  extends: type:node
  purpose: >
    a choice that was made, in the person's words — a title and free text: the reasoning as prose in `text` or as
    the card's content blocks, with `alternative:`, `choice:` and `consequence:` child blocks where they help
    (decision:wf2.decision-free-text); proposed until a person approves it; superseded when a later decision names it
    in `supersedes:` (the parser fills its `until` and `superseded-by`). context / choice / alternatives /
    consequences are optional keys from the ADR form, never asked for
  open: true
  statuses: [proposed, approved, rejected, superseded]
  props:
    date: date?
    text: text?
    context: text?
    choice: text?
    alternatives: text?
    consequences: text?
    governs: list of node? -(inverse)-> governed-by
    affects: list of node? -(inverse)-> affected-by
- id: type:when
  extends: type:node
  purpose: the trigger of a requirement — a child block of it
  open: true
- id: type:then
  extends: type:node
  purpose: the outcome of a requirement — a child block of it
  open: true
- id: type:unless
  extends: type:node
  purpose: the exception of a requirement — a child block of it
  open: true
- id: type:context
  extends: type:node
  purpose: what forced a decision — a child block of it
  open: true
- id: type:alternative
  extends: type:node
  purpose: a way not taken — a child block of the decision that considered it, its text saying what it was and why not
  open: true
- id: type:choice
  extends: type:node
  purpose: what was chosen, when a decision wants it as a block of its own under the decision rather than in its text
  open: true
- id: type:consequence
  extends: type:node
  purpose: what follows from a decision — a child block of it
  open: true
- id: type:statement
  extends: type:node
  purpose: what a constraint or a rule says — a child block of it (decision:wf2.parts-are-content)
  open: true
- id: type:scope
  extends: type:node
  purpose: where a constraint or a rule applies, in words — a child block of it (ids go in the card's `scope:` links)
  open: true
- id: type:rationale
  extends: type:node
  purpose: why a constraint or a rule holds — a child block of it
  open: true
- id: type:note
  extends: type:node
  purpose: a remark under a rule, a constraint or any node — a child block of it
  open: true
- id: type:constraint
  extends: type:node
  purpose: >
    a rule about the product or how it is built that no code enforces — "local-first", "markdown is canonical";
    the approved ones are the constitution every agent prompt carries (decision:memory.constraint-type). Its text
    is content: `statement:`, `scope:` (in words) and `rationale:` child blocks under the card, each a block the
    person edits or deletes (decision:wf2.parts-are-content); `statement` as a key on the card is the old form,
    read but never written; `scope:` with ids stays a link
  open: true
  statuses: [proposed, approved, retired]
  props:
    statement: text?
    scope: list of node? -(inverse)-> constrained-by
    rationale: ref decision? -(inverse)-> rationale-for
  shapes:
    approved requires rationale | owner | by
- id: type:lesson
  extends: type:node
  purpose: >
    procedural memory — "this broke because …", "here we always …" — learned in a session and kept for the next one;
    the constraint packet carries it when its scope reaches the request (decision:memory.consolidate-sessions)
  open: true
  props:
    statement: text
    about: list of node? -(inverse)-> lessons
- id: type:comment
  extends: type:node
  purpose: >
    a remark on a node — kept as a card in the Comments document of the node's project, never nested under the node;
    `on:` names the node, and the node lists its comments as the inverse edge (decision:ontology.comment-is-a-ref)
  open: true
  props:
    on: ref node -(inverse)-> comments
    date: date?                                       # `by` comes from type:node
- id: type:contradiction
  extends: type:node
  purpose: >
    two nodes that cannot both hold — found by the verdict pass or written by hand; open until a person supersedes one
    side, refines the other or dismisses it with a reason (decision:memory.write-time-verdict)
  open: true
  props:
    between: list of node? -(inverse)-> contradicted-in
    conflict: enum [static, dynamic, conditional]?
    reason: text?
    resolution: text?
- id: type:verdict
  extends: type:node
  purpose: >
    the verdict pass's classification of one pair — duplicate, refines, consistent or contradicts — with its reason,
    model and prompt hash so it can be replayed; generated once and kept as content of the node it judged
  open: true
  props:
    pair: list of node?
    kind: enum [duplicate, refines, consistent, contradicts]?
    reason: text?
    model: string?
    prompt: string?
- id: type:goal
  extends: type:node
  purpose: what the product or a project sets out to achieve
  open: true
  statuses: [proposed, on-track, at-risk, off-track, paused, complete, non-goal]
  props:
    target: string?
    progress: number?
- id: type:task
  extends: type:node
  purpose: >
    a unit of work for a human or agent — the work item every view lists and every worker takes
    (decision:exec.task-is-the-unit): its status on the line (todo, open, in-progress, blocked, review, done), `#ready`
    the person's mark that a runner may take it, `worker` who holds it now
  open: true
  statuses: [todo, open, in-progress, blocked, review, done]
  props:
    due: string?
    session: string?
    worker: string?                                   # a person's name or an agent name; who holds the task now
    priority: number?                                 # lower first, across plans; document order inside one
    depends-on: manyOf[task]? -(inverse)-> depended-on-by   # the dependency graph: a task waits until the tasks it depends on are done
    blocked-by: list of task? -(inverse)-> blocks     # the same wait, named from the other side (kept for the lines that use it)
    change: string?                                   # the change record a follow-up task came from
    ready: bool?                                      # `#ready` on the line: defined enough for a runner to take
- id: type:pr
  extends: type:module
  purpose: >
    A Prompt Request — a person's request to change the knowledge, one page per request (never an agent's, a
    task's, a hook's or an import's: constraint:wf2.pr-is-the-persons): `pr-<slug>` under the project's PRs page, holding the
    request, its context, the definition (the blocks it proposes), its impact, the tasks and — once built — the
    result with the blocks it produced. Statuses draft | refining | approved | building | done | failed | cancelled:
    refined by a librarian session until the person approves it on the page, then built by a worker. Written by the
    app at start, approval and end, by the agent and the person while they refine; the Agents page lists a session's
    requests. A base type because the app writes request pages in every product (rule:pr-type-base).
  open: true
  statuses: [draft, refining, approved, building, done, failed, cancelled]
  props:
    session: string
    agent: string?
    started: string?
    finished: string?
    task: string?                                     # the task this plan was assigned for (req:exec.dispatch): embedded, not re-created
    role: string?                                     # the session role that filled it: librarian | worker (decision:exec.wye-is-a-role)
    skills: list of skill?                            # attached skills: their bodies ride in every session on this request (decision:wf2.hooks-and-skills)
    hooks: list of hook?                              # attached hooks: fire on this request's events, paused or not
- id: type:skill
  extends: type:module
  purpose: >
    an instruction a session follows, kept as a document under the project's Skills page (`skill-<slug>.md`,
    decision:wf2.hooks-and-skills): the body is the instruction — markdown, tags to the knowledge it needs. The
    shipped prompts are skills (skill:refine, skill:build, skill:describe-module) a person can read and edit; a
    hook runs one on a node; `skills:` on a PR, a type card or a hook attaches skills to the sessions it starts.
  open: true
  props:
    role: enum [librarian, worker]?                   # the session role that runs it (default librarian)
    takes: string?                                    # the kind it runs on
    writes: list of string?                           # the kinds it produces
    skills: list of skill?                            # composition, one level
- id: type:hook
  extends: type:node
  purpose: >
    "when this happens to that kind of node, do this" — a card in the project's Hooks document. `on: <kind>.<event>`
    (created | status:<x> | linked:<verb> | pr.approved | pr.built | session.done; kind may be *), `where:` filters
    (document=<glob>, type=<slug>, status=<x>, prop=<key>:<value>), `do:` actions one per line (`run skill:<id>`,
    `add <template>`, `assign task:<id> --worker <w>`, `notify "<text>"`), `once` per node (default true), status
    active | paused. Everything a hook writes is proposed and goes through review (decision:wf2.hooks-and-skills).
  open: true
  statuses: [active, paused]
  props:
    on: string
    where: string?
    do: text
    once: bool?
    skills: list of skill?
- id: type:workflow
  extends: type:skill
  purpose: >
    an ordered, gated pipeline a person runs on any node or document (decision:wf2.workflow-is-a-skill): a document
    `workflow-<slug>.md` under the project's Skills page whose `stage:` cards are its steps, in document order. A
    skill that declares stages is executed by the app, never pasted into a session's prompt — that is the whole
    difference between the two. `takes:` says which kinds it may be started on (`*`, or a comma-separated list).
  open: true
  statuses: [active, paused]
  props:
    takes: string?
- id: type:stage
  extends: type:node
  purpose: >
    one step of a workflow, a card in its document: `do:` the actions a hook also runs (task / run / add / assign /
    notify / dispatch), `produces:` the documents it creates from templates/docs when they are absent, `until:` its
    exit criterion in the closed predicate set (decision:wf2.until-is-closed), `gate:` person (the default — the
    person advances) or auto. A stage with no actions is a review stop.
  open: true
  props:
    do: text?
    produces: string?
    until: string?
    gate: enum [person, auto]?
    worker: string?
    skills: list of skill?
- id: type:run
  extends: type:node
  purpose: >
    one run of a workflow (decision:wf2.run-is-a-page): a document of its own under the project's Workflow runs page
    — `run-<workflow>-<n>.md` — whose frontmatter is the state (which workflow, what it runs on, the stage it is at,
    its status, what it produced, the sessions it started, `auto` the consecutive automatic advances) and whose
    sections the engine owns: Stages (where it has got to), Blocking (what stops the next stage, computed and written
    when it changes), Log (what happened and by whom) and Result. Runs made before run pages are cards in the
    Workflow runs document and are still read.
  open: true
  statuses: [running, waiting, blocked, done, cancelled]
  props:
    workflow: list of workflow? -(inverse)-> runs
    runs-on: list of node? -(inverse)-> run-by      # not `on`: type:comment owns that verb, and an inverse is keyed by its name
    stage: list of stage? -(inverse)-> stage-of
    produced: list of node? -(inverse)-> produced-by
    sessions: list of string?
    started: string?
    finished: string?
- id: type:doc
  extends: type:node
  purpose: >
    a page that is only a page — prose and blocks — and not a bounded area of the product the way type:module is.
    What a workflow stage produces (a research write-up, a PRD, a design, a plan) is one of these, so a run's
    documents do not enter the product's list of modules.
  open: true
- id: type:step
  extends: type:node
  purpose: >
    one stage of one run (decision:wf2.run-is-a-page): a card in the run's page, written when the run starts so the
    whole chain is in the graph from the first moment, not only the stage it has reached. `stage` is the definition
    it came from, `part-of` its run, `needs` the criterion that must hold before the next step starts, `produced`
    what it made. The engine keeps their statuses — todo until the run reaches it, running while its work is out,
    ready when its criterion holds and only the person's Advance is missing, then done (or skipped).
  open: true
  statuses: [todo, running, review, ready, done, skipped, blocked]
  props:
    stage: list of stage? -(inverse)-> stage-of
    needs: string?
- id: type:template
  extends: type:node
  purpose: >
    blocks a hook adds, as a card in the Hooks document: `body` is markdown with {{node}}, {{slug}}, {{title}},
    {{kind}}; `add <slug>` appends it, filled, under the node the hook fired on (or a file under templates/hooks/)
  open: true
  props:
    body: text
- id: type:field
  extends: type:node
  purpose: generated by the parser from an entity's fields block; never hand-written
  open: true
  props:
    name: string?
    type: string?
    typed-as: list of node? -(inverse)-> types
- id: type:type
  extends: type:node
  purpose: a type — declares the properties its instances have and which type it extends
  open: true
  props:
    purpose: text?
    home: string?                                     # the document new instances are written to (decision:ontology.collection-document)
    plural: string?                                   # the title of the type's collection document; else the English plural of its name
    open: bool?
    extends: ref type? -(inverse)-> extended-by
    props: text?
- id: type:prop
  extends: type:node
  purpose: generated by the parser from a type's props block — one node per declared property
  open: true
- id: type:block
  extends: type:node
  purpose: an anonymous block of a document (paragraph, heading, list item, table, fence) — id block:<doc>.<anchor hash>
  open: true
```
