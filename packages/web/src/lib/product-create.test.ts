import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProduct } from './product-create';
import { listProducts } from './products';

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'wye-create-'));
const gone = (p: string) => stat(p).then(() => false, () => true);

// a new product in a folder of the person's choosing: the registry entry points at it with `root:`
describe('createProduct with a folder', () => {
  it('makes the folder, puts projects and inbox there, and registers it with root:', async () => {
    const dataRoot = await tmp(); const root = path.join(await tmp(), 'my-app', 'wye');
    const r = await createProduct({ slug: 'my-app', title: 'My app', dataRoot, root });
    expect(r.dir).toBe(root);
    expect((await stat(path.join(root, 'projects/main/docs'))).isDirectory()).toBe(true);
    expect((await stat(path.join(root, 'inbox'))).isDirectory()).toBe(true);
    expect(await readFile(path.join(dataRoot, 'products/my-app/_product.md'), 'utf8')).toContain(`root: ${root}\n`);
    expect(await gone(path.join(dataRoot, 'products/my-app/projects'))).toBe(true);
    expect((await listProducts(dataRoot)).find(p => p.slug === 'my-app')?.dir).toBe(root);
  });
  it('without a folder stays in the registry, with no root: line', async () => {
    const dataRoot = await tmp();
    const r = await createProduct({ slug: 'a', title: 'A', dataRoot });
    expect(r.dir).toBe(path.join(dataRoot, 'products/a'));
    expect(await readFile(path.join(r.dir, '_product.md'), 'utf8')).not.toContain('root:');
  });
  it('refuses a file, a folder that already holds a product, and leaves no registry entry', async () => {
    const dataRoot = await tmp(); const base = await tmp();
    const file = path.join(base, 'f.txt'); await writeFile(file, 'x');
    await expect(createProduct({ slug: 'b', title: 'B', dataRoot, root: file })).rejects.toThrow(/not a folder/);
    const taken = path.join(base, 'taken'); await mkdir(path.join(taken, 'projects'), { recursive: true });
    await expect(createProduct({ slug: 'b', title: 'B', dataRoot, root: taken })).rejects.toThrow(/already holds a product/);
    expect(await gone(path.join(dataRoot, 'products/b'))).toBe(true);
  });
});
