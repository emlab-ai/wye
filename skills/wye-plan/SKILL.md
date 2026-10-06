---
name: wye-plan
description: Plan a piece of work as a document in the Wye vault — /wye-plan <what to build>. Creates the plan page in the vault (goal, scope, the requirements it implements, phases, tasks as task lines), gets it approved, then works from it: tasks marked done as they land, new to-dos added under it, decisions proposed. Use instead of writing a plan or to-do list as a markdown file anywhere else, whenever work in a folder with a .wye vault needs a plan.
---

# /wye-plan <what to build>

The plan for a piece of work is a document in the vault, not a markdown file in the repo: the person reads and
approves it in the app, its tasks are nodes the Work view tracks, and every session after this one finds it with
`wye`. Run every command from the folder with the vault (`wye` finds it; `<v>` below is the vault's slug — the
project in a vault has the same slug, so a document ref is `<v>/<v>/<doc>`; `wye init` printed it, or read
`.wye/_product.md`).

## 1. Read before planning

```bash
wye packet --for "<what to build>"          # the rules, constraints, decisions, goals and open questions in force
wye ask "what do we know about <topic>?"    # what the vault, the documents and the code already say
wye context "plan <topic>"                   # a plan for this may exist — continue it instead of making a second
wye work list                                # the tasks already planned or in progress
```

If an existing plan covers it, open that one (`wye doc <v>/<v>/<doc>`) and go to step 4.

## 2. Make the page

```bash
wye doc create <v>/<v>/<slug> --title "<Title>" --template plan
```

The slug comes from the title — keep it short (two or three words: the task ids carry it); the command prints the ref and the link. The template gives a Goal, Phases and Tasks
section; the page's node is `module:<slug>` — the id every task of the plan is part of.

## 3. Define it — by section, never the whole document

`wye doc write <v>/<v>/<slug> --section "<Heading>" <<'EOF' … EOF` replaces one section; a missing one is added.

- **Goal** — one sentence saying what is true when the plan is done, and the goals / decisions it serves as links on
  the words: `[the vault's note](decision:<v>.x)`. Never a bare id in prose.
- **Scope** — what is in, what is out, in two short lists.
- **Requirements** — the `req:` blocks this plan implements, **defined on the plan page**, never as links to cards
  written elsewhere. A card holds only `id`, `title`, `status: proposed`, `part-of: module:<slug>`; its When / Then /
  Unless are **content lines indented two spaces under the fence**, each a node of its own — never yaml properties:

  ```markdown
  ```yaml
  - id: req:<v>.<slug>.<x>
    title: <what is true for the person, one sentence>
    status: proposed
    part-of: module:<slug>
  ```
    - when:<slug>.<x> <the trigger, a sentence>
    - then:<slug>.<x> <the outcome>
    - unless:<slug>.<x> <the exception>
  ```

  A requirement that already exists is linked on its words instead; a plan with no requirement is a to-do list —
  fine for a chore, say so.
- **Phases** — the table: what each delivers and the exit criterion that says it is done ("it works" is not one).
- **Tasks** — checkbox lines in the order they are done, one per thing a session can finish and a person can review:

  ```markdown
  - [ ] task:<slug>.<x> <what, in one sentence>, part of req:<…> #ready
  - [ ] task:<slug>.<y> <what>, part of req:<…>, depends on task:<slug>.<x>
  ```

  `part of` the requirement (or `module:<slug>` for a chore), `depends on` what it waits for, `#ready` only when a
  worker could start it now. A sub-task is a task line indented two spaces under its task.
- **Questions** — what you could not decide, as `question:` cards with `status: open`, never as prose.
- Every decision taken while planning (an approach chosen, an option rejected) is a `decision:` card proposed with
  `wye propose` the moment it is made — the vault's note in CLAUDE.md / AGENTS.md says how.

Then `wye check` (0 errors) and give the person the link. **Stop here until the person approves the plan** (its
status in the app, or their word); approving is theirs.

## 4. Work from it

```bash
wye doc <v>/<v>/<slug>                              # the plan with its task lines and their status — the record
wye work list --goal req:<…>                        # a requirement's tasks and their state, across plans
wye node set task:<slug>.<x> --status done          # as each lands — in the plan, not only in your reply
wye work add "<a to-do found on the way>" --part-of module:<slug> [--ready]   # new work goes under the plan
wye doc write <v>/<v>/<slug> --section "Tasks" …    # re-order or refine the task lines when the plan changes
```

Take the tasks in order (`#ready`, dependencies met), the normal development workflow for each (tests first,
verification before claiming done). A task that turns out wrong is not deleted: `--status cancelled` and a line why.
A decision made while building is proposed at once; a requirement that changed is a new `req:` that `supersedes:`
the old. A plan whose tasks are all done counts as ended on its own; the reply then names what shipped and what was
left as questions.
