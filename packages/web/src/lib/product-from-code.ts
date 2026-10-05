// A product from a code folder (Add a product › From your code): what `wye init --product <slug> --repo <dir> --title
// "…"` does, through the same code (lib/init.js) — the registry entry with `repo:`, the layered definition read from the
// folder's surface (modules, pages, components, operations, tests, one #ready describe task per module), no model, the
// folder untouched — then an inbox and the built graph. The folder is checked before anything is written, and a
// failure on the way removes what was made, so a refusal never leaves half a product.
import { createRequire } from 'node:module';
import { access, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, REPO_ROOT, registryDir, resolveRoot } from './products';
import { slugify } from './templates';
import { rebuild } from './write';

const req = createRequire(path.join(REPO_ROOT, 'package.json'));
type Init = (o: { dataRoot: string; product: string; title: string; repo: string; icon?: string; description?: string }) => { made: { written: string[] } };
const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

export async function productFromCode(o: { title: string; repo: string; icon?: string; description?: string; dataRoot?: string }): Promise<{ slug: string; dir: string; written: number }> {
  const dataRoot = o.dataRoot ?? DATA_ROOT;
  const title = (o.title ?? '').trim(); if (!title) throw new Error('invalid: a title is required');
  if (!(o.repo ?? '').trim()) throw new Error('invalid: the folder with the code is required');
  const repo = resolveRoot(o.repo.trim());
  const st = await stat(repo).catch(() => null);
  if (!st) throw new Error(`invalid: ${repo} does not exist`);
  if (!st.isDirectory()) throw new Error(`invalid: ${repo} is a file, not a folder`);
  const slug = slugify(title), dir = registryDir(slug, dataRoot);
  if (await exists(dir)) throw new Error(`conflict: ${slug} exists`);
  try {
    const { init } = req('./lib/init.js') as { init: Init };
    const r = init({ dataRoot, product: slug, title, repo, icon: o.icon || undefined, description: o.description?.trim() || undefined });
    await mkdir(path.join(dir, 'inbox'), { recursive: true });
    await rebuild(dir);
    return { slug, dir, written: r.made.written.length };
  } catch (e) { await rm(dir, { recursive: true, force: true }); throw e; }
}
