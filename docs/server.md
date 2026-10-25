# Wye on a server for several people

Wye usually runs on your laptop for you alone. This page runs it on a server so that several people — you, your
client, a teammate — read and write the same vault's pages at once, over HTTPS.

What they get:

- **Editing together.** Two people on one page each see the other's typing within a second. Edits merge by
  themselves: there is no "changed on disk — reload", and nothing anyone typed is lost.
- **Who is where.** The people on a page are shown at its top, with their cursors labelled and the block each is in
  marked in their colour. The sidebar marks the pages that have people on them.
- **Agents and the CLI included.** A `wye propose`, `wye doc write` or `wye node set` on a page someone has open
  appears in their editor at once, beside what they are typing.
- **Who changed what.** Each person gives their name once, and the change history records their changes under it.

```
browser ──https/wss──▶ Caddy :443 ──http/ws──▶ wye app :3456 (127.0.0.1 only)
                                               └── the vault: markdown files on the server
```

## Before you start

- A server you reach over SSH, with a DNS name pointing at it (`wye.example.com` below).
- Node.js 20.9 or later on the server.
- Ports 80 and 443 open to the people who will use it. Caddy needs 80 to get the certificate.

## 1. Install Wye and the vault

```bash
npm install -g @emlab/wye
git clone <the repo with the vault> ~/vault     # or put the vault's folder there any other way
```

## 2. Run Wye for the proxy

```bash
wye app ~/vault --no-open --public https://wye.example.com
```

- `--public` is the address people reach the server at. A request that reached the proxy over plain `http://` is
  sent there. The live editing connection is accepted only from pages at that address.
- Wye still listens on `127.0.0.1:3456` only. Nothing reaches it except through the proxy.
- Keep it running under a process manager such as systemd, `pm2` or `tmux`. On its own memory cap it restarts with
  exit 77 (`wye app` starts it again).
- Before a stop or restart it stores every page that is open live, so the last seconds of typing are not lost.

## 3. Caddy in front, with HTTPS

[Caddy](https://caddyserver.com) gets and renews the certificate by itself. It also passes websockets through with
no extra settings, which the live editing needs. `/etc/caddy/Caddyfile`:

```
wye.example.com {
	basic_auth {
		# caddy hash-password --plaintext '<a password>'
		alex   $2a$14$...
		client $2a$14$...
	}
	reverse_proxy 127.0.0.1:3456
}
```

Then run `sudo systemctl reload caddy`.

**Keep `basic_auth` until Wye has sign-in.** Wye has no login of its own yet. Anyone who reaches it can read and
change every vault on it, so the proxy's password, or a private network such as a VPN or Tailscale, is the only lock.
The name a person gives in the app says who they are to the others. It does not prove it.

nginx works too. It must pass the websocket upgrade on through and say which scheme the request came in on:

```
location / {
    proxy_pass http://127.0.0.1:3456;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1h;
}
```

## 4. Open it

Each person opens `https://wye.example.com` and is asked their name once; their browser keeps it. Their own chip at
the top of a page renames them.

On your own laptop (`localhost`) nobody is asked. Presence shows your git name, and your changes are recorded as
before.

From the Wye app and the CLI on a laptop, add it as a workspace: **App settings › Remote workspaces**, the address and
the proxy's user and password, or `wye connect https://wye.example.com --user <user>` with the password on stdin. The
window's **Workspace** menu then opens it, and `wye --workspace <name> …` sends a command there
([docs/remote-workspaces.md](remote-workspaces.md)).

## What it does not do yet

- **Sign-in and roles.** Who may read or change which vault: owner, editor or viewer per vault. These come later. Until
  then, use the proxy's login.
- **Backups.** The pages are plain markdown files on the server. Commit and push them yourself, or with a cron job,
  until the scheduled GitHub backup is built.
- **A second copy.** Live editing keeps everyone on this server in step. A copy of the vault edited elsewhere, such as
  a clone on your laptop, still meets this one through git, where conflicts are possible.

## When it does not work

| what you see | why | what to do |
|---|---|---|
| A page stays on "Loading…" for 6 s, then opens without other people's cursors | The live connection did not get through: a proxy that drops websockets, or a server started with `next start` | Check the proxy passes `Upgrade`. Start Wye with `wye app`, not `next start`. |
| "offline — what you type is kept…" | The connection dropped | Typing is kept and sent when it comes back, as long as the tab stays open. |
| 403 on `/collab` in the browser's network tab | The page's address is not the `--public` address | Open the server by the address given to `--public`. |
