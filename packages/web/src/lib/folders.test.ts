import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listFolders, makeFolder } from './folders';

describe('listFolders', () => {
  it('lists folders only, sorted, without hidden ones or node_modules, and marks a product folder', async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), 'wye-folders-'));
    for (const n of ['b', 'A', '.git', 'node_modules', 'shop/projects']) await mkdir(path.join(d, n), { recursive: true });
    await writeFile(path.join(d, 'file.txt'), 'x');
    const r = await listFolders(d);
    expect(r.path).toBe(d); expect(r.parent).toBe(path.dirname(d));
    expect(r.folders).toEqual([{ name: 'A', product: false }, { name: 'b', product: false }, { name: 'shop', product: true }]);
    expect((await listFolders(d, { hidden: true })).folders.map(f => f.name)).toContain('.git');
    expect((await listFolders(path.join(d, 'shop'))).product).toBe(true);
  });
  it('an empty path is the home folder; a missing path or a file answers with the nearest folder', async () => {
    expect((await listFolders('')).path).toBe(os.homedir());
    const d = await mkdtemp(path.join(os.tmpdir(), 'wye-folders-')); await writeFile(path.join(d, 'f'), 'x');
    expect((await listFolders(path.join(d, 'no', 'such'))).path).toBe(d);
    expect((await listFolders(path.join(d, 'f'))).path).toBe(d);
  });
  it('makes a folder under an existing one and refuses a name with a slash', async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), 'wye-folders-'));
    expect(await makeFolder(d, 'wye')).toBe(path.join(d, 'wye'));
    await expect(makeFolder(d, 'a/b')).rejects.toThrow(/invalid/);
    await expect(makeFolder(d, '..')).rejects.toThrow(/invalid/);
  });
});
