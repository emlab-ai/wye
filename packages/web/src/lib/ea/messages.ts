// Slack threads and emails waiting on the director (decision:ea.messages-pushed): an outside tool pushes them with
// `wye ea intake` as `{ "messages": [...] }`, next to or instead of a meeting. Each becomes a thread: or email: card in
// its collection page — open while a reply (or a look) is owed, answered once given. The tool's own id is kept
// (`source-id`), so a second push of the same thread updates its card: a newer time, the answer given. They are not
// knowledge waiting for review but what is waiting on the director, so they are not proposed; answered is `done`. Pure: the IO is in
// intake-run.
import { matchPeople, matchProjects, type EaModel } from './model';
import { safe } from './intake';

export type MessageIn = { via: 'slack' | 'email'; id: string; title: string; link: string; at: string; from?: string; channel?: string; waiting?: 'reply' | 'look'; answered?: boolean; project?: string };
export type PlannedMessage = { kind: 'thread' | 'email'; id: string; title: string; status: 'open' | 'done'; props: Record<string, string>; exists: boolean; notes: string[] };

const isWhen = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function validateMessages(raw: unknown): { ok: true; messages: MessageIn[] } | { ok: false; errors: string[] } {
  const errors: string[] = []; const out: MessageIn[] = [];
  if (!Array.isArray(raw)) return { ok: false, errors: ['messages must be a list'] };
  raw.forEach((x, i) => {
    const m = x as Record<string, unknown>; const at = `messages[${i}]`;
    if (!m || typeof m !== 'object') { errors.push(`${at} must be an object`); return; }
    if (m.via !== 'slack' && m.via !== 'email') { errors.push(`${at}.via must be "slack" or "email"`); return; }
    for (const k of ['id', 'title', 'link'] as const) if (typeof m[k] !== 'string' || !(m[k] as string).trim()) errors.push(`${at}.${k} is required`);
    if (!isWhen(m.at)) errors.push(`${at}.at must be a date (YYYY-MM-DD or an ISO time), got ${JSON.stringify(m.at)}`);
    for (const k of ['from', 'channel', 'project'] as const) if (m[k] !== undefined && typeof m[k] !== 'string') errors.push(`${at}.${k} must be a string`);
    if (m.waiting !== undefined && m.waiting !== 'reply' && m.waiting !== 'look') errors.push(`${at}.waiting must be "reply" or "look"`);
    if (m.answered !== undefined && typeof m.answered !== 'boolean') errors.push(`${at}.answered must be true or false`);
    if (errors.length) return;
    out.push({ via: m.via, id: String(m.id).trim(), title: String(m.title).replace(/\s+/g, ' ').trim(), link: String(m.link).trim(), at: String(m.at),
      ...(typeof m.from === 'string' && m.from.trim() ? { from: m.from.trim() } : {}), ...(typeof m.channel === 'string' && m.channel.trim() ? { channel: m.channel.trim() } : {}),
      ...(m.waiting ? { waiting: m.waiting as 'reply' | 'look' } : {}), ...(m.answered ? { answered: true } : {}), ...(typeof m.project === 'string' && m.project.trim() ? { project: m.project.trim() } : {}) });
  });
  return errors.length ? { ok: false, errors } : { ok: true, messages: out };
}

// `bySource`: the cards already there, by `<kind>|<source-id>` — a second push of the same thread updates that card
export function planMessages(model: Pick<EaModel, 'people' | 'projects'>, messages: MessageIn[], prefix: string, bySource: Map<string, string>, taken: Set<string>): PlannedMessage[] {
  return messages.map(m => {
    const kind = m.via === 'slack' ? 'thread' : 'email';
    const notes: string[] = [];
    const known = bySource.get(`${kind}|${m.id}`);
    let id = known ?? '';
    if (!id) { let s = `${kind}:${prefix}.${slug(m.title).slice(0, 40) || slug(m.id).slice(0, 40)}`; const base = s; let n = 2; while (taken.has(s)) s = `${base}-${n++}`; id = s; taken.add(id); }
    const props: Record<string, string> = { link: m.link, at: m.at.slice(0, 10), 'source-id': safe(m.id) };
    if (kind === 'thread') props.channel = safe(m.channel ?? 'dm');
    if (m.waiting) props.waiting = m.waiting;
    if (m.from) { const hit = matchPeople(model.people, m.from); if (hit.length === 1) props.from = hit[0].id; else notes.push(`from "${m.from}" ${hit.length ? `could be ${hit.map(p => p.id).join(' or ')}` : 'is nobody known'} — not linked`); }
    if (m.project) { const hit = matchProjects(model.projects, m.project); if (hit.length === 1) props.project = hit[0].id; else notes.push(`project "${m.project}" ${hit.length ? 'is ambiguous' : 'is not known'} — not linked`); }
    return { kind, id, title: m.title, status: m.answered ? 'done' : 'open', props, exists: !!known, notes };   // answered = done: what every view counts as closed
  });
}
