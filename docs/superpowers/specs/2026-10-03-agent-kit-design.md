# Agent kit — Wye in Claude Code, Codex and Cursor (design)

2026-10-03. A person who installs Wye can install its skills into the coding agents they use, globally or into one
repo, from a popup the first time the app opens (and later from Settings › Agents or the CLI). In a repo,
`/wye-init` links it to a Wye product — an existing one, or a new one made from the repo's code. From then on an agent
working there, outside the app, reads the product's knowledge before acting and writes every decision back to Wye as
a proposed block; hooks open and close a Wye session around its conversation so the person sees what it did.

Decisions with alex (session of 2026-10-03):
- **Agents**: Claude Code, Codex and Cursor, plus any agent through a Wye section in `AGENTS.md` / `CLAUDE.md`.
- **`/wye-init`**: link the repo to an existing product, or create one from its code.
- **Write-back**: skills teach the agent; hooks (where the agent has them) load the context at session start and
  record the session at its end — nothing depends on the agent remembering.
- **Name**: `/wye-init` (a skill, works in all three agents) instead of `/wye:init` (Claude Code only, needs a plugin
  installed from a marketplace, which a teammate cannot reach on another machine).
- **README**: a section that says how to install the kit and link a repo.

## 1. What is installed

One source in this repo, copied per agent:

- **Skills** — `skills/` as today (`wye-agent`, `wye-context`, `wye-describe-module`, `wye-restore`) plus a new
  `skills/wye-init/SKILL.md` (§4). Every agent reads the same `SKILL.md` format (name + description frontmatter).
- **Hooks** — one entry point, `wye hook session-start | session-end` (§5), registered in each agent's hook file.
- **AGENTS.md section** — `templates/agents-md.md`: the short contract (read Wye first, decisions to Wye, the
  commands) between `<!-- wye:begin -->` and `<!-- wye:end -->`, for agents with neither skills nor hooks.

Where each piece goes:

| Agent | Global (`--global`) | Local (`--local <repo>`, committed) |
|---|---|---|
| Claude Code | `~/.claude/skills/wye-*`; hooks in `~/.claude/settings.json` | `<repo>/.claude/skills/wye-*`; hooks in `<repo>/.claude/settings.json` |
| Codex | `~/.codex/skills/wye-*`; hooks in `~/.codex/hooks.json` | `<repo>/.codex/skills/wye-*`; `<repo>/.codex/hooks.json` |
| Cursor | `~/.cursor/skills/wye-*`; hooks in `~/.cursor/hooks.json` | `<repo>/.cursor/skills/wye-*`; `<repo>/.cursor/hooks.json` |
| Any agent | — | the Wye section in `<repo>/AGENTS.md` and `<repo>/CLAUDE.md` (created when missing) |

Rules:
- **Copies, not symlinks**, so a local install works on a teammate's machine and a global one survives the checkout
  moving. Each destination gets a manifest, `.wye-kit.json` (in the skills folder's parent: `~/.claude/`,
  `<repo>/.claude/`, …): kit version, the files written and the hash of each.
- **Re-install updates what nobody edited** — a file whose hash still matches the manifest is replaced by the new
  version; an edited one is kept and reported (decision:wf2.shipped-copies-follow-source, same rule).
- **Hook entries are merged, never clobbered**: Wye's entries carry `"wye": true` (Claude) or a command that starts
  with `wye hook` (Codex, Cursor); install adds them once, uninstall removes only them, every other entry stays.
- **Uninstall** (`wye agents uninstall`) removes the files the manifest lists whose hash still matches, Wye's hook
  entries and the AGENTS.md section between its markers; it reports what it left because it was edited.
- **The `wye` command**: `--global` also links `~/.local/bin/wye` to this checkout's `bin/wye.js` (what `install.sh`
  does today) and says whether that folder is on PATH. `install.sh` becomes `wye agents install --global
  --agents detected`.

Detection (which agents to tick): a home folder (`~/.claude`, `~/.codex`, `~/.cursor`) or the command on PATH
(`claude`, `codex`, `cursor`).

## 2. The installer — `lib/agent-kit.js` and `wye agents`

Plain CommonJS in `lib/` so the CLI uses it directly and the app through `createRequire` (like `lib/sections.js`).

```
wye agents status [--local <repo>]                 what is installed where, per agent, and what is out of date
wye agents install --global | --local <repo> [--agents claude,codex,cursor,agents-md | detected] [--dry-run]
wye agents uninstall --global | --local <repo> [--agents …]
```

`--dry-run` prints the plan (files to write, update, keep; hook entries to add) — the popup shows the same plan
before the person confirms. The functions: `detect()`, `plan(target, agents)`, `apply(plan)`, `status(target)`,
`uninstall(target, agents)`; `target` is `{ scope: 'global', home }` or `{ scope: 'local', repo }` (home injectable
for tests).

The app exposes it at `GET /api/agents` (detect + status) and `POST /api/agents` `{ action: 'plan' | 'install' |
'uninstall', scope, repo?, agents }`.

## 3. The popup and Settings › Agents

The first time the app opens (no `agentsPrompted` in the app's settings), a dialog:

- **Install Wye for your coding agents** — the detected agents, ticked; the others listed, unticked.
- **Where**: *Everywhere on this computer* (global) · *One repository* (local — a folder field with the recent
  repos of the product's `repo:` settings as suggestions).
- **Also put the `wye` command on your PATH** (global only, ticked).
- The plan, folded: the files it will write and the hook entries it will add.
- **Install** · **Not now**. Not now records `agentsPrompted` and never asks again; the same panel lives in
  **Settings › Agents**, with the status per agent (installed, out of date, edited, missing) and Update / Remove.

It is a page component in the web app, so it works the same in the desktop window and in a browser tab.

## 4. `/wye-init` — linking a repo

`skills/wye-init/SKILL.md`, invoked as `/wye-init` (Claude Code, Cursor) or by name (Codex):

1. If `.wye/config.json` exists, say which product the repo is linked to and stop (offer to re-link).
2. Check Wye is reachable (`wye products`); if not, say how to start it and stop.
3. Ask (one question): **link to an existing product** — the list from `wye products` — or **create a new product
   from this repo's code** (`wye init --product <slug> --repo . --title "…"`, the layered tree and describe tasks).
4. Write `.wye/config.json` — `{ "product": "<slug>", "url": "<WYE_URL>" }` — and add `.wye/session` to
   `.gitignore`.
5. Install the local kit for the agents the repo uses (`wye agents install --local . --agents detected`) unless it is
   there; set the product's `repo:` to this folder when it names none.
6. Report: the product, its link, what was installed, and the first commands (`wye ask`, `wye packet --for`).

**The CLI finds the product by itself**: when neither `--product` nor `WYE_PRODUCT` is given, `wye` walks up from the
current folder to the first `.wye/config.json` and takes `product` (and `url` when `WYE_URL` is unset). Every `wye`
command then works inside a linked repo with no environment set.

## 5. Hooks — the session around an agent's conversation

`wye hook session-start` (SessionStart in all three agents):
- reads the hook input on stdin (the agent's session id, cwd, transcript path when given);
- if the cwd is in a linked repo and Wye answers: creates an **external session** in Wye (`POST /api/<p>/sessions`
  with `{ external: true, agent, cwd, agentSessionId }` — status running, no process of Wye's), writes its id to
  `<repo>/.wye/session`, and prints the context the agent starts with: the product and its link, the session id,
  the read-first commands, "write every decision to Wye as a proposed `decision:` block with `wye propose`, every open
  question as a `question:`", and the constraints in force for the repo (`wye packet`, budgeted to ~1 500 tokens);
- otherwise prints nothing (not linked) or one line (Wye not running) and exits 0 — a hook never blocks the agent.

`wye hook session-end` (Claude Code SessionEnd, Codex and Cursor Stop on the last turn):
- finds the session from `.wye/session` (or the agent session id), attaches the transcript (the agent's transcript
  file when the hook input names one, trimmed like the app's own), marks it done with a summary of the blocks it
  proposed (the session's artifacts) and removes `.wye/session`.

The `wye` CLI sends the session from `.wye/session` with every write (the `x-wf-session` header it already sends from
`WYE_SESSION`), so what the agent proposes is credited to that session and listed under it.

v1 limit: one external session per repo at a time — a second agent in the same repo shares the file and the last one
to start owns it. The Agents view shows external sessions with the agent's name and an "outside Wye" mark; they cannot
be resumed or messaged from the app.

## 6. README

`README.md` › **Install and run** gains a subsection **Use Wye from Claude Code, Codex or Cursor**: the popup, `wye
agents install --global | --local`, `/wye-init` in a repo, what the agent then does (reads Wye first, writes
decisions back, its sessions in the Agents view), and `wye agents status / uninstall`. The `install.sh` line and the
paragraph under **Skills, hooks and workflows** that says the skills are "linked by install.sh" are updated to match.

## 7. Errors and limits

- An agent folder that does not exist yet (`~/.codex` without Codex): skipped unless named in `--agents`, then created.
- A hook file that is not valid JSON: install stops for that agent and says which file; nothing is rewritten.
- Wye not running: `/wye-init` stops with how to start it; hooks print one line and exit 0.
- A repo linked to a product that no longer exists: `wye` says so and points at `/wye-init`.

## 8. Testing

- **Unit** (`lib/agent-kit.test` via vitest in packages/web, home and repo in temp folders): plan and apply per
  agent and scope; re-install updates unedited files and keeps edited ones; hook merge is idempotent and keeps
  foreign entries; uninstall removes only Wye's files and entries; the AGENTS.md section between markers.
- **CLI**: config discovery from a nested folder; `wye agents install --dry-run` output.
- **Hooks**: `wye hook session-start` against the dev server with a linked temp repo — an external session exists,
  the context is printed; `session-end` closes it with the transcript.
- **Live**: install locally into a scratch repo, run Claude Code there with `/wye-init` (link to a scratch product),
  ask it to make a small decision — the `decision:` lands in Wye as proposed, under the session.

## 9. Delivery

1. **K1 — kit and installer**: `lib/agent-kit.js`, `wye agents`, `skills/wye-init`, `templates/agents-md.md`,
   CLI config discovery, `install.sh` on top of it, the README section.
2. **K2 — popup and Settings › Agents**: `/api/agents`, the dialog, the settings panel.
3. **K3 — hooks and external sessions**: `wye hook`, external sessions in the API and the Agents view, the CLI's
   session from `.wye/session`.

Out of scope: a Claude Code plugin and marketplace (`/wye:init`), MCP server, remote Wye (a server on another
machine), more than one external session per repo.
