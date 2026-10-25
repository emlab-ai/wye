// Remote agents, the part a page can read too (decision:wf2.remote-tunnel): what a host and a port may be, the ssh
// command a tunnel is, how ssh's own lines are read, and what to run on the server. Pure — no node: imports — so the
// settings section and lib/remote share it; tested by test:web-lib#remote.
// One list of remotes (decision:waterfall.remote-ws.one-list), a row per host and use: `agents` — the reverse tunnel an
// agent on that server reaches this app through (rows stored before uses existed) — or `workspace` (plan:remote-workspaces):
// a box whose own Wye this machine opens over a forward tunnel (host, the box's port, the local port it comes out on),
// or the address of a Wye served elsewhere (url, and the proxy's user; the password is kept apart, lib/credentials).
export type RemoteUse = 'agents' | 'workspace';
export interface RemoteSpec { host: string; port: number; on?: boolean; use?: RemoteUse; name?: string; local?: number; url?: string; user?: string; version?: string }
export type RemoteState = 'off' | 'connecting' | 'connected' | 'failed';
export interface RemoteView { host: string; port: number; on: boolean; state: RemoteState; message: string; since: string; use: RemoteUse; name?: string; local?: number; url?: string; user?: string; version?: string; open?: string }

// An ssh destination as the person types it: `server`, `you@server.example.com`, a Host from ~/.ssh/config. Letters,
// digits, dot, dash, underscore, one optional `user@` — nothing that ssh could read as an option or a command.
export function cleanHost(input: unknown): string | null {
  const h = String(input ?? '').trim();
  return /^([A-Za-z0-9_][A-Za-z0-9._-]*@)?[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(h) && h.length <= 255 ? h : null;
}
export function cleanPort(input: unknown, fallback: number): number {
  const n = Number(input); return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : fallback;
}
// The address of a Wye served elsewhere: http(s), a host, an optional port and path; never credentials, a query or a
// fragment (the password is not kept in the settings). Without a scheme, https.
export function cleanUrl(input: unknown): string | null {
  let t = String(input ?? '').trim(); if (!t) return null;
  if (!/^[a-z]+:\/\//i.test(t)) t = 'https://' + t;
  try {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash || !u.hostname) return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return null; }
}
// A workspace's name, as the CLI and the menu say it: lowercase letters, digits and dashes.
export function cleanName(input: unknown): string | null {
  const n = String(input ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return n || null;
}
// the name a workspace gets when none is given: the box (without its user), or the address's host
export const nameFor = (r: { host?: string; url?: string }) => cleanName(r.url ? new URL(r.url).hostname.split('.')[0] : String(r.host || '').replace(/^.*@/, '').split('.')[0]);

// The stored list as it is used: agent hosts once each, workspaces once per name, in order.
export function cleanRemotes(list: unknown): RemoteSpec[] {
  const out: RemoteSpec[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const r = (raw ?? {}) as RemoteSpec; const on = r.on ? { on: true } : {};
    if (r.use === 'workspace') {
      const url = r.url ? cleanUrl(r.url) : null; const host = url ? '' : cleanHost(r.host);
      if (!url && !host) continue;
      const name = cleanName(r.name) || nameFor({ host: host || undefined, url: url || undefined }); if (!name || out.some(x => x.use === 'workspace' && x.name === name)) continue;
      const user = r.user && /^[^:\s]{1,100}$/.test(String(r.user)) ? String(r.user) : undefined;
      out.push(url ? { use: 'workspace', name, host: '', port: 0, url, ...(user ? { user } : {}), ...on }
        : { use: 'workspace', name, host: host as string, port: cleanPort(r.port, 3456), ...(r.local ? { local: cleanPort(r.local, 0) || undefined } : {}), ...(r.version ? { version: String(r.version).slice(0, 40) } : {}), ...on });
      continue;
    }
    const host = cleanHost(r.host); if (!host || out.some(x => (x.use ?? 'agents') === 'agents' && x.host === host)) continue;
    out.push({ host, port: cleanPort(r.port, 3456), ...on });
  }
  return out;
}
export const isWorkspace = (r: RemoteSpec) => r.use === 'workspace';
// where a workspace is opened from this machine: the tunnel's local end, or its address
export const openUrl = (r: RemoteSpec) => r.url || (r.local ? `http://localhost:${r.local}` : undefined);

// `port` on the server leads to `local` here. -v because ssh says nothing when a forward succeeds without it (read by
// readLine below); ExitOnForwardFailure so a tunnel that could not take the port is an exit, not a session that looks
// fine; the keep-alives end a dead connection within ~90 s so it can be opened again. `--` ends the options.
// A workspace's tunnel is the other way (plan:remote-workspaces): `-L <local>:localhost:<box port>`, the box's Wye at
// http://localhost:<local> here.
const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'ConnectTimeout=15'];
export function sshArgs(r: { host: string; port: number; use?: RemoteUse; local?: number }, local: number): string[] {
  if (r.use === 'workspace') return ['-N', '-v', ...SSH_OPTS, '-L', `${r.local}:localhost:${r.port}`, '--', r.host];
  return ['-N', '-v', ...SSH_OPTS, '-R', `${r.port}:localhost:${local}`, '--', r.host];
}
// The one command run on a box when its workspace connects (req:waterfall.remote-ws.wye-on-box), in a login shell so
// the PATH is the person's: the version, the box home's one server started when it is not running
// (req:waterfall.server.cli-starts-it), and where it answers. Its output is read by readBoxCheck.
export function boxCheckArgs(host: string): string[] {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '--', host, `bash -lc 'command -v wye >/dev/null || { echo WYE-MISSING; exit 0; }; echo WYE-VERSION $(wye --version); wye server start >&2 && wye server --json'`];
}
const older = (v: string, than: [number, number]) => { const [a, b] = v.split('.').map(Number); return a < than[0] || (a === than[0] && b < than[1]); };
export function readBoxCheck(out: string): { version?: string; port?: number; error?: string } {
  if (/WYE-MISSING/.test(out)) return { error: 'wye is not installed on the box — there: npm install -g @emlab/wye && wye setup' };
  const v = out.match(/WYE-VERSION (\d+\.\d+\.\d+)/)?.[1];
  if (!v) return { error: 'the box did not answer the check — run `wye --version` there' };
  if (older(v, [0, 8])) return { version: v, error: `wye ${v} on the box cannot start its server by itself — there: npm install -g @emlab/wye@latest` };
  const j = out.slice(out.indexOf('{')).trim(); let port = 0;
  try { const o = JSON.parse(j) as { url?: string; up?: boolean }; if (o.up && o.url) port = Number(new URL(o.url).port) || 0; } catch { /* below */ }
  return port ? { version: v, port } : { version: v, error: 'wye on the box did not start its server — see ~/.wye/.cache/server.log there' };
}

// One line of ssh's stderr: the forward is up, or a reason worth showing (ssh's own message, without the debug noise).
export function readLine(line: string): { up?: true; reason?: string } {
  const l = line.trim();
  if (/remote forward success|All remote forwarding requests processed/i.test(l)) return { up: true };
  // a workspace's forward (-L): listening here is up; a port taken here is said; a connection the box refused is its Wye not answering
  if (/Local forwarding listening on|Local connections to \S+ forwarded/i.test(l)) return { up: true };
  if (/cannot listen to port|Could not request local forwarding|bind \[?[^\]]*\]?:\d+: Address already in use/i.test(l)) return { reason: 'the local port is already in use on this machine' };
  if (/open failed: connect failed/i.test(l)) return { reason: "the box's Wye does not answer on its port" };
  if (/^debug\d:/.test(l) || !l) {
    return /remote forward failure|remote port forwarding failed/i.test(l) ? { reason: 'the port is already in use on the server' } : {};
  }
  if (/remote port forwarding failed/i.test(l)) return { reason: 'the port is already in use on the server' };
  if (/Permission denied/i.test(l)) return { reason: 'permission denied — the server needs your SSH key (a password cannot be typed here): run ssh-copy-id, or connect once in a terminal' };
  if (/Host key verification failed/i.test(l)) return { reason: 'the server is not a known host yet — connect once in a terminal and accept its key' };
  if (/Could not resolve hostname/i.test(l)) return { reason: 'no such host' };
  if (/Connection refused/i.test(l)) return { reason: 'connection refused' };
  if (/timed out/i.test(l)) return { reason: 'the connection timed out' };
  if (/^Warning: Permanently added|^Authenticated to|^OpenSSH_|^Pseudo-terminal/i.test(l)) return {};
  return { reason: l.replace(/^ssh: /, '').slice(0, 200) };
}

// How long to wait before opening a dropped tunnel again: 2 s, then doubling to a minute.
export const retryDelay = (tries: number) => Math.min(60_000, 2000 * 2 ** Math.max(0, tries - 1));

// What to run on the server once the tunnel is up: once per server, then for each agent started there. Every agent
// joins as a session of its own (`wye session join`, decision:wf2.remote-agents-join), so several agents on one
// server — or on several — each have their own row in Wye and what each writes is attributed to it.
export function serverSetup(port: number): string {
  return ['npm install -g @emlab/wye && wye setup', ...(port === 3456 ? [] : [`echo 'export WYE_URL=http://localhost:${port}' >> ~/.bashrc && export WYE_URL=http://localhost:${port}`]), 'wye session list --product <product>   # answers from this machine'].join('\n');
}
export function agentStart(product?: string): string {
  return [`export WYE_PRODUCT=${product || '<product>'}`, 'eval "$(wye session join "what this agent is working on")"', 'claude'].join('\n');
}
