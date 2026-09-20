import { describe, it, expect } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readSettings, writeSettings, jevKey, publicSettings } from './settings';

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
    expect(publicSettings(s)).toEqual({ jev: { set: true, last4: '1234' } });
    const mode = (await stat(path.join(root, '_settings.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
    const gone = await writeSettings({ jev: { key: '' } }, root);
    expect(gone.jev?.key ?? '').toBe('');
    expect(publicSettings(gone)).toEqual({ jev: { set: false, last4: '' } });
  });
});
