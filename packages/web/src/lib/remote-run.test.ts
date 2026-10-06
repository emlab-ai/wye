import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The tunnel's life with a stand-in for ssh: a script that says what ssh says and stays, or fails the way ssh fails.
const dir = mkdtempSync(path.join(os.tmpdir(), 'wye-remote-'));
const fake = path.join(dir, 'ssh');
writeFileSync(fake, `#!/bin/sh
echo "$@" >> "${dir}/calls"
for a in "$@"; do host="$a"; done
case "$host" in
  good*) echo "debug1: Authenticated to $host" >&2; echo "debug1: remote forward success for: listen 4567, connect localhost:3456" >&2; exec sleep 30 ;;
  taken*) echo "Warning: remote port forwarding failed for listen port 4567" >&2; exit 255 ;;
  locked*) echo "$host: Permission denied (publickey)." >&2; exit 255 ;;
esac
exit 255
`);
chmodSync(fake, 0o755);
process.env.WATERFALL_DATA = dir; process.env.WYE_SSH = fake;
let remote: typeof import('./remote');
beforeAll(async () => { vi.resetModules(); remote = await import('./remote'); });
afterAll(async () => { for (const r of await remote.listRemotes()) await remote.disconnectRemote(r.host, true); rmSync(dir, { recursive: true, force: true }); });
const until = async (host: string, state: string) => { for (let i = 0; i < 100; i++) { const r = (await remote.listRemotes()).find(x => x.host === host); if (r?.state === state) return r; await new Promise(f => setTimeout(f, 30)); } throw new Error(`${host} never ${state}: ${JSON.stringify(await remote.listRemotes())}`); };

describe('a tunnel', () => {
  it('opens, is remembered as wanted, and closes when asked', async () => {
    const r = await remote.connectRemote('good@server', 4567, 3456);
    expect(Array.isArray(r)).toBe(true);
    await until('good@server', 'connected');
    expect(readFileSync(path.join(dir, 'calls'), 'utf8')).toMatch(/-R 4567:localhost:3456 -- good@server/);
    expect(JSON.parse(readFileSync(path.join(dir, '_settings.json'), 'utf8')).remotes).toEqual([{ host: 'good@server', port: 4567, on: true }]);
    await remote.disconnectRemote('good@server');
    const off = (await remote.listRemotes())[0];
    expect(off.state).toBe('off'); expect(off.on).toBe(false);
    await remote.disconnectRemote('good@server', true);
    expect(await remote.listRemotes()).toEqual([]);
    expect(existsSync(path.join(dir, '_settings.json')) ? JSON.parse(readFileSync(path.join(dir, '_settings.json'), 'utf8')).remotes : undefined).toBeUndefined();
  });
  it('a port already taken on the server is said, and tried again', async () => {
    await remote.connectRemote('taken', 4567, 3456);
    const r = await until('taken', 'failed');
    expect(r.message).toMatch(/already in use on the server — again in 2 s/);
    await remote.disconnectRemote('taken', true);
  });
  it('a server that will not let us in is said once and not tried again', async () => {
    await remote.connectRemote('locked', 4567, 3456);
    const r = await until('locked', 'failed');
    expect(r.message).toMatch(/SSH key/); expect(r.message).not.toMatch(/again in/);
    await remote.disconnectRemote('locked', true);
  });
  it('a host ssh could misread is refused before anything runs', async () => {
    expect(await remote.connectRemote('-oProxyCommand=x', 4567, 3456)).toEqual({ error: expect.stringMatching(/host/) });
  });
});
