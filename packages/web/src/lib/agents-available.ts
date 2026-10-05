// Which coding agents this machine has (the Quick start's `agent` step, the Welcome's agent check): `claude` and
// `codex` looked up on PATH the way agent-host spawns them — an executable file in a PATH entry, no child process.
// Cached a minute per PATH value: an install shows up without a restart, a page render never scans twice.
import { access, constants } from 'node:fs/promises';
import path from 'node:path';

export interface Agents { claude: boolean; codex: boolean }

const TTL = 60_000;
const cache = new Map<string, { at: number; agents: Promise<Agents> }>();
const exts = (env: NodeJS.ProcessEnv) => process.platform === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map(e => e.toLowerCase())] : [''];

async function onPath(bin: string, dirs: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  for (const d of dirs) for (const e of exts(env)) { try { await access(path.join(d, bin + e), constants.X_OK); return true; } catch { /* not here */ } }
  return false;
}

export function agentsAvailable(env: NodeJS.ProcessEnv = process.env): Promise<Agents> {
  const key = env.PATH ?? '';
  const hit = cache.get(key); if (hit && Date.now() - hit.at < TTL) return hit.agents;
  const dirs = key.split(path.delimiter).filter(Boolean);
  const agents = Promise.all([onPath('claude', dirs, env), onPath('codex', dirs, env)]).then(([claude, codex]) => ({ claude, codex }));
  cache.set(key, { at: Date.now(), agents });
  return agents;
}
