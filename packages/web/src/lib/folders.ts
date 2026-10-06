// The folders under a path, for the folder picker (components/FolderPicker): names only, hidden ones left out unless
// asked for, sorted; `product` says the folder holds projects/ (or .wye/projects/, wye/projects/) — what Open a folder takes. An empty
// path is the home folder; a path that is not a folder answers with its nearest existing parent.
import { execFile } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveRoot } from './products';

export interface FolderList { path: string; parent: string | null; home: string; folders: { name: string; product: boolean }[]; product: boolean }
const isDir = async (p: string) => { try { return (await stat(p)).isDirectory(); } catch { return false; } };
const holdsProduct = async (p: string) => (await isDir(path.join(p, 'projects'))) || (await isDir(path.join(p, '.wye', 'projects'))) || (await isDir(path.join(p, 'wye', 'projects')));

export async function listFolders(given: string, o: { hidden?: boolean } = {}): Promise<FolderList> {
  let dir = given.trim() ? resolveRoot(given.trim()) : os.homedir();
  while (!(await isDir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  let names: string[] = [];
  try { names = (await readdir(dir, { withFileTypes: true })).filter(e => (e.isDirectory() || e.isSymbolicLink()) && (o.hidden || !e.name.startsWith('.')) && e.name !== 'node_modules').map(e => e.name); } catch { /* unreadable: shown empty */ }
  const folders: FolderList['folders'] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) { const p = path.join(dir, name); if (await isDir(p)) folders.push({ name, product: (await isDir(path.join(p, 'projects'))) || (await isDir(path.join(p, '.wye', 'projects'))) }); }
  return { path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), home: os.homedir(), folders, product: await holdsProduct(dir) };
}

// a new folder under one that exists; the name is one path segment
export async function makeFolder(parent: string, name: string): Promise<string> {
  const n = name.trim(); if (!n || n === '.' || n === '..' || /[/\\\0]/.test(n)) throw new Error('invalid: a folder name without slashes');
  const base = resolveRoot(parent); if (!(await isDir(base))) throw new Error(`invalid: ${base} is not a folder`);
  const dir = path.join(base, n); await mkdir(dir); return dir;
}

// The system's own folder dialog, since the app runs on the machine the folders are on: macOS through AppleScript's
// `choose folder`, Linux through zenity or kdialog, Windows through the shell's browser. → the folder, '' when the
// person cancelled, null when this machine has no dialog to show (the caller falls back to its own sheet).
export function pickFolderNative(o: { title?: string; start?: string } = {}): Promise<string | null> {
  const title = (o.title ?? 'Choose a folder').replace(/["\\]/g, ''); const start = o.start ? resolveRoot(o.start) : '';
  const run = (cmd: string, args: string[]) => new Promise<{ code: number | null; out: string }>(res => execFile(cmd, args, { timeout: 10 * 60 * 1000, maxBuffer: 1 << 20 }, (e, out) => res({ code: e ? ((e as NodeJS.ErrnoException & { code?: number | string }).code === 'ENOENT' ? null : 1) : 0, out: String(out ?? '') })));
  return (async () => {
    if (process.platform === 'darwin') {
      const def = start ? ` default location POSIX file "${start.replace(/"/g, '')}"` : '';
      const r = await run('osascript', ['-e', `POSIX path of (choose folder with prompt "${title}"${def})`]);
      return r.code === 0 ? r.out.trim().replace(/\/$/, '') : r.code === null ? null : '';
    }
    if (process.platform === 'win32') {
      const r = await run('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "${title}"; ${start ? `$d.SelectedPath = "${start.replace(/"/g, '')}";` : ''} if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`]);
      return r.code === 0 ? r.out.trim() : r.code === null ? null : '';
    }
    for (const [cmd, args] of [['zenity', ['--file-selection', '--directory', `--title=${title}`, ...(start ? [`--filename=${start}/`] : [])]], ['kdialog', ['--getexistingdirectory', start || os.homedir(), '--title', title]]] as [string, string[]][]) {
      const r = await run(cmd, args);
      if (r.code === null) continue;
      return r.code === 0 ? r.out.trim() : '';
    }
    return null;
  })();
}
