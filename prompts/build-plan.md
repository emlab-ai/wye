# Build a plan

You build what a plan page (type:plan) says, from the folder with the vault, and the plan is the record: which task
is done, where each phase stands, what was decided on the way. A build can stop at any moment — the laptop closes,
the session ends — and the next one continues from the plan, not from memory. `<v>` is the vault's slug
(`.wye/_product.md`); `<plan>` the plan's slug.

## 1. Open the plan and join it

```bash
wye resolve <link or plan:<plan>>              # the page: <v>/<v>/<plan>
wye doc <v>/<v>/<plan>                         # goal, scope, requirements, phases, tasks with their status, progress
wye packet --for "<the plan's goal>" --ref plan:<plan>   # the constraints in force for it
eval "$(wye session join "build plan:<plan>" --ref plan:<plan>)"   # this build is a session: what you write is its own
wye doc set <v>/<v>/<plan> --status building   # once, when the first task starts
```

The plan's status must be `approved` (or `building` — a build that was interrupted) or the person said "build it":
otherwise stop and say so. Never build a `proposed` plan.

## 2. Find where it stands

Read the **Progress** section and the task lines: a task is done when its line says so (`#done`), a phase when its
Progress entry says its exit criterion held. Start at the first task not done whose dependencies are done; never
redo a done task — re-run its verification quickly if the next task builds on it, and say in the log that you did.

## 3. One task at a time

```bash
wye node set task:<plan>.<x> --status in-progress
# … the work: tests first, then the change, then the verification the task names (the normal development workflow)
wye node set task:<plan>.<x> --status done
wye session log $WYE_SESSION "task:<plan>.<x> done — <what landed, the test that shows it>"
git commit -- <the files you touched> -m "task:<plan>.<x> <what>"     # when the folder is a git repo: one commit per task, its id first
```

A task that turns out wrong or unnecessary is not deleted: `--status cancelled`, and the reason in the log and in
Progress. Work found on the way is a new task line under the plan — `wye work add "<text>" --part-of plan:<plan>
[--ready]` — never done silently. A decision made while building is proposed the moment it is made (`wye propose`,
`decision:` card, `evidence: session:$WYE_SESSION`); a requirement that turned out wrong is a new `req:` on the plan
page that `supersedes:` the old one, never an edit of it. A question you cannot answer is a `question:` card with
`status: open` on the plan page, and the task waits on it (`--status blocked`).

## 4. Write the progress back — after every task, and before you stop for any reason

The **Progress** section is one entry per phase, rewritten whole each time (`wye doc write <v>/<v>/<plan>
--section "Progress"`), the current phase first:

```markdown
### Phase 2 — <what it delivers> · in progress (3 of 5 tasks)
- done: task:<plan>.a (commit 1a2b3c), task:<plan>.b (commit 4d5e6f), task:<plan>.c
- now: task:<plan>.d — <where it stands: what is written, what is not yet, the test that fails>
- next: task:<plan>.e
- exit criterion: <the phase's criterion> — <not yet | held on <date>: how it was shown>
- found on the way: task:<plan>.f (added), decision:<v>.<y> (proposed), question:<v>.<z> (open)

### Phase 1 — <what it delivers> · done <date>
- exit criterion held: <how it was shown>
```

That entry is what the next session reads first; write it as if you will not be back. Also every ~30 minutes of
work and whenever you stop for a question: `wye session log $WYE_SESSION "<where you are>"`.

## 5. The end of a phase, the end of the plan

A phase ends when its exit criterion is shown to hold — run what shows it, write how in Progress. When every task
is done or cancelled: `wye doc set <v>/<v>/<plan> --status done`, `wye session done $WYE_SESSION "<what shipped, what
was left as questions>"`, and the reply names the same. A build that stops before that leaves the plan `building`,
Progress current, and `wye session log` saying why it stopped — the next `/wye-build` continues.
