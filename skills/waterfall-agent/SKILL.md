---
name: waterfall-agent
description: How an agent works with Wye through the wye CLI — resolve a Wye link (http://…/<product>/<project>/d/<doc>#…) or node id to its text, read and write documents and nodes, search product knowledge, and report progress on a session. Use whenever a message, task or prompt contains a Wye link, a node id like req:x / task:y / goal:z, a session id, or asks to update the PRD, plan, tech design or knowledge of a product kept in Wye.
---

# Working in Wye

The full contract is `prompts/agent-system.md` in the Wye repo (also served at `$WYE_URL/api/<product>/agent-prompt`).
The short version: read Wye before you act, and **write every decision — the person's or yours — as a
`decision:` block (status proposed) in the document it belongs to before moving on**; every open question as a
`question:` block where it arose; requirements as `req:` blocks, rules as `rule:` blocks, work as `task:` lines.
Never as prose. The Inbox and Questions views are the review of those blocks. Statuses of existing nodes may be
set directly (`wye node set`); `wye inbox add` is only for raw notes without a document.

Wye keeps a product's knowledge (goals, requirements, rules, decisions, entities, tasks) as markdown documents
with a graph on top, and a web app that people and agents share. `wye` is the CLI; it talks to the running web app
(`WYE_URL`, default http://localhost:3456). `WYE_PRODUCT` names the product when a link does not.

## Read first

```bash
wye packet --for "<text>" [--ref id]   # the constraints in force for what you are about to do: every rule, constraint, gate,
                                #   approved decision, goal and open question within two hops, complete (your first message carries it)
wye verdicts <id ...>            # how a block you wrote relates to its neighbours: duplicate | refines | consistent | contradicts
wye resolve <link|id>            # a link to a block, node, heading or document → its text and relations
wye doc <product/project/doc>    # a whole document (markdown)
wye node <id>                    # one node with its body and edges (kind:slug, e.g. req:offline.g4)
wye context "<text>"             # the knowledge closest to a piece of text (local semantic search; superseded / retired / archived hidden, --all shows them)
wye work list [--unassigned | --mine <name> | --goal <id>]   # the Work view: every task with its state and worker — what is planned or in progress
wye impact <id> --after "<new text>"   # before editing an approved node: what the edit reaches and what each reached node needs
                                #   (unaffected | update | rework | contradicts | ask); every edit keeps its old value as a change record
wye explain <id | "text">        # one librarian turn: the current state around a node or a text, with the nodes as tags
wye packet --root data/products/<product> --task "<sentence>"   # a token-budgeted slice of the graph (offline)
```

A link like `…/yessensei/offline/d/prd#n-goal%3Aoffline.g2` points at a node; `#b-<hash>` at a paragraph; a bare
`#slug` at a heading. Resolve it before acting: the answer names the file and line, so edits go to the right place.

## Write back

- New knowledge → typed blocks in the document (yaml card or id-first prose line) with `status: proposed`
  (decisions, requirements, rules, constraints, lessons) or `status: open` (questions); the Inbox page lists what waits
  for approval. A decision carries `by:` (who decided), `evidence:` (session:<id>, a document, a URL) and, when it
  replaces an earlier one, `supersedes:` — approving it retires the old one; never edit or delete the old block.
- Work: `wye work add "<text>" [--part-of <id>] [--ready]` writes a task line (under the node, else the plan's Backlog)
  for a follow-up; `wye propose <product/project/doc> --plan <plan ref>` (a yaml card on stdin) writes one proposed
  block into its home document and embeds it on a plan's Definition; `wye plan <plan ref>` shows a plan's Definition.
- Raw notes without a document: `wye inbox add --type note --title "…"` (pasted conversations, meeting notes).
- Whatever is indented two spaces under a node's line is its content: blocks of any kind, each a node with content
  of its own, to any depth (a sub-task is a task line indented under its task; no heading needed). A document shows
  a node folded; its content is in its details.
- Statuses and tracking fields of existing nodes: `wye node set <id> --status done --set owner=alex --set due=2026-10`
  (edits the defining line in place; `--unset key` removes a property; the graph rebuilds).
- Editing the documents themselves (`wye doc write`, or the markdown under `data/products/<product>/projects/<project>/docs/`)
  only when the person asks for it; keep node ids stable; a line that starts with an id defines that node; run
  `wye check --root data/products/<product>` afterwards: 0 errors.

## Sessions (when you were started by a runner, or asked to work on one)

```bash
wye session show <id> --product <p>        # instruction, refs, log so far, result
wye session log <id> --product <p> "<what you did / found>"   # progress lines people watch live
wye session done <id> --product <p> "<result summary>"       # or: wye session fail <id> "<why>"
wye session handoff <id> --product <p> --agent codex "<note>"  # continue under another agent
wye session changes <id> --product <p>     # every block the session added / changed / removed, per document
```

The runner marks the session done when you exit with 0; your final stdout is the result. Log as you go: the log is
what a person sees in the Sessions view.
