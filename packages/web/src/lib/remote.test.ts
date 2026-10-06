import { describe, it, expect } from 'vitest';
import { agentStart, cleanHost, cleanPort, cleanRemotes, readLine, retryDelay, serverSetup, sshArgs } from './remote-view';

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
