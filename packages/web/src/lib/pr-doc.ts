// The plan document (req:wf2.sessions.pr-doc, rule:pr-doc): one per request that starts work — a new session or
// a fresh-context message (decision:wf2.plan-per-request) — created by the app from templates/docs/pr.md
// under the project's Plans page (decision:wf2.plans-folder), finished by the app with the result. Pure: the slug,
// the body, the result section scoped to the plan's window, the frontmatter edits, a session's plans read from the
// graph; the IO lives in lib/plan-docs.
import type { BlockChange, Session, SessionPr, SessionStatus } from './session-types';

// The PRs page of a project: `prs.md`, node module:<project>-requests — every request is a sub-page of it;
// the rail shows it as a system folder, not in the Documents tree (rule:prs-folder).
export const prsPageId = (projectSlug: string) => `module:${projectSlug}-prs`;

// PRs are numbered like pull requests (decision:wf2.pr-numbers): `pr:123`, file `pr-123.md`, shown as "#123 Title".
// The next number is one more than the highest in use across the product — from the graph's pr nodes and the
// files on disk (a page written a second ago may not be in the graph yet).
export const prNumberOf = (idOrSlug: string): number | null => { const m = idOrSlug.match(/^(?:pr:|pr-)?(\d+)$/); return m ? Number(m[1]) : null; };
export function nextPrNumber(taken: Iterable<string>): number {
  let max = 0; for (const t of taken) { const n = prNumberOf(t); if (n && n > max) max = n; }
  return max + 1;
}
export const prLabel = (num: number, title: string) => `#${num} ${title}`;

// The title: the first non-empty line of the request, markdown stripped, cut at 90 characters.
export function prTitle(request: string): string {
  const line = request.split('\n').map(l => l.trim()).find(Boolean) ?? 'request';
  const plain = line.replace(/^#+\s*/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
  return plain.length > 90 ? `${plain.slice(0, 89).replace(/\s+\S*$/, '')}…` : plain || 'request';
}

// partOf: what the request task is part of (req:exec.request-is-a-task) — the goal or node it was sent from;
// task: the task the session was assigned (req:exec.dispatch) — embedded on the plan instead of a new request task
export type PrDocVars = { num: number; slug: string; title: string; date: string; session: string; agent: string; started: string; parent: string; request: string; from: string; partOf?: string; task?: string; skills?: string[]; hooks?: string[]; role?: 'worker' | 'librarian' };

// The request task (req:exec.request-is-a-task, decision:exec.task-is-the-unit): `task:<plan-slug>` on the plan
// document — the request itself as a work item, on the Work view from the first second.
export const requestTaskId = (slug: string) => `task:${slug}`;

// Fill the template. A request is quoted line by line so its own headings and blocks stay prose; `from` is the
// line that names where the request came from (document, node, refs) as tags — empty when nothing is known.
export function prDocBody(template: string, v: PrDocVars): string {
  const request = v.request.trim().split('\n').map(l => `> ${l}`).join('\n');
  // the request task's text can carry no parenthesis or hashtag: they would read as its properties or status
  const taskTitle = v.title.replace(/[()#]/g, ' ').replace(/\s+/g, ' ').trim();
  const requestTask = v.task ? `![[${v.task}]]` : `- [ ] ${requestTaskId(v.slug)} ${taskTitle} #in-progress (worker: ${v.agent}, session: ${v.session}${v.partOf ? `, part-of: ${v.partOf}` : ''})`;
  let out = template.replace(/\{\{(num|slug|title|date|session|agent|started|parent|request|from|task|requesttask|role)\}\}/g, (_, k: string) => k === 'request' ? request : k === 'requesttask' ? requestTask : k === 'role' ? (v.role === 'librarian' ? 'librarian' : '') : k === 'num' ? String(v.num) : String(v[k as keyof PrDocVars] ?? ''));
  // the skills and hooks attached to the request (decision:wf2.hooks-and-skills): the librarian's session carries the
  // skills' bodies; the hooks fire on the request's events besides the ones that match anyway
  out = out.replace(/^skills: \{\{skills\}\}\n/m, v.skills?.length ? `skills: [${v.skills.join(', ')}]\n` : '');
  out = out.replace(/^hooks: \{\{hooks\}\}\n/m, v.hooks?.length ? `hooks: [${v.hooks.join(', ')}]\n` : '');
  if (!v.parent) out = out.replace(/^part-of: \n/m, '');
  if (!v.task) out = out.replace(/^task: \n/m, '');
  // the page is born with someone on it (decision:wf2.pr-lifecycle): refining under a librarian, building under a worker
  if (v.role !== 'librarian') { out = out.replace(/^role: \n/m, ''); out = out.replace(/^status: draft$/m, 'status: building'); }
  else out = out.replace(/^status: draft$/m, 'status: refining');
  if (!v.from) out = out.replace(/\n{3,}## Context/, '\n\n## Context');
  return out;
}

// "from: module:x · refs: req:z" — what the palette knew about where the request was made, as tags.
export function fromLine(s: Pick<Session, 'refs' | 'source'>, docNode?: string): string {
  const parts: string[] = [];
  if (docNode && !docNode.startsWith('pr:')) parts.push(`from: ${docNode}`); // a PR page you happened to be on is not where the request comes from
  const refs = s.refs.filter(r => r !== docNode && !/^(pr|session):/.test(r));
  if (refs.length) parts.push(`refs: ${refs.join(', ')}`);
  return parts.length ? `_${parts.join(' · ')}_` : '';
}

// The app path of a plan document ref (product/project/slug).
export function prDocPath(ref: string): string { const [product, project, slug] = ref.split('/'); return `/${product}/${project}/d/${slug}`; }

const MARK: Record<BlockChange['change'], string> = { added: 'added', changed: 'changed', removed: 'removed' };

// The request's window (decision:wf2.plan-result-owned-by-app): only blocks credited between `started` and `finished`
// (ISO strings, compared as such) count, and never the plan's own page or the Plans page (`exclude`).
export type PrWindow = { started?: string; finished?: string; exclude?: string[] };

// The Result section's body: the summary, then the blocks the plan produced (one line each, the id as a tag —
// never at the start of the line, which would define it), paragraphs as a count with a link to the changes page.
export function resultSection(s: Pick<Session, 'id' | 'product' | 'status' | 'result' | 'artifacts'>, w: PrWindow = {}): string {
  const lines: string[] = [];
  lines.push((s.result ?? '').trim() || `_The session ended with status ${s.status} and no summary._`);
  const out = new Set(w.exclude ?? []);
  const blocks = (s.artifacts?.blocks ?? []).filter(b => !out.has(b.id) && (!w.started || b.at >= w.started) && (!w.finished || b.at <= w.finished));
  const typed = blocks.filter(b => !b.id.startsWith('block:'));
  const prose = blocks.length - typed.length;
  if (typed.length) {
    lines.push('', 'Blocks this request produced:', '');
    for (const b of typed) lines.push(`- ${MARK[b.change]} ${b.id}${b.title ? ` — ${b.title.replace(/\n/g, ' ').slice(0, 120)}` : ''}`);
  }
  if (prose) lines.push('', `${prose} paragraph${prose === 1 ? '' : 's'} added or changed — [per document](/${s.product}/sessions/${s.id}/changes)`);
  return lines.join('\n');
}

// The app owns "## Result": whatever is under it (up to the next "## " heading or the end) is replaced, so ending a
// plan twice writes it once; the section is appended when the heading is missing.
export function withResult(md: string, body: string): string {
  const m = md.match(/^## Result[^\n]*\n/m);
  if (!m || m.index === undefined) return `${md.replace(/\s+$/, '')}\n\n## Result\n\n${body}\n`;
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const next = rest.search(/^## /m);
  const end = next === -1 ? md.length : start + next;
  return `${md.slice(0, start)}\n${body}\n${next === -1 ? '' : '\n'}${md.slice(end)}`;
}

// The request task when its build ends (req:exec.request-is-a-task): review when the agent did not mark it done —
// a person checks — and done stays done; a cancelled or failed request leaves it open (todo) for the next worker.
export function requestTaskStatusOnEnd(taskStatus: string, prStatus: PrEndStatus): string {
  if (taskStatus === 'done') return 'done';
  return prStatus === 'done' ? 'review' : 'todo';
}

// The request's status when its build session ends (or a fresh request replaces it while it runs): done / failed /
// cancelled follow the session; anything else means it was left unfinished — cancelled.
export type PrEndStatus = 'done' | 'failed' | 'cancelled';
export function prStatusOnEnd(status: SessionStatus): PrEndStatus { return status === 'done' || status === 'failed' ? status : 'cancelled'; }

// A key's value from the frontmatter, undefined when absent.
export function getFrontmatter(md: string, key: string): string | undefined {
  const fm = md.match(/^---\n([\s\S]*?)\n---/); if (!fm) return undefined;
  const m = fm[1].match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() || undefined : undefined;
}

// A worker's PRs (SessionPr), read from the graph (decision:wf2.plan-per-request): every pr node whose
// `session` names the session's id, oldest first, with its task counts (tasks `part of` the request; done = status done).
type PrGraph = { nodes: { id: string; kind: string; title: string; status: string; body: string; file: string; defined?: boolean }[]; edges: { from: string; to: string; verb: string }[] };
export function prsOf(product: string, g: PrGraph, sessionId: string): SessionPr[] {
  const prop = (body: string, key: string) => body.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1].trim() || undefined;
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const out: SessionPr[] = [];
  for (const n of g.nodes) {
    if (n.kind !== 'pr' || n.defined === false) continue;
    if (!(prop(n.body, 'session') ?? '').split(/\s+/).includes(sessionId)) continue;
    const m = n.file.match(/projects\/([^/]+)\/docs\/([^/]+)\.md$/); if (!m) continue;
    const tasks = g.edges.filter(e => e.to === n.id && e.verb === 'part-of' && byId.get(e.from)?.kind === 'task').map(e => byId.get(e.from)!);
    const num = prNumberOf(n.id);
    out.push({ ref: `${product}/${m[1]}/${m[2]}`, node: n.id, title: num ? prLabel(num, n.title) : n.title, status: n.status, started: prop(n.body, 'started'), finished: prop(n.body, 'finished'), tasks: { done: tasks.filter(t => t.status === 'done').length, total: tasks.length } });
  }
  return out.sort((a, b) => (a.started ?? '').localeCompare(b.started ?? '') || a.ref.localeCompare(b.ref));
}

// Set (or add) a key in the frontmatter.
export function setFrontmatter(md: string, key: string, value: string): string {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return md;
  const re = new RegExp(`^${key}:.*$`, 'm');
  const body = re.test(fm[1]) ? fm[1].replace(re, `${key}: ${value}`) : `${fm[1]}\n${key}: ${value}`;
  return `---\n${body}\n---${md.slice(fm[0].length)}`;
}

// ---- the Definition (decision:wf2.pr-lifecycle, req:exec.plan-defined, req:exec.definition-tracked)

// The ids in a request's Definition section: embedded (`![[id]]`), defined as a card (`- id: x`) or as a prose line.
export function definitionIds(md: string): string[] {
  const sec = sectionBody(md, 'Definition'); if (sec === null) return [];
  const ids: string[] = [];
  // top-level lines only: what is indented under a block is that block's content (its verdicts, its sub-items)
  for (const l of sec.split('\n')) {
    const m = l.match(/^!\[\[([a-z-]+:[A-Za-z0-9_.\-]+)\]\]/) ?? l.match(/^-\s+id:\s*([a-z-]+:[A-Za-z0-9_.\-]+)\s*$/) ?? l.match(/^(?:[-*+]\s+(?:\[[ xX]\]\s+)?)?([a-z-]+:[A-Za-z0-9_.\-]+)\s/);
    if (m && !/^(verdict|contradiction|block):/.test(m[1]) && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}
export function sectionBody(md: string, heading: string): string | null {
  const m = md.match(new RegExp(`^## ${heading}[^\\n]*\\n`, 'm')); if (!m || m.index === undefined) return null;
  const start = m.index + m[0].length; const rest = md.slice(start); const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}
// Embed ids under Definition that are not there yet (the section is added after Context when missing).
export function withDefinition(md: string, ids: string[]): string {
  const have = new Set(definitionIds(md));
  const fresh = ids.filter(id => !have.has(id)); if (!fresh.length) return md;
  const lines = fresh.map(id => `![[${id}]]`).join('\n\n');
  const m = md.match(/^## Definition[^\n]*\n/m);
  if (!m || m.index === undefined) {
    const next = md.match(/^## Impact[^\n]*\n/m) ?? md.match(/^## Tasks[^\n]*\n/m) ?? md.match(/^## Plan[^\n]*\n/m);
    const block = `## Definition\n\n${lines}\n\n`;
    return next && next.index !== undefined ? `${md.slice(0, next.index)}${block}${md.slice(next.index)}` : `${md.replace(/\s+$/, '')}\n\n${block}`;
  }
  const start = m.index + m[0].length; const rest = md.slice(start); const next = rest.search(/^## /m);
  const end = next === -1 ? md.length : start + next;
  const body = md.slice(start, end).replace(/\s+$/, '');
  return `${md.slice(0, start)}${body}\n\n${lines}\n${next === -1 ? '' : '\n'}${md.slice(end)}`;
}
// Whether a Definition is agreed: every block approved, resolved, rejected or done, and no open contradiction on an
// approved one. `nodes` gives each id's status and the ids of open contradictions touching it.
export const AGREED = new Set(['approved', 'resolved', 'rejected', 'dismissed', 'done', 'shipped', 'accepted', 'superseded', 'retired', 'answered', 'complete', 'active']);
export type DefinitionState = { total: number; agreed: number; open: number; missing: number; contradicted: string[]; defined: boolean; items: { id: string; status: string; agreed: boolean; missing?: boolean }[] };
export function definitionState(ids: string[], lookup: (id: string) => { status: string; openContradictions: string[] } | null): DefinitionState {
  // a task is agreed once it is work (todo, open, in progress, done) rather than a proposal
  const ok = (id: string, status: string) => id.startsWith('task:') ? !['proposed', 'draft', 'rejected'].includes(status) : AGREED.has(status);
  const items = ids.map(id => { const n = lookup(id); if (!n) return { id, status: '', agreed: false, missing: true }; return { id, status: n.status, agreed: ok(id, n.status) }; });
  const contradicted = ids.filter(id => { const n = lookup(id); return n && ok(id, n.status) && n.openContradictions.length; });
  const agreed = items.filter(i => i.agreed).length; const missing = items.filter(i => i.missing).length;
  return { total: items.length, agreed, open: items.length - agreed - missing, missing, contradicted, defined: items.length > 0 && agreed === items.length && !contradicted.length, items };
}

// The Tasks section's task ids: `- [ ] task:x …` / `- [x] task:x …` lines, top level only.
export function taskLines(md: string): string[] {
  const sec = sectionBody(md, 'Tasks'); if (sec === null) return [];
  return sec.split('\n').map(l => l.match(/^-\s+\[[ xX]\]\s+(task:[A-Za-z0-9_.\-]+)\s/)?.[1]).filter((x): x is string => !!x);
}

// Readiness (decision:wf2.pr-lifecycle): computed, never a status — what must hold before the person approves.
// `impactFresh` is the scheduler's "the scope was computed after the last Definition change"; until then always true.
export type Readiness = { definition: boolean; agreed: boolean; impact: boolean; contradictions: boolean; tasks: boolean; ok: boolean; unagreed: string[]; contradicted: string[] };
export function readiness(d: DefinitionState, taskCount: number, impactFresh = true): Readiness {
  const unagreed = d.items.filter(i => !i.agreed).map(i => i.id);
  const r = { definition: d.total > 0, agreed: d.total > 0 && unagreed.length === 0, impact: impactFresh, contradictions: d.contradicted.length === 0, tasks: taskCount > 0, unagreed, contradicted: d.contradicted };
  return { ...r, ok: r.definition && r.agreed && r.impact && r.contradictions && r.tasks };
}
