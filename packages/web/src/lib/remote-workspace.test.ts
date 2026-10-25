import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// A box workspace (plan:remote-workspaces) with a stand-in for ssh: the box check answers as a box would (wye there and
// started, wye missing, an old wye), and `-N -L a:localhost:b` forwards port a here to port b as ssh does — b being a
// small server playing the box's Wye. A drop of the tunnel is brought back.
const dir = mkdtempSync(path.join(os.tmpdir(), 'wye-remote-ws-'));
const fake = path.join(dir, 'ssh');
writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs'), net = require('net');
const a = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(path.join(dir, 'calls'))}, a.join(' ') + '\\n');
const host = a[a.indexOf('--') + 1];
const L = a.indexOf('-L');
if (L >= 0) {
  const [local, , port] = a[L + 1].split(':');
  const sv = net.createServer(c => { const u = net.connect(Number(port), '127.0.0.1'); c.pipe(u).pipe(c); u.on('error', () => c.destroy()); c.on('error', () => u.destroy()); });
  sv.on('error', () => { console.error('bind [127.0.0.1]:' + local + ': Address already in use'); process.exit(255); });
  sv.listen(Number(local), '127.0.0.1', () => console.error('debug1: Local connections to LOCALHOST:' + local + ' forwarded to remote address localhost:' + port));
  if (host.startsWith('flaky')) setTimeout(() => process.exit(255), 300);
  return;
}
if (host.startsWith('nowye')) { console.log('WYE-MISSING'); process.exit(0); }
if (host.startsWith('oldwye')) { console.log('WYE-VERSION 0.7.0 (/x)'); process.exit(0); }
if (host.startsWith('locked')) { console.error(host + ': Permission denied (publickey).'); process.exit(255); }
console.log('WYE-VERSION 0.8.0 (/x)'); console.log(JSON.stringify({ home: '/h', url: 'http://localhost:' + process.env.BOX_PORT, up: true }));
`);
chmodSync(fake, 0o755);
process.env.WATERFALL_DATA = dir; process.env.WYE_SSH = fake;
let remote: typeof import('./remote');
let box: http.Server;
beforeAll(async () => {
  box = http.createServer((q, r) => r.end(JSON.stringify({ box: true, path: q.url })));
  await new Promise<void>(r => box.listen(0, '127.0.0.1', r));
  process.env.BOX_PORT = String((box.address() as { port: number }).port);
  vi.resetModules(); remote = await import('./remote');
});
afterAll(async () => {
  for (const r of await remote.listRemotes()) if (r.use === 'workspace') await remote.disconnectWorkspace(r.name, true);
  box.close(); rmSync(dir, { recursive: true, force: true });
});
const until = async (name: string, state: string) => { for (let i = 0; i < 150; i++) { const r = (await remote.listRemotes()).find(x => x.name === name); if (r?.state === state) return r; await new Promise(f => setTimeout(f, 30)); } throw new Error(`${name} never ${state}: ${JSON.stringify(await remote.listRemotes())}`); };

describe('a box workspace', () => {
  it("checks wye on the box, forwards a local port to the port its server answers on, and the box's Wye answers here", async () => {
    const r = await remote.connectWorkspace({ host: 'you@devbox.lan' });
    expect(Array.isArray(r)).toBe(true);
    const w = await until('devbox', 'connected');
    expect(w).toMatchObject({ use: 'workspace', host: 'you@devbox.lan', port: Number(process.env.BOX_PORT), version: '0.8.0' });
    expect(w.local).toBeGreaterThanOrEqual(3460); expect(w.open).toBe(`http://localhost:${w.local}`);
    const got = await (await fetch(`${w.open}/api/products`)).json();
    expect(got).toEqual({ box: true, path: '/api/products' });
    const calls = readFileSync(path.join(dir, 'calls'), 'utf8');
    expect(calls).toMatch(/wye server start/); expect(calls).toMatch(new RegExp(`-L ${w.local}:localhost:${process.env.BOX_PORT} -- you@devbox.lan`));
    // remembered with its port and wanted; the same name keeps its local port
    const again = await remote.connectWorkspace({ host: 'you@devbox.lan' });
    expect((again as { name?: string; local?: number }[]).find(x => x.name === 'devbox')?.local).toBe(w.local);
    await remote.disconnectWorkspace('devbox');
    expect((await remote.listRemotes()).find(x => x.name === 'devbox')).toMatchObject({ state: 'off', on: false });
  });
  it('a box without wye, with one too old, or that refuses the key is named with what to do — no tunnel is opened', async () => {
    await remote.connectWorkspace({ host: 'nowye' });
    expect((await until('nowye', 'failed')).message).toMatch(/npm install -g @emlab\/wye/);
    await remote.connectWorkspace({ host: 'oldwye' });
    expect((await until('oldwye', 'failed')).message).toMatch(/@latest/);
    await remote.connectWorkspace({ host: 'locked' });
    expect((await until('locked', 'failed')).message).toMatch(/SSH key/);
    const calls = readFileSync(path.join(dir, 'calls'), 'utf8');
    expect(calls).not.toMatch(/-L \d+:localhost:\d+ -- (nowye|oldwye|locked)/);
  });
  it('a dropped tunnel is opened again', async () => {
    await remote.connectWorkspace({ host: 'flaky', name: 'flaky' });
    await until('flaky', 'connected');
    await until('flaky', 'failed');
    await until('flaky', 'connected');
    await remote.disconnectWorkspace('flaky', true);
  });
  it('an address is a row of its own with no tunnel; a name meaning this machine, or an address with a password in it, is refused', async () => {
    const r = await remote.connectWorkspace({ url: 'https://wye.example.com/', user: 'alex' }) as { name?: string; url?: string; user?: string; open?: string }[];
    expect(r.find(x => x.name === 'wye')).toMatchObject({ url: 'https://wye.example.com', user: 'alex', open: 'https://wye.example.com' });
    expect(await remote.connectWorkspace({ url: 'https://me:pw@x.example.com' })).toHaveProperty('error');
    expect(await remote.connectWorkspace({ host: 'box', name: 'local' })).toHaveProperty('error');
  });
  it('an agent host and a workspace on one box are two rows (decision:waterfall.remote-ws.one-list)', async () => {
    const both = (await remote.listRemotes()).filter(x => x.host === 'you@devbox.lan');
    expect(both.map(x => x.use)).toEqual(['workspace']);
  });
});

describe('a workspace at an address (req:waterfall.remote-ws.url)', () => {
  it('answers with the stored password; a wrong or missing one is said as such; the password is never in the settings', async () => {
    process.env.WYE_CREDENTIALS = path.join(dir, 'credentials.json');
    const proxy = http.createServer((q, r) => { if (q.headers.authorization !== 'Basic ' + Buffer.from('alex:s3cret').toString('base64')) { r.statusCode = 401; r.setHeader('www-authenticate', 'Basic realm="wye"'); return r.end(); } r.end('[]'); });
    await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
    let l = await remote.connectWorkspace({ url, name: 'team', user: 'alex', password: 's3cret' }) as { name?: string; state: string; message: string }[];
    expect(l.find(x => x.name === 'team')).toMatchObject({ state: 'connected' });
    expect(readFileSync(path.join(dir, '_settings.json'), 'utf8')).not.toMatch(/s3cret/);
    expect(JSON.stringify(l)).not.toMatch(/s3cret/);
    expect(readFileSync(process.env.WYE_CREDENTIALS, 'utf8')).toMatch(/s3cret/);
    l = await remote.connectWorkspace({ url, name: 'team', user: 'alex', password: 'wrong' }) as typeof l;
    expect(l.find(x => x.name === 'team')?.message).toMatch(/refused the user and password/);
    await remote.disconnectWorkspace('team', true);
    expect(readFileSync(process.env.WYE_CREDENTIALS, 'utf8')).not.toMatch(/wrong|s3cret/);
    l = await remote.connectWorkspace({ url, name: 'team2' }) as typeof l;
    expect(l.find(x => x.name === 'team2')?.message).toMatch(/asks for a user and password/);
    await remote.disconnectWorkspace('team2', true);
    proxy.close();
  });
});
