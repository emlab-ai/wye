import { describe, it, expect } from 'vitest';
import { agentStart, boxCheckArgs, cleanHost, cleanName, cleanPort, cleanRemotes, cleanUrl, openUrl, readBoxCheck, readLine, retryDelay, serverSetup, sshArgs } from './remote-view';

describe('cleanHost', () => {
  it('takes what ssh takes: a name, user@host, a config alias', () => {
    for (const h of ['server', 'you@server.example.com', 'gpu-box_2', ' 10.0.0.5 ']) expect(cleanHost(h)).toBe(h.trim());
  });
  it('refuses anything ssh could read as an option or a command', () => {
    for (const h of ['-oProxyCommand=evil', 'host -R 1:a:2', 'a;b', 'you@@host', 'host$(x)', '', 'a@-b', 'host:22']) expect(cleanHost(h)).toBeNull();
  });
});

describe('cleanPort / cleanRemotes', () => {
  it('a port is an unprivileged integer, else the fallback', () => {
    expect(cleanPort(4567, 3456)).toBe(4567); expect(cleanPort('4567', 3456)).toBe(4567);
    for (const p of [80, 0, 70000, 'x', 3456.5, undefined]) expect(cleanPort(p, 3456)).toBe(3456);
  });
  it('the stored list: valid hosts, once each', () => {
    expect(cleanRemotes([{ host: 'a', port: 3456, on: true }, { host: '-bad' }, { host: 'a', port: 1 }, { host: 'you@b' }, 'x'])).toEqual([{ host: 'a', port: 3456, on: true }, { host: 'you@b', port: 3456 }]);
    expect(cleanRemotes(undefined)).toEqual([]);
  });
});

describe('sshArgs', () => {
  it('a reverse forward of the server\'s port to this app, no prompt, no shell, the host after --', () => {
    const a = sshArgs({ host: 'you@server', port: 4567 }, 3456);
    expect(a.slice(-4)).toEqual(['-R', '4567:localhost:3456', '--', 'you@server']);
    expect(a).toContain('-N'); expect(a).toContain('BatchMode=yes'); expect(a).toContain('ExitOnForwardFailure=yes');
  });
});

describe('readLine', () => {
  it('the forward is up when ssh says so', () => {
    expect(readLine('debug1: remote forward success for: listen 3456, connect localhost:3456')).toEqual({ up: true });
    expect(readLine('debug1: All remote forwarding requests processed')).toEqual({ up: true });
  });
  it('debug noise says nothing', () => { expect(readLine('debug1: Reading configuration data /etc/ssh/ssh_config')).toEqual({}); expect(readLine('')).toEqual({}); });
  it('a failure is said in words a person can act on', () => {
    expect(readLine('Warning: remote port forwarding failed for listen port 3456').reason).toMatch(/already in use/);
    expect(readLine('debug1: remote forward failure for: listen 3456, connect localhost:3456').reason).toMatch(/already in use/);
    expect(readLine('you@server: Permission denied (publickey,password).').reason).toMatch(/SSH key/);
    expect(readLine('Host key verification failed.').reason).toMatch(/known host/);
    expect(readLine('ssh: Could not resolve hostname nope: nodename nor servname provided, or not known').reason).toBe('no such host');
    expect(readLine('ssh: connect to host server port 22: Connection refused').reason).toBe('connection refused');
    expect(readLine('ssh: something new').reason).toBe('something new');
  });
});

describe('retryDelay / what to run on the server', () => {
  it('2 s, doubling, a minute at most', () => { expect([1, 2, 3, 4, 9].map(retryDelay)).toEqual([2000, 4000, 8000, 16000, 60000]); });
  it('the server needs WYE_URL only when the port is not the default', () => {
    expect(serverSetup(3456)).not.toMatch(/WYE_URL/);
    expect(serverSetup(4567)).toMatch(/WYE_URL=http:\/\/localhost:4567/);
  });
  it('each agent joins as a session of its own before it starts', () => {
    const lines = agentStart('shop').split('\n');
    expect(lines[0]).toBe('export WYE_PRODUCT=shop'); expect(lines[1]).toMatch(/^eval "\$\(wye session join /); expect(lines[2]).toBe('claude');
  });
});

describe('workspaces (plan:remote-workspaces)', () => {
  it('an address is http(s) with a host, never credentials, a query or a fragment; https when no scheme is given', () => {
    expect(cleanUrl('https://wye.example.com/')).toBe('https://wye.example.com');
    expect(cleanUrl('wye.example.com')).toBe('https://wye.example.com');
    expect(cleanUrl('http://10.0.0.5:3456/team')).toBe('http://10.0.0.5:3456/team');
    for (const u of ['https://me:pw@wye.example.com', 'ftp://x', 'https://x/?a=1', 'https://x/#y', '', 'javascript:alert(1)']) expect(cleanUrl(u)).toBeNull();
  });
  it('a name is lowercase words with dashes', () => { expect(cleanName(' GPU Box 2 ')).toBe('gpu-box-2'); expect(cleanName('!!')).toBeNull(); });
  it('one list: agent hosts once, workspaces once per name; a box can be both; old rows are agent rows', () => {
    const l = cleanRemotes([
      { host: 'box', port: 3456, on: true },
      { use: 'workspace', host: 'you@box.lan', port: 3456, local: 3471, on: true },
      { use: 'workspace', name: 'box', host: 'other', port: 3456 },
      { use: 'workspace', url: 'https://wye.example.com/', user: 'alex' },
      { use: 'workspace', url: 'https://me:pw@x.example.com' },
      { use: 'workspace', host: '-oProxyCommand=x' },
    ]);
    expect(l).toEqual([
      { host: 'box', port: 3456, on: true },
      { use: 'workspace', name: 'box', host: 'you@box.lan', port: 3456, local: 3471, on: true },
      { use: 'workspace', name: 'wye', host: '', port: 0, url: 'https://wye.example.com', user: 'alex' },
    ]);
    expect(openUrl(l[1])).toBe('http://localhost:3471'); expect(openUrl(l[2])).toBe('https://wye.example.com');
  });
  it("a workspace's tunnel forwards a local port to the box's Wye", () => {
    const a = sshArgs({ use: 'workspace', host: 'you@box', port: 3456, local: 3471 }, 3456);
    expect(a.slice(-4)).toEqual(['-L', '3471:localhost:3456', '--', 'you@box']);
    expect(a).toContain('BatchMode=yes'); expect(a).not.toContain('-R');
  });
  it("ssh's local-forward lines", () => {
    expect(readLine('debug1: Local connections to LOCALHOST:3471 forwarded to remote address localhost:3456')).toEqual({ up: true });
    expect(readLine('bind [127.0.0.1]:3471: Address already in use').reason).toMatch(/local port is already in use/);
    expect(readLine('channel 2: open failed: connect failed: Connection refused').reason).toMatch(/does not answer/);
  });
  it('the box check: one login-shell command after --, read back to a version and a port or what to do', () => {
    const a = boxCheckArgs('you@box'); expect(a.slice(-3, -1)).toEqual(['--', 'you@box']); expect(a.at(-1)).toMatch(/^bash -lc '.*wye server start.*wye server --json'$/);
    expect(readBoxCheck('WYE-MISSING\n').error).toMatch(/npm install -g @emlab\/wye/);
    expect(readBoxCheck('WYE-VERSION 0.7.0 (/usr/lib/node_modules/@emlab/wye)\n').error).toMatch(/@latest/);
    expect(readBoxCheck('WYE-VERSION 0.8.0 (/x)\n{\n "home": "/h", "url": "http://localhost:3456", "up": true\n}\n')).toEqual({ version: '0.8.0', port: 3456 });
    expect(readBoxCheck('WYE-VERSION 0.8.1 (/x)\n{ "url": "http://localhost:3456", "up": false }').error).toMatch(/did not start/);
  });
});
