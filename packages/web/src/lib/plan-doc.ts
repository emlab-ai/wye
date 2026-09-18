// The plan document (req:wf2.sessions.plan-doc, rule:plan-doc): one per request that starts work — a new session or
// a fresh-context message (decision:wf2.plan-per-request) — created by the app from templates/docs/plan-request.md
// under the project's Plans page (decision:wf2.plans-folder), finished by the app with the result. Pure: the slug,
// the body, the result section scoped to the plan's window, the frontmatter edits, a session's plans read from the
// graph; the IO lives in lib/plan-docs.
import type { BlockChange, Session, SessionPlan, SessionStatus } from './session-types';

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'it', 'be', 'me', 'my', 'so', 'as', 'at', 'by', 'do', 'we', 'i', 'that', 'this', 'with', 'from', 'into', 'when', 'then', 'not', 'must', 'should', 'please', 'can', 'you']);

// `plan-` + the first telling words of the request (stop words dropped, six at most), `-2`, `-3`… when taken.
export function planSlug(request: string, taken: Iterable<string> = []): string {
  const words = request.toLowerCase().replace(/[`*_#>\[\]()]/g, ' ').split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
  const base = `plan-${(words.slice(0, 6).join('-') || 'request').slice(0, 48).replace(/-+$/, '')}`;
  const have = new Set(taken);
  if (!have.has(base)) return base;
  for (let n = 2; ; n++) if (!have.has(`${base}-${n}`)) return `${base}-${n}`;
}

// The title: the first non-empty line of the request, markdown stripped, cut at 90 characters.
export function planTitle(request: string): string {
  const line = request.split('\n').map(l => l.trim()).find(Boolean) ?? 'request';
  const plain = line.replace(/^#+\s*/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
  return plain.length > 90 ? `${plain.slice(0, 89).replace(/\s+\S*$/, '')}…` : plain || 'request';
}

export type PlanDocVars = { slug: string; title: string; date: string; session: string; agent: string; started: string; parent: string; request: string; from: string };

// Fill the template. A request is quoted line by line so its own headings and blocks stay prose; `from` is the
// line that names where the request came from (document, node, refs) as tags — empty when nothing is known.
export function planDocBody(template: string, v: PlanDocVars): string {
  const request = v.request.trim().split('\n').map(l => `> ${l}`).join('\n');
  let out = template.replace(/\{\{(slug|title|date|session|agent|started|parent|request|from)\}\}/g, (_, k: keyof PlanDocVars) => k === 'request' ? request : v[k]);
  if (!v.parent) out = out.replace(/^part-of: \n/m, '');
  if (!v.from) out = out.replace(/\n{3,}## Context/, '\n\n## Context');
  return out;
}

// "from: module:x · refs: req:z" — what the palette knew about where the request was made, as tags.
export function fromLine(s: Pick<Session, 'refs' | 'source'>, docNode?: string): string {
  const parts: string[] = [];
  if (docNode) parts.push(`from: ${docNode}`);
  const refs = s.refs.filter(r => r !== docNode);
  if (refs.length) parts.push(`refs: ${refs.join(', ')}`);
  return parts.length ? `_${parts.join(' · ')}_` : '';
}

// The app path of a plan document ref (product/project/slug).
export function planDocPath(ref: string): string { const [product, project, slug] = ref.split('/'); return `/${product}/${project}/d/${slug}`; }

const MARK: Record<BlockChange['change'], string> = { added: 'added', changed: 'changed', removed: 'removed' };

// The plan's window (decision:wf2.plan-result-owned-by-app): only blocks credited between `started` and `finished`
// (ISO strings, compared as such) count, and never the plan's own page or the Plans page (`exclude`).
export type PlanWindow = { started?: string; finished?: string; exclude?: string[] };

// The Result section's body: the summary, then the blocks the plan produced (one line each, the id as a tag —
// never at the start of the line, which would define it), paragraphs as a count with a link to the changes page.
export function resultSection(s: Pick<Session, 'id' | 'product' | 'status' | 'result' | 'artifacts'>, w: PlanWindow = {}): string {
  const lines: string[] = [];
  lines.push((s.result ?? '').trim() || `_The session ended with status ${s.status} and no summary._`);
  const out = new Set(w.exclude ?? []);
  const blocks = (s.artifacts?.blocks ?? []).filter(b => !out.has(b.id) && (!w.started || b.at >= w.started) && (!w.finished || b.at <= w.finished));
  const typed = blocks.filter(b => !b.id.startsWith('block:'));
  const prose = blocks.length - typed.length;
  if (typed.length) {
    lines.push('', 'Blocks this plan produced:', '');
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

// The plan's status when its session ends (or a fresh request replaces it while it runs): done / failed /
// cancelled follow the session; anything else means the plan was left unfinished — cancelled.
export type PlanEndStatus = 'done' | 'failed' | 'cancelled';
export function planStatusOnEnd(status: SessionStatus): PlanEndStatus { return status === 'done' || status === 'failed' ? status : 'cancelled'; }

// A key's value from the frontmatter, undefined when absent.
export function getFrontmatter(md: string, key: string): string | undefined {
  const fm = md.match(/^---\n([\s\S]*?)\n---/); if (!fm) return undefined;
  const m = fm[1].match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  return m ? m[1].trim() || undefined : undefined;
}

// A worker's plans (SessionPlan), read from the graph (decision:wf2.plan-per-request): every plan node whose
// `session` names the session's id, oldest first, with its task counts (tasks `part of` the plan; done = status done).
type PlanGraph = { nodes: { id: string; kind: string; title: string; status: string; body: string; file: string; defined?: boolean }[]; edges: { from: string; to: string; verb: string }[] };
export function plansOf(product: string, g: PlanGraph, sessionId: string): SessionPlan[] {
  const prop = (body: string, key: string) => body.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))?.[1].trim() || undefined;
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const out: SessionPlan[] = [];
  for (const n of g.nodes) {
    if (n.kind !== 'plan' || n.defined === false) continue;
    if (!(prop(n.body, 'session') ?? '').split(/\s+/).includes(sessionId)) continue;
    const m = n.file.match(/projects\/([^/]+)\/docs\/([^/]+)\.md$/); if (!m) continue;
    const tasks = g.edges.filter(e => e.to === n.id && e.verb === 'part-of' && byId.get(e.from)?.kind === 'task').map(e => byId.get(e.from)!);
    out.push({ ref: `${product}/${m[1]}/${m[2]}`, node: n.id, title: n.title, status: n.status, started: prop(n.body, 'started'), finished: prop(n.body, 'finished'), tasks: { done: tasks.filter(t => t.status === 'done').length, total: tasks.length } });
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
