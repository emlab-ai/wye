import { describe, it, expect } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readSettings, writeSettings, jevKey, publicSettings, agentSettings } from './settings';

// the app's settings (Jev auto-linking design §0): one json file under the data root, never committed, the key never
// returned to a browser
describe('settings', () => {
  it('round-trips, keeps the key out of the public view, removes on empty', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wf-settings-'));
    expect(await readSettings(root)).toEqual({});
    expect(await jevKey(root)).toBe('');
    const s = await writeSettings({ jev: { key: 'sk-abcdef1234' } }, root);
    expect(s.jev?.key).toBe('sk-abcdef1234');
    expect(await jevKey(root)).toBe('sk-abcdef1234');
    expect(publicSettings(s).jev).toEqual({ set: true, last4: '1234' });
    const mode = (await stat(path.join(root, '_settings.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
    const gone = await writeSettings({ jev: { key: '' } }, root);
    expect(gone.jev?.key ?? '').toBe('');
    expect(publicSettings(gone).jev).toEqual({ set: false, last4: '' });
  });
  it('agents: defaults, the clamp on parallel, an unknown agent falls back', async () => {
    expect(agentSettings({})).toEqual({ parallel: 1, agent: 'claude-code' });
    expect(agentSettings({ agents: { parallel: 20, agent: 'codex' } })).toEqual({ parallel: 8, agent: 'codex' });
    expect(agentSettings({ agents: { parallel: 0, agent: 'gpt' } })).toEqual({ parallel: 1, agent: 'claude-code' });
    const root = await mkdtemp(path.join(os.tmpdir(), 'wf-settings-'));
    await writeSettings({ agents: { parallel: 3 } }, root);
    expect(publicSettings(await readSettings(root)).agents).toEqual({ parallel: 3, agent: 'claude-code' });
  });
});
