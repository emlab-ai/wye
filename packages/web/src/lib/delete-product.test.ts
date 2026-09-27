import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deleteProduct } from './delete-product';

// a data root with the products named, each holding one document; `root` relocates a product's folder the way
// _product.md's `root:` does (decision:wf2.product-folder)
async function dataRoot(products: { slug: string; root?: string }[]): Promise<string> {
  const data = await mkdtemp(path.join(os.tmpdir(), 'wf-del-'));
  for (const p of products) {
    const reg = path.join(data, 'products', p.slug);
    await mkdir(reg, { recursive: true });
    await writeFile(path.join(reg, '_product.md'), `---\ntitle: ${p.slug}\n${p.root ? `root: ${p.root}\n` : ''}---\n`);
    const docs = path.join(p.root ?? reg, 'projects/main/docs');
    await mkdir(docs, { recursive: true });
    await writeFile(path.join(docs, 'intro.md'), '# Intro\n');
  }
  return data;
}
const gone = async (p: string) => { try { await access(p); return false; } catch { return true; } };

// Deleting a product moves its folder into the data root's _trash rather than unlinking it: recoverable from Finder,
// and a product whose knowledge lives beside its code keeps that folder where it is.
describe('deleteProduct', () => {
  it('moves a product in the data folder to _trash, documents and all', async () => {
    const data = await dataRoot([{ slug: 'samsara' }, { slug: 'wye' }]);
    const r = await deleteProduct('samsara', data);
    expect(r.relocated).toBe(false);
    expect(await gone(path.join(data, 'products/samsara'))).toBe(true);
    const trashed = await readdir(path.join(data, '_trash'));
    expect(trashed).toHaveLength(1);
    expect(trashed[0]).toMatch(/^samsara-\d{8}-\d{6}$/);
    expect(await readFile(path.join(data, '_trash', trashed[0], 'projects/main/docs/intro.md'), 'utf8')).toBe('# Intro\n');
  });

  it('leaves a relocated product\'s folder where it is, and trashes only the registry entry', async () => {
    const beside = await mkdtemp(path.join(os.tmpdir(), 'wf-code-'));
    const data = await dataRoot([{ slug: 'samsara', root: beside }, { slug: 'wye' }]);
    const r = await deleteProduct('samsara', data);
    expect(r.relocated).toBe(true);
    expect(r.kept).toBe(beside);
    expect(await gone(path.join(data, 'products/samsara'))).toBe(true);
    // the knowledge beside the code is untouched
    expect(await readFile(path.join(beside, 'projects/main/docs/intro.md'), 'utf8')).toBe('# Intro\n');
  });

  it('names the product to land on next, and none when that was the last one', async () => {
    const two = await dataRoot([{ slug: 'samsara' }, { slug: 'wye' }]);
    expect((await deleteProduct('samsara', two)).next).toBe('wye');
    const one = await dataRoot([{ slug: 'samsara' }]);
    expect((await deleteProduct('samsara', one)).next).toBe('');
  });

  it('refuses a product that is not there', async () => {
    const data = await dataRoot([{ slug: 'wye' }]);
    await expect(deleteProduct('samsara', data)).rejects.toThrow(/not_found/);
  });

  it('keeps an earlier deletion of the same slug', async () => {
    const data = await dataRoot([{ slug: 'samsara' }]);
    await deleteProduct('samsara', data);
    await mkdir(path.join(data, 'products/samsara'), { recursive: true });
    await writeFile(path.join(data, 'products/samsara/_product.md'), '---\ntitle: samsara\n---\n');
    await deleteProduct('samsara', data);
    expect(await readdir(path.join(data, '_trash'))).toHaveLength(2);
  });
});
