// How an agent process is launched (decision:wf2.agent-launch): the model it runs, how much it may do without asking,
// its reasoning effort and any flags of the person's own — per agent, in the app's settings (Settings › Agents). A
// skill, a workflow or a stage names its own model on its card (`model:`); the most specific one wins. Pure and
// browser-safe: the settings page reads the option lists, the host (lib/agent-host) turns a launch into arguments.
export type AgentLaunch = { model?: string; mode?: string; effort?: string; args?: string };
export type LaunchSettings = Record<string, AgentLaunch>;

// What each CLI accepts (`claude --help`, `codex exec --help`). The first mode is what Wye runs with when nothing is
// chosen; `flag` is what the person would type, shown beside the choice.
export const LAUNCH_OPTIONS: Record<string, { label: string; models: string[]; modes: { id: string; label: string; flag: string }[]; efforts: string[] }> = {
  'claude-code': {
    label: 'Claude Code',
    models: ['fable', 'opus', 'sonnet', 'haiku'],
    modes: [
      { id: 'default', label: 'Ask — every permission comes to the conversation', flag: '' },
      { id: 'acceptEdits', label: 'Accept edits — file edits without asking', flag: '--permission-mode acceptEdits' },
      { id: 'auto', label: 'Auto — a classifier approves what is safe', flag: '--permission-mode auto' },
      { id: 'plan', label: 'Plan — reads and plans, changes nothing', flag: '--permission-mode plan' },
      { id: 'dontAsk', label: 'Don’t ask — what is not allowed is denied', flag: '--permission-mode dontAsk' },
      { id: 'bypassPermissions', label: 'YOLO — every permission check skipped', flag: '--dangerously-skip-permissions' },
    ],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  codex: {
    label: 'Codex',
    models: [],
    modes: [
      { id: 'workspace-write', label: 'Workspace — writes the working folder', flag: '--sandbox workspace-write' },
      { id: 'read-only', label: 'Read only — changes nothing', flag: '--sandbox read-only' },
      { id: 'approve-for-me', label: 'Auto — approvals go through automatic review', flag: '--approve-for-me' },
      { id: 'danger-full-access', label: 'Full access — no sandbox', flag: '--sandbox danger-full-access' },
      { id: 'yolo', label: 'YOLO — no approvals, no sandbox', flag: '--dangerously-bypass-approvals-and-sandbox' },
    ],
    efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  },
};

// a model name goes to the CLI as one argument: an alias or a full id, never something that reads as a flag
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,99}$/;
export const validModel = (m: unknown): m is string => typeof m === 'string' && MODEL.test(m);

// The stored launch settings as the host uses them: known agents only, a mode or effort the CLI does not have dropped.
export function cleanLaunch(v: unknown): LaunchSettings {
  const out: LaunchSettings = {};
  const src = v && typeof v === 'object' ? v as Record<string, AgentLaunch | undefined> : {};
  for (const [agent, o] of Object.entries(LAUNCH_OPTIONS)) {
    const a = src[agent]; const l: AgentLaunch = {};
    if (a && typeof a === 'object') {
      const model = typeof a.model === 'string' ? a.model.trim() : '';
      if (validModel(model)) l.model = model;
      if (o.modes.slice(1).some(m => m.id === a.mode)) l.mode = a.mode;
      if (o.efforts.includes(a.effort ?? '')) l.effort = a.effort;
      const args = typeof a.args === 'string' ? a.args.replace(/\s+/g, ' ').trim().slice(0, 2000) : '';
      if (args) l.args = args;
    }
    out[agent] = l;
  }
  return out;
}

// The person's own flags as arguments: split on spaces, quotes keep a value together (`--settings '{"a": 1}'`).
export function splitArgs(s: string): string[] {
  const out: string[] = []; let cur = ''; let quote = ''; let open = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = ''; else if (c === '\\' && quote === '"' && i + 1 < s.length) cur += s[++i]; else cur += c; continue; }
    if (c === '"' || c === "'") { quote = c; open = true; continue; }
    if (/\s/.test(c)) { if (cur || open) out.push(cur); cur = ''; open = false; continue; }
    if (c === '\\' && i + 1 < s.length) { cur += s[++i]; continue; }
    cur += c;
  }
  if (cur || open) out.push(cur);
  return out;
}

// A card's `model:` for one agent: a bare name is for whichever agent runs (`model: opus`); `agent=name` pairs name
// one each (`model: claude-code=opus codex=gpt-5.1-codex`) — the pair for this agent wins over a bare name.
export function modelFor(value: string | undefined, agent: string): string {
  let bare = '';
  for (const tok of (value ?? '').split(/[\s,]+/).filter(Boolean)) {
    const m = tok.match(/^([a-z-]+)=(.+)$/);
    if (m) { if (m[1] === agent && validModel(m[2])) return m[2]; continue; }
    if (!bare && validModel(tok)) bare = tok;
  }
  return bare;
}

// Which model a session runs: its own, else the stage's, the skill's, the workflow's, the app's default for the
// agent — the first that names one. `from` says where it came from, for the console's opening note.
export type ModelSource = { from: string; value?: string };
export function resolveModel(agent: string, sources: ModelSource[]): { model: string; from: string } | null {
  for (const s of sources) { const model = modelFor(s.value, agent); if (model) return { model, from: s.from }; }
  return null;
}

// What the host adds to `claude -p …`. A librarian keeps its closed tool set whatever the mode says, so the mode is
// the workers'; `own` (a scheduled job's agent, decision:wf2.scheduler-runs-agents) runs as this machine set it up —
// only a model named for it applies.
export function claudeLaunchArgs(launch: AgentLaunch, o: { model?: string; librarian?: boolean; own?: boolean } = {}): string[] {
  const args: string[] = [];
  if (o.model) args.push('--model', o.model);
  if (o.own) return args;
  if (launch.mode) args.push(...(launch.mode === 'bypassPermissions' ? ['--dangerously-skip-permissions'] : ['--permission-mode', launch.mode]));
  if (launch.effort) args.push('--effort', launch.effort);
  args.push(...splitArgs(launch.args ?? ''));
  return args;
}

// What the host adds to `codex exec …` (after `exec`, or after `exec resume <thread>`). `resume` has no --sandbox or
// --approve-for-me: a sandbox other than the workspace goes as config, the rest stays as the thread started.
// A librarian on Codex (decision:wf2.pr-agent-and-model) is kept to the workspace sandbox whatever the mode says —
// never full access, never without a sandbox: Codex has no closed tool set to give it, so this is the tightest it
// runs with `wye` still reaching the app (a read-only sandbox has no network).
export function codexLaunchArgs(launch: AgentLaunch, o: { model?: string; resume?: boolean; own?: boolean; librarian?: boolean } = {}): string[] {
  const args: string[] = [];
  if (o.model) args.push('--model', o.model);
  if (o.own) return args;
  const mode = launch.mode || 'workspace-write';
  if (mode === 'yolo') args.push('--dangerously-bypass-approvals-and-sandbox');
  else if (o.resume) { if (mode === 'read-only' || mode === 'danger-full-access') args.push('-c', `sandbox_mode=${mode}`); }
  else if (mode === 'approve-for-me') args.push('--approve-for-me');
  else args.push('--sandbox', mode);
  if (launch.effort) args.push('-c', `model_reasoning_effort=${launch.effort}`);
  args.push(...splitArgs(launch.args ?? ''));
  return args;
}

// one line for the console: "model opus (skill:prd) · auto · effort high · --verbose"
export function launchLine(agent: string, launch: AgentLaunch, model: { model: string; from: string } | null, o: { librarian?: boolean; own?: boolean } = {}): string {
  const parts: string[] = [];
  if (model) parts.push(`model ${model.model} (${model.from})`);
  if (!o.own) {
    const mode = LAUNCH_OPTIONS[agent]?.modes.find(m => m.id === launch.mode);
    if (mode) parts.push(mode.flag);
    if (launch.effort) parts.push(`effort ${launch.effort}`);
    if (launch.args) parts.push(launch.args);
  }
  return parts.join(' · ');
}
