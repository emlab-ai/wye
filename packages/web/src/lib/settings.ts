// The app's settings (Jev auto-linking design §0): one json file at <data>/_settings.json — local to this machine,
// listed in .gitignore, mode 0600 because it holds keys. Read fresh on every use (cheap, and the page's Save is
// visible to the next request); the browser only ever sees publicSettings().
import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT } from './products';

export interface Settings { jev?: { key?: string } }

const file = (root: string) => path.join(root, '_settings.json');

export async function readSettings(root: string = DATA_ROOT): Promise<Settings> {
  try { return JSON.parse(await readFile(file(root), 'utf8')) as Settings; } catch { return {}; }
}
export async function writeSettings(patch: Settings, root: string = DATA_ROOT): Promise<Settings> {
  const cur = await readSettings(root);
  const next: Settings = { ...cur, ...(patch.jev ? { jev: { ...cur.jev, ...patch.jev } } : {}) };
  if (next.jev && !next.jev.key) delete next.jev; // an empty key removes the section
  await writeFile(file(root), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  await chmod(file(root), 0o600).catch(() => {}); // writeFile's mode only applies to a new file
  return next;
}
// the stored key, or the environment's for tests and evals outside the app
export async function jevKey(root: string = DATA_ROOT): Promise<string> { return (await readSettings(root)).jev?.key || (root === DATA_ROOT ? process.env.TYPESAFE_API_KEY : '') || ''; }
export function publicSettings(s: Settings): { jev: { set: boolean; last4: string } } {
  const k = s.jev?.key ?? ''; return { jev: { set: !!k, last4: k.slice(-4) } };
}
