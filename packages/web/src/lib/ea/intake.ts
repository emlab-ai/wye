// Intake, the pure part (decision:ea.tools-push-through-cli, task:ea.cli-intake, req:ea.meeting-lands-in-place): a
// meeting analysis an outside tool pushes is validated, then planned against what the product holds — the meeting
// card, a proposed card for every decision, commitment and risk (`by: agent:<source>`, `from:` the meeting), an update
// line under its project, a proposed person for every name nobody goes by, and for an item whose project is unknown or
// ambiguous, or whose owner is ambiguous, an open question under the meeting and an inbox item instead of a guess.
// Everything lands proposed (constraint:ea.pushed-is-proposed). Same title + date → same meeting, and an item already
// filed from it is not filed again, so a second push of one analysis plans nothing. ea/intake-run does the writes.
import { slugify } from '../templates';
import { isDate, matchPeople, matchProjects, type EaModel, type EaPerson, type EaProject } from './model';

export type IntakeItem = { kind: 'decision' | 'commitment' | 'risk' | 'update'; text: string; title?: string; owner?: string; due?: string; project?: string; people?: string[] };
export type IntakeInput = { meeting: { title: string; date: string; attendees: string[]; source: string; type?: string; projects?: string[] }; items: IntakeItem[] };
const KINDS = ['decision', 'commitment', 'risk', 'update'];

// The analysis checked field by field; every problem named with where it is.
export function validateIntake(raw: unknown): { ok: true; input: IntakeInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['the analysis must be a JSON object { meeting, items }'] };
  const m = o.meeting as Record<string, unknown> | undefined;
  const strs = (v: unknown, where: string): string[] => { if (v === undefined) return []; if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) { errors.push(`${where} must be a list of names (strings)`); return []; } return (v as string[]).map(s => s.trim()).filter(Boolean); };
  if (!m || typeof m !== 'object') errors.push('meeting is required: { "title", "date": "YYYY-MM-DD", "attendees": [names], "source" }');
  const title = typeof m?.title === 'string' ? m.title.trim() : '';
  if (m && !title) errors.push('meeting.title is required');
  if (m && !isDate(m.date)) errors.push(`meeting.date must be YYYY-MM-DD (got ${JSON.stringify(m?.date)})`);
  const attendees = strs(m?.attendees, 'meeting.attendees');
  const projects = strs(m?.projects, 'meeting.projects');
  if (m?.source !== undefined && typeof m.source !== 'string') errors.push('meeting.source must be a string (the tool, e.g. cowork)');
  if (m?.type !== undefined && typeof m.type !== 'string') errors.push('meeting.type must be a string ("1on1" for a 1:1)');
  // "1on1 (only for a 1:1)" — the skill's example copied word for word — still means a 1:1
  const type = typeof m?.type === 'string' ? (/^\s*1\s*on\s*1\b|^\s*1:1\b/i.test(m.type) ? '1on1' : slugify(m.type)) : '';
  if (o.items !== undefined && !Array.isArray(o.items)) errors.push('items must be a list');
  const items: IntakeItem[] = [];
  ((Array.isArray(o.items) ? o.items : []) as unknown[]).forEach((x, i) => {
    const it = x as Record<string, unknown>; const at = `items[${i}]`;
    if (!it || typeof it !== 'object') { errors.push(`${at} must be an object`); return; }
    if (!KINDS.includes(it.kind as string)) { errors.push(`${at}.kind must be one of ${KINDS.join(', ')} (got ${JSON.stringify(it.kind)})`); return; }
    const text = typeof it.text === 'string' ? it.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) errors.push(`${at}.text is required`);
    for (const k of ['title', 'owner', 'project'] as const) if (it[k] !== undefined && typeof it[k] !== 'string') errors.push(`${at}.${k} must be a string`);
    if (it.kind === 'commitment' && !isDate(it.due)) errors.push(`${at}: a commitment needs due as YYYY-MM-DD (got ${JSON.stringify(it.due)}) — no date said, push it as an update`);
    else if (it.due !== undefined && !isDate(it.due)) errors.push(`${at}.due must be YYYY-MM-DD`);
    const people = strs(it.people, `${at}.people`);
    items.push({ kind: it.kind as IntakeItem['kind'], text, ...(typeof it.title === 'string' && it.title.trim() ? { title: it.title.trim() } : {}), ...(typeof it.owner === 'string' && it.owner.trim() ? { owner: it.owner.trim() } : {}), ...(typeof it.due === 'string' ? { due: it.due } : {}), ...(typeof it.project === 'string' && it.project.trim() ? { project: it.project.trim() } : {}), ...(people.length ? { people } : {}) });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, input: { meeting: { title, date: m!.date as string, attendees, source: (typeof m!.source === 'string' && m!.source.trim()) || 'cli', ...(type ? { type } : {}), ...(projects.length ? { projects } : {}) }, items } };
}

export type PlannedCard = { kind: string; id: string; title: string; status: 'proposed'; props: Record<string, string>; exists: boolean };
export type PlannedLine = { under: string; id: string; line: string };
export type PlannedQuestion = PlannedLine & { item: IntakeItem; index: number; q: string; candidates: string[] };
export type IntakePlan = { meeting: PlannedCard; people: PlannedCard[]; cards: PlannedCard[]; updates: PlannedLine[]; questions: PlannedQuestion[]; skipped: string[]; notes: string[] };
// what the product already has that the plan needs to know: every id, and for an existing card the meeting it came from
export type Existing = { ids: Set<string>; from: Map<string, string> };

// A prop value safe inside a row's `(k: v, …)` group: no parentheses, no `, key:` that would read as a new key.
export const safe = (v: string) => v.replace(/[()]/g, '').replace(/,(\s*[A-Za-z][\w-]*:)/g, ';$1').replace(/\s+/g, ' ').trim();
// A row's text: one line, no trailing `#tag` or `(k: v)` the parser would take for a status or props.
export const rowText = (t: string) => t.replace(/\s+/g, ' ').replace(/(\s#[a-z-]+)+\s*$/i, '').replace(/\(([A-Za-z][\w-]*:[^()]*)\)\s*$/, '[$1]').trim();
const list = (ids: string[]) => `[${ids.join(', ')}]`;

export function planIntake(model: Pick<EaModel, 'people' | 'projects'>, input: IntakeInput, prefix: string, existing: Existing): IntakePlan {
  const by = `agent:${slugify(input.meeting.source)}`;
  const meetingId = `meeting:${prefix}.${slugify(input.meeting.title).slice(0, 48)}-${input.meeting.date}`;
  const taken = new Set(existing.ids);
  const notes: string[] = []; const skipped: string[] = [];
  const people: PlannedCard[] = []; const known: EaPerson[] = [...model.people];
  // a name nobody goes by is a new person — a hub of its own, proposed — never a guess at who it might be
  const person = (name: string): { id: string } | { ambiguous: EaPerson[] } => {
    const hit = matchPeople(known, name);
    if (hit.length === 1) return { id: hit[0].id };
    if (hit.length > 1) return { ambiguous: hit };
    let slug = slugify(name).slice(0, 40), n = 2; const base = slug;
    while (taken.has(`person:${prefix}.${slug}`)) slug = `${base}-${n++}`;
    const id = `person:${prefix}.${slug}`; taken.add(id);
    people.push({ kind: 'person', id, title: name.trim(), status: 'proposed', props: { name: safe(name), by }, exists: false });
    known.push({ id, title: name.trim(), name: name.trim(), role: '', aliases: [], reportsTo: '', status: 'proposed' });
    return { id };
  };
  const project = (name: string): EaProject[] => matchProjects(model.projects, name);

  const attendees: string[] = [];
  for (const a of input.meeting.attendees) { const r = person(a); if ('id' in r) attendees.push(r.id); else notes.push(`attendee "${a}" could be ${r.ambiguous.map(p => p.id).join(' or ')} — not linked`); }
  const meetingProjects: string[] = [];
  for (const p of input.meeting.projects ?? []) { const hit = project(p); if (hit.length === 1) meetingProjects.push(hit[0].id); else notes.push(`meeting project "${p}" ${hit.length ? `could be ${hit.map(x => x.id).join(' or ')}` : 'is not a project here'} — not linked`); }
  const meeting: PlannedCard = { kind: 'meeting', id: meetingId, title: input.meeting.title, status: 'proposed', exists: existing.ids.has(meetingId), props: {
    date: input.meeting.date, ...(attendees.length ? { attendees: list([...new Set(attendees)]) } : {}), ...(meetingProjects.length ? { projects: list(meetingProjects) } : {}), source: safe(input.meeting.source), ...(input.meeting.type ? { format: input.meeting.type } : {}), by } };
  const mslug = meetingId.slice(meetingId.indexOf('.') + 1);

  const cards: PlannedCard[] = []; const updates: PlannedLine[] = []; const questions: PlannedQuestion[] = [];
  input.items.forEach((it, index) => {
    const short = it.text.length > 80 ? it.text.slice(0, 77) + '…' : it.text;
    const ask = (q: string, candidates: string[]) => {
      const id = `question:${prefix}.${mslug}-q${index + 1}`;
      questions.push({ under: meetingId, id, item: it, index, q, candidates, line: `- ${id} ${rowText(q)} #open (related-to: ${list([meetingId, ...candidates])})` });
    };
    // the project: the item's own name, else the meeting's one project; none, or two that fit, is a question
    const pname = it.project ?? (meetingProjects.length === 1 ? meetingProjects[0] : '');
    const ps = pname ? project(pname) : [];
    if (ps.length !== 1) { ask(`Which project is "${short.replace(/"/g, "'")}" about?${pname ? ` "${pname}" ${ps.length ? 'fits more than one' : 'is not a project here'}.` : ''}`, ps.map(p => p.id)); return; }
    const pid = ps[0].id;
    let owner = '';
    if (it.owner) { const r = person(it.owner); if ('ambiguous' in r) { ask(`Who is "${it.owner}" in "${short.replace(/"/g, "'")}"?`, r.ambiguous.map(p => p.id)); return; } owner = r.id; }
    const linked = (it.people ?? []).map(n => person(n)).filter((r): r is { id: string } => 'id' in r).map(r => r.id);
    if (it.kind === 'update') {
      const id = `update:${prefix}.${mslug}-u${index + 1}`;
      updates.push({ under: pid, id, line: `- ${id} ${rowText(it.title ? `${it.title} — ${it.text}` : it.text)} #proposed (from: ${meetingId}, date: ${input.meeting.date}, by: ${by})` });
      return;
    }
    const title = rowText(it.title ? `${it.title} — ${it.text}` : it.text);
    const base = slugify(it.title ?? it.text).slice(0, 40);
    let slug = base, n = 2, id = `${it.kind}:${prefix}.${slug}`, exists = false;
    // the same item pushed again from the same meeting is the card already there; another meeting's card of that name is
    // a different one, so the slug steps on
    for (;;) {
      if (existing.ids.has(id) && existing.from.get(id) === meetingId) { exists = true; break; }
      if (!taken.has(id)) break;
      slug = `${base}-${n++}`; id = `${it.kind}:${prefix}.${slug}`;
    }
    taken.add(id);
    if (exists) { skipped.push(id); return; }
    const props: Record<string, string> = it.kind === 'commitment'
      ? { ...(owner ? { owner } : {}), due: it.due!, state: 'open', project: pid, from: meetingId, ...(linked.length ? { to: list(linked) } : {}), by }
      : { ...(owner ? { owner } : {}), project: pid, from: meetingId, ...(linked.length ? { 'related-to': list(linked) } : {}), by };
    cards.push({ kind: it.kind, id, title, status: 'proposed', props, exists: false });
  });
  return { meeting, people, cards, updates, questions, skipped, notes };
}

// The summary a push returns: what was made, what waits for the director, what was already there.
export type IntakeSummary = { meeting: string; meetingCreated: boolean; created: string[]; updates: string[]; questions: string[]; inbox: string[]; skipped: string[]; notes: string[] };
