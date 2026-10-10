# Workspaces and vaults

Where a product's knowledge lives, how it gets there, and how `wye` and the agents find it.

```text
vault      a folder's own knowledge: <folder>/.wye/, committed with the code it describes
workspace  the folder you open in the app: every vault it reaches is a root in Documents
home       where Wye itself runs: ~/.wye when installed from npm, the clone when you work on Wye
```

## Install from npm

```bash
npm install -g @emlab/wye     # needs Node.js 20.9+
wye setup                     # makes the home (~/.wye) and links the Claude Code skills into ~/.claude/skills
wye app                       # the app in its own window; --browser for http://localhost:3456
```

Wye runs its agents through [Claude Code](https://claude.com/claude-code) (`claude`) or
[Codex](https://github.com/openai/codex) (`codex`): one of them must be installed and signed in. Without either the
core still works — the Markdown, the graph, `wye build` / `wye check`, the documents in the app — but the librarian,
builds, Ask, Remember and the contradiction checks all run through one of them.

The **home** is `~/.wye` (or `WYE_HOME`): `data/products/` holds the products you keep in Wye's own data rather than
beside code, and stays yours across updates; `bin/`, `lib/`, `packages/`, `prompts/`, `schema/`, `skills/` and
`templates/` are links into the installed package, so an update swaps the code under the same paths. The first
search downloads two small local models into `~/.wye/.cache/models`.

**Update:** `npm install -g @emlab/wye@latest`, then `wye setup` once more so the links and the skills point at the
new install. `wye --version` prints the version and the install it runs from. A vault's `.wye/` and the home's
`data/` are never touched by an update.

**From a clone**, to work on Wye itself, the clone is its own home: products in `data/products/`, `./install.sh`
links `wye` into `~/.local/bin` and the skills into `~/.claude/skills` (see [reference.md](reference.md#install-and-run)).
Only one `wye` should be on the PATH: `which -a wye` lists them.

Environment: `WYE_HOME` (the home), `WYE_PORT` (the app's port, default 3456), `WYE_URL` (where the CLI finds the
app, default `http://localhost:3456`), `WYE_PRODUCT` (the product when there is no vault to find, see below).

## A vault: `wye init`

A vault is a product kept in `.wye/` inside the folder it describes — a repository, a service in a monorepo, a
package. The same layout as any product, next to the code, in the same Git history:

```text
<folder>/.wye/
├── _product.md              title, slug, icon, description; parent: and vaults: — the links to the vaults above and below
├── _agent.md                this folder's own instructions to agents: how to run and test it, what never to touch
├── projects/<slug>/
│   ├── _project.md
│   └── docs/*.md            the documents — the definition read from the code, then everything written since
├── inbox/                   what was said, as it was said (wye remember), and raw notes for later filing
├── .gitignore               _build/ _sessions/ _changes/ _hooks/ _impact/ — generated and local, never committed
├── _build/graph.json        generated: the graph, rebuilt after every save
├── _sessions/               agent sessions: instruction, log, result (this machine)
└── _changes/, _hooks/       the change history and what hooks fired (this machine)
```

```bash
cd ~/code/shop && wye init                    # this folder: vault "shop", titled from the folder name
wye init ~/code/mono/services/payments        # another folder
wye init --slug pay --title "Payments"        # the slug is the id prefix of every block (req:pay.…), so it must be unique among linked vaults
```

`wye init` on a folder without a vault:

1. **Reads the code into a first definition** (`lib/init.js`, no model): the layered tree, every module, page,
   component, library, operation and test it can see, each a shallow block with its `source:`, and a `#ready`
   *describe* task per module. Nothing in the folder's own files is changed; nothing that exists in `.wye/` is
   overwritten. React Navigation screens are pages; two files of one name in two folders get distinct ids.
2. **Writes `_agent.md`** — a short page for this folder's instructions, to be filled by you.
3. **Writes a note to agents** in the folder's `AGENTS.md` and `CLAUDE.md` (between `<!-- wye:vault -->` markers;
   a file that exists gains the section, a `CLAUDE.md` that already takes `AGENTS.md` in is left alone). The note
   tells any agent working under the folder that the vault exists, to read `wye packet` before it plans or changes
   anything, to store the person's words with `wye remember`, and to write every decision as a proposed block. That
   is the whole connection between a coding agent and the vault — no hooks, nothing per turn.
4. **Links it** to the nearest vault above and the nearest ones below (`parent:` and `vaults:` in `_product.md`,
   as relative paths, written on both sides), and opens it in the app.

Run again on a folder that has a vault, `wye init` only brings the note to agents up to date — after an update of
Wye, or when the note was edited away.

**Deepen it.** The first definition is shallow by design: what a file is called and where it is. `wye deepen
<module>` (or the module's describe task in the app) sends an agent to write what the code does not say — the
requirements in the person's words, the decisions and what they rejected, the rules and where they come from, what
is open. A card that paraphrases the code is not knowledge; the rule for every describe agent is *nothing the code
already says*.

**Commit `.wye/`.** The documents, `_product.md`, `_agent.md` and the inbox belong in Git with the code; the
`.gitignore` it writes keeps the generated graph and the local history out. A clone of the repository has the
product's memory from the first checkout.

**In the app:** Add a product › **From your code** does the same for a folder (the knowledge is kept in that
folder's `.wye/` unless you ask for Wye's own data), and right-click on a folder under **Files** offers *Init Wye
here*.

## How `wye` finds its vault

`wye` run from a folder with a vault, or any folder under it, needs no flag: it finds the nearest `.wye/` at or
above where it runs and every command reads and writes that product. From elsewhere, `--product <slug>` or
`WYE_PRODUCT`. So an agent working in `services/payments` proposes what it learns into the payments vault, not the
monorepo's; a session Wye started keeps its own product (`WYE_SESSION` + `WYE_PRODUCT`) but what it writes from
another vault's folder goes to that vault.

```bash
cd ~/code/shop
wye packet --for "change the refund window"   # the rules, constraints, decisions, goals and open questions in force
wye ask "why is the refund window 30 days?"   # a cited answer from the vault, the documents and the code
wye remember --title "Acme call" <<'EOF'      # the person's words, verbatim, into the inbox; digested at once
…
EOF
wye propose shop/shop/decisions --file card.yaml   # one proposed block (a decision, a fact, a question)
wye node set req:shop.refund-window --status approved
```

A vault's packet carries the approved constraints of the vaults above it: a rule in the monorepo's Constitution
binds every service below.

## A workspace: open a folder

The workspace is the folder the app is opened on — `wye app <folder>`, *Open folder…* at the top of the rail, or
`wye open <folder>`. Every vault it reaches is a root in **Documents**; Goals, Work, the Inbox, pins and search read
them all, each item named by its vault. **Files** lists the folder's files: a click opens one in a tab, read only,
in the VS Code editor.

```bash
wye app ~/code/mono            # the monorepo: its vaults are the roots, its files are under Files
cd ~/code/mono && wye app .    # the same
wye app                        # no folder: the home's products
```

Which vaults a folder reaches is answered by the links, never by a walk of the disk: the folder's own vault and,
link by link, every vault below it; a folder without a vault takes the links of the nearest vault above. When the
links drift — a vault moved, one deleted, one made by hand — **Rescan** (the workspace menu) walks the folder once,
shows what it would change in `parent:` and `vaults:`, and writes it when you agree.

A folder that is itself a product kept the old way — `projects/` in it, or in its `wye/` — opens as that product,
where it is. Products in the home's `data/products/` are always there, whatever folder is open.

**Bring products in and out.** `wye export <product>` writes one file, `<product>.wye.tgz` (documents, the app's
pages, the inbox, the agent instructions — not sessions or history); `wye import <file.wye.tgz>` makes a product
from it; Settings › Export and Add a product › Import a file do the same in the app.

## Several vaults in one repository

```text
mono/                 .wye/  vault "mono"        vaults: [services/payments, services/orders]
├── services/payments .wye/  vault "payments"    parent: ../..
└── services/orders   .wye/  vault "orders"      parent: ../..
```

- `wye init` in `mono` first, then in each service, or in any order: each init links itself to what is above and
  below and corrects the vault above to point at it.
- Slugs are id prefixes, so linked vaults cannot share one (`wye init --slug` when the folder names collide).
- An agent in `services/payments` reads and writes the payments vault, and its packet includes the constraints
  approved in `mono`. A request on the monorepo that reaches two services is one Prompt Request whose blocks are
  defined in the vault their kind lives in.
- Open `mono` as the workspace to see all three; open `services/payments` to see that one.
