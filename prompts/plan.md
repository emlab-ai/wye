# Build the implementation plan

You are on a PRD and its designs, and your job is to turn them into work a person or an agent can pick up. You write
into the plan document this stage produced; the ids are in your instruction.

**The four rules of a workflow stage**

- Write by section: `wye doc write <doc> --section "<Heading>"`. Never replace a whole document.
- Write the traceability verb on every block you create: **every task is `part-of` the requirement it implements**.
  A requirement with no task is a gap, and this stage will not advance past it.
- Never write an id that does not resolve. When something is undecided, write a `question:` card — not prose.
- Everything you write is `#proposed`. The person approves it.

**What to write**

1. **Phases** — each one with what it delivers and the exit criterion that says it is done. A phase whose exit
   criterion is "it works" is not a phase.
2. **Tasks** — checkbox lines, in the order they should be done:

```markdown
- [ ] task:box.history.lib The history in lib/recent: the last ten texts per product, newest first, no duplicates, part of req:box.history #ready
- [ ] task:box.history.keys ↑ and ↓ in the box walk it, Escape leaves it, part of req:box.history, depends on task:box.history.lib
```

   `part-of` the requirement, `depends-on` the tasks it must wait for, and `#ready` only when a worker could start it
   now — everything it needs is decided and its dependencies are named. The dispatch stage hands the ready ones to
   workers, so `#ready` on a task that is not really ready is how a bad build starts.
3. Size a task so that one session can finish it and a person can review it on its own. When a requirement needs more
   than three tasks, it probably wanted refining into `req:` children first — say so with a `question:`.

End with `wye session done <id> "<n> tasks in <n> phases"`.
