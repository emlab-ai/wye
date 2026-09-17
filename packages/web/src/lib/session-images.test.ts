import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession, getSession, filesDir, imageLines } from './sessions';

// a 1×1 png
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('images pasted into the command box (req:wf2.ui.palette-images)', () => {
  it('become the session\'s files and are listed on the session', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-img-'));
    const s = await createSession(dir, 'p', { agent: 'claude-code', instruction: 'fix the button', mode: 'chat', cwd: dir, images: [{ name: 'shot.png', dataUrl: PNG }, { dataUrl: 'not-a-data-url' }] });
    expect(s.images).toHaveLength(1);
    expect(s.images![0]).toMatch(/\.png$/);
    expect((await readdir(filesDir(dir, s.id)))).toEqual(s.images);
    expect((await stat(path.join(filesDir(dir, s.id), s.images![0]))).size).toBeGreaterThan(0);
    expect((await getSession(dir, s.id))?.images).toEqual(s.images);
  });
  it('are absent from a session without images', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-img-'));
    const s = await createSession(dir, 'p', { agent: 'claude-code', instruction: 'x' });
    expect(s.images).toBeUndefined();
  });
  it('are pointed at under the instruction by path', () => {
    expect(imageLines([])).toBe('');
    expect(imageLines(['/a/b.png', '/a/c.png'])).toBe('\nImages attached to the request (look at them with the Read tool):\n- /a/b.png\n- /a/c.png');
  });
});
