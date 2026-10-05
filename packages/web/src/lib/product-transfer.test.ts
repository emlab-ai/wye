import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { archiveProblems, exportProduct, importProduct, openProduct, portableMeta } from './product-transfer';

// a data root holding the products named, each with one document, a session log and a built graph — what an export
// should carry and what it should leave behind; `root` relocates the product's folder (decision:wf2.product-folder)
async function dataRoot(products: { slug: string; title?: string; root?: string }[]): Promise<string> {
  const data = await mkdtemp(path.join(os.tmpdir(), 'wf-xfer-'));
  for (const p of products) {
    const reg = path.join(data, 'products', p.slug);
    await mkdir(reg, { recursive: true });
    await writeFile(path.join(reg, '_product.md'), `---\ntitle: ${p.title ?? p.slug}\nicon: 🛒\n${p.root ? `root: ${p.root}\n` : ''}---\n`);
    const dir = p.root ?? reg;
    await mkdir(path.join(dir, 'projects/main/docs'), { recursive: true });
    await writeFile(path.join(dir, 'projects/main/_project.md'), '---\ntitle: Main\n---\n');
    await writeFile(path.join(dir, 'projects/main/docs/prd.md'), '# PRD\n\nreq:refund.window Customers may ask for a refund within 30 days.\n');
    await mkdir(path.join(dir, '_sessions'), { recursive: true });
    await writeFile(path.join(dir, '_sessions/s1.md'), 'a session log\n');
  }
  return data;
}
const there = async (p: string) => { try { await access(p); return true; } catch { return false; } };
const names = (tgz: Buffer) => spawnSync('tar', ['-tzf', '-'], { input: tgz }).stdout.toString().split('\n').filter(Boolean).map(n => n.replace(/^\.\//, ''));

describe('portableMeta', () => {
  it('drops root: — a path on this machine — and keeps the rest', () => {
    expect(portableMeta('---\ntitle: Shop\nroot: /Users/a/shop/wye\nicon: 🛒\n---\nbody\n')).toBe('---\ntitle: Shop\nicon: 🛒\n---\nbody\n');
  });
});

describe('archiveProblems', () => {
  it('accepts a product: _product.md, projects/, inbox/', () => {
    expect(archiveProblems(['_product.md', 'projects/', 'projects/main/docs/prd.md', 'inbox/'], ['-', 'd', '-', 'd'])).toEqual([]);
  });
  it('refuses paths outside the product, links, and folders a product does not have', () => {
    const bad = archiveProblems(['../evil.sh', '/etc/passwd', 'projects/main/docs/x.md', '_sessions/s.md', 'projects/link'], ['-', '-', '-', '-', 'l']);
    expect(bad).toHaveLength(4);
    expect(bad.join('\n')).toMatch(/\.\.\/evil\.sh: outside/);
    expect(bad.join('\n')).toMatch(/\/etc\/passwd: outside/);
    expect(bad.join('\n')).toMatch(/_sessions\/s\.md: not part of a Wye product/);
    expect(bad.join('\n')).toMatch(/projects\/link: links/);
  });
});

describe('export and import', () => {
  it('exports what the product knows and leaves this machine\'s history behind', async () => {
    const beside = await mkdtemp(path.join(os.tmpdir(), 'wf-code-'));
    const data = await dataRoot([{ slug: 'shop', title: 'Shop', root: beside }]);
    const { file, data: tgz } = await exportProduct('shop', data);
    expect(file).toBe('shop.wye.tgz');
    const n = names(tgz);
    expect(n).toContain('_product.md');
    expect(n).toContain('projects/main/docs/prd.md');
    expect(n.some(x => x.startsWith('_sessions'))).toBe(false);
    const meta = spawnSync('tar', ['-xzOf', '-', '_product.md'], { input: tgz }).stdout.toString();
    expect(meta).not.toMatch(/root:/);
    expect(meta).toMatch(/title: Shop/);
  });

  it('imports an export as a new product under a free slug, documents intact', async () => {
    const from = await dataRoot([{ slug: 'shop', title: 'Shop' }]);
    const { data: tgz } = await exportProduct('shop', from);
    const to = await dataRoot([{ slug: 'shop', title: 'Shop' }]);   // the name is taken here
    const r = await importProduct(tgz, { dataRoot: to });
    expect(r.slug).toBe('shop-2');
    expect(await readFile(path.join(to, 'products/shop-2/projects/main/docs/prd.md'), 'utf8')).toMatch(/req:refund\.window/);
    expect(await there(path.join(to, 'products/shop-2/inbox'))).toBe(true);
    expect(await there(path.join(to, 'products/shop-2/_build/graph.json'))).toBe(true);
  });

  it('refuses an archive that is not a product, and writes nothing', async () => {
    const work = await mkdtemp(path.join(os.tmpdir(), 'wf-bad-'));
    await mkdir(path.join(work, 'src'), { recursive: true });
    await writeFile(path.join(work, 'src/app.js'), 'x\n');
    const tgz = spawnSync('tar', ['-czf', '-', '-C', work, 'src']).stdout;
    const to = await dataRoot([]);
    await expect(importProduct(tgz, { dataRoot: to })).rejects.toThrow(/not part of a Wye product/);
    const left = spawnSync('ls', ['-A', path.join(to, 'products')]).stdout.toString().trim();
    expect(left).toBe('');
  });
});

describe('openProduct', () => {
  it('registers a folder in place — a repo\'s wye/ folder — named by its own _product.md', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'wf-repo-'));
    await mkdir(path.join(repo, 'wye/projects/main/docs'), { recursive: true });
    await writeFile(path.join(repo, 'wye/_product.md'), '---\ntitle: Kitchen POS\nicon: 🍳\nroot: /elsewhere\n---\n');
    await writeFile(path.join(repo, 'wye/projects/main/docs/prd.md'), '# PRD\n');
    const data = await dataRoot([]);
    const r = await openProduct(repo, { dataRoot: data });
    expect(r.slug).toBe('kitchen-pos');
    expect(r.dir).toBe(path.join(repo, 'wye'));
    expect(r.existing).toBe(false);
    const reg = await readFile(path.join(data, 'products/kitchen-pos/_product.md'), 'utf8');
    expect(reg).toMatch(/title: Kitchen POS/);
    expect(reg).toMatch(new RegExp(`root: ${path.join(repo, 'wye').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(reg).not.toMatch(/root: \/elsewhere/);
    // opening it again answers with the same product
    expect(await openProduct(path.join(repo, 'wye'), { dataRoot: data })).toMatchObject({ slug: 'kitchen-pos', existing: true });
  });

  it('refuses a folder that holds no product', async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), 'wf-empty-'));
    await expect(openProduct(empty, { dataRoot: await dataRoot([]) })).rejects.toThrow(/not a Wye product folder/);
  });

  it('refuses a link that came inside an archive, rather than following it', async () => {
    const data = await dataRoot([{ slug: 'shop' }]);
    await symlink('/etc', path.join(data, 'products/shop/projects/main/docs/etc'));
    const { data: tgz } = await exportProduct('shop', data);
    const to = await dataRoot([]);
    // the export carries the link as a link; import refuses it rather than following it
    await expect(importProduct(tgz, { dataRoot: to })).rejects.toThrow(/links and special files/);
  });
});
