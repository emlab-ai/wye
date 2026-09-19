---
name: waterfall-agent
description: How an agent works with Wye through the wf CLI — resolve a Wye link (http://…/<product>/<project>/d/<doc>#…) or node id to its text, read and write documents and nodes, search product knowledge, and report progress on a session. Use whenever a message, task or prompt contains a Wye link, a node id like req:x / task:y / goal:z, a session id, or asks to update the PRD, plan, tech design or knowledge of a product kept in Wye.
---

# Working in Wye

The full contract is `prompts/agent-system.md` in the Wye repo (also served at `$WF_URL/api/<product>/agent-prompt`).
The short version: read Wye before you act, and **write every decision — the person's or yours — as a
`decision:` block (status proposed) in the document it belongs to before moving on**; every open question as a
`question:` block where it arose; requirements as `req:` blocks, rules as `rule:` blocks, work as `task:` lines.
Never as prose. The Inbox and Questions views are the review of those blocks. Statuses of existing nodes may be
set directly (`wf node set`); `wf inbox add` is only for raw notes without a document.

Wye keeps a product's knowledge (goals, requirements, rules, decisions, entities, tasks) as markdown documents
with a graph on top, and a web app that people and agents share. `wf` is the CLI; it talks to the running web app
(`WF_URL`, default http://localhost:3456). `WF_PRODUCT` names the product when a link does not.

## Read first

```bash
wf packet --for "<text>" [--ref id]   # the constraints in force for what you are about to do: every rule, constraint, gate,
                                #   approved decision, goal and open question within two hops, complete (your first message carries it)
wf verdicts <id ...>            # how a block you wrote relates to its neighbours: duplicate | refines | consistent | contradicts
wf resolve <link|id>            # a link to a block, node, heading or document → its text and relations
wf doc <product/project/doc>    # a whole document (markdown)
wf node <id>                    # one node with its body and edges (kind:slug, e.g. req:offline.g4)
wf context "<text>"             # the knowledge closest to a piece of text (local semantic search; superseded / retired / archived hidden, --all shows them)
ctx --root data/products/<product> packet --task "<sentence>"   # a token-budgeted slice of the graph (offline)
```

A link like `…/yessensei/offline/d/prd#n-goal%3Aoffline.g2` points at a node; `#b-<hash>` at a paragraph; a bare
`#slug` at a heading. Resolve it before acting: the answer names the file and line, so edits go to the right place.

## Write back

- New knowledge → typed blocks in the document (yaml card or id-first prose line) with `status: proposed`
  (decisions, requirements, rules, constraints, lessons) or `status: open` (questions); the Inbox page lists what waits
  for approval. A decision carries `by:` (who decided), `evidence:` (session:<id>, a document, a URL) and, when it
  replaces an earlier one, `supersedes:` — approving it retires the old one; never edit or delete the old block.
- Raw notes without a document: `wf inbox add --type note --title "…"` (pasted conversations, meeting notes).
- Whatever is indented two spaces under a node's line is its content: blocks of any kind, each a node with content
  of its own, to any depth (a sub-task is a task line indented under its task; no heading needed). A document shows
  a node folded; its content is in its details.
- Statuses and tracking fields of existing nodes: `wf node set <id> --status done --set owner=alex --set due=2026-10`
  (edits the defining line in place; `--unset key` removes a property; the graph rebuilds).
- Editing the documents themselves (`wf doc write`, or the markdown under `data/products/<product>/projects/<project>/docs/`)
  only when the person asks for it; keep node ids stable; a line that starts with an id defines that node; run
  `ctx --root data/products/<product> check` afterwards: 0 errors.

## Sessions (when you were started by a runner, or asked to work on one)

```bash
wf session show <id> --product <p>        # instruction, refs, log so far, result
wf session log <id> --product <p> "<what you did / found>"   # progress lines people watch live
wf session done <id> --product <p> "<result summary>"       # or: wf session fail <id> "<why>"
wf session handoff <id> --product <p> --agent codex "<note>"  # continue under another agent
wf session changes <id> --product <p>     # every block the session added / changed / removed, per document
```

The runner marks the session done when you exit with 0; your final stdout is the result. Log as you go: the log is
what a person sees in the Sessions view.
