// The workspace (decision:wf2.workspace-is-the-top): the folder the person has open. Its vaults — the folder's own, and
// link by link every vault below it (decision:wf2.vault-links, lib/vault.js#reach) — are the products the rail shows,
// one Documents root each; Goals, Work, Inbox and Pinned read all of them. No folder open is the home workspace: the
// app's own products (<data>/products), as before workspaces existed. Which folder is open, the recent ones and the
// list a Rescan found for a folder no vault names are this machine's, in <data>/_settings.json — the links themselves
// are text in each vault's _product.md, in the folder's git.
import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, listProducts, productRepo, resolveRoot, type Product } from './products';
import { readSettings, writeSettings } from './settings';

export interface WorkspaceVault { folder: string; dir: string; parent: string | null }
export interface LinkFix { folder: string; parent: string; vaults: string[]; was: { parent: string; vaults: string[] } }
interface VaultLib {
  reach: (folder: string, scanned?: string[]) => { folder: string; parent: string | null }[];
  rescan: (folder: string) => { vaults: string[]; roots: string[]; fixes: LinkFix[] };
  applyFixes: (fixes: LinkFix[]) => string[];
  hasVault: (folder: string) => boolean; vaultAbove: (folder: string) => string | null; vaultOf: (p: string) => string | null;
  links: (folder: string) => { parent: string | null; vaults: string[]; missing: string[] };
  readMeta: (folder: string) => { slug: string; title: string; parent: string; vaults: string[] };
  setMeta: (folder: string, keys: Record<string, string>) => boolean;
}
// lib/vault.js is CommonJS in Node's module cache, which Next's reload does not touch (lib/build.ts): in development
// it is read again when the file changed
let loaded = '';
export function vaultLib(): VaultLib {
  const req = createRequire(path.join(REPO_ROOT, 'package.json'));
  if (process.env.NODE_ENV !== 'production') {
    try { const f = req.resolve('./lib/vault.js'); const stamp = String(statSync(f).mtimeMs); if (stamp !== loaded) { delete req.cache[f]; loaded = stamp; } } catch { /* not there */ }
  }
  return req('./lib/vault.js') as VaultLib;
}

// one read of the links serves the requests of a moment; a change the app makes itself (open, init, rescan) clears it
const g = globalThis as unknown as { __wyeWorkspace?: { at: number; folder: string | null; vaults: WorkspaceVault[] } | null };
export function bustWorkspace() { g.__wyeWorkspace = null; }
const TTL = 1500;

export async function currentWorkspace(): Promise<string | null> {
  const w = (await readSettings()).workspace?.trim();
  return w ? resolveRoot(w) : null;
}
export async function workspaceVaults(): Promise<{ folder: string | null; vaults: WorkspaceVault[] }> {
  const hit = g.__wyeWorkspace; if (hit && Date.now() - hit.at < TTL) return hit;
  const s = await readSettings(); const folder = s.workspace?.trim() ? resolveRoot(s.workspace.trim()) : null;
  let vaults: WorkspaceVault[] = [];
  if (folder) { try { vaults = vaultLib().reach(folder, s.workspaceScan?.[folder]).map(v => ({ ...v, dir: path.join(v.folder, '.wye') })); } catch (e) { console.warn(`wye: workspace ${folder}: ${(e as Error).message}`); } }
  g.__wyeWorkspace = { at: Date.now(), folder, vaults };
  return g.__wyeWorkspace;
}

// Open a folder as the workspace ('' or null: the home workspace). A folder with no vault at or above it is walked
// once, here, and the list kept — after that only a Rescan walks it again.
export async function openWorkspace(given: string | null): Promise<{ folder: string | null }> {
  const cur = await readSettings();
  if (!given?.trim()) { await writeSettings({ workspace: '' }); bustWorkspace(); return { folder: null }; }
  const folder = resolveRoot(given.trim());
  const st = await stat(folder).catch(() => null); if (!st?.isDirectory()) throw new Error(`invalid: ${folder} is not a folder`);
  const lib = vaultLib();
  const scan = !lib.hasVault(folder) && !lib.vaultAbove(folder) && !cur.workspaceScan?.[folder] ? { [folder]: lib.rescan(folder).roots } : null;
  // the folder joins the opened workspaces, which the menu lists until the person takes one out (forgetWorkspace)
  await writeSettings({ workspace: folder, workspaces: [folder, ...(cur.workspaces ?? []).filter(f => f !== folder)].slice(0, 40), ...(scan ? { workspaceScan: scan } : {}) });
  bustWorkspace();
  return { folder };
}

// take a folder out of the opened workspaces (its vaults and links stay as they are)
export async function forgetWorkspace(given: string): Promise<void> {
  const folder = resolveRoot(given.trim()); const cur = await readSettings();
  await writeSettings({ workspaces: (cur.workspaces ?? []).filter(f => f !== folder), ...(cur.workspace && resolveRoot(cur.workspace) === folder ? { workspace: '' } : {}) });
  bustWorkspace();
}

// Rescan: the one full walk of the open folder → every vault under it and the links that differ from what it found
// (proposed, never written here — fixWorkspaceLinks writes the ones the person agrees to)
export async function rescanWorkspace(): Promise<{ folder: string; vaults: string[]; fixes: LinkFix[] }> {
  const folder = await currentWorkspace(); if (!folder) throw new Error('invalid: no folder is open — the home workspace has no links to scan');
  const lib = vaultLib(); const r = lib.rescan(folder);
  if (!lib.hasVault(folder) && !lib.vaultAbove(folder)) await writeSettings({ workspaceScan: { [folder]: r.roots } });
  bustWorkspace();
  return { folder, vaults: r.vaults, fixes: r.fixes };
}
export async function fixWorkspaceLinks(fixes: LinkFix[]): Promise<string[]> {
  const folder = await currentWorkspace(); if (!folder) throw new Error('invalid: no folder is open');
  // only a vault at, under or above the open folder, and only its links
  const ok = fixes.filter(f => typeof f.folder === 'string' && (f.folder === folder || f.folder.startsWith(folder + path.sep) || folder.startsWith(f.folder + path.sep)) && Array.isArray(f.vaults) && f.vaults.every(v => typeof v === 'string' && !/[\n\r,\[\]]/.test(v)) && typeof f.parent === 'string' && !/[\n\r]/.test(f.parent));
  const changed = vaultLib().applyFixes(ok); bustWorkspace(); return changed;
}

export interface WorkspaceView {
  folder: string | null; name: string; /** every folder opened as a workspace on this machine, newest first, the open one included */ recent: string[];
  /** the vaults the rail shows, parents before their children; `parent`: the slug of the vault above, when it is shown too */
  vaults: { slug: string; title: string; icon: string; folder: string | null; parent: string | null }[];
}
// What the rail shows of the workspace: its vaults as products, nested as their folders nest
export async function workspaceView(products?: Product[]): Promise<WorkspaceView> {
  const list = (products ?? await listProducts()).filter(p => p.inWorkspace);
  const s = await readSettings(); const folder = s.workspace?.trim() ? resolveRoot(s.workspace.trim()) : null;
  const byFolder = new Map(list.filter(p => p.vault).map(p => [p.vault!.folder, p.slug]));
  const vaults = list.map(p => ({ slug: p.slug, title: p.meta.title, icon: p.meta.icon, folder: p.vault?.folder ?? null, parent: p.vault?.parent ? byFolder.get(p.vault.parent) ?? null : null }));
  // in a folder: as the folders read; at home: as the registry lists them
  if (folder) vaults.sort((a, b) => (a.folder ?? '').localeCompare(b.folder ?? ''));
  // parents first, each vault's children after it
  const order: WorkspaceView['vaults'] = []; const put = (v: WorkspaceView['vaults'][number]) => { order.push(v); for (const c of vaults.filter(x => x.parent === v.slug)) put(c); };
  for (const v of vaults.filter(x => !x.parent)) put(v);
  return { folder, name: folder ? path.basename(folder) : 'Home', recent: s.workspaces ?? [], vaults: order };
}
// the products of the open workspace — what a view over "all vaults" reads
export async function workspaceProducts(): Promise<Product[]> { return (await listProducts()).filter(p => p.inWorkspace); }

// The folder the Files section shows for a product: the open workspace's folder, else (the home workspace) the
// product's own code folder — null when it names none
export async function filesRoot(product?: Product | null): Promise<string | null> {
  return (await currentWorkspace()) ?? (product ? productRepo(product) : null);
}
// the product whose vault is the nearest at or above a path — where knowledge about that file belongs
export async function productOfPath(p: string): Promise<Product | null> {
  const folder = vaultLib().vaultOf(p); if (!folder) return null;
  return (await listProducts()).find(x => x.vault?.folder === folder) ?? null;
}
// A vault that was just made or opened (wye init, Init Wye here): the next read sees it. In an open folder that no
// vault names, the kept list gains it — unless a vault inside the folder links to it — and loses the ones now below it.
export async function noteVault(dir: string): Promise<void> {
  bustWorkspace();
  const folder = await currentWorkspace(); if (!folder || path.basename(dir) !== '.wye') return;
  const vf = path.dirname(path.resolve(dir)); if (vf !== folder && !vf.startsWith(folder + path.sep)) return;
  const lib = vaultLib(); if (lib.hasVault(folder) || lib.vaultAbove(folder)) return;
  const above = lib.vaultAbove(vf); if (above && above.startsWith(folder + path.sep)) return;
  const cur = (await readSettings()).workspaceScan?.[folder] ?? [];
  const next = [...cur.filter(f => f !== vf && !f.startsWith(vf + path.sep)), vf].sort();
  if (next.join('\n') !== cur.join('\n')) { await writeSettings({ workspaceScan: { [folder]: next } }); bustWorkspace(); }
}

// A vault leaves (it goes to the trash): the vault above stops naming it and names its children instead, each child
// names that vault as its parent — or none
export function unlinkVault(folder: string): string[] {
  const lib = vaultLib(); const l = lib.links(folder); const changed: string[] = [];
  const rel = (from: string, to: string) => path.relative(from, to).split(path.sep).join('/') || '.';
  const list = (paths: string[]) => paths.length ? `[${[...new Set(paths)].sort().join(', ')}]` : '';
  if (l.parent) {
    const kept = lib.links(l.parent).vaults.filter(v => v !== folder);
    if (lib.setMeta(l.parent, { vaults: list([...kept, ...l.vaults].map(v => rel(l.parent!, v))) })) changed.push(l.parent);
  }
  for (const c of l.vaults) if (lib.setMeta(c, { parent: l.parent ? rel(c, l.parent) : '' })) changed.push(c);
  return changed;
}
