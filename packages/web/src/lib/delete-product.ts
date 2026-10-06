// Deleting a product moves its registry folder into <data>/_trash/<slug>-<stamp> instead of unlinking it: a product is
// months of knowledge, and a rename is recoverable from Finder while rm is not. A product whose folder was moved beside
// its code (`root:` in _product.md — decision:wf2.product-folder) keeps that folder exactly where it is: the app owns
// its registry entry, not a folder someone else's repo holds. A vault of the open workspace (lib/workspace) has no
// entry: its .wye/ folder is what goes to the trash, and its links go with it (decision:wf2.vault-links) — the vault
// above stops naming it and takes its children, each child names that vault as its parent. The note to agents in the
// folder's AGENTS.md / CLAUDE.md stays; it is the person's file.
import { mkdir, rename, access, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, isVaultDir, listProducts, registryDir } from './products';

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
  const entry = await there(registry);
  if (entry) await rename(registry, dest);
  // a vault the workspace found through its links: the entry (when there was one) was only a pointer
  if (product.inWorkspace && product.vault && isVaultDir(product.dir) && dataRoot === DATA_ROOT) {
    const { unlinkVault, bustWorkspace } = await import('./workspace');
    unlinkVault(product.vault.folder);
    const to = entry ? path.join(dest, 'vault') : dest;
    // the trash may be on another disk than the repository: a rename there fails, a copy does not
    try { await rename(product.dir, to); } catch { await cp(product.dir, to, { recursive: true }); await rm(product.dir, { recursive: true, force: true }); }
    bustWorkspace();
    const next = (await listProducts(dataRoot)).find(p => p.inWorkspace)?.slug ?? '';
    return { slug, trashed: to, relocated: false, kept: null, next };
  }
  if (!entry) throw new Error('not_found');
  const next = (await listProducts(dataRoot))[0]?.slug ?? '';
  return { slug, trashed: dest, relocated, kept: relocated ? product.dir : null, next };
}
