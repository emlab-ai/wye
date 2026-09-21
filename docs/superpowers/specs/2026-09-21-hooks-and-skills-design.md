# Hooks and skills — design

2026-09-21. Skills are instructions a session follows, kept as documents in Wye; hooks fire on events in the graph and run a skill on the node, add blocks from a template, assign or notify. Together they let a person define a harness — "when a requirement is approved, define how to test it" — without code. Decisions with alex: a skill is a document under a Skills folder; a hook's actions are run a skill / add blocks / assign or notify; hooks live in one Hooks document per project, keyed by kind + event + filter; everything a hook produces goes through review like an agent's work.

Two deliverables: **H1** — skills, the hooks engine with `run` and `add`, the example harness; **H2** — `assign` / `notify`, chaining, the column's Hooks section, Settings.

## 1. Skills

- `type:skill` in the base ontology (extends type:module — a skill is a page): props `role: enum [librarian, worker]?` (default librarian), `takes: string?` (the kind it runs on), `writes: list of string?` (the kinds it produces), `skills: list of skill?` (composition, one level), `status`. The body is the instruction: markdown, tags to the knowledge it needs, embeds allowed.
- Skills are documents under the project's **Skills** page (`skills.md`, `module:<project>-skills`, a system folder in the rail like PRs), `skill-<slug>.md`, `node: skill:<slug>`. `ensureSkillsPage` like the PRs page; a "+ skill" on the folder makes one from a template.
- The shipped prompts become skills a person can read and edit: `skill:refine` (prompts/librarian-system.md's role text + the refining brief), `skill:build` (the worker's), `skill:describe-module`, plus the example `skill:define-tests`. They are written into a product's Skills page when it is first needed (`ensureBaseSkills`), and the host reads the skill's body from the document when present, else the file — the file stays the fallback so nothing breaks without them.
- Attachment: `skills: [skill:x, …]` on a PR's frontmatter (the build session's first message carries their bodies under "## Skills"), on a type card (every session started on an instance of that type gets them), on a hook. `wye skill <id>` prints a skill; `wye skills` lists them.

## 2. Hooks

- `type:hook` (extends type:node), cards in the project's **Hooks** document (`hooks.md`, `module:<project>-hooks`, a system folder; one place to read them):

```yaml
- id: hook:req-approved-tests
  title: An approved requirement gets its tests defined
  on: req.status:approved
  where: document=requirements-*        # optional: document=<slug glob>, type=<slug>, status=<x>, prop=<key>:<value>
  do: run skill:define-tests            # one action per line; several `do` lines allowed (do, do-2 … or a list)
  once: true                            # per node: fire at most once (default true)
  status: active                        # active | paused
```

- Events (`on:` = `<kind>.<event>`): `created` (a node newly defined), `status:<x>` (its status became x), `linked:<verb>` (an edge with that verb now points at it), `pr.approved`, `pr.built` (the build session ended done), `session.done` (any session ended; `where` filters by role). `kind` may be `*`.
- Actions (`do:`): `run skill:<id>` — a session on the node; `add <template>` — blocks from a template under the node; `assign task:<id> --worker <w>`; `notify "<text>"` (H2 for the last two).

## 3. The engine — `lib/hooks.ts`

- Events come from where they already happen: the watcher's change records (`recordsFromDiff` knows before/after status and new nodes → `created`, `status:<x>`, `linked:<verb>` from the edge diff), `approvePr` (`pr.approved`), the dispatcher's build end and `onSessionEnd` (`pr.built`, `session.done`). Each emits `fire(product, { kind, id, event, node, session? })`.
- `matchHooks(hooks, event, node)` (pure) picks the active hooks whose `on` and `where` match. A firing is recorded in `<product>/_hooks/<id>.json` `{ hook, node, event, at, actions: [{ kind, session?, added?: string[] }], depth }` — `once` holds through it, and the node's column can show what ran.
- Chaining: blocks a hook's session or template creates are ordinary changes and can fire hooks; a firing carries `depth` (the firing that led to the session that wrote the block + 1) and the engine refuses depth > 3 and any hook that already fired on the same node. Hooks are off for a product when Settings says so (H2) or the env `WF_HOOKS=0`.

## 4. Actions

- **run**: `createSession` with the skill's role, `refs` = the node + its `part-of` targets, `source` = the node's page, `hook: { id, firing }` on the session; `startChat` with a first message built as today (instruction = "Run skill:<id> on <node>", the resolved refs, the constraint packet) plus `## Skill` = the skill's body and `## Skills` for any attached; the session's blocks go through `wye propose` / review as any agent's; its end records the result on the firing. Worker skills run in the product repo; librarian skills in Wye's.
- **add**: a template under `templates/hooks/<name>.md` or a `template:` card in the Hooks document — markdown with `{{node}}`, `{{slug}}`, `{{title}}`, `{{kind}}` — appended as the node's content (child blocks, `status: proposed`, `by: hook:<slug>`) or, with `to: <doc>`, to a document's end. Deterministic, no model.
- **assign** / **notify** (H2): the existing assign route; an inbox note (`from: hook:<slug>`) plus a push notification.

## 5. UI

- Rail: **Skills** and **Hooks** system folders (per project pages, every project together like PRs). A skill page is an ordinary document (the editor); a hook card is a yaml card with the fields above, `status` active/paused as its status.
- The column of any node: a **Hooks** section (H2) — the hooks that match its kind (what would fire on which event), the firings that ran (with the session / the blocks). A PR head lists its attached skills.
- Settings › Agents: `hooks: on | off` (H2).
- The example harness ships with the base skills: `hook:req-approved-tests` → `run skill:define-tests` — the skill proposes `test:` / `ui-test:` cards for the requirement, each with `verified-by` back to it and `covers`, on the project's Tests page.

## Testing

vitest: `hooks.test.ts` (`matchHooks` over events/filters/once/paused, the template fill, depth and repeat refusal), `skills.test.ts` (skill body resolution document → file, attachments to a session's first message), the watcher's event extraction from a diff (`eventsFromDiff`). Live: approve a requirement in a scratch product with the example hook → a session starts with the skill; `add` on a template appends proposed blocks.

## Out of scope

- A visual hook builder (the card is the builder). Cron-like hooks (time is not an event here). Hooks across products.
