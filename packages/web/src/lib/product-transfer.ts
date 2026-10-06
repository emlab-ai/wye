// A product in and out of this machine, besides creating one: export it as one file, import such a file as a new
// product, or open a product folder that is already on disk where it is (decision:wf2.product-transfer).
//   export — a gzipped tar of what the product knows: _product.md (without `root:`, a path on this machine), projects/
//            (documents and the app's .wye pages), inbox/ and _agent.md. The graph (_build) is rebuilt from the
//            documents; sessions, change records and hook logs are this machine's history and stay here.
//   import — the archive is listed before anything is written: only those top-level names, no absolute path, no `..`,
//            no link or device; it is unpacked beside the registry and renamed into place, then built.
//   open   — a folder holding projects/ (or a repo holding .wye/projects/ — a vault, lib/vault.js — or wye/projects/)
//            becomes a product in place: a registry entry with `root:` pointing at it (decision:wf2.product-folder),
//            nothing copied. A vault's own _product.md names its slug and keeps its links (`parent:`, `vaults:`);
//            the entry does not repeat the links.
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DATA_ROOT, listProducts, registryDir, resolveRoot } from './products';
import { slugify } from './templates';
import { writeAtomic, rebuild } from './write';

export const EXPORTED = ['projects', 'inbox', '_agent.md'] as const;
const ALLOWED_TOP = new Set<string>(['_product.md', ...EXPORTED]);
const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

function run(cmd: string, args: string[], o: { cwd?: string; input?: Buffer } = {}): Promise<{ code: number; out: Buffer; err: string }> {
  return new Promise((res, rej) => {
    const c = spawn(cmd, args, { cwd: o.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = []; let err = '';
    c.stdout.on('data', d => out.push(d)); c.stderr.on('data', d => { err += d; });
    c.on('error', rej); c.on('close', code => res({ code: code ?? 1, out: Buffer.concat(out), err }));
    if (o.input) c.stdin.end(o.input); else c.stdin.end();
  });
}

// _product.md as it travels: every key but `root:` (where the files sit on this machine)
export function portableMeta(md: string): string {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return md;
  const lines = fm[1].split('\n').filter(l => !/^root:/.test(l));
  return `---\n${lines.join('\n')}\n---` + md.slice(fm[0].length);
}
// the registry entry of a product opened in place: without the vault's links, which are read from the vault itself
const withoutLinks = (md: string) => md.replace(/^---\n([\s\S]*?)\n---/, (_, fm: string) => `---\n${fm.split('\n').filter(l => !/^(parent|vaults|slug):/.test(l)).join('\n')}\n---`);
const slugIn = (md: string) => (md.match(/^---\n[\s\S]*?^slug:\s*(.+)$/m)?.[1] ?? '').trim();
const titleOf = (md: string) => (md.match(/^---\n[\s\S]*?^title:\s*(.+)$/m)?.[1] ?? '').trim();

// A slug no product has yet: `shop`, else `shop-2`, `shop-3`…
async function freeSlug(base: string, dataRoot: string): Promise<string> {
  const taken = new Set((await listProducts(dataRoot)).map(p => p.slug));
  const root = slugify(base) || 'product';
  for (let n = 1; ; n++) { const s = n === 1 ? root : `${root}-${n}`; if (!taken.has(s) && !(await exists(registryDir(s, dataRoot)))) return s; }
}

export async function exportProduct(slug: string, dataRoot: string = DATA_ROOT): Promise<{ file: string; data: Buffer }> {
  const p = (await listProducts(dataRoot)).find(x => x.slug === slug); if (!p) throw new Error(`not_found: ${slug}`);
  const stage = path.join(os.tmpdir(), `wye-export-${process.pid}-${Date.now()}`);
  await mkdir(stage, { recursive: true });
  try {
    let meta = ''; try { meta = await readFile(path.join(registryDir(slug, dataRoot), '_product.md'), 'utf8'); } catch { meta = `---\ntitle: ${p.meta.title}\n---\n`; }
    await writeFile(path.join(stage, '_product.md'), portableMeta(meta));
    const parts: string[] = []; for (const n of EXPORTED) if (await exists(path.join(p.dir, n))) parts.push(n);
    const args = ['-czf', '-', '--exclude', '.DS_Store', '--exclude', '*/.wye/packages', '-C', stage, '_product.md', ...(parts.length ? ['-C', p.dir, ...parts] : [])];
    const r = await run('tar', args);
    if (r.code !== 0) throw new Error(`tar failed: ${r.err.trim()}`);
    return { file: `${slug}.wye.tgz`, data: r.out };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

// What an archive would write, checked before it writes: [] when it is safe, else the reasons. `names` is
// `tar -tzf` (one exact name a line, alike in GNU tar and bsdtar); `types` the first character of each `tar -tvzf`
// line, in the same order (- a file, d a folder, l / h a link…) — the verbose columns differ between tars, the mode
// character does not.
export function archiveProblems(names: string[], types: string[]): string[] {
  const bad: string[] = [];
  names.forEach((name, i) => {
    if (!name) return;
    const type = types[i] ?? '?';
    if (type !== '-' && type !== 'd') { bad.push(`${name}: links and special files are not imported`); return; }
    const clean = name.replace(/^\.\//, '').replace(/\/$/, '');
    if (!clean || clean === '.') return;
    if (path.isAbsolute(clean) || clean.split('/').includes('..')) { bad.push(`${name}: outside the product`); return; }
    if (!ALLOWED_TOP.has(clean.split('/')[0])) bad.push(`${name}: not part of a Wye product (expected _product.md, projects/, inbox/, _agent.md)`);
  });
  return bad;
}

export async function importProduct(data: Buffer, o: { slug?: string; dataRoot?: string } = {}): Promise<{ slug: string; dir: string }> {
  const dataRoot = o.dataRoot ?? DATA_ROOT;
  const products = path.join(dataRoot, 'products'); await mkdir(products, { recursive: true });
  // unpacked beside the registry (a dot folder the registry skips), so the move into place is a rename
  const stage = path.join(products, `.import-${process.pid}-${Date.now()}`);
  const tgz = `${stage}.tgz`;
  await writeFile(tgz, data);
  try {
    const names = await run('tar', ['-tzf', tgz]), verbose = await run('tar', ['-tvzf', tgz]);
    if (names.code !== 0 || verbose.code !== 0) throw new Error(`invalid: not a .wye.tgz export (${(names.err || verbose.err).trim().split('\n')[0]})`);
    const lines = (b: Buffer) => b.toString('utf8').split('\n').filter(Boolean);
    const bad = archiveProblems(lines(names.out), lines(verbose.out).map(l => l[0]));
    if (bad.length) throw new Error(`invalid: ${bad.slice(0, 3).join('; ')}${bad.length > 3 ? ` (+${bad.length - 3} more)` : ''}`);
    await mkdir(stage, { recursive: true });
    const x = await run('tar', ['-xzf', tgz, '-C', stage]);
    if (x.code !== 0) throw new Error(`invalid: could not unpack (${x.err.trim().split('\n')[0]})`);
    if (!(await exists(path.join(stage, 'projects')))) throw new Error('invalid: the archive has no projects/ — not a Wye product');
    let meta = ''; try { meta = await readFile(path.join(stage, '_product.md'), 'utf8'); } catch { /* none: made below */ }
    const slug = await freeSlug(o.slug || titleOf(meta) || 'imported', dataRoot);
    if (!meta) await writeFile(path.join(stage, '_product.md'), `---\ntitle: ${o.slug || 'Imported'}\n---\n`);
    else await writeFile(path.join(stage, '_product.md'), portableMeta(meta));
    await mkdir(path.join(stage, 'inbox'), { recursive: true });
    const dir = registryDir(slug, dataRoot);
    await rename(stage, dir);
    await rebuild(dir);
    return { slug, dir };
  } finally {
    await rm(tgz, { force: true }); await rm(stage, { recursive: true, force: true });
  }
}

// The product folder a path names: the folder itself when it holds projects/, else its .wye/ folder (a vault) or its
// wye/ folder (a repo that keeps its product beside the code)
export async function productFolderAt(p: string): Promise<string | null> {
  const dir = resolveRoot(p.trim());
  for (const d of [dir, path.join(dir, '.wye'), path.join(dir, 'wye')]) { try { if ((await stat(path.join(d, 'projects'))).isDirectory()) return d; } catch { /* next */ } }
  return null;
}

export async function openProduct(folder: string, o: { slug?: string; dataRoot?: string } = {}): Promise<{ slug: string; dir: string; existing: boolean }> {
  const dataRoot = o.dataRoot ?? DATA_ROOT;
  if (!folder.trim()) throw new Error('invalid: a folder is required');
  const dir = await productFolderAt(folder);
  if (!dir) throw new Error(`invalid: ${resolveRoot(folder.trim())} is not a Wye product folder — it needs a projects/ folder (or .wye/projects/, wye/projects/)`);
  // a vault inside the open workspace is found through its links: it needs no entry (decision:wf2.workspace-is-the-top)
  if (dataRoot === DATA_ROOT) await (await import('./workspace')).noteVault(dir);
  const known = (await listProducts(dataRoot)).find(p => path.resolve(p.dir) === path.resolve(dir));
  if (known) return { slug: known.slug, dir, existing: true };
  if (path.resolve(dir).startsWith(path.resolve(path.join(dataRoot, 'products')) + path.sep)) throw new Error('invalid: that folder is already inside the app\'s products');
  // the folder's own _product.md (an export, a teammate's clone) names it; the registry entry points at the folder
  let meta = ''; try { meta = await readFile(path.join(dir, '_product.md'), 'utf8'); } catch { /* none */ }
  const title = titleOf(meta) || path.basename(['wye', '.wye'].includes(path.basename(dir)) ? path.dirname(dir) : dir);
  const slug = await freeSlug(o.slug || slugIn(meta) || title, dataRoot);
  const base = meta ? withoutLinks(portableMeta(meta)) : `---\ntitle: ${title}\nicon: 📦\n---\n`;
  const fm = base.match(/^---\n([\s\S]*?)\n---/);
  const next = fm ? `---\n${fm[1]}\nroot: ${dir}\n---${base.slice(fm[0].length)}` : `---\ntitle: ${title}\nroot: ${dir}\n---\n`;
  await mkdir(registryDir(slug, dataRoot), { recursive: true });
  await writeAtomic(path.join(registryDir(slug, dataRoot), '_product.md'), next);
  await mkdir(path.join(dir, 'inbox'), { recursive: true });
  await rebuild(dir);
  return { slug, dir, existing: false };
}
