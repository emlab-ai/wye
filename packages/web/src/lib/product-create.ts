// A new product folder, the way the app makes one (POST /api/products) and `wye install --create-product` does: the
// registry entry with its _product.md, an inbox, and one project to hold documents — `main` unless named.
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT } from './products';
import { writeAtomic } from './write';

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };
export async function createProduct(o: { slug: string; title: string; description?: string; icon?: string; project?: string; projectTitle?: string; dataRoot?: string }): Promise<{ slug: string; dir: string; project: string }> {
  const dir = path.join(o.dataRoot ?? DATA_ROOT, 'products', o.slug);
  if (await exists(dir)) throw new Error(`conflict: ${o.slug} exists`);
  const project = o.project || 'main';
  const projectDir = path.join(dir, 'projects', project);
  await mkdir(path.join(projectDir, 'docs'), { recursive: true });
  await mkdir(path.join(dir, 'inbox'), { recursive: true });
  await writeAtomic(path.join(dir, '_product.md'), `---\ntitle: ${o.title}\nicon: ${o.icon ?? '📦'}\ndescription: ${o.description ?? ''}\n---\n`);
  // every product needs at least one project to hold documents — without it, req:wf2.page.new-dialog's project
  // fallback (projects[0]?.slug ?? '') is empty and "+ New page" silently fails
  const ptitle = o.projectTitle ?? (project === 'main' ? 'Main' : project.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()));
  await writeAtomic(path.join(projectDir, '_project.md'), `---\ntitle: ${ptitle}\nkind: project\nstatus: proposed\nicon: 📁\ndescription:\n---\n`);
  return { slug: o.slug, dir, project };
}
