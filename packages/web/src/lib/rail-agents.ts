// The rail's Agents folder (decision:wf2.rail-shows-running-agents): the sessions running in this product now, each
// as one row — its state, what it works on, what it is doing, for how long. Pure, client-safe.
export type RailSession = { id: string; agent: string; status: string; createdAt: string; startedAt?: string; instruction?: string; task?: string; live?: boolean; busy?: boolean; asking?: { text?: string } | null; prs?: { title?: string; ref?: string }[]; log?: { t: string; line: string }[] };
export type RailAgent = { id: string; agent: string; state: 'working' | 'idle' | 'asking' | 'queued'; title: string; doing: string; since: string };

const RUNNING = new Set(['running', 'queued', 'claimed', 'waiting']);
// lines the app writes about a session, not what the agent is doing
const APP_LINE = /^(status →|started in the app|resumed|chat session created|claimed by|builds |waiting for a slot|agent exited|session (created|done))/i;

export function elapsed(from: string, now: number): string {
  const m = Math.floor((now - Date.parse(from)) / 60000);
  if (!(m >= 1)) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// The row's title: a build names the request it builds; anything else its own first line of text (a bare "Work on
// <id>." skipped for the line after it); the request it belongs to only when the instruction says nothing.
function titleOf(s: RailSession): string {
  const ins = s.instruction ?? '';
  // the request task itself (task:pr-N) carries the raw request as its title: the request's own title reads better
  if (/^Work on task:~?pr-\d+\b/.test(ins) || /^task:~?pr-\d+$/.test(s.task ?? '')) { const plan = ins.match(/on the plan pr:\d+ \("([^"]+)"\)/)?.[1]; if (plan) return plan; }
  for (const line of ins.split('\n').map(l => l.trim()).filter(Boolean)) {
    const text = line.replace(/^Work on\s+(?:[a-z-]+:[\w.~-]+[,\s]*)+[.:]?\s*/i, '').trim();
    if (text) return text.slice(0, 90);
  }
  return s.prs?.find(p => p.title)?.title ?? s.id;
}

export function railAgents(sessions: RailSession[], now = Date.now()): RailAgent[] {
  return sessions
    .filter(s => RUNNING.has(s.status) || s.live)
    .sort((a, b) => (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt))
    .map(s => {
      const asking = s.live && s.asking ? s.asking : null;
      const state: RailAgent['state'] = asking ? 'asking' : s.status === 'queued' && !s.live ? 'queued' : s.live && !s.busy ? 'idle' : 'working';
      const last = [...(s.log ?? [])].reverse().find(l => l.line && !APP_LINE.test(l.line))?.line ?? '';
      const doing = asking ? `waiting for you: ${asking.text ?? 'a question'}` : state === 'queued' ? 'waiting for a free agent slot' : last.replace(/\s+/g, ' ').slice(0, 140);
      return { id: s.id, agent: s.agent, state, title: titleOf(s), doing, since: elapsed(s.startedAt ?? s.createdAt, now) };
    });
}
