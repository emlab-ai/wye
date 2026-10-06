# An agent on another machine

Wye runs on your laptop; the agent runs on a server you reach over SSH. This page sets up the simplest link between
them: an SSH reverse tunnel, so the `wye` command on the server talks to the app on the laptop as if it were local.

Nothing in Wye changes for this. The `wye` CLI already reaches the app over HTTP at `WYE_URL` (default
`http://localhost:3456`); the tunnel makes that address on the server lead to your laptop.

```
laptop                                   server
┌──────────────────────┐   ssh -R       ┌──────────────────────────┐
│ Wye app  :3456       │◀───────────────│ localhost:3456           │
│ your products (md)   │                │ wye CLI ← the agent      │
└──────────────────────┘                └──────────────────────────┘
```

What the agent writes lands in the product on the laptop at once: the graph rebuilds, open pages update, and its
blocks arrive as proposed in the Inbox.

## Before you start

- Wye running on the laptop (`wye app`, or `npm run dev` from a checkout) on port 3456.
- SSH access from the laptop to the server.
- Node.js 20.9 or later on the server.

## From the app

The app can open and keep the tunnels for you. **App settings › Remote agents** is a list of servers: type a host as
you would give it to ssh — `you@server`, or a `Host` from `~/.ssh/config` — and press **Add server**; add another for
each further machine. Each row shows where its tunnel stands (connecting, connected, or why not), and once it is
connected, what to run once on that server and what to run for each agent (steps 2–4 below).

- One tunnel per server is enough for every agent on it: they all reach the app through the same `localhost:3456`.

- It stays up while the app runs, comes back after a drop, and is opened again when the app starts — until you press
  **Disconnect**.
- It runs `ssh` without a prompt, so your key must already work for the host: if `ssh you@server` asks for a password
  or to accept the host's key, do that once in a terminal first. The row says which of the two it was.
- **port** is the port on the server. Leave it empty to use the app's own (3456).

The rest of this page is the same thing by hand.

## 1. Open the tunnel

From the laptop:

```bash
ssh -R 3456:localhost:3456 you@server
```

`-R 3456:localhost:3456` means: port 3456 on the server leads to port 3456 on the laptop. The tunnel lasts as long as
this SSH session does.

Keep the same port on both sides. Links Wye hands to an agent look like `http://localhost:3456/<product>/…`, and
with the same port they open on the server unchanged.

## 2. Install the CLI on the server

In that SSH session:

```bash
npm install -g @emlab/wye
wye setup            # the Claude Code skills into ~/.claude/skills (and an empty ~/.wye, which you will not use)
```

Do not run `wye app` on the server — the app is the one on your laptop.

## 3. Check the link

Still on the server:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3456/api/products    # 200
export WYE_PRODUCT=<your product slug>
wye session list                                                               # "runners online: …"
wye doc <product>/<project>/<doc> | head                                       # a page from your laptop
```

`fetch failed` means the tunnel is not up — see [When it does not work](#when-it-does-not-work).

## 4. Start each agent

Each agent joins Wye as a session of its own, then starts. In its own shell (or `tmux` window), in the code folder:

```bash
export WYE_PRODUCT=<your product slug>     # WYE_URL is http://localhost:3456 by default — leave it
eval "$(wye session join "what this agent is working on")"
claude
```

`wye session join` registers a running session in Wye and prints `export WYE_SESSION=<id>`; `eval` puts that id in
the shell, and from there `wye` sends it with everything the agent writes. Do this once per agent — three agents on
one server, or one on each of three, are three sessions:

- each has its own row under **Agents** in the rail and on the Sessions page, with what it is working on and where it
  runs (`you@server`, or `--name <n>`);
- every block it adds or changes is attributed to it, so two agents writing at once are told apart;
- its progress lines (`wye session log`) and its result land on its own session.

When an agent is finished: `wye session done $WYE_SESSION "what came of it"`. A session that is never finished stays
listed as running — cancel it on its page.

`wye session join` came after 0.3.0: until the next release is on npm, install the CLI on the server from a checkout
(`./install.sh`) to have it.

The `wye-agent` skill that `wye setup` installed tells the agent how to work with Wye. To be explicit, open with
something like:

> Use the wye CLI. Read `wye packet --for "<what you are about to do>"` first, and write every decision, question and
> requirement back as a proposed block in the document it belongs to.

## What works over the tunnel, and what does not

Works — everything that goes through the app:

| | commands |
|---|---|
| read | `wye resolve`, `wye doc`, `wye node`, `wye packet`, `wye ask`, `wye ask-search`, `wye context`, `wye query`, `wye explain` |
| write | `wye doc write`, `wye doc create`, `wye node set`, `wye node add`, `wye node content`, `wye propose`, `wye inbox add`, `wye work add` |
| follow | `wye session list`, `wye work list`, `wye pr`, `wye hooks`, `wye run` |

Does not work on the server — the commands that read the product's files directly, which are on the laptop:
`wye build`, `wye check`, `wye get`, `wye search` and the rest of `wye graph …`. The agent does not need them: the
app builds and checks on every write, and `wye node` / `wye ask` cover the reads.

Two things to know:

- **Code search reads the laptop's copy.** `wye ask` cites code from the folder the product's `repo:` names on the
  laptop. If the code only exists on the server, answers come from the knowledge and documents, not from that code.
- **Who wrote it.** An agent started after `wye session join` (step 4) is a session, and its changes are its own.
  One started without it still works, but its changes are recorded with no session behind them — and with several
  such agents writing at once, Wye cannot tell them apart. Either way they are proposed blocks waiting in the Inbox.

## Keep the tunnel up

Put it in `~/.ssh/config` on the laptop, so every `ssh server` opens it:

```
Host server
  HostName server.example.com
  User you
  RemoteForward 3456 localhost:3456
  ExitOnForwardFailure yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

`ExitOnForwardFailure` makes SSH refuse to connect when the port cannot be forwarded — better than a session that
looks fine and has no tunnel.

For an agent that runs for hours in `tmux` or `screen` on the server, the tunnel must outlive your terminal. Run it on
its own, with no shell, and let `autossh` bring it back when the connection drops:

```bash
autossh -M 0 -f -N -R 3456:localhost:3456 server
```

The tunnel the app opens (above) does this by itself for as long as the app runs.

The laptop has to be awake and online: when it sleeps, `wye` on the server fails with `fetch failed` until it is back.

## Security

The app has no login. The tunnel does not open it to the internet — SSH binds the forwarded port to the server's
loopback address only (leave `GatewayPorts` off in the server's `sshd_config`, which is the default).

It does open it to **every account on that server**: anyone who can run a command there can read and write your
products through `localhost:3456` while the tunnel is up. On a server only you use, that is fine. On a shared one,
do not use this setup.

## When it does not work

| what you see | why | what to do |
|---|---|---|
| `fetch failed` from `wye` | no tunnel, or Wye is not running on the laptop | on the laptop: `curl localhost:3456/api/products`; then reconnect with `-R` |
| `Warning: remote port forwarding failed for listen port 3456` | something on the server already holds 3456 — often a tunnel from an earlier session | on the server: `lsof -i :3456` (or `ss -ltnp \| grep 3456`), end it, reconnect |
| the port is taken by something you need | — | forward another one, `-R 4567:localhost:3456`, and `export WYE_URL=http://localhost:4567` on the server; links in prompts will still say 3456 |
| `wye: no … graph.json — run wye build first` | a command that reads local files | use `wye node` / `wye resolve` instead |
| `--product <slug> (or WYE_PRODUCT) is required` | `WYE_PRODUCT` is not set in this shell | `export WYE_PRODUCT=<slug>` |

## Next

This page is the agent writing back. Handing work the other way — a task assigned in the Wye UI, picked up by an
agent on the server — is what `wye agent listen` is for: run on the server, it takes queued sessions over the same
tunnel and runs the agent there. That path is not covered here yet.
