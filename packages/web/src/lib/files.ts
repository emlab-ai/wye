// The files of a folder, for the rail's Files section and a file's tab (req:wf2.workspace-files,
// decision:wf2.files-are-code-tabs): a folder's entries — what git ignores and the usual build folders left out unless
// asked for — and one file's text with its language. A path always resolves inside the root it is asked under; a
// binary file or one over 1 MB is named, not sent.
import { execFile } from 'node:child_process';
import { cp, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const LANG: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html', yml: 'yaml', yaml: 'yaml', py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', php: 'php', sh: 'shell', bash: 'shell', sql: 'sql', xml: 'xml', toml: 'ini', ini: 'ini', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', graphql: 'graphql', dockerfile: 'dockerfile', txt: 'plaintext' };
export function languageOf(rel: string): string {
  const ext = path.extname(rel).slice(1).toLowerCase(); const base = path.basename(rel).toLowerCase();
  return LANG[ext] ?? (base === 'dockerfile' ? 'dockerfile' : 'plaintext');
}
// never listed: git's own folder and the Finder's file; hidden unless asked for: what a build or an install leaves
const NEVER = new Set(['.git', '.DS_Store']);
const BUILT = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'coverage', '.next', '.turbo', '.cache', '.venv', 'venv', '__pycache__', 'vendor', '.idea', '.gradle']);
export const MAX_FILE = 1024 * 1024;

export interface FileEntry { name: string; dir: boolean; vault?: boolean; /** the folder is a product kept the old way — _product.md and projects/ in it (one of the app's own, or a `root:` folder) */ product?: boolean; ignored?: boolean }
export type Inside = { abs: string; rel: string } | null;
export function inside(root: string, given: string): Inside {
  const rel = given.replace(/^\.\//, '').replace(/^\/+/, ''); const abs = path.resolve(root, rel);
  return abs === root || abs.startsWith(root + path.sep) ? { abs, rel: path.relative(root, abs).split(path.sep).join('/') } : null;
}
// the names git ignores in a folder ([] outside a repository, or without git)
function gitIgnored(dir: string, names: string[]): Promise<Set<string>> {
  return new Promise(res => {
    if (!names.length) return res(new Set());
    const c = execFile('git', ['-C', dir, 'check-ignore', '--stdin', '-z'], { timeout: 4000 }, (_e, out) => res(new Set(String(out ?? '').split('\0').filter(Boolean))));
    c.stdin?.on('error', () => {});   // outside a repository git exits before reading: the write is EPIPE, not an error of ours
    c.stdin?.end(names.join('\0'));
  });
}
// every file git tracks or does not ignore, relative to the folder, '/'-joined — null when the folder is not a repo
function gitFiles(dir: string): Promise<string[] | null> {
  return new Promise(res => {
    execFile('git', ['-C', dir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { timeout: 8000, maxBuffer: 64 * 1024 * 1024 }, (e, out) => res(e ? null : String(out ?? '').split('\0').filter(Boolean)));
  });
}
const isDir = async (p: string) => { try { return (await stat(p)).isDirectory(); } catch { return false; } };
const isFile = async (p: string) => { try { return (await stat(p)).isFile(); } catch { return false; } };

export async function listDir(abs: string, o: { hidden?: boolean } = {}): Promise<FileEntry[]> {
  const ents = (await readdir(abs, { withFileTypes: true })).filter(e => !NEVER.has(e.name));
  const ignored = await gitIgnored(abs, ents.map(e => e.name));
  const out: FileEntry[] = [];
  for (const e of ents) {
    const dir = e.isDirectory() || (e.isSymbolicLink() && await isDir(path.join(abs, e.name)));
    const ig = ignored.has(e.name) || (dir && BUILT.has(e.name));
    // a vault's own folder is knowledge, shown in Documents — here only when everything is
    if (!o.hidden && (ig || e.name === '.wye')) continue;
    out.push({ name: e.name, dir, ...(dir && await isFile(path.join(abs, e.name, '.wye', '_product.md')) ? { vault: true } : {}), ...(dir && await isFile(path.join(abs, e.name, '_product.md')) && await isDir(path.join(abs, e.name, 'projects')) ? { product: true } : {}), ...(ig ? { ignored: true } : {}) });
  }
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// Find (req:wf2.files.filter-finds): every file under the folder whose name holds the text, walking the tree with the
// same rules the listing has (git-ignored and built folders left out unless `hidden`), capped so a huge tree answers
// in time — `more` says the cap was hit. Paths are relative to the folder, '/'-joined.
export async function findFiles(abs: string, q: string, o: { hidden?: boolean; limit?: number; budget?: number } = {}): Promise<{ matches: { path: string; name: string; dir: boolean }[]; more: boolean }> {
  const needle = q.trim().toLowerCase(); const limit = o.limit ?? 200; const budget = o.budget ?? 20000;
  const matches: { path: string; name: string; dir: boolean }[] = []; let seen = 0; let more = false;
  if (!needle) return { matches, more };
  // a git folder: one `git ls-files` says every file that is tracked or not ignored — one process for the whole
  // tree instead of a check-ignore per folder; the walk below is for a folder that is not a repo, or everything
  if (!o.hidden) {
    const listed = await gitFiles(abs);
    if (listed) {
      const dirs = new Set<string>();
      for (const f of listed) {
        const parts = f.split('/');
        if (parts.some(x => BUILT.has(x) || x === '.wye' || NEVER.has(x))) continue;
        // folders are matched too, once each, by their name
        for (let i = 0; i < parts.length - 1; i++) { const d = parts.slice(0, i + 1).join('/'); if (!dirs.has(d)) { dirs.add(d); if (parts[i].toLowerCase().includes(needle)) matches.push({ path: d, name: parts[i], dir: true }); } }
        if (parts[parts.length - 1].toLowerCase().includes(needle)) matches.push({ path: f, name: parts[parts.length - 1], dir: false });
        if (matches.length > limit) { more = true; matches.length = limit; break; }
      }
      matches.sort((a, b) => Number(b.dir) - Number(a.dir) || a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
      return { matches, more };
    }
  }
  const walk = async (dir: string, rel: string): Promise<void> => {
    if (more) return;
    let entries: FileEntry[]; try { entries = await listDir(dir, { hidden: o.hidden }); } catch { return; }
    for (const e of entries) {
      if (++seen > budget || matches.length >= limit) { more = true; return; }
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.name.toLowerCase().includes(needle)) matches.push({ path: p, name: e.name, dir: e.dir });
      if (e.dir && !e.vault && !e.product && !e.ignored) await walk(path.join(dir, e.name), p);
    }
  };
  await walk(abs, '');
  return { matches, more };
}

export type FileText = { path: string; language: string; text: string; size: number; mtime: string } | { path: string; size: number; mtime: string; binary?: true; large?: true };
export async function readFileAt(abs: string, rel: string): Promise<FileText> {
  const st = await stat(abs); const base = { path: rel, size: st.size, mtime: st.mtime.toISOString() };
  if (st.size > MAX_FILE) return { ...base, large: true };
  // a NUL in the first 8 KB: not text
  const fh = await open(abs, 'r'); try { const b = Buffer.alloc(Math.min(8192, st.size)); await fh.read(b, 0, b.length, 0); if (b.includes(0)) return { ...base, binary: true }; } finally { await fh.close(); }
  return { ...base, language: languageOf(rel), text: await readFile(abs, 'utf8') };
}

// ---- what the Files menu does to a file or folder, every path inside the root (op:api.workspace-files POST)
const exists = async (p: string) => { try { await stat(p); return true; } catch { return false; } };
const run = (cmd: string, args: string[]) => new Promise<void>((res, rej) => execFile(cmd, args, { timeout: 8000 }, e => e ? rej(e) : res()));
// a name of one path segment
export function oneName(name: string): string {
  const n = name.trim(); if (!n || n === '.' || n === '..' || /[/\\\0]/.test(n)) throw new Error('invalid: a name without slashes');
  return n;
}
// a free path next to `abs`: the name, else name-2, name-3…
async function freeBeside(abs: string): Promise<string> {
  if (!(await exists(abs))) return abs;
  const ext = path.extname(abs), base = abs.slice(0, abs.length - ext.length);
  for (let n = 2; ; n++) { const p = `${base}-${n}${ext}`; if (!(await exists(p))) return p; }
}
export type FileOp = { op: 'rename'; path: string; name: string } | { op: 'move' | 'copy'; path: string; into: string } | { op: 'delete'; path: string } | { op: 'mkdir' | 'newfile'; path: string; name: string } | { op: 'reveal' | 'open'; path: string };
// → the path the operation ended with, relative to the root ('' for delete, reveal, open)
export async function fileOp(root: string, o: FileOp): Promise<{ path: string }> {
  const at = inside(root, o.path); if (!at) throw new Error('invalid: the path leaves the open folder');
  const rel = (abs: string) => path.relative(root, abs).split(path.sep).join('/');
  if (o.op === 'reveal' || o.op === 'open') {
    // the system's own file browser or the file's own application, on this machine
    if (!(await exists(at.abs))) throw new Error(`not_found: ${at.rel}`);
    const mac = process.platform === 'darwin', win = process.platform === 'win32';
    if (o.op === 'reveal') await run(mac ? 'open' : win ? 'explorer' : 'xdg-open', mac ? ['-R', at.abs] : win ? [`/select,${at.abs}`] : [path.dirname(at.abs)]);
    else await run(mac ? 'open' : win ? 'cmd' : 'xdg-open', win ? ['/c', 'start', '', at.abs] : [at.abs]);
    return { path: '' };
  }
  if (!at.rel && o.op !== 'mkdir' && o.op !== 'newfile') throw new Error('invalid: not the open folder itself');
  if (o.op === 'delete') {
    // to the system's trash when the machine has one, so the person can take it back; never past the root
    const mac = process.platform === 'darwin';
    if (mac) { try { await run('osascript', ['-e', `tell application "Finder" to delete POSIX file ${JSON.stringify(at.abs)}`]); return { path: '' }; } catch { /* Finder is not there: the trash folder */ } }
    const trash = mac ? path.join(os.homedir(), '.Trash') : process.platform === 'linux' ? path.join(os.homedir(), '.local/share/Trash/files') : '';
    if (trash && await exists(trash)) { await rename(at.abs, await freeBeside(path.join(trash, path.basename(at.abs)))).catch(async () => { await cp(at.abs, await freeBeside(path.join(trash, path.basename(at.abs))), { recursive: true }); await rm(at.abs, { recursive: true, force: true }); }); return { path: '' }; }
    await rm(at.abs, { recursive: true, force: true }); return { path: '' };
  }
  if (o.op === 'rename') { const to = path.join(path.dirname(at.abs), oneName(o.name)); if (await exists(to)) throw new Error(`conflict: ${rel(to)} exists`); await rename(at.abs, to); return { path: rel(to) }; }
  if (o.op === 'mkdir' || o.op === 'newfile') {
    const to = path.join(at.abs, oneName(o.name)); if (await exists(to)) throw new Error(`conflict: ${rel(to)} exists`);
    if (o.op === 'mkdir') await mkdir(to, { recursive: true }); else { await mkdir(path.dirname(to), { recursive: true }); await writeFile(to, ''); }
    return { path: rel(to) };
  }
  // move or copy into a folder: a free name there; a folder never goes into itself
  if (o.op !== 'move' && o.op !== 'copy') throw new Error('invalid: unknown operation');
  const into = inside(root, o.into); if (!into) throw new Error('invalid: the target leaves the open folder');
  if (!(await stat(into.abs).catch(() => null))?.isDirectory()) throw new Error(`invalid: ${into.rel || '.'} is not a folder`);
  if (into.abs === at.abs || into.abs.startsWith(at.abs + path.sep)) throw new Error('invalid: a folder cannot go into itself');
  const to = await freeBeside(path.join(into.abs, path.basename(at.abs)));
  if (o.op === 'copy') await cp(at.abs, to, { recursive: true, errorOnExist: true, force: false });
  else { try { await rename(at.abs, to); } catch { await cp(at.abs, to, { recursive: true }); await rm(at.abs, { recursive: true, force: true }); } }
  return { path: rel(to) };
}
