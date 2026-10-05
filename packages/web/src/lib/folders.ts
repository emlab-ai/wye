// The folders under a path, for the folder picker (components/FolderPicker): names only, hidden ones left out unless
// asked for, sorted; `product` says the folder holds projects/ (or wye/projects/) — what Open a folder takes. An empty
// path is the home folder; a path that is not a folder answers with its nearest existing parent.
import { mkdir, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveRoot } from './products';

export interface FolderList { path: string; parent: string | null; home: string; folders: { name: string; product: boolean }[]; product: boolean }
const isDir = async (p: string) => { try { return (await stat(p)).isDirectory(); } catch { return false; } };
const holdsProduct = async (p: string) => (await isDir(path.join(p, 'projects'))) || (await isDir(path.join(p, 'wye', 'projects')));

export async function listFolders(given: string, o: { hidden?: boolean } = {}): Promise<FolderList> {
  let dir = given.trim() ? resolveRoot(given.trim()) : os.homedir();
  while (!(await isDir(dir)) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  let names: string[] = [];
  try { names = (await readdir(dir, { withFileTypes: true })).filter(e => (e.isDirectory() || e.isSymbolicLink()) && (o.hidden || !e.name.startsWith('.')) && e.name !== 'node_modules').map(e => e.name); } catch { /* unreadable: shown empty */ }
  const folders: FolderList['folders'] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) { const p = path.join(dir, name); if (await isDir(p)) folders.push({ name, product: await isDir(path.join(p, 'projects')) }); }
  return { path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), home: os.homedir(), folders, product: await holdsProduct(dir) };
}

// a new folder under one that exists; the name is one path segment
export async function makeFolder(parent: string, name: string): Promise<string> {
  const n = name.trim(); if (!n || n === '.' || n === '..' || /[/\\\0]/.test(n)) throw new Error('invalid: a folder name without slashes');
  const base = resolveRoot(parent); if (!(await isDir(base))) throw new Error(`invalid: ${base} is not a folder`);
  const dir = path.join(base, n); await mkdir(dir); return dir;
}
