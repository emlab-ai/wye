// Deleting a product moves its registry folder into <data>/_trash/<slug>-<stamp> instead of unlinking it: a product is
// months of knowledge, and a rename is recoverable from Finder while rm is not. A product whose folder was moved beside
// its code (`root:` in _product.md — decision:wf2.product-folder) keeps that folder exactly where it is: the app owns
// its registry entry, not a folder someone else's repo holds.
import { mkdir, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, listProducts, registryDir } from './products';

export interface Deleted {
  slug: string;
  trashed: string;  // where the registry folder went
  relocated: boolean; // the product kept its documents outside the data folder
  kept: string | null; // that folder, left untouched
  next: string; // the product to land on now, '' when that was the last one
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const there = async (p: string) => { try { await access(p); return true; } catch { return false; } };

export async function deleteProduct(slug: string, dataRoot: string = DATA_ROOT): Promise<Deleted> {
  const product = (await listProducts(dataRoot)).find(p => p.slug === slug);
  if (!product) throw new Error('not_found');
  const registry = registryDir(slug, dataRoot);
  const relocated = path.resolve(product.dir) !== path.resolve(registry);
  const trash = path.join(dataRoot, '_trash');
  await mkdir(trash, { recursive: true });
  // the stamp is to the second, so a slug deleted twice within one second still gets its own folder
  let dest = path.join(trash, `${slug}-${stamp()}`);
  for (let n = 2; await there(dest); n++) dest = path.join(trash, `${slug}-${stamp()}-${n}`);
  await rename(registry, dest);
  const next = (await listProducts(dataRoot))[0]?.slug ?? '';
  return { slug, trashed: dest, relocated, kept: relocated ? product.dir : null, next };
}
