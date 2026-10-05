import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { productFromCode } from './product-from-code';

const there = async (p: string) => { try { await access(p); return true; } catch { return false; } };
const data = () => mkdtemp(path.join(os.tmpdir(), 'wf-fromcode-data-'));
// a repo with two source files in one area, each with the header comment init reads as its purpose
async function repo(): Promise<string> {
  const r = await mkdtemp(path.join(os.tmpdir(), 'wf-fromcode-repo-'));
  await mkdir(path.join(r, 'src'), { recursive: true });
  await writeFile(path.join(r, 'src/cart.ts'), '// The cart: lines, totals, the discount.\nexport const cart = 1;\n');
  await writeFile(path.join(r, 'src/checkout.ts'), '// Checkout: pay for the cart.\nexport const pay = 1;\n');
  return r;
}

describe('productFromCode', () => {
  it('makes the product the way wye init does, with repo:, a first definition and a built graph', async () => {
    const d = await data(), r = await repo();
    const res = await productFromCode({ title: 'Kitchen POS', repo: r, dataRoot: d });
    expect(res.slug).toBe('kitchen-pos');
    const dir = path.join(d, 'products', 'kitchen-pos');
    expect(res.dir).toBe(dir);
    const meta = await readFile(path.join(dir, '_product.md'), 'utf8');
    expect(meta).toMatch(/^title: Kitchen POS$/m);
    expect(meta).toMatch(new RegExp(`^repo: ${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    const docs = await readdir(path.join(dir, 'projects', 'main', 'docs'));
    expect(docs).toContain('kitchen-pos.md');
    expect(docs.length).toBeGreaterThan(1);
    expect(res.written).toBeGreaterThan(1);
    expect(await there(path.join(dir, 'inbox'))).toBe(true);
    const graph = JSON.parse(await readFile(path.join(dir, '_build', 'graph.json'), 'utf8')) as { nodes: { id: string }[] };
    expect(graph.nodes.some(n => n.id === 'module:kitchen-pos')).toBe(true);
  });

  it('refuses a folder that does not exist, a file, and no folder — and leaves no product behind', async () => {
    const d = await data(), r = await repo();
    await expect(productFromCode({ title: 'Gone', repo: path.join(r, 'nope'), dataRoot: d })).rejects.toThrow(/^invalid: .*does not exist/);
    await expect(productFromCode({ title: 'File', repo: path.join(r, 'src/cart.ts'), dataRoot: d })).rejects.toThrow(/^invalid: .*not a folder/);
    await expect(productFromCode({ title: 'Empty', repo: '  ', dataRoot: d })).rejects.toThrow(/^invalid: /);
    await expect(productFromCode({ title: '', repo: r, dataRoot: d })).rejects.toThrow(/^invalid: /);
    expect(await readdir(path.join(d, 'products')).catch(() => [])).toEqual([]);
  });

  it('expands ~ to the home folder', async () => {
    const d = await data();
    const name = `wf-fromcode-missing-${process.pid}-${Date.now()}`;
    await expect(productFromCode({ title: 'Home', repo: `~/${name}`, dataRoot: d })).rejects.toThrow(path.join(os.homedir(), name));
  });

  it('refuses a title whose product exists and leaves that product as it was', async () => {
    const d = await data(), r = await repo();
    await mkdir(path.join(d, 'products', 'shop'), { recursive: true });
    await writeFile(path.join(d, 'products', 'shop', '_product.md'), '---\ntitle: Shop\n---\n');
    await expect(productFromCode({ title: 'Shop', repo: r, dataRoot: d })).rejects.toThrow(/^conflict: /);
    expect(await readdir(path.join(d, 'products', 'shop'))).toEqual(['_product.md']);
  });
});
