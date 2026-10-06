// Server-only registry of products and projects, read from the data folder:
//   <data>/products/<product>/_product.md
//   <data>/products/<product>/projects/<project>/_project.md
//   <data>/products/<product>/projects/<project>/docs/*.md
//   <data>/products/<product>/_build/graph.json      (one graph per product: all its projects' docs)
//   <data>/products/<product>/inbox/                 (dropped inputs, not processed yet)
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// The folder laid out like the Wye checkout that everything reads and writes (bin/wye-home.js): the clone when running
// from source, WYE_HOME (~/.wye) when the package was installed from npm — its data/ is the person's, the rest links in.
export const REPO_ROOT = process.env.WYE_HOME ? path.resolve(process.env.WYE_HOME) : path.resolve(process.cwd(), '../..');
export const DATA_ROOT = process.env.WATERFALL_DATA ? path.resolve(process.cwd(), process.env.WATERFALL_DATA) : path.join(REPO_ROOT, 'data');

// people: the names that can hold work (`people: alex, bo` in _product.md — req:exec.human-work); settings: every
// other frontmatter key as written (`impact: manual`, `auto-take: off`, `verdicts: on`), read by the features they switch
export interface Meta { title: string; icon: string; description: string; kind: string; status: string; repo?: string; people?: string[]; settings: Record<string, string> }
// metaFile: the _product.md the meta was read from and a rename or a setting is written to — the registry entry's, or
// a vault's own. vault: set when the product is a vault (<folder>/.wye, lib/vault.js) — the folder it describes and the
// vault folder above it, from its `parent:` link. inWorkspace: it is one of the open workspace's vaults (lib/workspace).
export interface Product { slug: string; dir: string; graphPath: string; meta: Meta; metaFile?: string; vault?: { folder: string; parent: string | null }; inWorkspace?: boolean }
// docsDir: the person's pages; wyeDir: the pages the app writes (lib/doc SYSTEM_DIR) — never the same folder
export interface Project { slug: string; product: string; dir: string; docsDir: string; meta: Meta; docsRel: string; wyeDir: string }

function parseMeta(md: string, fallbackTitle: string): Meta {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const get = (k: string) => (fm ? (fm[1].match(new RegExp('^' + k + ':\\s*(.*)$', 'm')) ?? [])[1] ?? '' : '').trim();
  const settings: Record<string, string> = {};
  if (fm) for (const l of fm[1].split('\n')) { const m = l.match(/^([a-z][a-z0-9-]*):\s*(.*)$/); if (m) settings[m[1]] = m[2].trim(); }
  const people = get('people').split(/[,\s]+/).filter(Boolean);
  return { title: get('title') || fallbackTitle, icon: get('icon'), description: get('description'), kind: get('kind') || 'project', status: get('status'), repo: get('repo') || undefined, ...(people.length ? { people } : {}), settings };
}
async function readMeta(file: string, fallbackTitle: string): Promise<Meta> {
  try { return parseMeta(await readFile(file, 'utf8'), fallbackTitle); } catch { return parseMeta('', fallbackTitle); }
}
async function dirs(p: string): Promise<string[]> {
  try { return (await readdir(p, { withFileTypes: true })).filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map(e => e.name).sort(); } catch { return []; }
}

// A product's folder (decision:wf2.product-folder): by default the registry entry itself, <data>/products/<slug>; with
// `root: <path>` in _product.md, that folder holds everything but _product.md — the projects and their documents, the
// graph, sessions, changes, hooks, inbox — so a product's knowledge can live beside its code (~ is the home folder).
// The product's code folder, from `repo:` in _product.md: an absolute path as it is, a relative one against the repo the
// app runs from (`repo: .` is this repo), null when the product names none. A vault (<folder>/.wye, lib/vault.js) names
// none and needs none: its code is the folder it sits in (decision:wf2.vault-is-a-product-in-wye).
export const isVaultDir = (dir: string) => path.basename(dir) === '.wye';
export function productRepo(p: Pick<Product, 'meta'> & { dir?: string }): string | null {
  const r = p.meta.repo?.trim(); if (!r) return p.dir && isVaultDir(p.dir) ? path.dirname(p.dir) : null;
  return path.isAbsolute(r) ? r : path.resolve(REPO_ROOT, r);
}
export function resolveRoot(root: string): string { return path.resolve(root.replace(/^~(?=$|\/)/, os.homedir())); }
export const registryDir = (slug: string, dataRoot: string = DATA_ROOT) => path.join(dataRoot, 'products', slug);
const dirSlugs = new Map<string, string>(); // product folder → slug, for the callers that only hold the folder
export function slugOfDir(productDir: string): string { return dirSlugs.get(path.resolve(productDir)) ?? path.basename(productDir); }
// Every product the app can address: the registry's entries (<data>/products/<slug>) and the vaults of the open
// workspace (decision:wf2.workspace-is-the-top, lib/workspace) — found through their links, with no entry of their own.
// A vault is read from its own _product.md wherever it was found: an entry that points at one (`root:` — a vault
// outside the open workspace, decision:wf2.vault-first-slice) is this machine's pointer and nothing more. A vault's
// address is its own `slug:`, stepped (`-2`) when a product already has it.
export const metaFileOf = (p: Pick<Product, 'dir' | 'metaFile'>) => p.metaFile ?? path.join(p.dir, '_product.md');
async function asVault(dir: string, fallbackTitle: string): Promise<Pick<Product, 'meta' | 'metaFile' | 'vault'> | null> {
  if (!isVaultDir(dir)) return null;
  const metaFile = path.join(dir, '_product.md'); let md = ''; try { md = await readFile(metaFile, 'utf8'); } catch { return null; }
  const meta = parseMeta(md, fallbackTitle); const folder = path.dirname(dir);
  return { meta, metaFile, vault: { folder, parent: meta.settings.parent ? path.resolve(folder, meta.settings.parent) : null } };
}
export async function listProducts(dataRoot: string = DATA_ROOT): Promise<Product[]> {
  const base = path.join(dataRoot, 'products');
  const list: Product[] = await Promise.all((await dirs(base)).map(async slug => {
    const metaFile = path.join(base, slug, '_product.md');
    const meta = await readMeta(metaFile, slug);
    const dir = meta.settings.root ? resolveRoot(meta.settings.root) : path.join(base, slug);
    const v = await asVault(dir, meta.title);
    return v ? { slug, dir, graphPath: path.join(dir, '_build/graph.json'), ...v, meta: { ...v.meta, settings: { ...v.meta.settings, root: meta.settings.root } } } : { slug, dir, graphPath: path.join(dir, '_build/graph.json'), meta, metaFile };
  }));
  // the open workspace applies to the app's own data only (a test's data root has no workspace)
  if (dataRoot === DATA_ROOT) {
    const { workspaceVaults } = await import('./workspace');
    const ws = await workspaceVaults();
    if (ws.folder) {
      const byDir = new Map(list.map(p => [path.resolve(p.dir), p]));
      const taken = new Set(list.map(p => p.slug));
      for (const v of ws.vaults) {
        const known = byDir.get(v.dir); if (known) { known.inWorkspace = true; continue; }
        const a = await asVault(v.dir, path.basename(v.folder)); if (!a) continue;
        const own = (a.meta.settings.slug || path.basename(v.folder)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'vault';
        let slug = own; for (let n = 2; taken.has(slug); n++) slug = `${own}-${n}`;
        taken.add(slug);
        list.push({ slug, dir: v.dir, graphPath: path.join(v.dir, '_build/graph.json'), ...a, inWorkspace: true });
      }
    } else for (const p of list) p.inWorkspace = true;
  }
  for (const p of list) dirSlugs.set(path.resolve(p.dir), p.slug);
  return list;
}
export async function getProduct(slug: string): Promise<Product | undefined> {
  return (await listProducts()).find(p => p.slug === slug);
}
export async function listProjects(product: Product): Promise<Project[]> {
  const base = path.join(product.dir, 'projects');
  return Promise.all((await dirs(base)).map(async slug => {
    const dir = path.join(base, slug);
    return { slug, product: product.slug, dir, docsDir: path.join(dir, 'docs'), docsRel: path.relative(REPO_ROOT, path.join(dir, 'docs')), wyeDir: path.join(dir, '.wye'), meta: await readMeta(path.join(dir, '_project.md'), slug) };
  }));
}
// The file of a page by its slug: a marked slug (`~goals`) is a system page in .wye/, `~<pkg>.<doc>` a document of an
// installed package, through its link (lib/doc.ts#packageOfSlug), any other is the person's
export function pageFile(project: Pick<Project, 'docsDir' | 'wyeDir'>, slug: string): string {
  const pm = slug.match(/^~([a-z0-9][a-z0-9-]*)\.([^/.]+)$/); if (pm) return path.join(project.wyeDir, 'packages', pm[1], `${pm[2]}.md`);
  return slug.startsWith('~') ? path.join(project.wyeDir, `${slug.slice(1)}.md`) : path.join(project.docsDir, `${slug}.md`);
}
export async function getProject(product: Product, slug: string): Promise<Project | undefined> {
  return (await listProjects(product)).find(p => p.slug === slug);
}
export async function listInbox(product: Product): Promise<{ name: string; size: number; mtime: string }[]> {
  const dir = path.join(product.dir, 'inbox');
  try {
    const names = (await readdir(dir)).filter(n => !n.startsWith('.'));
    return Promise.all(names.map(async n => { const s = await stat(path.join(dir, n)); return { name: n, size: s.size, mtime: s.mtime.toISOString() }; }));
  } catch { return []; }
}
