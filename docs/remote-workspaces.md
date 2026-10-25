# Wye on another machine

How do you work in a Wye that runs somewhere else: on a dev box where the code and its vault live, or on a server a
team shares? You open it as a **remote workspace**. Your window shows that Wye itself: its documents, graph, inbox and
sessions, and everything you write lands there. Two kinds:

- **A box you reach over SSH.** Wye checks that `wye` is installed on the box, starts its server there when it is not
  running, and opens a forward tunnel so it answers on a port of this machine.
- **An address.** A Wye served with `wye app --public https://…` behind a proxy ([docs/server.md](server.md)). You give
  the proxy's user and password once; they are kept on this machine.

This is the opposite of [an agent on another machine](remote-agent.md): there the vault stays on your laptop and an
agent on a server reaches back to it. Here the vault is on the other machine and you go to it.

```
this machine                                 the box
┌─────────────────────────┐   ssh -L        ┌────────────────────────────┐
│ window → localhost:3460 │────────────────▶│ wye server :3456           │
│ wye --workspace box …   │                 │ its vaults, its agents     │
└─────────────────────────┘                 └────────────────────────────┘
```

## A box

Before you start:

- Your SSH key works for the box: `ssh you@devbox` logs in without a password prompt, and the box is a known host.
- `wye` 0.8 or later is installed on the box (`npm install -g @emlab/wye && wye setup`), with the vaults you want in
  its home or opened there (`wye open <folder>`, or `wye init` in the repository).

In the app: **App settings › Remote workspaces**, type the host as you would give it to ssh (`you@devbox`, or a `Host`
from `~/.ssh/config`), an optional name, and press **Add box**. The row shows where it stands: checking, connected (with
the box's wye version), or what to do. Wye runs one command on the box in a login shell: `wye --version`, then
`wye server start`, which starts the box's server without a window if it is not running. Then it opens
`ssh -N -L <local port>:localhost:<box port> you@devbox`, keeps it up and opens it again after a drop or when the app
restarts. The local port is chosen once, from 3460 up, and stays the same for that workspace.

From the terminal:

```bash
wye connect you@devbox --name devbox      # checks and starts wye there, opens the tunnel
wye workspaces                            # every workspace, its state and where it opens
wye --workspace devbox ask "…" --product shop
wye disconnect devbox [--forget]
```

## An address

The server runs `wye app --public https://wye.example.com` behind a proxy with a password ([docs/server.md](server.md)).
In the app: **App settings › Remote workspaces**, type the address, the proxy's user and password, and press **Add
address**. From the terminal:

```bash
wye connect https://wye.example.com --name team --user alex   # the password on stdin, or in WYE_PASSWORD
wye --workspace team inbox --product shop
WYE_URL=https://wye.example.com wye inbox --product shop      # the stored password is sent here too
```

The password is kept in `~/.wye/credentials.json`, readable only by you (`WYE_CREDENTIALS` moves it), never in the app's
settings or a vault. The row says whether the address answers and whether it accepted the password.

## Switching

In the window, the **Workspace** menu lists **This machine** and each workspace. Choosing one loads that Wye in the
window, and choosing **This machine** comes back. In a browser, **Open** on a workspace's row opens it in a tab.

The CLI never follows the window. A command goes to a workspace only when it asks: `--workspace <name>`, `WYE_WORKSPACE`,
or `WYE_URL`. An agent working in a folder on this machine keeps writing to that folder's vault, whatever the window
shows. Agents started from a remote workspace's pages run on that machine, beside its vault.

## When it does not work

| the row says | what to do |
|---|---|
| permission denied — the server needs your SSH key | `ssh-copy-id you@devbox`, or log in once in a terminal |
| not a known host yet | `ssh you@devbox` once in a terminal and accept its key |
| wye is not installed on the box | on the box: `npm install -g @emlab/wye && wye setup` |
| wye 0.7.x on the box cannot start its server by itself | on the box: `npm install -g @emlab/wye@latest` |
| the local port is already in use on this machine | Remove the workspace and add it again, so it gets another port |
| the address refused the user and password | add it again with the right ones (`wye connect … --user u`) |
| the address does not answer | is the server up, and the proxy? `curl -I https://wye.example.com` |

**Who else can reach it.** Wye has no sign-in of its own yet. A tunnel's local port answers to anyone on this machine,
and an address answers to anyone with the proxy's password.
