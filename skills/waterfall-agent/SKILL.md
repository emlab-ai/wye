---
name: waterfall-agent
description: How an agent works with Waterfall through the wf CLI — resolve a Waterfall link (http://…/<product>/<project>/d/<doc>#…) or node id to its text, read and write documents and nodes, search product knowledge, and report progress on a session. Use whenever a message, task or prompt contains a Waterfall link, a node id like req:x / task:y / goal:z, a session id, or asks to update the PRD, plan, tech design or knowledge of a product kept in Waterfall.
---

# Working in Waterfall

Waterfall keeps a product's knowledge (goals, requirements, rules, decisions, entities, tasks) as markdown documents
with a graph on top, and a web app that people and agents share. `wf` is the CLI; it talks to the running web app
(`WF_URL`, default http://localhost:3456). `WF_PRODUCT` names the product when a link does not.

## Read first

```bash
wf resolve <link|id>            # a link to a block, node, heading or document → its text and relations
wf doc <product/project/doc>    # a whole document (markdown)
wf node <id>                    # one node with its body and edges (kind:slug, e.g. req:offline.g4)
wf context "<text>"             # the knowledge closest to a piece of text (local semantic search)
ctx --root data/products/<product> packet --task "<sentence>"   # a token-budgeted slice of the graph (offline)
```

A link like `…/yessensei/offline/d/prd#n-goal%3Aoffline.g2` points at a node; `#b-<hash>` at a paragraph; a bare
`#slug` at a heading. Resolve it before acting: the answer names the file and line, so edits go to the right place.

## Write back

- Small changes to a goal, task or any prose node: `wf node set <id> --status done --set owner=alex --set due=2026-10 --text "new text"`
  (edits the defining line in place; `--unset key` removes a property; the graph rebuilds).
- Larger edits: change the markdown file under `data/products/<product>/projects/<project>/docs/` directly, or
  `wf doc write <product/project/doc> --file new.md` for a whole body. Keep node ids stable; a line that starts with
  an id defines that node (`req:x …`, `- [ ] task:y …`, `goal:z … #on-track (target: 2026-10)`).
- New knowledge goes where its kind lives: goals/requirements/questions in the PRD, entities/rules/decisions in the
  tech design, tests in the test design, tasks in the plan. Link with ids in the text ("part of goal:x",
  "depends on entity:y").
- Run `ctx --root data/products/<product> check` before finishing: 0 errors.

## Sessions (when you were started by a runner, or asked to work on one)

```bash
wf session show <id> --product <p>        # instruction, refs, log so far, result
wf session log <id> --product <p> "<what you did / found>"   # progress lines people watch live
wf session done <id> --product <p> "<result summary>"       # or: wf session fail <id> "<why>"
wf session handoff <id> --product <p> --agent codex "<note>"  # continue under another agent
```

The runner marks the session done when you exit with 0; your final stdout is the result. Log as you go: the log is
what a person sees in the Sessions view.
