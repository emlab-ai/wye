// The Digest's daily summary, the pure part (decision:ea.digest-is-a-page). The Digest is a live page of views; once a
// weekday morning skill:ea.daily-summary writes an entry into its "Daily summary" section. The agent reads a context
// computed here — what arrived, changed or closed since the last summary (a snapshot of the assistant's nodes then
// against now), grouped by project and person, and what waits now — then writes a few lines of judgment on top of it.

export type DigestNode = { id: string; kind: string; title: string; status: string; body: string; defined?: boolean };
export type DigestSnapshot = { date: string; nodes: Record<string, { kind: string; title: string; status: string; hash: string }> };

// what the director follows: the assistant's kinds and the work and statements filed about them
export const DIGEST_KINDS = new Set(['person', 'project', 'commitment', 'meeting', 'risk', 'decision', 'question', 'task', 'thread', 'email', 'fact', 'goal']);
const CLOSED = new Set(['done', 'shipped', 'complete', 'met', 'dropped', 'answered', 'cancelled', 'rejected', 'retired', 'superseded', 'dismissed']);
const closed = (n: { status: string; body?: string }) => CLOSED.has(n.status) || CLOSED.has((n.body ?? '').match(/^state:\s*(\S+)/m)?.[1] ?? '');

function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
// a card's meaning, without the keys the app moves by itself
const meaning = (n: DigestNode) => n.body.split('\n').filter(l => !/^(last-verified|session|evidence|by|since|worker|produced):/.test(l)).join('\n') + `|${n.status}`;

export function digestSnapshot(nodes: DigestNode[], date: string): DigestSnapshot {
  const out: DigestSnapshot['nodes'] = {};
  for (const n of nodes) if (n.defined !== false && DIGEST_KINDS.has(n.kind)) out[n.id] = { kind: n.kind, title: n.title, status: n.status, hash: hash(meaning(n)) };
  return { date, nodes: out };
}

const refsIn = (body: string, key: string) => (body.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1] ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(s => /^[a-z-]+:/.test(s));
// what a node is about, for grouping: its project, else the people on it
function aboutOf(n: DigestNode): string[] {
  if (n.kind === 'project' || n.kind === 'person') return [n.id];
  const p = [...refsIn(n.body, 'project'), ...refsIn(n.body, 'projects'), ...refsIn(n.body, 'part-of').filter(x => x.startsWith('project:'))];
  if (p.length) return [...new Set(p)];
  const who = [...refsIn(n.body, 'from'), ...refsIn(n.body, 'to'), ...refsIn(n.body, 'attendees'), ...refsIn(n.body, 'people'), ...refsIn(n.body, 'owner')].filter(x => x.startsWith('person:'));
  return who.length ? [...new Set(who)] : ['(nothing named)'];
}

export type QuietProject = { id: string; title: string; last: string | null; days: number | null };
export type DigestContext = { quiet?: QuietProject[]; suggestions?: { id: string; title: string; about: string; suggested: string }[]; since: string | null; added: DigestNode[]; changed: DigestNode[]; closedNow: DigestNode[]; waiting: DigestNode[]; late: DigestNode[]; dueSoon: DigestNode[] };

export function digestContext(prev: DigestSnapshot | null, nodes: DigestNode[], today: string): DigestContext {
  const mine = nodes.filter(n => n.defined !== false && DIGEST_KINDS.has(n.kind));
  const now = digestSnapshot(mine, today).nodes;
  const before = prev?.nodes ?? {};
  const added: DigestNode[] = [], changed: DigestNode[] = [], closedNow: DigestNode[] = [];
  if (prev) for (const n of mine) {
    const b = before[n.id];
    if (!b) added.push(n);
    else if (b.hash !== now[n.id].hash) (closed(n) && !CLOSED.has(b.status) ? closedNow : changed).push(n);
  }
  const due = (n: DigestNode) => n.body.match(/^due:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? '';
  const week = new Date(`${today}T12:00:00`); week.setDate(week.getDate() + 7); const weekDay = week.toISOString().slice(0, 10);
  const open = mine.filter(n => !closed(n));
  return {
    since: prev?.date ?? null, added, changed, closedNow,
    waiting: open.filter(n => n.kind === 'thread' || n.kind === 'email'),
    late: open.filter(n => due(n) && due(n) < today), dueSoon: open.filter(n => due(n) && due(n) >= today && due(n) <= weekDay),
  };
}

// The context as the agent reads it: grouped by what each thing is about, ids kept so the summary can link them.
export function contextMarkdown(c: DigestContext, titleOf: (id: string) => string, today: string): string {
  const line = (n: DigestNode) => `- ${n.kind} ${n.id} — ${n.title}${n.status ? ` (${n.status})` : ''}`;
  const grouped = (list: DigestNode[]) => {
    const g = new Map<string, DigestNode[]>();
    for (const n of list) for (const a of aboutOf(n)) { if (!g.has(a)) g.set(a, []); g.get(a)!.push(n); }
    return [...g].sort((a, b) => b[1].length - a[1].length).map(([a, ns]) => `#### ${a === '(nothing named)' ? a : `${titleOf(a)} (${a})`}\n${ns.map(line).join('\n')}`).join('\n\n');
  };
  const part = (title: string, list: DigestNode[], group = true) => list.length ? `### ${title} (${list.length})\n\n${group ? grouped(list) : list.map(line).join('\n')}\n` : '';
  return [
    `# Digest context — ${today}`,
    c.since ? `Since the last summary (${c.since}).` : 'No summary was written before: everything is new, so the "since" parts are left out — summarise what waits now.',
    part('Arrived', c.added), part('Changed', c.changed), part('Closed', c.closedNow),
    part('Late', c.late, false), part('Due within a week', c.dueSoon, false), part('Waiting for a reply (Slack, email)', c.waiting, false),
    c.quiet?.length ? (() => { const dated = c.quiet!.filter(q => q.last), none = c.quiet!.filter(q => !q.last);
      return `### Quiet projects (${c.quiet!.length})\n\nOpen projects with no activity — no meeting, no dated item, no change, nothing met — for ${QUIET_DAYS}+ days:\n\n${dated.map(q => `- ${q.id} — ${q.title}: last activity ${q.last} (${q.days} days ago)`).join('\n')}${none.length ? `${dated.length ? '\n' : ''}- no dated activity on record (${none.length}): ${none.map(q => q.id).join(', ')}` : ''}\n`; })() : '',
    c.suggestions ? `### Open suggestions (${c.suggestions.length})\n\n${c.suggestions.length ? c.suggestions.map(s => `- ${s.id} — ${s.title}${s.about ? ` (about ${s.about})` : ''}, suggested ${s.suggested}`).join('\n') : 'none'}\n` : '',
  ].filter(Boolean).join('\n\n');
}

// The entry goes at the top of the "## Daily summary" section (under its one-line intro), as `### <date>`; an entry of
// the same date is replaced; at most `keep` entries stay (the oldest go).
export function prependSummary(md: string, date: string, entry: string, keep = 30): string {
  const m = md.match(/^## Daily summary[^\n]*\n/m);
  const body = `### ${date}\n\n${entry.trim()}\n`;
  if (!m) return `${md.replace(/\s*$/, '\n')}\n## Daily summary\n\n${body}`;
  const start = m.index! + m[0].length;
  const rest = md.slice(start); const nextH2 = rest.search(/^## /m);
  const section = nextH2 === -1 ? rest : rest.slice(0, nextH2); const after = nextH2 === -1 ? '' : rest.slice(nextH2);
  const firstEntry = section.search(/^### /m);
  const intro = (firstEntry === -1 ? section : section.slice(0, firstEntry)).replace(/\s*$/, '');
  const entries = firstEntry === -1 ? [] : section.slice(firstEntry).split(/^(?=### )/m).map(e => e.replace(/\s*$/, '')).filter(e => e && !e.startsWith(`### ${date}\n`) && e !== `### ${date}`);
  const kept = [body.replace(/\s*$/, ''), ...entries].slice(0, keep);
  return `${md.slice(0, start)}${intro ? `${intro}\n\n` : '\n'}${kept.join('\n\n')}\n${after ? `\n${after}` : ''}`;
}

export const QUIET_DAYS = 14;
// A project's last activity: the latest of the meetings that discussed it, the changes recorded to it or to an item
// about it, and the commitments on it that were met. Open projects quiet for QUIET_DAYS or more, quietest first.
export function quietProjects(nodes: DigestNode[], changes: { node: string; at: string }[], today: string, days = QUIET_DAYS): QuietProject[] {
  const projects = nodes.filter(n => n.kind === 'project' && n.defined !== false && !closed(n));
  const last = new Map<string, string>(projects.map(p => [p.id, '']));
  const bump = (p: string, d: string) => { if (last.has(p) && d && d > (last.get(p) ?? '')) last.set(p, d.slice(0, 10)); };
  const about = new Map<string, string[]>();
  for (const n of nodes) {
    const ps = [...refsIn(n.body, 'project'), ...refsIn(n.body, 'projects'), ...refsIn(n.body, 'part-of')].filter(x => x.startsWith('project:'));
    if (ps.length) about.set(n.id, ps);
    // a dated item about it — a meeting, a decision, a fact, an update — is activity on that day (not a date to come)
    { const d = n.body.match(/^(?:date|since):\s*(\d{4}-\d{2}-\d{2})/m)?.[1]; if (d && d <= today) for (const p of ps) bump(p, d); }
    const met = n.body.match(/^met-on:\s*(\d{4}-\d{2}-\d{2})/m)?.[1]; if (met) for (const p of ps) bump(p, met);
  }
  for (const c of changes) { bump(c.node, c.at); for (const p of about.get(c.node) ?? []) bump(p, c.at); }
  const dayMs = 86400000; const t = Date.parse(`${today}T12:00:00`);
  return projects.map(p => { const l = last.get(p.id) || null; return { id: p.id, title: p.title, last: l, days: l ? Math.round((t - Date.parse(`${l}T12:00:00`)) / dayMs) : null }; })
    .filter(q => q.days === null || q.days >= days).sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9));
}
