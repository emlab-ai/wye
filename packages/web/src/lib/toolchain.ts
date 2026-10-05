// What this machine has for the app and its agents (op:install.toolchain): the coding agents (agents-available), the
// `wye` command (installed in ~/.local/bin, bin/wye-home.js) and the command-line tools an agent may reach for. Checked
// once at startup (instrumentation.ts, which also installs `wye` when it is missing), then on request, cached a minute.
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './products';
import { agentsAvailable, onPath, type Agents } from './agents-available';

// the tools an agent's prompt names, so it does not spend turns on `which`
export const TOOLS = ['git', 'gh', 'node', 'npm', 'rg', 'jq', 'python3'] as const;

export interface CliStatus { link: string; target: string; installed: boolean; elsewhere: boolean; blocked: boolean; onPath: boolean; dir: string }
export interface Toolchain { agents: Agents; wye: CliStatus; tools: Record<string, boolean> }

// bin/wye-home.js knows where the command links (a home's bin/ is a link to the package, so it resolves to the install)
type Home = { cliStatus(): CliStatus; linkCli(): CliStatus; linkSkills(): string[] };
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
export const wyeHome = (): Home => req(/* turbopackIgnore: true */ /* webpackIgnore: true */ './bin/wye-home.js'); // read at run time, never bundled

const TTL = 60_000;
let cache: { at: number; value: Promise<Toolchain> } | null = null;

export function toolchain(fresh = false): Promise<Toolchain> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const value = Promise.all([agentsAvailable(), Promise.all(TOOLS.map(t => onPath(t, dirs, process.env)))])
    .then(([agents, found]) => ({ agents, wye: wyeHome().cliStatus(), tools: Object.fromEntries(TOOLS.map((t, i) => [t, found[i]])) }));
  cache = { at: Date.now(), value };
  return value;
}

// At startup: link `wye` (and the skills with it) when there is none, or the link is broken (its checkout is gone). A
// working link to another checkout is left alone — with several clones, the one a person installed stays the command.
// WYE_AUTO_INSTALL=0 turns it off.
export async function ensureToolchain(log: (line: string) => void = console.log): Promise<Toolchain> {
  if (process.env.WYE_AUTO_INSTALL !== '0') {
    const h = wyeHome(), st = h.cliStatus();
    if (!st.installed && !st.elsewhere && !st.blocked) {
      try { h.linkCli(); h.linkSkills(); log(`wye: installed the wye command → ${st.link} and the Claude Code skills`); }
      catch (e) { log(`wye: could not install the wye command: ${(e as Error).message}`); }
    }
  }
  const t = await toolchain(true);
  const mark = (ok: boolean) => ok ? '✓' : '✗';
  log(`wye: agents claude ${mark(t.agents.claude)} codex ${mark(t.agents.codex)} · wye ${t.wye.installed || t.wye.elsewhere ? `${t.wye.link}${t.wye.elsewhere ? ' (another checkout)' : ''}${t.wye.onPath ? '' : ` (add ${t.wye.dir} to PATH)`}` : t.wye.blocked ? `${t.wye.link} is not Wye's — left as it is` : 'not installed'} · tools ${TOOLS.map(n => `${n} ${mark(t.tools[n])}`).join(' ')}`);
  if (!t.agents.claude && !t.agents.codex) log('wye: no coding agent on PATH — install Claude Code (claude) or Codex (codex) to run agents');
  return t;
}

// one line for an agent's prompt: what it can call
export function toolsLine(t: Toolchain): string {
  const have = ['wye', ...TOOLS.filter(n => t.tools[n])], missing = TOOLS.filter(n => !t.tools[n]);
  return `- tools on this machine: ${have.map(n => `\`${n}\``).join(', ')}${missing.length ? `; not installed: ${missing.join(', ')}` : ''}`;
}
