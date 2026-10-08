import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanLaunch, splitArgs, modelFor, resolveModel, claudeLaunchArgs, codexLaunchArgs, launchLine } from './agent-launch';
import { writeSettings, readSettings, launchSettings, publicSettings } from './settings';

// how an agent is launched (decision:wf2.agent-launch): the settings as stored, a card's `model:`, the arguments
describe('agent launch', () => {
  it('settings: known agents only, an unknown mode, effort or model dropped', () => {
    expect(cleanLaunch(undefined)).toEqual({ 'claude-code': {}, codex: {} });
    expect(cleanLaunch({ 'claude-code': { model: ' opus ', mode: 'auto', effort: 'high', args: '  --verbose   --x 1 ' }, codex: { model: '--oops', mode: 'acceptEdits', effort: 'max' }, gpt: { model: 'x' } }))
      .toEqual({ 'claude-code': { model: 'opus', mode: 'auto', effort: 'high', args: '--verbose --x 1' }, codex: {} });
    // the first mode is what runs with nothing chosen: not stored
    expect(cleanLaunch({ 'claude-code': { mode: 'default' }, codex: { mode: 'workspace-write' } })).toEqual({ 'claude-code': {}, codex: {} });
  });
  it('settings: an agent the patch names is replaced whole, the other kept', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wf-launch-'));
    await writeSettings({ launch: { 'claude-code': { model: 'opus', mode: 'auto' }, codex: { mode: 'yolo' } } }, root);
    await writeSettings({ launch: { 'claude-code': { effort: 'low' } } }, root);
    expect(launchSettings(await readSettings(root))).toEqual({ 'claude-code': { effort: 'low' }, codex: { mode: 'yolo' } });
    await writeSettings({ agents: { parallel: 2 } }, root);
    expect(publicSettings(await readSettings(root)).launch.codex).toEqual({ mode: 'yolo' });
  });
  it('the person\'s own flags: split on spaces, quotes keep a value together', () => {
    expect(splitArgs('')).toEqual([]);
    expect(splitArgs('--asdfads')).toEqual(['--asdfads']);
    expect(splitArgs(`--settings '{"a": 1}' -c model="o3"  --name "my run" --empty ''`)).toEqual(['--settings', '{"a": 1}', '-c', 'model=o3', '--name', 'my run', '--empty', '']);
  });
  it('a card\'s model: a bare name for any agent, agent=name for one', () => {
    expect(modelFor('opus', 'claude-code')).toBe('opus');
    expect(modelFor('opus', 'codex')).toBe('opus');
    expect(modelFor('claude-code=opus codex=gpt-5.1-codex', 'codex')).toBe('gpt-5.1-codex');
    expect(modelFor('claude-code=opus', 'codex')).toBe('');
    expect(modelFor('sonnet, codex=gpt-5', 'codex')).toBe('gpt-5');
    expect(modelFor('sonnet, codex=gpt-5', 'claude-code')).toBe('sonnet');
    expect(modelFor('--dangerously-skip-permissions', 'claude-code')).toBe('');
    expect(modelFor(undefined, 'claude-code')).toBe('');
  });
  it('the model: the session\'s, the stage\'s, the skill\'s, the workflow\'s, the app\'s — the first that names one', () => {
    const app = { from: 'Settings › Agents', value: 'sonnet' };
    expect(resolveModel('claude-code', [{ from: 'this session' }, { from: 'skill:prd', value: 'opus' }, { from: 'workflow:feature', value: 'haiku' }, app])).toEqual({ model: 'opus', from: 'skill:prd' });
    expect(resolveModel('claude-code', [{ from: 'this session', value: 'fable' }, { from: 'skill:prd', value: 'opus' }, app])).toEqual({ model: 'fable', from: 'this session' });
    expect(resolveModel('claude-code', [{ from: 'skill:prd', value: 'codex=gpt-5' }, { from: 'workflow:feature', value: 'haiku' }, app])).toEqual({ model: 'haiku', from: 'workflow:feature' });
    expect(resolveModel('claude-code', [{ from: 'skill:prd' }, app])).toEqual({ model: 'sonnet', from: 'Settings › Agents' });
    expect(resolveModel('codex', [{ from: 'skill:prd' }])).toBeNull();
  });
  it('claude: model, mode, effort, own flags; a librarian follows the same mode; a scheduled job only its model', () => {
    expect(claudeLaunchArgs({})).toEqual([]);
    expect(claudeLaunchArgs({ mode: 'auto', effort: 'high', args: '--asdfads' }, { model: 'opus' })).toEqual(['--model', 'opus', '--permission-mode', 'auto', '--effort', 'high', '--asdfads']);
    expect(claudeLaunchArgs({ mode: 'bypassPermissions' })).toEqual(['--dangerously-skip-permissions']);
    expect(claudeLaunchArgs({ mode: 'bypassPermissions', effort: 'low' }, { librarian: true })).toEqual(['--dangerously-skip-permissions', '--effort', 'low']);
    expect(claudeLaunchArgs({ mode: 'auto', args: '--x' }, { model: 'opus', own: true })).toEqual(['--model', 'opus']);
  });
  it('codex: the workspace sandbox unless told otherwise; resume takes the sandbox as config', () => {
    expect(codexLaunchArgs({})).toEqual(['--sandbox', 'workspace-write']);
    expect(codexLaunchArgs({}, { resume: true })).toEqual([]);
    // a librarian runs with the mode Settings › Agents gives the agent
    expect(codexLaunchArgs({ mode: 'yolo' }, { librarian: true, model: 'gpt-5' })).toEqual(['--model', 'gpt-5', '--dangerously-bypass-approvals-and-sandbox']);
    expect(codexLaunchArgs({ mode: 'danger-full-access' }, { librarian: true, resume: true })).toEqual(['-c', 'sandbox_mode=danger-full-access']);
    expect(codexLaunchArgs({ mode: 'yolo', effort: 'high' }, { model: 'gpt-5' })).toEqual(['--model', 'gpt-5', '--dangerously-bypass-approvals-and-sandbox', '-c', 'model_reasoning_effort=high']);
    expect(codexLaunchArgs({ mode: 'yolo' }, { resume: true })).toEqual(['--dangerously-bypass-approvals-and-sandbox']);
    expect(codexLaunchArgs({ mode: 'approve-for-me' })).toEqual(['--approve-for-me']);
    expect(codexLaunchArgs({ mode: 'approve-for-me' }, { resume: true })).toEqual([]);
    expect(codexLaunchArgs({ mode: 'read-only', args: '-c a=b' }, { resume: true })).toEqual(['-c', 'sandbox_mode=read-only', '-c', 'a=b']);
    expect(codexLaunchArgs({ mode: 'yolo' }, { own: true })).toEqual([]);
  });
  it('the console line says what was added and where the model came from', () => {
    expect(launchLine('claude-code', {}, null)).toBe('');
    expect(launchLine('claude-code', { mode: 'auto', effort: 'high' }, { model: 'opus', from: 'skill:prd' })).toBe('model opus (skill:prd) · --permission-mode auto · effort high');
    expect(launchLine('claude-code', { mode: 'auto' }, null, { librarian: true })).toBe('--permission-mode auto');
  });
});
