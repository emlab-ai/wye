// Remote agents, the part a page can read too (decision:wf2.remote-tunnel): what a host and a port may be, the ssh
// command a tunnel is, how ssh's own lines are read, and what to run on the server. Pure — no node: imports — so the
// settings section and lib/remote share it; tested by test:web-lib#remote.
export interface RemoteSpec { host: string; port: number; on?: boolean }
export type RemoteState = 'off' | 'connecting' | 'connected' | 'failed';
export interface RemoteView { host: string; port: number; on: boolean; state: RemoteState; message: string; since: string }

// An ssh destination as the person types it: `server`, `you@server.example.com`, a Host from ~/.ssh/config. Letters,
// digits, dot, dash, underscore, one optional `user@` — nothing that ssh could read as an option or a command.
export function cleanHost(input: unknown): string | null {
  const h = String(input ?? '').trim();
  return /^([A-Za-z0-9_][A-Za-z0-9._-]*@)?[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(h) && h.length <= 255 ? h : null;
}
export function cleanPort(input: unknown, fallback: number): number {
  const n = Number(input); return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : fallback;
}
// The stored list as it is used: valid hosts once each, in order.
export function cleanRemotes(list: unknown): RemoteSpec[] {
  const out: RemoteSpec[] = [];
  for (const r of Array.isArray(list) ? list : []) {
    const host = cleanHost((r as RemoteSpec)?.host); if (!host || out.some(x => x.host === host)) continue;
    out.push({ host, port: cleanPort((r as RemoteSpec).port, 3456), ...((r as RemoteSpec).on ? { on: true } : {}) });
  }
  return out;
}

// `port` on the server leads to `local` here. -v because ssh says nothing when a forward succeeds without it (read by
// readLine below); ExitOnForwardFailure so a tunnel that could not take the port is an exit, not a session that looks
// fine; the keep-alives end a dead connection within ~90 s so it can be opened again. `--` ends the options.
export function sshArgs(r: { host: string; port: number }, local: number): string[] {
  return ['-N', '-v', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'ConnectTimeout=15', '-R', `${r.port}:localhost:${local}`, '--', r.host];
}

// One line of ssh's stderr: the forward is up, or a reason worth showing (ssh's own message, without the debug noise).
export function readLine(line: string): { up?: true; reason?: string } {
  const l = line.trim();
  if (/remote forward success|All remote forwarding requests processed/i.test(l)) return { up: true };
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
