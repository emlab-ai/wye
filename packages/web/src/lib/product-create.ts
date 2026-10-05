// A new product folder, the way the app makes one (POST /api/products) and `wye install --create-product` does: the
// registry entry with its _product.md, an inbox, and one project to hold documents — `main` unless named. With `root`
// (a folder of the person's choosing, decision:wf2.product-folder) the registry entry holds only _product.md with
// `root: <path>`, and the projects and inbox are made in that folder — beside the code, in a repo, wherever it is kept.
import { access, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, listProducts, resolveRoot } from './products';
import { writeAtomic } from './write';

const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };
export async function createProduct(o: { slug: string; title: string; description?: string; icon?: string; project?: string; projectTitle?: string; dataRoot?: string; root?: string }): Promise<{ slug: string; dir: string; project: string }> {
  const dataRoot = o.dataRoot ?? DATA_ROOT;
  const entry = path.join(dataRoot, 'products', o.slug);
  if (await exists(entry)) throw new Error(`conflict: ${o.slug} exists`);
  // the folder the product lives in: the registry entry, or the one the person named — made if it is not there, refused
  // when it is a file, already holds a product (that is Open a folder) or sits inside the app's own products
  const dir = o.root?.trim() ? resolveRoot(o.root.trim()) : entry;
  if (dir !== entry) {
    try { if (!(await stat(dir)).isDirectory()) throw new Error(`invalid: ${dir} is not a folder`); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (await exists(path.join(dir, 'projects'))) throw new Error(`invalid: ${dir} already holds a product — use Open a folder`);
    if ((dir + path.sep).startsWith(path.resolve(dataRoot, 'products') + path.sep)) throw new Error("invalid: that folder is inside the app's products");
    if ((await listProducts(dataRoot)).some(p => path.resolve(p.dir) === dir)) throw new Error(`invalid: ${dir} is another product's folder`);
  }
  const project = o.project || 'main';
  const projectDir = path.join(dir, 'projects', project);
  try {
    await mkdir(path.join(projectDir, 'docs'), { recursive: true });
    await mkdir(path.join(dir, 'inbox'), { recursive: true });
    await mkdir(entry, { recursive: true });
    await writeAtomic(path.join(entry, '_product.md'), `---\ntitle: ${o.title}\nicon: ${o.icon ?? '📦'}\ndescription: ${o.description ?? ''}\n${dir !== entry ? `root: ${dir}\n` : ''}---\n`);
    // every product needs at least one project to hold documents — without it, req:wf2.page.new-dialog's project
    // fallback (projects[0]?.slug ?? '') is empty and "+ New page" silently fails
    const ptitle = o.projectTitle ?? (project === 'main' ? 'Main' : project.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()));
    await writeAtomic(path.join(projectDir, '_project.md'), `---\ntitle: ${ptitle}\nkind: project\nstatus: proposed\nicon: 📁\ndescription:\n---\n`);
  } catch (e) { await rm(entry, { recursive: true, force: true }); throw e; }   // no registry entry pointing at half a product
  return { slug: o.slug, dir, project };
}
