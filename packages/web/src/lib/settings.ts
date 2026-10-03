// The app's settings (Jev auto-linking design §0): one json file at <data>/_settings.json — local to this machine,
// listed in .gitignore, mode 0600 because it holds keys. Read fresh on every use (cheap, and the page's Save is
// visible to the next request); the browser only ever sees publicSettings().
import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT } from './products';

export interface Settings { jev?: { key?: string }; agents?: { parallel?: number; agent?: string; hooks?: boolean }; timezone?: string }

// The dispatcher's knobs (decision:wf2.pr-scheduler): how many builds run at once, and which agent builds by default.
export const AGENT_IDS = ['claude-code', 'codex'];
export const DEFAULT_AGENTS = { parallel: 1, agent: 'claude-code' };
// hooks: whether the hooks engine fires at all (decision:wf2.hooks-and-skills); on unless switched off here or WF_HOOKS=0
export function agentSettings(s: Settings): { parallel: number; agent: string; hooks: boolean } {
  const n = Number(s.agents?.parallel); const parallel = Number.isFinite(n) ? Math.max(1, Math.min(8, Math.round(n))) : DEFAULT_AGENTS.parallel;
  const agent = AGENT_IDS.includes(s.agents?.agent ?? '') ? s.agents!.agent! : DEFAULT_AGENTS.agent;
  return { parallel, agent, hooks: s.agents?.hooks !== false };
}

// the person's time zone (decision:ea.time-based-hooks): what a `time.<schedule>` hook's HH:MM means; WYE_TZ overrides
// it (tests), else the setting, else this machine's zone — an IANA name Intl does not know falls through
export const validZone = (tz: string | undefined): tz is string => { if (!tz) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
export function timeZoneOf(s: Settings): string {
  for (const tz of [process.env.WYE_TZ, s.timezone]) if (validZone(tz)) return tz;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

const file = (root: string) => path.join(root, '_settings.json');

export async function readSettings(root: string = DATA_ROOT): Promise<Settings> {
  try { return JSON.parse(await readFile(file(root), 'utf8')) as Settings; } catch { return {}; }
}
export async function writeSettings(patch: Settings, root: string = DATA_ROOT): Promise<Settings> {
  const cur = await readSettings(root);
  const next: Settings = { ...cur, ...(patch.jev ? { jev: { ...cur.jev, ...patch.jev } } : {}), ...(patch.agents ? { agents: { ...cur.agents, ...patch.agents } } : {}), ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}) };
  if (next.timezone !== undefined && !validZone(next.timezone)) delete next.timezone; // an empty or unknown zone: back to the machine's
  if (next.jev && !next.jev.key) delete next.jev; // an empty key removes the section
  await writeFile(file(root), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  await chmod(file(root), 0o600).catch(() => {}); // writeFile's mode only applies to a new file
  return next;
}
// the stored key, or the environment's for tests and evals outside the app
export async function jevKey(root: string = DATA_ROOT): Promise<string> { return (await readSettings(root)).jev?.key || (root === DATA_ROOT ? process.env.TYPESAFE_API_KEY : '') || ''; }
export function publicSettings(s: Settings): { jev: { set: boolean; last4: string }; agents: { parallel: number; agent: string; hooks: boolean }; timezone: string } {
  const k = s.jev?.key ?? ''; return { jev: { set: !!k, last4: k.slice(-4) }, agents: agentSettings(s), timezone: timeZoneOf(s) };
}
