// Init Wye here (req:wf2.vault-init): a vault for a folder, the way `wye init` in that folder makes one — through the
// same code (lib/vault.js): <folder>/.wye/ with the shallow definition of the folder's code, _agent.md, the note to
// agents in AGENTS.md / CLAUDE.md, and the parent / child links on both sides — then opened in place and built, so it
// is a product in the app at once (decision:wf2.vault-first-slice). A folder that has a vault is opened, never rewritten.
import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, REPO_ROOT, resolveRoot } from './products';
import { openProduct } from './product-transfer';

const req = createRequire(path.join(REPO_ROOT, 'package.json'));
interface VaultInit { existing: boolean; folder: string; dir: string; slug: string; title: string; parent?: string | null; children?: string[]; linked?: string[]; made?: { written: string[]; skipped: string[] } }

export async function initVaultHere(o: { folder: string; slug?: string; title?: string; dataRoot?: string }): Promise<{ slug: string; vault: string; dir: string; folder: string; existing: boolean; written: number; parent: string | null; children: string[]; linked: string[] }> {
  if (!(o.folder ?? '').trim()) throw new Error('invalid: a folder is required');
  const folder = resolveRoot(o.folder.trim());
  const st = await stat(folder).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`invalid: ${folder} is not a folder`);
  const dataRoot = o.dataRoot ?? DATA_ROOT;
  if ((folder + path.sep).startsWith(path.resolve(dataRoot, 'products') + path.sep)) throw new Error("invalid: that folder is inside the app's products");
  // CommonJS, kept in Node's module cache, which Next's reload does not touch (lib/build.ts): in development the two
  // files are read again, so an edit of lib/vault.js or lib/init.js is what runs
  if (process.env.NODE_ENV !== 'production') for (const m of ['./lib/vault.js', './lib/init.js']) { try { delete req.cache[req.resolve(m)]; } catch { /* not cached */ } }
  const { initVault } = req('./lib/vault.js') as { initVault: (o: { folder: string; slug?: string; title?: string }) => VaultInit };
  const v = initVault({ folder, slug: o.slug, title: o.title });
  const opened = await openProduct(v.dir, { dataRoot });
  return { slug: opened.slug, vault: v.slug, dir: v.dir, folder, existing: v.existing, written: v.made?.written.length ?? 0, parent: v.parent ?? null, children: v.children ?? [], linked: v.linked ?? [] };
}
