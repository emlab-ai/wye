// The app's settings (Jev auto-linking design §0): one json file at <data>/_settings.json — local to this machine,
// listed in .gitignore, mode 0600 because it holds keys. Read fresh on every use (cheap, and the page's Save is
// visible to the next request); the browser only ever sees publicSettings().
import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT } from './products';
import { cleanLaunch, validModel, type LaunchSettings } from './agent-launch';

// onboarding: the Quick start's marked steps and dismissal per product slug — about the person at this machine, so here
// and never in a product file, Git or an export (docs/superpowers/specs/2026-10-05-onboarding-design.md)
export interface Settings { jev?: { key?: string }; agents?: { parallel?: number; agent?: string; librarian?: string; librarianModel?: string; hooks?: boolean }; /** how each agent CLI is launched: model, mode, effort, the person's own flags (lib/agent-launch) */ launch?: LaunchSettings; timezone?: string; onboarding?: Record<string, { done?: string[]; dismissed?: boolean }>; /** servers this app keeps an SSH reverse tunnel to, and whether each is wanted on (lib/remote) — replaced whole by a patch */ remotes?: { host: string; port: number; on?: boolean }[]; /** the folder open as the workspace (lib/workspace) — none: the app's own products; `workspaces` the recent ones, newest first; `workspaceScan` the vaults a Rescan found under a folder no vault names */ workspace?: string; workspaces?: string[]; workspaceScan?: Record<string, string[]> }

// The dispatcher's knobs (decision:wf2.pr-scheduler): how many builds run at once, and which agent builds by default.
export const AGENT_IDS = ['claude-code', 'codex'];
export const DEFAULT_AGENTS = { parallel: 1, agent: 'claude-code' };
// hooks: whether the hooks engine fires at all (decision:wf2.hooks-and-skills); on unless switched off here or WF_HOOKS=0
// librarian: the harness a librarian (Prompt Requests, Remember, Ask, a skill's librarian) runs on unless the person picked one
export function agentSettings(s: Settings): { parallel: number; agent: string; librarian: string; librarianModel: string; hooks: boolean } {
  const n = Number(s.agents?.parallel); const parallel = Number.isFinite(n) ? Math.max(1, Math.min(8, Math.round(n))) : DEFAULT_AGENTS.parallel;
  const agent = AGENT_IDS.includes(s.agents?.agent ?? '') ? s.agents!.agent! : DEFAULT_AGENTS.agent;
  const librarian = AGENT_IDS.includes(s.agents?.librarian ?? '') ? s.agents!.librarian! : DEFAULT_AGENTS.agent;
  const lm = (s.agents?.librarianModel ?? '').trim(); const librarianModel = validModel(lm) ? lm : '';
  return { parallel, agent, librarian, librarianModel, hooks: s.agents?.hooks !== false };
}

// how each agent is launched (decision:wf2.agent-launch): every known agent, empty when nothing is set
export const launchSettings = (s: Settings): LaunchSettings => cleanLaunch(s.launch);

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
  const next: Settings = { ...cur, ...(patch.jev ? { jev: { ...cur.jev, ...patch.jev } } : {}), ...(patch.agents ? { agents: { ...cur.agents, ...patch.agents } } : {}), ...(patch.launch ? { launch: mergeLaunch(cur.launch, patch.launch) } : {}), ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}), ...(patch.onboarding ? { onboarding: mergeOnboarding(cur.onboarding, patch.onboarding) } : {}), ...(patch.remotes ? { remotes: patch.remotes } : {}), ...(patch.workspace !== undefined ? { workspace: patch.workspace } : {}), ...(patch.workspaces ? { workspaces: patch.workspaces } : {}), ...(patch.workspaceScan ? { workspaceScan: { ...cur.workspaceScan, ...patch.workspaceScan } } : {}) };
  if (!next.workspace) delete next.workspace; // an empty folder: back to the app's own products
  if (next.remotes && !next.remotes.length) delete next.remotes;
  if (next.timezone !== undefined && !validZone(next.timezone)) delete next.timezone; // an empty or unknown zone: back to the machine's
  if (next.jev && !next.jev.key) delete next.jev; // an empty key removes the section
  await writeFile(file(root), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  await chmod(file(root), 0o600).catch(() => {}); // writeFile's mode only applies to a new file
  return next;
}
// an agent the patch names is replaced whole (an emptied field must go); the others are kept
const mergeLaunch = (cur: Settings['launch'], patch: LaunchSettings) => cleanLaunch({ ...(cur && typeof cur === 'object' ? cur : {}), ...patch });
// a patch's products merged field by field into the stored ones; products the patch does not name are kept
const mergeOnboarding = (cur: Settings['onboarding'], patch: NonNullable<Settings['onboarding']>) => {
  const out = { ...(cur && typeof cur === 'object' ? cur : {}) };
  for (const [p, v] of Object.entries(patch)) out[p] = { ...out[p], ...v };
  return out;
};
// the stored key, or the environment's for tests and evals outside the app
export async function jevKey(root: string = DATA_ROOT): Promise<string> { return (await readSettings(root)).jev?.key || (root === DATA_ROOT ? process.env.TYPESAFE_API_KEY : '') || ''; }
export function publicSettings(s: Settings): { jev: { set: boolean; last4: string }; agents: { parallel: number; agent: string; librarian: string; librarianModel: string; hooks: boolean }; launch: LaunchSettings; timezone: string } {
  const k = s.jev?.key ?? ''; return { jev: { set: !!k, last4: k.slice(-4) }, agents: agentSettings(s), launch: launchSettings(s), timezone: timeZoneOf(s) };
}
