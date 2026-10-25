// Remote agents (decision:wf2.remote-tunnel): the app on this machine, an agent on a server reached over SSH. The app
// opens the reverse tunnel itself — `ssh -N -R <port>:localhost:<port> <host>` — so `wye` on the server reaches this app
// at http://localhost:<port> (docs/remote-agent.md), keeps it up while it is wanted (it comes back after a drop, and
// when the app starts again), and says where it stands. Nothing is typed into ssh from here: it runs with BatchMode,
// so a host that needs a password or is not yet known fails with ssh's own words instead of waiting on a prompt.
//
// The hosts and whether each is wanted live in <data>/_settings.json (`remotes`); the running tunnels on globalThis,
// across dev reloads. What a host may be, the ssh arguments and how ssh's lines are read are in lib/remote-view (pure).
//
// A workspace row (plan:remote-workspaces) is the other way: `ssh -N -L <local>:localhost:<box port> <host>` to a box
// whose own Wye the window then opens at http://localhost:<local> (decision:waterfall.remote-ws.window-loads-the-box) —
// the box's Wye checked and started over ssh first (req:waterfall.remote-ws.wye-on-box) — or an address, no tunnel.
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './products';
import { readSettings, writeSettings } from './settings';

import { boxCheckArgs, cleanHost, cleanName, cleanPort, cleanRemotes, cleanUrl, nameFor, openUrl, readBoxCheck, readLine, retryDelay, sshArgs, type RemoteSpec, type RemoteState, type RemoteView } from './remote-view';
export * from './remote-view';

// ---- the running tunnels

type Tunnel = { spec: RemoteSpec; local: number; child: ChildProcess | null; state: RemoteState; message: string; since: string; tries: number; timer: ReturnType<typeof setTimeout> | null; wanted: boolean };
const g = globalThis as unknown as { __wfRemote?: { tunnels: Map<string, Tunnel>; exitHook: boolean; started: boolean } };
const st = () => (g.__wfRemote ??= { tunnels: new Map(), exitHook: false, started: false });
// the port this app answers on: Next sets PORT for `next dev -p` and `next start -p`; a request's own port wins (connect)
export const appPort = () => cleanPort(process.env.PORT, 3456);
const SSH = () => process.env.WYE_SSH || 'ssh';
// a row's key among the tunnels: an agent host by its host, a workspace by its name
const keyOf = (r: RemoteSpec) => r.use === 'workspace' ? `workspace:${r.name}` : r.host;

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

const view = (spec: RemoteSpec, t?: Tunnel): RemoteView => ({
  host: spec.host, port: t?.spec.port ?? spec.port, on: !!spec.on, state: t?.state ?? 'off', message: t?.message ?? '', since: t?.since ?? '', use: spec.use ?? 'agents',
  ...(spec.use === 'workspace' ? { name: spec.name, ...(spec.local ? { local: spec.local } : {}), ...(spec.url ? { url: spec.url } : {}), ...(spec.user ? { user: spec.user } : {}), ...(t?.spec.version || spec.version ? { version: t?.spec.version || spec.version } : {}), open: openUrl(spec) } : {}),
});
export async function listRemotes(): Promise<RemoteView[]> {
  const s = st(); const list = cleanRemotes((await readSettings()).remotes);
  await Promise.all(list.filter(r => r.use === 'workspace' && r.url).map(r => probeAddress(r)));
  return list.map(r => view(r, s.tunnels.get(keyOf(r))));
}
const save = async (fn: (list: RemoteSpec[]) => RemoteSpec[]) => { await writeSettings({ remotes: fn(cleanRemotes((await readSettings()).remotes)) }); };

// Open the tunnel to a host (added to the list when new) and keep it wanted; `local` is the port this app answers on.
export async function connectRemote(hostIn: unknown, portIn: unknown, local: number = appPort()): Promise<RemoteView[] | { error: string }> {
  const host = cleanHost(hostIn); if (!host) return { error: 'a host as you would give it to ssh: server, or you@server' };
  const port = cleanPort(portIn, local);
  await save(list => [...list.filter(r => r.use === 'workspace' || r.host !== host), { host, port, on: true }]);
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
    const mine = (r: RemoteSpec) => r.use !== 'workspace' && r.host === host;
    await save(list => forget ? list.filter(r => !mine(r)) : list.map(r => mine(r) ? { host: r.host, port: r.port } : r));
  }
  return listRemotes();
}
// At startup (instrumentation): the tunnels that were on when the app stopped are opened again.
export async function startRemotes(): Promise<void> {
  const s = st(); if (s.started) return; s.started = true;
  for (const r of cleanRemotes((await readSettings()).remotes)) {
    if (r.use === 'workspace') { if (r.on && !r.url && !s.tunnels.has(keyOf(r))) void openWorkspace(r); continue; }
    if (!r.on || s.tunnels.has(r.host)) continue;
    exitHook();
    const t: Tunnel = { spec: r, local: appPort(), child: null, state: 'off', message: '', since: '', tries: 0, timer: null, wanted: true };
    s.tunnels.set(r.host, t); open(t);
  }
}

// ---- workspaces (plan:remote-workspaces)

// the passwords of address workspaces, kept apart from the settings (lib/credentials, req:waterfall.remote-ws.url)
type Credentials = { get(url: string): { user: string; password: string } | null; set(url: string, user: string, password: string): void; remove(url: string): void; header(url: string): string | null };
let creds: Credentials | null = null;
export const credentials = (): Credentials => (creds ??= createRequire(path.join(REPO_ROOT, 'package.json'))('./lib/credentials.js') as Credentials);

// An address has no tunnel: where it stands is whether it answers, and to the stored password (asked again at most every
// 10 s, on a list or a connect).
async function probeAddress(r: RemoteSpec, force = false): Promise<void> {
  const s = st(); const key = keyOf(r); const url = r.url as string;
  let t = s.tunnels.get(key);
  if (!t) { t = { spec: { ...r }, local: 0, child: null, state: 'off', message: '', since: '', tries: 0, timer: null, wanted: !!r.on }; s.tunnels.set(key, t); }
  if (!r.on) { t.state = 'off'; t.message = ''; return; }
  if (!force && t.since && Date.now() - Date.parse(t.since) < 10_000 && t.state !== 'connecting') return;
  const set = (state: RemoteState, message = '') => { t.state = state; t.message = message; t.since = new Date().toISOString(); };
  const auth = credentials().header(url);
  try {
    const res = await fetch(`${url}/api/products`, { headers: auth ? { authorization: auth } : {}, signal: AbortSignal.timeout(8000), redirect: 'manual' });
    if (res.status === 401 || res.status === 403) set('failed', auth ? 'the address refused the user and password' : 'the address asks for a user and password');
    else if (res.ok) set('connected');
    else set('failed', `the address answered ${res.status} — is it a Wye?`);
  } catch (e) { set('failed', `the address does not answer (${(e as Error & { cause?: { code?: string } }).cause?.code || (e as Error).message})`); }
}

// a local port for a box's tunnel, chosen once and kept on its row: the first free one from 3460, not another row's
async function freePort(taken: number[]): Promise<number> {
  const free = (p: number) => new Promise<boolean>(res => { const sv = net.createServer(); sv.once('error', () => res(false)); sv.listen(p, '127.0.0.1', () => sv.close(() => res(true))); });
  for (let p = 3460; p < 3600; p++) if (!taken.includes(p) && p !== appPort() && await free(p)) return p;
  return 0;
}

// The box's Wye, checked and started there before the tunnel opens (req:waterfall.remote-ws.wye-on-box): one ssh command
// in a login shell — the version, `wye server start` (the box home's one server), the port it answers on.
export function checkBox(host: string): Promise<{ version?: string; port?: number; error?: string }> {
  return new Promise(res => {
    let out = '', err = ''; let child: ChildProcess;
    try { child = spawn(SSH(), boxCheckArgs(host), { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return res({ error: `ssh could not be started: ${(e as Error).message}` }); }
    const timer = setTimeout(() => { try { child.kill('SIGTERM'); } catch { /* gone */ } }, 240_000);   // a first start on the box can take a while
    child.stdout?.on('data', (d: Buffer) => { out += d; }); child.stderr?.on('data', (d: Buffer) => { err += d; });
    child.on('error', e => { clearTimeout(timer); res({ error: `ssh could not be started: ${e.message}` }); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (code !== 0 && !/WYE-/.test(out)) { const why = err.split('\n').map(l => readLine(l).reason).filter(Boolean).pop(); return res({ error: why || `ssh ended (exit ${code})` }); }
      res(readBoxCheck(out));
    });
  });
}

async function openWorkspace(r: RemoteSpec): Promise<void> {
  const s = st(); exitHook(); const key = keyOf(r);
  const old = s.tunnels.get(key); if (old) close(old);
  const t: Tunnel = { spec: { ...r }, local: r.local || 0, child: null, state: 'connecting', message: 'checking wye on the box', since: new Date().toISOString(), tries: 0, timer: null, wanted: true };
  s.tunnels.set(key, t);
  const box = await checkBox(r.host);
  if (!t.wanted || s.tunnels.get(key) !== t) return;
  if (box.error) { t.state = 'failed'; t.message = box.error; t.since = new Date().toISOString(); if (box.version) t.spec.version = box.version; return; }
  t.spec.port = box.port as number; t.spec.version = box.version;
  await save(list => list.map(x => x.use === 'workspace' && x.name === r.name ? { ...x, port: t.spec.port, version: box.version } : x));
  open(t);
}

// Add (or change) a workspace and connect it: a box over ssh, or an address. → the list, or what is wrong with the input.
export async function connectWorkspace(input: { host?: unknown; url?: unknown; name?: unknown; port?: unknown; user?: unknown; password?: unknown }): Promise<RemoteView[] | { error: string }> {
  const url = input.url ? cleanUrl(input.url) : null; const host = url ? null : cleanHost(input.host);
  if (input.url && !url) return { error: 'an address like https://wye.example.com — no user or password in it' };
  if (!url && !host) return { error: 'a box as you would give it to ssh (server, you@server), or an address (https://…)' };
  const list = cleanRemotes((await readSettings()).remotes);
  const name = cleanName(input.name) || nameFor({ host: host || undefined, url: url || undefined });
  if (!name) return { error: 'a name for the workspace: letters, digits, dashes' };
  if (name === 'local' || name === 'this-mac') return { error: `"${name}" means this machine — give the workspace another name` };
  const was = list.find(r => r.use === 'workspace' && r.name === name);
  let row: RemoteSpec;
  if (url) row = { use: 'workspace', name, host: '', port: 0, url, ...(cleanUser(input.user) ? { user: cleanUser(input.user) } : {}), on: true };
  else {
    const taken = list.filter(r => r.use === 'workspace' && r.name !== name && r.local).map(r => r.local as number);
    const local = was?.local && !taken.includes(was.local) ? was.local : await freePort(taken);
    if (!local) return { error: 'no free local port between 3460 and 3600 for the tunnel' };
    row = { use: 'workspace', name, host: host as string, port: cleanPort(input.port, was?.port || 3456), local, on: true };
  }
  await save(l => { const i = l.findIndex(r => r.use === 'workspace' && r.name === name); if (i < 0) return [...l, row]; const c = [...l]; c[i] = row; return c; });
  if (url) {
    // the password goes to the credentials file, never the settings; a user without one keeps the stored password
    const user = cleanUser(input.user);
    if (user && input.password != null && String(input.password) !== '') credentials().set(url, user, String(input.password));
    else if (!user && input.password === '') credentials().remove(url);
    await probeAddress(row, true);
  } else await openWorkspace(row);
  return listRemotes();
}
const cleanUser = (u: unknown) => { const v = String(u ?? '').trim(); return v && /^[^:\s]{1,100}$/.test(v) ? v : undefined; };

export async function disconnectWorkspace(nameIn: unknown, forget = false): Promise<RemoteView[]> {
  const name = cleanName(nameIn); const s = st();
  if (name) {
    const t = s.tunnels.get(`workspace:${name}`); if (t) { close(t); if (forget) s.tunnels.delete(`workspace:${name}`); }
    if (forget) { const row = cleanRemotes((await readSettings()).remotes).find(r => r.use === 'workspace' && r.name === name); if (row?.url) credentials().remove(row.url); }
    await save(list => forget ? list.filter(r => !(r.use === 'workspace' && r.name === name)) : list.map(r => r.use === 'workspace' && r.name === name ? { ...r, on: undefined } : r));
  }
  return listRemotes();
}
