import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rm } from 'node:fs/promises';
import { createProduct } from './product-create';
import { loadScope } from './scope';
import { viewPageId } from './pr-docs';
import { hooksPageId, skillsPageId } from './skills';
import { ensureSystemPages } from './system-pages';

// a brand-new product's Goals, Work, Hooks and Skills (onboarding): written on the first visit and built before the
// rail links to them, so a first click never lands on "Page not found"
describe('ensureSystemPages', () => {
  let dir: string; let product: string;
  beforeAll(async () => { product = `zz-sys-${Math.random().toString(36).slice(2, 8)}`; dir = (await createProduct({ slug: product, title: 'Sys' })).dir; });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
  it('writes the pages and answers a scope that has them; a second pass builds nothing', async () => {
    const first = (await loadScope(product))!;
    expect(first.graph.modules.some(m => m.id === viewPageId('main', 'goals'))).toBe(false);
    const after = await ensureSystemPages(first);
    const ids = after.graph.modules.map(m => m.id);
    for (const id of [viewPageId('main', 'goals'), viewPageId('main', 'work'), hooksPageId('main'), skillsPageId('main')]) expect(ids).toContain(id);
    expect(await ensureSystemPages(after)).toBe(after);
  });
});
