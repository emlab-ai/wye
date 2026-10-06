import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inside, languageOf, listDir, readFileAt } from './files';

// The Files section's reads (req:wf2.workspace-files): a path stays inside its root; a listing leaves out what git
// ignores, build folders and a vault's own folder unless asked; a folder with a vault says so; a binary or a large
// file is named, not sent.
describe('the files of an open folder', () => {
  let root = '';
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wye-files-')));
    for (const d of ['src', 'node_modules/x', 'dist', 'secret', 'svc/.wye', '.git']) await mkdir(path.join(root, d), { recursive: true });
    await writeFile(path.join(root, 'src/a.ts'), 'export const a = 1;\n');
    await writeFile(path.join(root, 'README.md'), '# hi\n');
    await writeFile(path.join(root, '.gitignore'), 'secret\n*.log\n');
    await writeFile(path.join(root, 'run.log'), 'x\n');
    await writeFile(path.join(root, 'svc/.wye/_product.md'), '---\ntitle: Svc\nslug: svc\n---\n');
    await writeFile(path.join(root, 'bin.dat'), Buffer.from([1, 2, 0, 3]));
    await writeFile(path.join(root, 'big.txt'), 'x'.repeat(1024 * 1024 + 1));
    try { execFileSync('git', ['init', '-q', root]); } catch { /* no git: the build folders are still left out */ }
  });
  it('keeps a path inside the root', () => {
    expect(inside(root, 'src/a.ts')).toEqual({ abs: path.join(root, 'src/a.ts'), rel: 'src/a.ts' });
    expect(inside(root, '')).toEqual({ abs: root, rel: '' });
    expect(inside(root, '../x')).toBeNull(); expect(inside(root, 'src/../../x')).toBeNull();
    expect(inside(root, '/etc/passwd')?.abs).toBe(path.join(root, 'etc/passwd')); // a leading slash is the root's own
  });
  it('lists folders first, without what git ignores, build folders, .git or a vault\'s own folder', async () => {
    const names = (await listDir(root)).map(e => e.name);
    expect(names.slice(0, 2)).toEqual(['src', 'svc']);
    expect(names).toEqual(expect.arrayContaining(['.gitignore', 'README.md', 'bin.dat', 'big.txt']));
    for (const gone of ['node_modules', 'dist', '.git', 'secret', 'run.log']) expect(names).not.toContain(gone);
    expect((await listDir(root)).find(e => e.name === 'svc')).toMatchObject({ dir: true, vault: true });
    expect((await listDir(path.join(root, 'svc'))).map(e => e.name)).toEqual([]);
  });
  it('shows them all when asked — marked — but never .git', async () => {
    const all = await listDir(root, { hidden: true });
    expect(all.find(e => e.name === 'node_modules')).toMatchObject({ dir: true, ignored: true });
    expect(all.find(e => e.name === 'secret')?.ignored).toBe(true);
    expect(all.map(e => e.name)).not.toContain('.git');
    expect((await listDir(path.join(root, 'svc'), { hidden: true })).map(e => e.name)).toEqual(['.wye']);
  });
  it('reads a text file with its language; names a binary or a large one without its bytes', async () => {
    expect(await readFileAt(path.join(root, 'src/a.ts'), 'src/a.ts')).toMatchObject({ language: 'typescript', text: 'export const a = 1;\n', size: 20 });
    expect(await readFileAt(path.join(root, 'bin.dat'), 'bin.dat')).toMatchObject({ binary: true }); expect(await readFileAt(path.join(root, 'bin.dat'), 'bin.dat')).not.toHaveProperty('text');
    expect(await readFileAt(path.join(root, 'big.txt'), 'big.txt')).toMatchObject({ large: true });
    expect(languageOf('Dockerfile')).toBe('dockerfile'); expect(languageOf('x.unknown')).toBe('plaintext');
  });
});

// the Files menu's operations (op:api.workspace-files POST): every path inside the root, a free name on a collision
describe('file operations', () => {
  it('renames, makes, moves and copies inside the root and refuses what leaves it', async () => {
    const { fileOp } = await import('./files');
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wye-fileop-')));
    await mkdir(path.join(root, 'a/b'), { recursive: true }); await writeFile(path.join(root, 'a/x.ts'), 'x');
    expect(await fileOp(root, { op: 'rename', path: 'a/x.ts', name: 'y.ts' })).toEqual({ path: 'a/y.ts' });
    await expect(fileOp(root, { op: 'rename', path: 'a/y.ts', name: '../z.ts' })).rejects.toThrow(/without slashes/);
    expect(await fileOp(root, { op: 'mkdir', path: 'a', name: 'c' })).toEqual({ path: 'a/c' });
    expect(await fileOp(root, { op: 'newfile', path: '', name: 'README.md' })).toEqual({ path: 'README.md' });
    expect(await fileOp(root, { op: 'copy', path: 'a/y.ts', into: 'a/b' })).toEqual({ path: 'a/b/y.ts' });
    expect(await fileOp(root, { op: 'copy', path: 'a/y.ts', into: 'a/b' })).toEqual({ path: 'a/b/y-2.ts' });
    expect(await fileOp(root, { op: 'move', path: 'a/y.ts', into: 'a/c' })).toEqual({ path: 'a/c/y.ts' });
    expect((await listDir(path.join(root, 'a'))).map(e => e.name)).toEqual(['b', 'c']);
    await expect(fileOp(root, { op: 'move', path: 'a', into: 'a/b' })).rejects.toThrow(/into itself/);
    await expect(fileOp(root, { op: 'move', path: '../etc', into: 'a' })).rejects.toThrow(/leaves/);
    await expect(fileOp(root, { op: 'delete', path: '' })).rejects.toThrow(/not the open folder itself/);
  });
});
