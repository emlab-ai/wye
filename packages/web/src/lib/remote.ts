// Remote agents (decision:wf2.remote-tunnel): the app on this machine, an agent on a server reached over SSH. The app
// opens the reverse tunnel itself — `ssh -N -R <port>:localhost:<port> <host>` — so `wye` on the server reaches this app
// at http://localhost:<port> (docs/remote-agent.md), keeps it up while it is wanted (it comes back after a drop, and
// when the app starts again), and says where it stands. Nothing is typed into ssh from here: it runs with BatchMode,
// so a host that needs a password or is not yet known fails with ssh's own words instead of waiting on a prompt.
//
// The hosts and whether each is wanted live in <data>/_settings.json (`remotes`); the running tunnels on globalThis,
// across dev reloads. What a host may be, the ssh arguments and how ssh's lines are read are in lib/remote-view (pure).
import { spawn, type ChildProcess } from 'node:child_process';
import { readSettings, writeSettings } from './settings';

import { cleanHost, cleanPort, cleanRemotes, readLine, retryDelay, sshArgs, type RemoteSpec, type RemoteState, type RemoteView } from './remote-view';
export * from './remote-view';

// ---- the running tunnels

type Tunnel = { spec: RemoteSpec; local: number; child: ChildProcess | null; state: RemoteState; message: string; since: string; tries: number; timer: ReturnType<typeof setTimeout> | null; wanted: boolean };
const g = globalThis as unknown as { __wfRemote?: { tunnels: Map<string, Tunnel>; exitHook: boolean; started: boolean } };
const st = () => (g.__wfRemote ??= { tunnels: new Map(), exitHook: false, started: false });
// the port this app answers on: Next sets PORT for `next dev -p` and `next start -p`; a request's own port wins (connect)
export const appPort = () => cleanPort(process.env.PORT, 3456);
const SSH = () => process.env.WYE_SSH || 'ssh';

function open(t: Tunnel) {
  if (t.timer) { clearTimeout(t.timer); t.timer = null; }
  if (t.child || !t.wanted) return;
  const set = (state: RemoteState, message = '') => { t.state = state; t.message = message; t.since = new Date().toISOString(); };
  set('connecting', t.tries ? `again (attempt ${t.tries + 1})` : '');
  let reason = ''; let child: ChildProcess;
  try { child = spawn(SSH(), sshArgs(t.spec, t.local), { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { set('failed', `ssh could not be started: ${(e as Error).message}`); return; }
  t.child = child;
  // ssh without the success line (an older or a different client): alive after a while with nothing said against it
  const settle = setTimeout(() => { if (t.child === child && t.state === 'connecting') { t.tries = 0; set('connected'); } }, 12_000);
  let buf = '';
  child.stderr?.on('data', (d: Buffer) => {
    buf += d.toString(); const lines = buf.split('\n'); buf = lines.pop() ?? '';
    for (const l of lines) { const r = readLine(l); if (r.reason) reason = r.reason; if (r.up && t.child === child && t.state !== 'connected') { t.tries = 0; set('connected'); } }
  });
  const ended = (why: string) => {
    clearTimeout(settle); if (t.child !== child) return; t.child = null;
    if (!t.wanted) { set('off'); return; }
    // a host that will not let us in, or is not there, is not tried again and again: the person has something to do first
    const final = /permission denied|known host|no such host|could not be started/.test(why);
    const was = t.state; t.tries++;
    set('failed', why || (was === 'connected' ? 'the connection dropped' : 'ssh ended'));
    if (!final) { t.message += ` — again in ${Math.round(retryDelay(t.tries) / 1000)} s`; t.timer = setTimeout(() => open(t), retryDelay(t.tries)); }
  };
  child.on('error', e => ended(`ssh could not be started: ${e.message}`));
  child.on('exit', () => ended(reason));
}
function close(t: Tunnel) {
  t.wanted = false; if (t.timer) { clearTimeout(t.timer); t.timer = null; }
  const c = t.child; t.child = null; t.tries = 0; t.state = 'off'; t.message = ''; t.since = new Date().toISOString();
  if (c) { try { c.kill('SIGTERM'); } catch { /* gone */ } }
}
function exitHook() {
  const s = st(); if (s.exitHook) return; s.exitHook = true;
  // the tunnels are this app's: they go when it goes
  const end = () => { for (const t of s.tunnels.values()) { try { t.child?.kill('SIGTERM'); } catch { /* gone */ } } };
  process.once('exit', end);
}

const view = (spec: RemoteSpec, t?: Tunnel): RemoteView => ({ host: spec.host, port: spec.port, on: !!spec.on, state: t?.state ?? 'off', message: t?.message ?? '', since: t?.since ?? '' });
export async function listRemotes(): Promise<RemoteView[]> {
  const s = st(); return cleanRemotes((await readSettings()).remotes).map(r => view(r, s.tunnels.get(r.host)));
}
const save = async (fn: (list: RemoteSpec[]) => RemoteSpec[]) => { await writeSettings({ remotes: fn(cleanRemotes((await readSettings()).remotes)) }); };

// Open the tunnel to a host (added to the list when new) and keep it wanted; `local` is the port this app answers on.
export async function connectRemote(hostIn: unknown, portIn: unknown, local: number = appPort()): Promise<RemoteView[] | { error: string }> {
  const host = cleanHost(hostIn); if (!host) return { error: 'a host as you would give it to ssh: server, or you@server' };
  const port = cleanPort(portIn, local);
  await save(list => [...list.filter(r => r.host !== host), { host, port, on: true }]);
  const s = st(); exitHook();
  const old = s.tunnels.get(host); if (old) close(old);
  const t: Tunnel = { spec: { host, port, on: true }, local, child: null, state: 'off', message: '', since: '', tries: 0, timer: null, wanted: true };
  s.tunnels.set(host, t); open(t);
  return listRemotes();
}
export async function disconnectRemote(hostIn: unknown, forget = false): Promise<RemoteView[]> {
  const host = cleanHost(hostIn); const s = st();
  if (host) {
    const t = s.tunnels.get(host); if (t) { close(t); if (forget) s.tunnels.delete(host); }
    await save(list => forget ? list.filter(r => r.host !== host) : list.map(r => r.host === host ? { host: r.host, port: r.port } : r));
  }
  return listRemotes();
}
// At startup (instrumentation): the tunnels that were on when the app stopped are opened again.
export async function startRemotes(): Promise<void> {
  const s = st(); if (s.started) return; s.started = true;
  for (const r of cleanRemotes((await readSettings()).remotes)) {
    if (!r.on || s.tunnels.has(r.host)) continue;
    exitHook();
    const t: Tunnel = { spec: r, local: appPort(), child: null, state: 'off', message: '', since: '', tries: 0, timer: null, wanted: true };
    s.tunnels.set(r.host, t); open(t);
  }
}
