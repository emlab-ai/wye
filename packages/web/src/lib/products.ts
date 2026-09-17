// Server-only registry of products and projects, read from the data folder:
//   <data>/products/<product>/_product.md
//   <data>/products/<product>/projects/<project>/_project.md
//   <data>/products/<product>/projects/<project>/docs/*.md
//   <data>/products/<product>/_build/graph.json      (one graph per product: all its projects' docs)
//   <data>/products/<product>/inbox/                 (dropped inputs, not processed yet)
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const DATA_ROOT = path.resolve(process.cwd(), process.env.WATERFALL_DATA ?? '../../data');
export const REPO_ROOT = path.resolve(process.cwd(), '../..');

export interface Meta { title: string; icon: string; description: string; kind: string; status: string; repo?: string }
export interface Product { slug: string; dir: string; graphPath: string; meta: Meta }
export interface Project { slug: string; product: string; dir: string; docsDir: string; meta: Meta; docsRel: string }

function parseMeta(md: string, fallbackTitle: string): Meta {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  const get = (k: string) => (fm ? (fm[1].match(new RegExp('^' + k + ':\\s*(.*)$', 'm')) ?? [])[1] ?? '' : '').trim();
  return { title: get('title') || fallbackTitle, icon: get('icon'), description: get('description'), kind: get('kind') || 'project', status: get('status'), repo: get('repo') || undefined };
}
async function readMeta(file: string, fallbackTitle: string): Promise<Meta> {
  try { return parseMeta(await readFile(file, 'utf8'), fallbackTitle); } catch { return parseMeta('', fallbackTitle); }
}
async function dirs(p: string): Promise<string[]> {
  try { return (await readdir(p, { withFileTypes: true })).filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map(e => e.name).sort(); } catch { return []; }
}

export async function listProducts(): Promise<Product[]> {
  const base = path.join(DATA_ROOT, 'products');
  return Promise.all((await dirs(base)).map(async slug => {
    const dir = path.join(base, slug);
    return { slug, dir, graphPath: path.join(dir, '_build/graph.json'), meta: await readMeta(path.join(dir, '_product.md'), slug) };
  }));
}
export async function getProduct(slug: string): Promise<Product | undefined> {
  return (await listProducts()).find(p => p.slug === slug);
}
export async function listProjects(product: Product): Promise<Project[]> {
  const base = path.join(product.dir, 'projects');
  return Promise.all((await dirs(base)).map(async slug => {
    const dir = path.join(base, slug);
    return { slug, product: product.slug, dir, docsDir: path.join(dir, 'docs'), docsRel: path.relative(REPO_ROOT, path.join(dir, 'docs')), meta: await readMeta(path.join(dir, '_project.md'), slug) };
  }));
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
