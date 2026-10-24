# Wye

**Product definition and long-term memory for coding agents.**

Wye keeps what a product is *supposed to do* in Markdown in Git: its requirements, rules, decisions, constraints,
architecture and context. Coding agents read that definition before they build. What they learn and decide while
building comes back as proposed knowledge for a person to review.

So instead of every agent session starting by reconstructing intent from code, tickets and chat history, the product
develops a memory.

![A tour of Wye: a document, a Prompt Request, Remember, the Inbox, Ask, the mind map and a table's SQL](docs/tour.gif)

```bash
npm install -g @emlab/wye
wye setup              # your products go in ~/.wye/data; the Claude Code skills into ~/.claude/skills
wye app                # the app in its own window (--browser: in your browser, at http://localhost:3456)
```

Needs Node.js 20.9+ and [Claude Code](https://claude.com/claude-code) or [Codex](https://github.com/openai/codex)
installed: Wye runs its agents through them. Local-first, no accounts, Apache-2.0.
[Getting started](#getting-started) has the details.

---

## Why Wye?

Coding is becoming easier to delegate to agents. Describing **what should be built, why, and under which
constraints** is not.

The knowledge needed to make a product change is usually scattered across the code, Jira or Linear, Notion or
Confluence, Slack, architecture documents, previous agent conversations, and people's heads. A coding agent sees only
part of it.

Give an agent a request like:

> Change the refund window from 30 days to 14 days.

and several questions appear at once:

- Where is the current 30-day rule defined?
- Which customer promises depend on it?
- Does another requirement contradict the change?
- Which services, tests and UI flows are affected?
- Was the old rule a deliberate product decision, or an implementation detail?
- If the agent discovers something important while building, where does that knowledge go?
- Will the next agent know what happened?

The usual workflow is roughly:

```text
prompt → agent reads some code → agent reconstructs context → agent makes assumptions → code
```

Wye explores a different one:

```text
product definition → Prompt Request → impact + contradictions → human decision
    → agent → review → approved memory → next change
```

The central idea:

> **Humans own the product definition. Agents derive changes from it.**

## What is Wye?

Wye is an editor and runtime for a product's **definition**: its goals, users, requirements, rules, constraints,
decisions, entities, architecture, tests, questions, commitments and tasks, and the relationships between them.

They are stored as ordinary Markdown files in Git. Wye reads the important blocks in those files as nodes in a graph,
which gives the same knowledge two forms:

```text
Markdown   for people to read and edit
   ⇅
Graph      for software and agents to reason over
```

The Markdown is canonical and the graph is derived from it. There is no separate knowledge database you have to trust
as the source of truth.

![A requirements document, with one requirement opened in the column](docs/screenshots/document.png)
*A document of requirements. Every block is a node; opened in the column, its links are editable.*

## The idea in one example

*An illustration.* Say the product definition contains:

```markdown
req:refund.window Customers may request a refund within 30 days of purchase.

decision:refund.window Refunds use a 30-day window because enterprise contracts promise 30 days.

test:refund.window Refund requests on days 1–30 are accepted; requests after day 30 are rejected.
```

Now someone asks: *reduce the refund window to 14 days.*

In a normal coding-agent workflow, the agent searches the repository, finds the constant and changes it. But the
code is only part of the story.

Wye treats the request as a change to the **product definition** first. The proposed 14-day rule contradicts
`decision:refund.window`, because enterprise contracts still promise 30 days, and the graph shows the test and the
other parts of the product linked to it. Before any code is written, a person has a decision to make:

```text
A  Keep enterprise customers at 30 days and move everyone else to 14.
B  Change the contracts and move everyone to 14.
C  Don't make the change.
```

Once the intended behaviour is approved, the coding agent gets the requirements, constraints and decisions in force,
and builds the change. If it finds during the build that enterprise refunds go through a separate service, that does
not have to disappear into the transcript. The agent proposes it:

```markdown
fact:refund.enterprise-service Enterprise refunds are processed by component:enterprise-refunds.
```

A person reviews it. Once approved, it is part of the product's memory, and the next change starts with more
knowledge than this one did. That accumulation is the point.

## The Wye loop

### 1. Define

Describe the product in documents. Most of it can be ordinary prose, but the important pieces get stable ids:

```markdown
goal:checkout.fast Checkout should feel instantaneous.

req:sale.close When the final kitchen item is completed, the order becomes Closed.

rule:payments.capture Payment must be captured before an order can be completed.

decision:payments.provider Use Stripe for online card processing.
```

These are still readable Markdown. Because they have ids, Wye can connect them. You can also start from code:
`wye init` in a repository gives it a **vault** — its own knowledge in `.wye/`, committed with the code: a first,
shallow definition read from the files, a note in `AGENTS.md` / `CLAUDE.md` that sends every agent working there to
it, and links to the vaults above and below it in a monorepo. `wye deepen` then sends an agent to describe each
module in a person's words — only what the code does not already say. Inside a folder with a vault, `wye` needs no
`--product`: it finds the nearest `.wye/` above where it runs, so what an agent learns about a service lands in that
service's vault, and a vault's packet carries the approved constraints of the vaults above it. Open the repository
(or any folder) as the **workspace** — `wye app <folder>`, or Open folder… at the top of the rail — and every vault
it reaches is a root in Documents; Goals, Work, the Inbox and search read them all. The whole of it:
[docs/workspaces-and-vaults.md](docs/workspaces-and-vaults.md).

### 2. Request

A change starts as a **Prompt Request**. In Wye, PR does not mean pull request.

A Prompt Request describes what you want to change before an agent changes the code: what is asked and why, what
behaviour changes, what stays the same, which questions are open, and what the change may reach. A *librarian* agent
refines it with you. It writes a summary of what will be built, asks questions, and proposes the blocks the request
needs. The librarian never writes code: its job is to understand the change.

![A Prompt Request: readiness, approve, and the blocks it proposes](docs/screenshots/pr.png)
*A Prompt Request: its readiness checks, Approve, and every node the change may touch.*

### 3. Understand the impact

Wye knows how requirements, decisions, components, tests and pages relate, so it can compute what a change may reach:

```text
req:refund.window
  ├─ verified-by   test:refund.window
  ├─ governed-by   decision:refund.window
  ├─ satisfied-by  component:refund-api
  └─ satisfied-by  page:account.refunds
```

This happens **before** implementation. The goal is not to predict every changed line of code. It is to put the
product knowledge around a change in front of people and agents, so nobody works from an isolated prompt.

### 4. Resolve contradictions

Products change, and so does what they know. A new requirement may agree with an existing one, refine it, duplicate
it, supersede it, or contradict it.

Wye makes contradictions visible rather than letting an agent settle them quietly:

```text
Existing:  Refunds are available for 30 days.
Proposed:  Refunds are available for 14 days.
```

That is not necessarily an error; it may be a legitimate product change. But someone, ideally a person, should decide
which statement is now in force and what happens to the old one.

When something is written, Wye's judge compares it with its neighbours in the graph and classifies each pair as
`duplicate`, `refines`, `consistent` or `contradicts`. For a contradiction it also names the kind: a fact against a
fact, a later state of the same thing, or a conflict only under some condition. Each verdict records the model and
prompt that produced it, so it can be replayed and evaluated.

A contradiction is itself a node, and it waits in the Inbox with its two sides and the decisions that stand behind
each. **Resolving it is a decision**: you say which side holds — A, B, both, neither, or another way in your own
words — and why, and Wye writes that as an approved `decision:` block. The losing side and the decisions that stood
only behind it are marked `superseded` and point at the new decision; the contradiction closes and points at it too.
Nothing is deleted, and nothing left standing says what was decided against. When you cannot decide yet, **Ask** turns
it into an open question about both sides, and the contradiction waits for the answer.

### 5. Approve

Agents can propose changes to the definition. They cannot make those proposals true.

> **Agents propose. Humans approve.**

Approval matters because product knowledge is not generated text. Once something is part of the definition, future
agents will make decisions based on it. Changing a product's memory is a meaningful act.

### 6. Build

Once a request is defined and approved, Wye hands it to a coding agent, Claude Code or Codex. The agent's first
message carries the constraints in force: a bounded description of the world around the change, so it doesn't have
to infer the whole product from the repository. Requests whose scopes don't overlap can be built in parallel.

The code stays in your normal repository. Wye is not trying to replace Git, your language or your coding agent. It
tries to improve what flows into the agent and what comes back out.

### 7. Review

A build produces more than code. On the way, an agent may find an undocumented architectural constraint, a dependency
nobody recorded, a new domain rule, the reason an old implementation exists, an open question, or a decision it had
to make to finish the work.

Those come back to Wye as proposed knowledge and wait in the **Inbox**, where a person approves, edits or rejects
them.

### 8. Remember

Approved knowledge becomes the context for future work:

```text
          ┌────────────────────┐
          │ product definition │◄─────────────────┐
          └─────────┬──────────┘                  │
                    ▼                             │
               new request                        │
                    ▼                             │
            impact / decisions                    │
                    ▼                             │
              human approval                      │
                    ▼                             │
                  agent                           │
                    ▼                             │
             discoveries + code                   │
                    ▼                             │
               human review                       │
                    ▼                             │
              approved memory ────────────────────┘
```

The definition grows richer as the product evolves.

## Product memory, not chat memory

Many coding-agent products now have some notion of "memory". Wye means something more specific by it. Memory is not
*here are some old conversations*. It is structured knowledge whose relationship to the current product can be
inspected:

```yaml
- id: decision:orders.close-v2
  status: approved
  supersedes: decision:orders.close-v1
```

The old decision doesn't disappear; it stays in the history, marked as superseded. What matters is knowing which
statement is in force now. Every node can say since when and until when it holds, so a product keeps both *what we
believed then* and *what is true now*, without flattening them into one timeless context dump.

The context an agent gets is computed, not recalled. A request's first message carries every rule, constraint,
approved decision and goal within two hops of what it touches, plus the open questions on them. That is a walk over
the graph, complete by construction. Search only finds where to start the walk; it is never the authority on what
governs.

## Everything important can have an id

The smallest useful unit in Wye is a block with an id:

```markdown
req:sale.close When the final kitchen item is completed, the order is marked Closed.

decision:memory.bitemporal Product knowledge keeps its history rather than overwriting old states.

entity:order One customer's active purchase.
```

An id lets other knowledge refer to it, and those references become edges in the graph:

```markdown
test:sale.close verifies req:sale.close.
component:order-service satisfies req:sale.close.
rule:close-on-complete governs req:sale.close.
```

The words before an id name the verb (*verifies*, *satisfies*, *governs*, *depends on*, *part of*); the parser fills
in the inverse on the other side.

## Markdown is the database

Wye keeps the canonical form deliberately boring: **text files in Git.**

```markdown
req:sale.close When a sale is completed and all [kitchen items](entity:kitchen-item) are done, et:order is marked Closed. #proposed
  - when:sale.close the final kitchen item is completed
  - then:sale.close the order is marked Closed
```

Wye parses the documents into nodes and relationships. The graph can then answer questions like:

- What implements this requirement? Which tests verify it?
- Which decisions govern it, and what superseded them?
- What would this change affect? Which constraints apply?
- Which open questions concern this area?

The files stay usable without Wye: read them on GitHub, edit them in any editor, diff them, branch them, review their
history.

![The Knowledge page: everything the product knows, by kind](docs/screenshots/knowledge.png)
*Knowledge: everything the product knows, by kind.*

## The type system is open

Wye has base types such as `req:`, `rule:`, `decision:`, `constraint:`, `goal:`, `entity:`, `question:`, `task:`,
`page:` and `test:`. It doesn't prescribe one universal ontology, though: a product declares its own vocabulary.

| a product for | might add |
|---|---|
| software it builds | `service:`, `store:`, `metric:` (`module:`, `component:`, `lib:`, `op:` and `fact:` are base kinds — `wye init` writes them) |
| logistics | `vehicle:`, `route:`, `depot:`, `driver:` |
| evaluation | `eval:`, `dataset:`, `benchmark:`, `run:` |
| hospitality | `restaurant:`, `menu:`, `dish:`, `table:` |

Declare the type as a card in any document and its instances join the same graph. See
[docs/type-system.md](docs/type-system.md) for the full model.

![The Types page: each type with its parent, properties and instances](docs/screenshots/types.png)
*Types: each kind with what it extends, its properties and how many instances it has.*

## The Constitution

Some constraints matter to every change, even when no code can enforce them:

```text
Never expose one tenant's data to another tenant.
Text files in Git are canonical.
All externally visible behaviour must have a requirement.
Agents may propose knowledge but may not approve it.
```

Wye calls these product-level constraints the **Constitution**. The approved ones go verbatim into every agent's
system prompt, so they are hard to lose between sessions.

![The Constitution page](docs/screenshots/constitution.png)

## Ask

**Ask** (⌘F) answers questions about the product, searching across its knowledge, documents, code, graph and agent
sessions:

```text
Why do we use a 30-day refund window?
What happens when the final kitchen item is completed?
Which requirements depend on component:order-service?
```

A question gets two answers at once: a fast one in a few seconds, and a deeper one from an agent that searches,
follows the graph and reads the code while you watch the sources it opens. Answers cite their sources, so you can
check them rather than trust unsupported model output. The index is local; nothing leaves the machine except the
answering model call.

![Ask: a cited answer and the sources the deeper search found](docs/screenshots/ask.png)
*Ask: a cited answer, the sources the deeper search found, and the passages behind it.*

## Remember

Not all useful knowledge starts as a formal requirement. Sometimes someone pastes:

```text
Talked to Acme today. Their finance team needs invoices to keep the original PO number
even when the invoice is regenerated. They won't roll out to Germany until this works.
```

**Remember** (⌘M) turns that into proposed knowledge. A librarian agent splits it into single statements, finds what
each one is about, and proposes where it belongs:

```text
requirement    regenerated invoices keep the original PO number
customer fact  Acme needs this for its finance workflow
commitment     the German rollout depends on the requirement
```

A detail goes onto the block that already holds it, and a newer state supersedes the old one. What the librarian can't
place, it asks you about. Everything stays proposed until reviewed. The goal is not to store every conversation
forever; it is to pull durable knowledge out of passing communication.

![Remember: a pasted note, about to be filed](docs/screenshots/remember.png)

## The Inbox

Everything newly proposed waits in one place: new requirements and decisions, changed facts, edits to existing blocks
(shown as diffs), agent discoveries, open questions.

The Inbox is a review surface, not another source of truth: approving a block changes its status in the Markdown
document it lives in.

![The Inbox: proposed blocks and contradictions waiting for review](docs/screenshots/inbox.png)

## Tables and queries

Because the definition is a graph, it can be queried. Every table in Wye runs SQL over an in-memory DuckDB copy of
the graph, so views like these are queries over the same definition rather than lists someone keeps by hand:

```text
every requirement without a test
every open question that affects checkout
every decision made this month
every commitment, grouped by project
```

Filters write the SQL for you; you can edit it, or describe the table in words and let an agent write the query. See
[docs/query.md](docs/query.md).

![A table's filter opened: the SQL it runs, and an agent ready to write one](docs/screenshots/table.png)

## Analytics

An **analytics** page groups the same blocks any way you like: rows and columns are each a stack of dimensions — a
property, a team, a status, a month, a path of links like `worker.part-of` — and every cell shows the cards at that
intersection, never a count. One query line is a kanban (`y=status`), a swimlane board (`y=worker x=status`), a
planner (`y=worker.part-of,worker x=due:month`) or a Gantt (`x=when:span`); the data is a SQL query like a table's,
and **✦ Ask** writes the whole page from a sentence. Nothing is stored per card: a block is on the page because the
query admits it, and leaves when it stops. See [docs/query.md](docs/query.md#analytics-pages).

## Mind maps

A **map** page is the same knowledge as a canvas: its nodes are blocks and its links are the graph's edges. Add a
node, grow a child, draw a link and name it. Everything you draw is written back to the documents.

![A mind map of the decisions behind Wye's memory](docs/screenshots/map.png)

## Work

Tasks live wherever they make sense: under a requirement, in a design, in a Prompt Request, next to a decision. The
**Work** view collects them into one board, grouped by status, document, dependency or readiness. Each task belongs to
the knowledge that created it; the board is just another view over the graph.

![The Work board](docs/screenshots/work.png)

## Coding agents

Wye works with **Claude Code** and **Codex**. Two roles, deliberately kept apart:

```text
Librarian   understands and structures the change; never writes code
Worker      implements the approved change; never quietly redefines the product
```

Every running agent shows in the app's left rail with what it is doing. A click opens its conversation, where you
answer its questions.

Which model an agent runs and how much it does without asking is yours to set: **Settings › Agents** has, for each of
the two, a default model, a mode (ask, accept edits, auto, plan … up to skipping every check), an effort, and a line
for any other flag the CLI takes. A skill, a workflow or one stage can name its own model with `model:` on its card.

## Parallel work

Agents can work faster than people can keep overlapping changes in their heads, and two reasonable changes can each
modify the same product assumption.

Wye computes each request's scope and doesn't build overlapping Prompt Requests at the same time. It coordinates work
at the level of **product intent**, not only Git merge conflicts: a clean merge doesn't mean two product changes are
compatible.

## Wye uses Wye to build Wye

Wye's own product definition lives in [`data/products/wye/`](data/products/wye): its requirements, decisions, rules,
components and tests, in the same model the app offers every other product. A change to Wye starts by changing that
definition, and then

```bash
wye check --root data/products/wye
npm test
```

must pass. That's intentional dogfooding: the project should prove whether the model works by using it to evolve
itself.

## Getting started

Wye needs Node.js 20.9+ and **Claude Code (`claude`) or Codex (`codex`) installed and signed in**: it doesn't have its
own agent, it runs one of those.

```bash
npm install -g @emlab/wye
wye setup                                 # the home (~/.wye) and the Claude Code skills (~/.claude/skills)
cd ~/code/shop && wye init                # this repository's own knowledge in .wye/, beside its code: a vault
wye app ~/code/shop                       # the app in its own window on that folder; --browser for http://localhost:3456
```

`wye init` reads the code into a first definition, writes a note to agents in `AGENTS.md` / `CLAUDE.md`, and links
the vault to the ones above and below it in a monorepo; commit `.wye/` with the code. From then on, `wye` run
anywhere under that folder — by you or by an agent — reads and writes that vault without a flag. To update:
`npm install -g @emlab/wye@latest && wye setup`; a vault and the home's data are never touched by an update.
Products you would rather keep out of a repository go in `~/.wye/data/products/` (`wye init --product shop --repo
~/code/shop`, or Add a product in the app). All of this in detail: [docs/workspaces-and-vaults.md](docs/workspaces-and-vaults.md).

**Several people on one vault.** Two people on one page edit it together: each sees the other's typing, cursor and
name as it happens, edits merge by themselves, and an agent's write lands beside what they type. Run on a server
behind HTTPS (`wye app --public https://…` and a proxy), a vault is shared with a client or a team:
[docs/server.md](docs/server.md).

**The first run.** With no products yet, `wye app` opens a Welcome: what Wye is in three steps, whether Claude Code or
Codex was found, and Add a product, which starts on **From your code** (`wye init` through the app: a folder, and
its knowledge is kept in that folder's `.wye/` unless you ask for Wye's own data). Every product then has a **Quick start** (`/<product>/start`, in the rail with its count): nine steps that tick
themselves as the product fills in, from a first document to a first build, each with the button that does it. Empty
pages say what they are for, and **Help** (`?` in the rail, ⌘/) lists the shortcuts and where everything is.

![The Quick start of a new product: four steps done, the next one highlighted](docs/screenshots/quick-start.png)

**Bring products in and out.** Add a product (the workspace menu at the top of the rail, or `/new`) also offers
**New**, **Open a folder** (any folder, opened as the workspace: its vaults become the Documents roots; a folder that
is itself a product kept the old way — `projects/` in it or in its `wye/` — opens as that product, where it is) and
**Import a file** (a `.wye.tgz` made with Settings › Export). From the command line: `wye export <product>`,
`wye import <product>.wye.tgz`, `wye open <folder>`. An export carries the documents, the app's pages, the inbox and
agent instructions; agent sessions and change history stay on the machine that made them.

Without either, only the core works: the Markdown, the graph, `wye build` / `wye check` and the app's documents. The
librarian, builds, Ask's answers, Remember and contradiction checks all run through `claude` or `codex`. The first search downloads two small local models into `~/.wye/.cache/models`.

**From a clone**, to work on Wye itself:

```bash
git clone https://github.com/emlab-ai/wye.git && cd wye
npm install
./install.sh                              # the wye CLI into ~/.local/bin, the Claude Code skills into ~/.claude/skills
wye build --root data/products/wye && wye check --root data/products/wye
npm run dev                               # the dev server; or npm run desktop for the app in its own window
```

A clone is its own home: its products are in `data/products/`. The `wye` command, the desktop app and everything
else in detail are in [docs/reference.md](docs/reference.md).

## Command line

Every command and its parameters (`wye --help` prints the same). Inside a folder with a vault, `--product p` can be
left out: `wye` finds the vault from the current folder. Most commands that print take `--json`. Commands that read
or write knowledge go through the home's Wye server (`WYE_URL`, default `http://localhost:3456`). When nothing answers,
the command starts it, without a window, and leaves it running for the next command and for the window; an agent
writing to the vault never needs the app open. The graph commands read the Markdown directly and need no server.

**Environment.** `WYE_URL` the app to talk to · `WYE_PRODUCT` the default `--product` · `WYE_SESSION` the agent
session writes are attributed to (`wye session join` prints it) · `WYE_HOME` the home (`~/.wye`) · `WYE_PORT` the
app's port · `WYE_PUBLIC_URL` the public address of a served app · `WYE_ASK_MODEL` Ask's default model ·
`WYE_READONLY` only commands that read are allowed (Ask's deep lane runs under it) · `WYE_CACHE` where every vault's
cache folder is (default `~/.wye/.cache/vaults`) · `WYE_AUTOSTART=0` a command that finds no server fails instead of
starting one.

**Install and the app**

```text
wye --version                                   the version and the install it runs from
wye setup                                       the home (~/.wye) and the agent skills (Claude Code, Codex)
wye app [folder] [--port 3456] [--browser] [--no-open] [--public https://…]
                                                the app in its own window; --browser: in your browser; --public: on a
                                                server behind a TLS proxy (docs/server.md); a folder opens as the workspace.
                                                The window connects to the home's one server (started without a window
                                                when none runs) and leaves it running when it closes; --no-open is the
                                                server itself, in the foreground
wye server [status | start | stop] [--json]     the home's one server: where it runs (pid, port), start it without a
                                                window, or stop it and the agents it runs
wye init [folder] [--slug s] [--title "…"] [--icon i] [--description "…"]
                                                a vault for the folder in .wye/ beside its code, linked to the vaults above
                                                and below; on a folder that has one, only the note in CLAUDE.md / AGENTS.md
                                                is brought up to date
wye init --product <slug> --repo <dir> [--title "…"] [--project x] [--feature "<name>" --path <dir>]
                                                a product's (or a feature's) definition from its code, shallow, with a
                                                describe task per module; no model, nothing overwritten
wye refresh [--product p] [--json]              after a branch switch or a pull: the graph rebuilt from the files that
                                                changed, the Ask index re-reading only files whose content changed
wye cache list [--json]                         every vault's cache folder on this machine: its vault, size, last use,
                                                orphans whose vault is gone
wye cache clear <vault | cache folder | product> [--judgements] | --orphans | --all
                                                empty the parts that rebuild (graph, Ask index, vectors); --judgements
                                                also the model judgements; --orphans removes orphaned folders
wye deepen <module> --product p [--worker claude-code]
                                                hand a module's describe task to an agent: requirements from the code
wye export <product> [--out file]               the product as one <product>.wye.tgz (documents, pages, inbox; not sessions)
wye import <file.wye.tgz> [--slug s]            a new product from an export
wye open <folder> [--slug s]                    a product folder already on disk, used where it is
```

**Ask and search**

```text
wye ask "<question>" --product p [--fast | --deep] [--model m] [--rounds n] [--hops n] [--sources] [--json]
        [--vault <name>] [--no-queue]
    a cited answer from the knowledge, documents, code and sessions: a fast answer, then a deeper agent's
    --fast / --deep   only that lane (both by default)
    --model m         the claude model both lanes answer with (an alias or id), else WYE_ASK_MODEL
    --rounds n        plan first (1–5): a query plan over the type system (entities, kinds, props, time) whose SQL
                      queries run on the graph, then planned again on what is still missing, n rounds at most; it
                      stops early when a round finds nothing new. Without --rounds or --hops, Ask works as before
    --hops n          how many links the plan may follow (1–4); either flag turns the plan on (default 2 for the other)
    --sources         end with every source used, each marked cited, read by the agent, or found by the search or plan
    --vault <name>    another vault answers (parent, one below, or a linked repo); when it cannot, the question is
                      filed there as open and its answer comes back to this inbox (--no-queue: don't file it)
wye ask-search "<words>" --product p [--source node|doc|code|session] [--limit n] [--expand] [--rerank] [--json]
    the passages Ask answers from, ranked (full-text + vectors); --expand adds one hop along the graph
wye context "<text>" --product p [--limit n] [--all | --as-of d] [--json]
    the knowledge closest to a text (local semantic search; ended nodes hidden unless --all)
wye packet --for "<text>" [--ref id ...] --product p [--budget N] [--all | --as-of d] [--json]
    every rule, constraint, gate, approved decision, goal and open question within two hops of what a text touches
wye query "<SQL>" [--file f] [--json]
    one read-only query over the graph: nodes(id, kind, title, status, project, page, file, text, props JSON, a
    column per prop) and edges(src, dst, verb); MATCH patterns on graph wye via GRAPH_TABLE
wye explain <id | "text"> --product p          the state of the product around a node or a text (the librarian, one turn)
```

**Nodes, documents and types**

```text
wye resolve <link|id>                           what a link points at: document, node, block or section, with its text
wye node <id> [--product p]                     a node with its relations
wye node set <id> --product p [--status s] [--text t] [--title "…"] [--set key=value ...] [--unset key ...]
wye node content <id> [--product p] [--file f]  the blocks under a node as Markdown; --file or stdin replaces them
wye node add <type>:<slug> --product p [--title "…"] [--doc project/doc]
                                                a new instance of a type (a base kind needs --doc)
wye doc <product/project/doc>                   a document's Markdown body
wye doc write <product/project/doc> [--file f] [--section "<heading>"]
                                                replace the body, or one ## section, checked against the current hash
wye doc create <product/project/slug> --title "…" [--template blank] [--parent doc] [--type module]
wye doc set <product/project/doc> [--status s] [--set key=value ...]   the page's own frontmatter
wye doc retype <product/project/doc> --type <slug>   the page becomes an instance of that type; links follow
wye type add <slug> --product p [--extends parent] [--purpose "…"] [--color "#hex"] [--doc product/project/doc]
wye propose [<product/project/doc>] [--pr <product/project/pr-x>] --product p [--file f]
                                                a proposed block (a YAML card with `- id: kind:slug`, stdin or --file)
                                                into the document where its kind lives
wye impact <id> --after "<new text>" --product p [--no-judge] [--json]
                                                what an edit would reach and what each node needs (unaffected | update |
                                                rework | contradicts | ask); nothing is written
wye verdicts <id ...> --product p               classify nodes against their neighbours (duplicate | refines |
                                                consistent | contradicts)
```

**Remember, inbox and other vaults**

```text
wye remember [--title "…"] [--ref id ...] [--file f] [--from who] --product p
    the person's words as said (stdin or the argument), kept in the inbox and judged against what is known
wye inbox add --product p --title "…" [--type note] [--ref id ...] [--from who]   a raw note (body on stdin)
wye inbox list --product p [--all]              what is waiting for review
wye links [--json]                              the vaults this one reaches (parent, below, linked repos)
wye link <repo URL> [--name n]                  link a vault in another repo by its URL
wye link <name> --path <folder>                 where a linked vault is on this machine (kept locally)
wye link --remove <name>
wye request <vault> [--title "…"] [--file f]    a request to another vault (stdin), digested there; a task on each side
wye requests [--all]                            requests other vaults sent here, not answered yet
wye request done <item> [--note "…"]            tell the vault that asked; closes the tasks on both sides
wye request decline <item> [--why "…"]
```

**Work, requests and plans**

```text
wye work list --product p [--unassigned | --mine <name> | --goal <id> | --plan <id> | --pr <id>] [--project x] [--done]
wye work add "<text>" --product p [--part-of <id>] [--ready]
wye work next --product p [--goal <id>]         the oldest ready, unblocked, unassigned task
wye work assign <task> --worker <person|claude-code|codex|runner> --product p [--note "…"] [--by name] [--force]
wye pr <product/project/pr-x> [--status draft|refining|approved|building|done|failed|cancelled]
wye pr approve|cancel|reopen <product/project/pr-x> [--by name]
wye pr revisit <product/project/pr-x>           bring a page written under older rules up to the current approach
wye pr build <product/project/pr-x> [--worker claude-code|codex|runner] [--note "…"] [--force]
wye import <file|dir> --product p [--project x] [--parent doc] [--no-analyse] [--brief "…"]
    Markdown files as documents, then an agent extracts types, requirements, facts and decisions as proposed blocks
wye import --code <dir> --name "<module>" --product p [--project x] [--parent doc] [--no-analyse] [--brief "…"]
    a page for a module, written by an agent from its code
```

**Agent sessions**

```text
wye session list --product p [--all]            sessions, active first; runners online
wye session show <id> --product p [--full]      one session with its log
wye session changes <id> [--json]               every block it added, changed or removed, per document
wye session create --product p --agent a "<instruction>" [--ref id ...] [--link url]
wye session join ["what you are working on"] --product p [--agent a] [--name n] [--ref id ...]
    an agent already running joins as a session; prints `export WYE_SESSION=<id>`
wye session log <id> --product p "<line>"       append to the log (or stdin)
wye session done|fail <id> --product p ["result"]
wye session handoff <id> --product p --agent a ["note"]
wye session open <id> --product p <product/project/doc[#node] | url>   navigate the person's browser to a page
wye session take <id> --product p [--runner name]   mark it running under you
wye agent listen --product p --agent claude-code|codex [--cmd "<command>"] [--name n] [--once] [--cwd dir]
        [--take-ready [--goal <id>]] [--wye-root dir]
    pick up queued sessions for that agent and run them; --take-ready also claims the oldest ready task
```

**Skills, hooks, workflows and packages**

```text
wye skills --product p                          the product's skills
wye skill <id> --product p                      print a skill's instruction
wye hooks --product p [--node <id>]             hooks and what fired
wye hooks tick --product p [--now <iso>]        one tick of the hooks clock
wye workflow list | show <id>                   workflows: stages, what each produces, its gate (wye workflows = list)
wye workflow run <id> --on <node> [--again]
wye run list | show <id>
wye run advance|skip|retry|cancel <id>
wye run reopen <id> --stage <s>
wye packages [--product p] [--json]             the system library: each package and what it holds
wye install <package> --product p --project x [--dry-run] [--create-product "<title>"] [--by name]
wye uninstall <package> --product p --project x
```

**The graph, without the app**

```text
wye build [--root <product dir>]                parse the documents → graph.json in the vault's cache folder
wye check [--root <product dir>] [--strict] [--deep [--limit n] [--budget-pairs n] [--budget-calls n]]
                                                the graph's problems; --deep also judges same-kind pairs for contradictions
wye graph get <id>                              one node with all edges
wye graph neighbors <id> [-d N] [--kinds a,b] [--structural]
wye graph search <terms...> [--all | --as-of <date>]
wye graph impact <id> [--explain] [--semantic] [--after "<new text>"] [--json]
wye graph packet --task "<text>" [--budget N] [--seeds n] [--all | --as-of d]
wye graph constraints --task "<text>" [--ref id,id] [--budget N] [--all | --as-of d] [--json]
wye graph verdicts <id ...> [--limit N] [--budget-pairs N] [--budget-calls N] [--json]
wye graph reqs [--status s]                     the requirement tree
wye graph stats
wye graph site [--out dir]                      a static viewer, ready to publish
```

**Benchmarks** (each takes `--product p`)

```text
wye eval own [--suite s] [--live] [--build-truth] [--baseline "<why>"] [--tolerance n]
wye eval compare --request "<text>" [--ref id ...] [--plan id] --agent claude-code --runs 5 [--arms with,without]
wye eval public <moosedev|reqpairs|memoryagentbench|memorybench> --fetch | --import | --run [--live] | --report
        [--set s] [--sample n] [--limit n] [--provider p] [--model m] [--judge m] [--judge-passes n]
        [--run-id id] [--from-run id] [--parallel n] [--competency c]
wye eval ask [--k 10] [--rerank] [--json]       the Ask retriever's recall@k
wye eval judge --agreement [--live] | --sample 50
wye eval report [--suite s] [--since date]
wye eval cards                                  the results as cards in the Evaluation project
```

## Repository structure

| path | what |
|---|---|
| `lib/` | the core: Markdown → nodes and edges, graph queries, impact, validation, the contradiction judge, `wye init` |
| `bin/` | the `wye` CLI |
| `packages/web/` | the app (Next.js) |
| `packages/desktop/` | the Electron shell |
| `schema/` | the base ontology |
| `prompts/` | the instructions Wye's agents follow |
| `skills/` | Claude Code skills that teach an agent to work with Wye |
| `templates/` | document templates |
| `data/products/wye/` | Wye's own product definition |
| `test/`, `eval/` | tests and benchmarks: parsing, ontology, memory, impact, verdicts |

## Data layout

A vault is a product folder inside the repository it describes; a product in Wye's home is the same folder under
`~/.wye/data/products/<product>/`:

```text
<repo>/.wye/                     the vault (wye init) — committed with the code
├── _product.md                  title, slug, icon, description; parent: and vaults: — links to the vaults above and below
├── _agent.md                    this folder's own instructions to agents
├── projects/<project>/
│   ├── _project.md
│   └── docs/*.md, docs/assets/  the documents
├── inbox/                       what was said, as it was said (wye remember); raw notes for later filing
├── _sessions/                   agent sessions: instruction, log, result        (local, gitignored)
└── _changes/, _hooks/           the change history, what hooks fired            (local, gitignored)
```

The Markdown files are canonical; everything generated from them is a cache, kept outside the vault in one folder
per machine: `~/.wye/.cache/vaults/<vault>-<hash of its path>/` — the graph, the Ask index, the context-search
vectors and the model judgements. A vault folder holds only knowledge, so switching git branches never carries or
clobbers a cache: the app and `wye` notice the files changed (the repo's HEAD moved, or a file's content differs from
the last build) and rebuild only what changed, without recording the switch as anyone's edits. `wye refresh` does it
by hand; `wye cache list` shows every cache on the machine with its size and the ones whose vault is gone, and
`wye cache clear` empties one, the orphans or all. A vault that still has an old `_build/` folder is copied once and
the folder goes when nothing has written it for three days.

## A node can be almost anything

```markdown
goal:pos.fast Every common interaction should feel immediate.

req:sale.close When the last kitchen item is completed, the order is closed.

- [ ] task:kitchen-screen Build the kitchen display.
```

```yaml
- id: decision:memory.bitemporal
  title: Keep historical product states
  status: approved
  supersedes: decision:memory.snapshot
  affects: [type:node, req:wf2.decisions]
```

The representation is deliberately light. Wye is not meant to turn product thinking into a heavyweight modelling
exercise: add structure where it gives leverage, and leave the rest as prose.

## What Wye is not

- **A new coding agent.** Wye doesn't write your code. Claude Code or Codex does, with the product's definition in
  front of it; Wye decides what goes into that first message and keeps what comes back.
- **A new agent harness.** Wye doesn't replace the tool that runs the agent: no new agent loop, tool system or model
  client. It starts the agents you already use (Claude Code or Codex, through their own command-line tools, with your
  login) and talks to them. **For now, that means Claude Code or Codex must be installed on the machine.**
- **A replacement for Git.** Git stays the history and the storage.
- **Another issue tracker.** Tasks exist, but the central object is product knowledge, not tickets.
- **A new programming language.** The output is ordinary software.
- **A giant prompt file.** Wye selects the knowledge relevant to a change instead of stuffing the whole product into
  an agent's context.
- **An autonomous product manager.** Agents analyse, connect and propose; important decisions stay visible to people.
- **A claim that all product knowledge can be formalised.** Products are messy. Some knowledge belongs in structured
  relationships, some in plain prose, and Wye lets both coexist.

## Why a graph?

Search answers *where is "refund window" mentioned?*. A graph answers different questions: *What does this
requirement affect? What implements it? Which decision governs it, and which newer decision superseded that one?
Which tests verify it? Which request is trying to change it?*

Those are relationships, not similar text. Semantic search is still useful, and Wye uses it, but similarity and
product structure solve different problems.

## Why Git?

A product definition changes for the same reason code does: someone made a decision. Keeping it in Git gives it
history, diffs, attribution, branches, review, rollback, portability, text tooling and local ownership almost for
free, and keeps it next to the implementation the agents are changing.

## Why not infer everything from code?

Code tells you a great deal about what a system **does**. It doesn't reliably tell you what the system **should do**.
A strange piece of behaviour might be a bug, or an important contractual requirement; the implementation alone often
can't tell an agent which. The definition keeps the intent that shouldn't have to be reverse-engineered on every
change.

## The experiment

Wye is early. It explores one question:

> **What should the interface between people and increasingly capable coding agents look like?**

One answer is to keep today's workflow and give agents bigger contexts. Wye explores another: as agents get better at
producing implementations, engineers may spend more of their time defining and evolving the system they want (its
users, goals, behaviours, rules, constraints, decisions and relationships) and less time translating it into code
by hand.

In that world the important artifact may not be the codebase alone, but the product definition, the implementation,
and the history of why they became what they are, together. Wye is an experiment in tooling for that world.

## Why the name?

A **wye** is the written name of the letter **Y**, and a Y-shaped junction where two flows meet:

```text
human flow  ─ what the product is for, what was asked, what was decided ─┐
                                                                          Y── shared product definition
agent flow  ─ what the code does, what the agent found, what it needs ────┘
```

It also sounds like **why**, which is a good place for any product change to begin.

## Status

Wye is early, local-first, open source, under active development, and used to build itself. The core workflow needs
no accounts and no hosted service. Expect the model, the interface and the APIs to change. The current version is
`0.7.0`.

## Contributing

If the idea interests you, contributions and criticism are welcome. Ideas and questions go to
[Discussions](https://github.com/emlab-ai/wye/discussions); bugs and the
[`good first issue`](https://github.com/emlab-ai/wye/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
list to Issues. [CONTRIBUTING.md](CONTRIBUTING.md) explains how the repo works: since Wye describes itself, a change
starts as a block in `data/products/wye`.

The most useful feedback right now is not only *does this feature work?* but *is this actually a better way for people
and coding agents to work together?* Ideas, counterexamples and other models are all welcome.

## License

Apache License 2.0. See [LICENSE](LICENSE).

---

**In one sentence:** Wye gives people and coding agents a shared, version-controlled memory of what the product is,
why it works that way, and what is allowed to change.
