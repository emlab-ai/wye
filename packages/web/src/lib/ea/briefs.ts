// The briefs, the pure part (req:ea.daily-brief, req:ea.weekly-pace, req:ea.one-on-one-prep): markdown built from one
// plain input — the assistant's knowledge (ea/model), the follow scan of the other products (ea/follow) and the snapshot
// of the last brief — so every rule here is tested with fixtures. ea/brief-run gathers the input and writes the page.
// Only approved commitments count (constraint:ea.pushed-is-proposed, test:ea.proposed-commitment-stays-in-inbox); met
// and dropped never show; every open one is listed from the day it is made, late and due today first
// (decision:ea.briefs-list-all-open-commitments, decision:ea.daily-brief-lists-all-open); every line links to the block
// it is about (test:ea.brief-lines-link-to-source).
import { addDays, counts, daysBetween, isOpenCommitment, namesMatch, personNames, slipCount, type EaCommitment, type EaModel, type EaProject } from './model';
import type { FollowItem } from './follow';

export type Snapshot = { date: string; projects: Record<string, { status: string; pace: string; target: string }>; commitments: Record<string, { due: string; state: string }> };
export type BriefInput = { product: string; director: string; model: EaModel; follow: FollowItem[]; previous: Snapshot | null };

export function snapshotOf(model: EaModel, date: string): Snapshot {
  return { date, projects: Object.fromEntries(model.projects.map(p => [p.id, { status: p.status, pace: p.pace, target: p.target }])), commitments: Object.fromEntries(model.commitments.filter(counts).map(c => [c.id, { due: c.due, state: c.state }])) };
}

const esc = (s: string) => s.replace(/([[\]])/g, '\\$1');
const link = (title: string, href: string) => `[${esc(title || href)}](${href})`;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function helpers(input: BriefInput) {
  const { model } = input;
  const person = new Map(model.people.map(p => [p.id, p]));
  const project = new Map(model.projects.map(p => [p.id, p]));
  const who = (id: string) => (id ? person.get(id)?.name ?? id.replace(/^[a-z-]+:([a-z0-9-]+\.)?/, '') : 'nobody named');
  const projectName = (id: string) => (id ? project.get(id)?.title ?? id : 'no project');
  const director = person.get(input.director);
  const names = director ? personNames(director) : [];
  const isDirector = (v: string) => !!v && (v === input.director || namesMatch(v, names));
  const open = model.commitments.filter(isOpenCommitment);
  const line = (c: EaCommitment, date: string) => {
    const late = c.due && c.due < date ? daysBetween(c.due, date) : 0;
    return `- ${link(c.title, c.id)} — ${who(c.owner)} · ${projectName(c.project)} · due ${c.due || 'no date'}${late ? ` (${plural(late, 'day')} late)` : c.due === date ? ' (today)' : ''}${c.moves.length ? ` · moved ${plural(c.moves.length, 'time')}` : ''}`;
  };
  const followLine = (f: FollowItem) => {
    const people = f.people.map(p => (p.id ? link(p.name, p.id) : p.name));
    return `- ${link(f.title, f.link)} — ${f.product} › ${f.project} · ${f.kind}${f.status ? ` (${f.status})` : ''} · ${f.why === 'owner' ? 'yours' : '@follow'}${people.length ? ` · with ${people.join(', ')}` : ''}${f.due ? ` · due ${f.due}` : ''}`;
  };
  return { person, project, who, projectName, isDirector, open, line, followLine, names };
}

const byDue = (a: EaCommitment, b: EaCommitment) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title);
const section = (title: string, lines: string[]) => (lines.length ? [`## ${title}`, '', ...lines, ''] : []);

// The morning brief (req:ea.daily-brief). First line: nothing late or due today, or how many; then Late, Due today,
// Open by project, Decisions waiting on you, You owe a reply or a follow-up, Changed since yesterday — an empty section
// is left out (test:ea.brief-quiet-day-one-line).
export function dailyBrief(input: BriefInput, date: string): string {
  const h = helpers(input);
  const late = h.open.filter(c => c.due && c.due < date).sort(byDue);
  const due = h.open.filter(c => c.due === date).sort(byDue);
  const rest = h.open.filter(c => !late.includes(c) && !due.includes(c));
  const groups = new Map<string, EaCommitment[]>();
  for (const c of rest.sort(byDue)) { if (!groups.has(c.project)) groups.set(c.project, []); groups.get(c.project)!.push(c); }
  const byProject = [...groups].sort((a, b) => byDue(a[1][0], b[1][0]) || h.projectName(a[0]).localeCompare(h.projectName(b[0])))
    .flatMap(([p, cs]) => [`### ${p ? link(h.projectName(p), p) : 'No project'}`, '', ...cs.map(c => h.line(c, date)), '']);
  const decisions = [
    ...input.model.decisions.filter(d => d.status === 'proposed' && h.isDirector(d.owner)).map(d => `- ${link(d.title, d.id)} — ${h.projectName(d.project)}${d.from ? ` · from ${link(d.from.replace(/^meeting:[a-z0-9-]+\./, ''), d.from)}` : ''}`),
    ...input.follow.filter(f => f.kind === 'decision').map(h.followLine),
  ];
  const owed = input.follow.filter(f => f.kind !== 'decision').map(h.followLine);
  const changed = changedSince(input, date);
  const head = late.length || due.length ? `${[late.length ? `${late.length} late` : '', due.length ? `${due.length} due today` : ''].filter(Boolean).join(', ')}.` : 'Nothing is late or due today.';
  const out = [head, '', ...section('Late', late.map(c => h.line(c, date))), ...section('Due today', due.map(c => h.line(c, date))),
    ...(byProject.length ? ['## Open, by project', '', ...byProject] : []), ...section('Decisions waiting on you', decisions),
    ...section('You owe a reply or a follow-up', owed), ...section('Changed since yesterday', changed)];
  return out.join('\n').replace(/\n+$/, '\n');
}

// Projects whose pace, status or target changed and commitments whose date moved since the previous brief's snapshot
// (test:ea.brief-lists-projects-changed-since-yesterday): a change already in that snapshot was reported then.
export function changedSince(input: BriefInput, date: string): string[] {
  const prev = input.previous; if (!prev || prev.date >= date) return [];
  const h = helpers(input); const out: string[] = [];
  for (const p of input.model.projects) {
    const o = prev.projects[p.id]; if (!o) continue;
    const diffs = ([['status', o.status, p.status], ['pace', o.pace, p.pace], ['target', o.target, p.target]] as const).filter(([, a, b]) => (a || '') !== (b || '')).map(([k, a, b]) => `${k} ${a || 'unset'} → ${b || 'unset'}`);
    if (diffs.length) out.push(`- ${link(p.title, p.id)} — ${diffs.join(', ')}`);
  }
  for (const c of h.open) {
    const o = prev.commitments[c.id]; if (!o || o.due === c.due) continue;
    const why = c.moves.filter(m => m.to === c.due).pop()?.why;
    out.push(`- ${link(c.title, c.id)} — ${h.who(c.owner)} · ${h.projectName(c.project)} · due ${o.due} → ${c.due}${why ? ` because ${why}` : ''}`);
  }
  return out;
}

// --- the weekly execution review (req:ea.weekly-pace) ---
export type ProjectWeek = { project: EaProject; planned: EaCommitment[]; done: EaCommitment[]; moved: { c: EaCommitment; from: string; to: string; on: string; why: string }[]; overdue: EaCommitment[]; risks: { id: string; title: string; severity: string }[]; quiet: boolean; needsYou: boolean; need: number; slips: number };

export function projectWeeks(input: BriefInput, weekEnding: string): ProjectWeek[] {
  const start = addDays(weekEnding, -6);
  const inWeek = (d: string) => !!d && d >= start && d <= weekEnding;
  const { model } = input;
  return model.projects.filter(p => p.status !== 'done' && p.status !== 'complete').map(project => {
    const cs = model.commitments.filter(c => c.project === project.id && counts(c));
    const planned = cs.filter(c => c.state !== 'dropped' && (inWeek(c.due) || c.moves.some(m => inWeek(m.from))));
    const done = cs.filter(c => c.state === 'met' && inWeek(c.metOn));
    const moved = cs.flatMap(c => c.moves.filter(m => inWeek(m.on)).map(m => ({ c, from: m.from, to: m.to, on: m.on, why: m.why })));
    const overdue = cs.filter(c => isOpenCommitment(c) && c.due && c.due < weekEnding).sort(byDue);
    const risks = model.risks.filter(r => r.project === project.id && counts(r) && !['resolved', 'done', 'closed'].includes(r.status)).map(r => ({ id: r.id, title: r.title, severity: r.severity }));
    // news: an update, a meeting about it, a commitment met, moved or made in a meeting this week
    const meetings = new Set(model.meetings.filter(m => inWeek(m.date)).map(m => m.id));
    const news = project.updates.some(u => inWeek(u.date)) || model.meetings.some(m => inWeek(m.date) && m.projects.includes(project.id))
      || moved.length > 0 || done.length > 0 || cs.some(c => meetings.has(c.from));
    const quiet = !news;
    // how much it needs the director: one for each reason — off track counts double
    const need = (project.status === 'off-track' ? 2 : project.status === 'at-risk' ? 1 : 0) + Number(project.pace === 'slowing') + Number(overdue.length > 0) + Number(quiet);
    return { project, planned, done, moved, overdue, risks, quiet, needsYou: need > 0, need, slips: slipCount(project, model.commitments) };
  }).sort((a, b) => b.need - a.need || a.project.title.localeCompare(b.project.title));
}

export function weeklyReview(input: BriefInput, weekEnding: string): string {
  const h = helpers(input);
  const weeks = projectWeeks(input, weekEnding);
  const need = weeks.filter(w => w.needsYou).length;
  const out = [`Week ending ${weekEnding}: ${need ? `${plural(need, 'project needs', 'projects need')} you` : 'no project needs you'}${weeks.length ? ` (of ${weeks.length})` : ''}.`, ''];
  for (const w of weeks) {
    const p = w.project;
    // a project with no news is gone quiet, never on track (req:ea.weekly-pace)
    const state = [p.status && !(w.quiet && p.status === 'on-track') ? p.status.replace(/-/g, ' ') : '', p.pace, w.quiet ? 'gone quiet' : ''].filter(Boolean).join(' · ');
    out.push(`## ${link(p.title, p.id)}${state ? ` — ${state}` : ''}`, '');
    out.push(`- Done vs planned: ${w.done.length} met of ${w.planned.length} planned this week${w.done.length ? ` — ${w.done.map(c => link(c.title, c.id)).join(', ')}` : ''}`);
    if (w.moved.length) { out.push(`- Dates moved this week (${w.moved.length}; ${plural(w.slips, 'move')} in all):`); for (const m of w.moved) out.push(`  - ${link(m.c.title, m.c.id)} ${m.from} → ${m.to} on ${m.on} because ${m.why}`); }
    if (w.overdue.length) { out.push('- Blockers — overdue:'); for (const c of w.overdue) out.push(`  ${h.line(c, weekEnding)}`); }
    if (w.risks.length) { out.push('- Open risks:'); for (const r of w.risks) out.push(`  - ${link(r.title, r.id)}${r.severity ? ` (${r.severity})` : ''}`); }
    out.push(`- Trend: ${p.pace || 'pace not set'}${p.target ? ` · target ${p.target}` : ''}${w.quiet ? ' · no update, meeting or commitment change in 7 days' : ''}`, '');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

// --- 1:1 prep (req:ea.one-on-one-prep) ---
export function oneOnOne(input: BriefInput, personId: string, date: string): string {
  const h = helpers(input);
  const p = h.person.get(personId);
  const name = p?.name ?? h.who(personId);
  const theirNames = p ? personNames(p) : [];
  const concerns = (f: FollowItem) => f.people.some(x => x.id === personId || namesMatch(x.id ?? x.name, theirNames)) || namesMatch(f.owner, theirNames);
  const threads = input.follow.filter(concerns).map(h.followLine);
  const theyOwe = h.open.filter(c => c.owner === personId).sort(byDue);
  const youOwe = h.open.filter(c => h.isDirector(c.owner) && c.to.includes(personId)).sort(byDue);
  const last = input.model.meetings.filter(m => m.type === '1on1' && m.attendees.includes(personId) && m.date <= date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const from = (mid: string) => [
    ...input.model.decisions.filter(d => d.from === mid).map(d => `  - decision ${link(d.title, d.id)}${d.status === 'proposed' ? ' (proposed)' : ''}`),
    ...input.model.commitments.filter(c => c.from === mid).map(c => `  - commitment ${link(c.title, c.id)} — ${h.who(c.owner)} · due ${c.due} · ${c.state}${c.status === 'proposed' ? ' (proposed)' : ''}`),
    ...input.model.risks.filter(r => r.from === mid).map(r => `  - risk ${link(r.title, r.id)}`),
    ...input.model.projects.flatMap(pr => pr.updates.filter(u => u.from === mid).map(u => `  - update on ${link(pr.title, pr.id)}: ${u.text}`)),
  ];
  const projects = input.model.projects.filter(pr => pr.owner === personId || pr.people.includes(personId)).map(pr => {
    const cs = h.open.filter(c => c.project === pr.id); const late = cs.filter(c => c.due && c.due < date).length;
    return `- ${link(pr.title, pr.id)} — ${[pr.status.replace(/-/g, ' '), pr.pace, pr.target ? `target ${pr.target}` : ''].filter(Boolean).join(' · ') || 'no status'} · ${plural(cs.length, 'open commitment')}${late ? `, ${late} late` : ''}${pr.owner === personId ? ' · they own it' : ''}`;
  });
  const out = [`1:1 with ${link(name, personId)} on ${date}: they owe ${theyOwe.length}, you owe them ${youOwe.length}${threads.length ? `, ${plural(threads.length, 'open thread')}` : ''}.`, '',
    ...section('Open threads', threads),
    ...section(`${name} owes`, theyOwe.map(c => h.line(c, date) + (c.to.length ? ` · to ${c.to.map(t => h.who(t)).join(', ')}` : ''))),
    ...section(`You owe ${name}`, youOwe.map(c => h.line(c, date))),
    ...(last.length ? ['## From your last 1:1s', '', ...last.flatMap(m => [`- ${link(m.title, m.id)} — ${m.date}`, ...from(m.id)]), ''] : []),
    ...section('Their projects', projects)];
  return out.join('\n').replace(/\n+$/, '\n');
}
