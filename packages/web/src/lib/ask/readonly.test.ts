import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { deepArgs, deepEnv } from './deep';

// The deep lane reads; it never writes knowledge (constraint:wf2.pr-is-the-persons). The wye CLI enforces it under
// WYE_READONLY, so an over-helpful agent cannot run `wye node set` however its Bash allow-list is matched.
const WYE = path.resolve(__dirname, '../../../../../bin/wye.js');
const run = (...args: string[]) => spawnSync('node', [WYE, ...args], { env: { ...process.env, WYE_READONLY: '1', WYE_PRODUCT: 'p', WYE_URL: 'http://127.0.0.1:9' }, encoding: 'utf8', timeout: 10000 });

describe('wye under WYE_READONLY', () => {
  it.each([['node', 'set', 'req:x', '--status', 'done'], ['node', 'content', 'req:x'], ['doc', 'write', 'p/v2/m', '--file', 'f'], ['propose', 'p/v2/m'], ['pr', 'build', 'p/v2/pr-1'],
    ['work', 'add', 'x'], ['inbox', 'add', 'x'], ['session', 'log', 's', 'x'], ['ask', 'why'], ['build', '--root', '.'], ['graph', 'build'], ['verdicts', 'req:x'], ['import', 'x']])('refuses %s', (...args) => {
    const r = run(...args);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/read-only/);
  });
  it.each([['node', 'req:x'], ['doc', 'p/v2/m'], ['ask-search', 'invite'], ['resolve', 'req:x'], ['session', 'show', 's']])('lets %s through to the app', (...args) => {
    expect(run(...args).stderr).not.toMatch(/read-only/);
  });
});

describe('the deep lane process', () => {
  const a = deepArgs({ product: 'p', productDir: '/d', codeRoot: '/c', wfUrl: 'http://x' });
  it('has only the read tools, no MCP servers, and no permissive mode', () => {
    expect(a[a.indexOf('--tools') + 1]).toBe('Bash,Read,Grep,Glob');
    expect(a).toContain('--strict-mcp-config');
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('default');
  });
  it('runs wye read-only and outside any session', () => {
    const e = deepEnv({ product: 'p', wfUrl: 'http://x' }, { WYE_SESSION: 's1', WF_SESSION: 's1', PATH: '/bin' } as unknown as NodeJS.ProcessEnv);
    expect(e).toMatchObject({ WYE_READONLY: '1', WYE_PRODUCT: 'p', WYE_URL: 'http://x', PATH: '/bin' });
    expect(e.WYE_SESSION).toBeUndefined(); expect(e.WF_SESSION).toBeUndefined();
  });
});
