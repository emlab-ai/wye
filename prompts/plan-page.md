# Plan a piece of work as a plan page

The plan for a piece of work is a page of the vault (type:plan), not a markdown file in the repo: the person reads
and approves it in the app, its requirements and tasks are nodes the Inbox and the Work view track, and every session
after this one finds it with `wye`. Run every command from the folder with the vault (`wye` finds it; `<v>` below is
the vault's slug — the project in a vault has the same slug, so a document ref is `<v>/<v>/<doc>`; read it from
`.wye/_product.md`, or `wye init` printed it).

## 1. Read before planning

```bash
wye packet --for "<what to build>"          # the rules, constraints, decisions, goals and open questions in force
wye ask "what do we know about <topic>?"    # what the vault, the documents and the code already say
wye context "plan <topic>"                   # a plan for this may exist — continue it instead of making a second
wye work list                                # the tasks already planned or in progress
```

If an existing plan covers it, open that one (`wye doc <v>/<v>/<doc>`) and refine it instead.

## 2. Make the page

```bash
wye doc create <v>/<v>/<slug> --title "<Title>" --template plan --type plan
```

Keep the title short — two or three words: the slug comes from it and every task id carries the slug. The page is
a plan, its node `plan:<slug>` — what every requirement of the plan is part of. The command prints the ref and the
link; the template gives the sections below.

## 3. Define it — by section, never the whole document

`wye doc write <v>/<v>/<slug> --section "<Heading>" <<'EOF' … EOF` replaces one section; a missing one is added.

- **Goal** — one sentence saying what is true when the plan is done, and the goals / decisions it serves as links on
  the words: `[the vault's note](decision:<v>.x)`. Never a bare id in prose, never an id that does not resolve.
- **Scope** — what is in, what is out, in two short lists.
- **Requirements** — the `req:` blocks this plan implements, **defined on the plan page**. A card holds only `id`,
  `title`, `status: proposed`, `part-of: plan:<slug>`; its When / Then / Unless are **content lines indented two
  spaces under the fence**, each a node of its own — never yaml properties:

  ```markdown
  ```yaml
  - id: req:<v>.<slug>.<x>
    title: <what is true for the person, one sentence>
    status: proposed
    part-of: plan:<slug>
  ```
    - when:<slug>.<x> <the trigger, a sentence>
    - then:<slug>.<x> <the outcome>
    - unless:<slug>.<x> <the exception>
  ```

  A requirement that already exists is linked on its words instead. A plan with no requirement is a to-do list —
  fine for a chore, say so.
- **Phases** — the table: what each delivers and the exit criterion that says it is done ("it works" is not one).
- **Tasks** — checkbox lines in the order they are done, one per thing a session can finish and a person can review:

  ```markdown
  - [ ] task:<slug>.<x> <what, in one sentence>, part of req:<v>.<slug>.<…> #ready
  - [ ] task:<slug>.<y> <what>, part of req:<v>.<slug>.<…>, depends on task:<slug>.<x>
  ```

  `part of` the requirement (or `plan:<slug>` for a chore), `depends on` what it waits for, `#ready` only when a
  worker could start it now. A sub-task is a task line indented two spaces under its task. Name the phase a task
  belongs to in its sentence when the order alone does not say it.
- **Progress** — leave the template's text: the build writes here, one entry per phase.
- **Questions** — what you could not decide, as `question:` cards with `status: open`, never as prose.
- Every decision taken while planning (an approach chosen, an option rejected) is a `decision:` card proposed with
  `wye propose` the moment it is made — the vault's note in CLAUDE.md / AGENTS.md says how.

Then `wye check` (0 errors from this page) and give the person the link. **Stop there: the person approves the plan**
(its status on the page, or their word); approving is theirs. Building it is `/wye-build <link or plan:<slug>>` —
the build-plan skill — once it is approved.
