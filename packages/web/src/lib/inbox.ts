// The inbox: knowledge candidates (decisions, requirements, rules, questions, notes) that agents and people drop in.
// Nothing enters the documents from here without a review: an item is filed into a document as a node, or dismissed.
import { mkdir, readdir, readFile, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { slugify } from './templates';
import { writeAtomic, rebuild, withFileLock } from './write';
import { REPO_ROOT } from './products';
import { search } from './semantic';
import { judgeText, confidentIds, type SearchFn } from './links';
import { LINK_MIN, type JevClient } from './jev';
import type { GraphData, GraphNode } from './graph';
import { docRoute } from './doc';

export type InboxType = 'decision' | 'requirement' | 'rule' | 'question' | 'note';
// raw: the person's words as they were said (wye remember) — never typed, never filed as a block; the digest and the
// impact judged on arrival are what Wye makes of it (decision:waterfall.raw-input-stays-raw)
export type InboxImpactCandidate = { id: string; kind: string; title: string; verdict: 'update' | 'rework' | 'contradicts' | 'ask'; reason: string; question?: string };
export type InboxImpact = { at: string; judged: number; candidates: InboxImpactCandidate[] };
export interface InboxItem { name: string; type: InboxType; title: string; from: string; added: string; status: 'new' | 'filed' | 'dismissed' | 'digested'; refs: string[]; session?: string; raw?: boolean; impact?: InboxImpact; fields: Record<string, string>; body: string; filedTo?: string; node?: string; size: number; mtime: string }

const FIELD_KEYS = ['context', 'choice', 'alternatives', 'consequences', 'when', 'then', 'unless', 'statement', 'source', 'q'];

export async function listInboxItems(productDir: string): Promise<InboxItem[]> {
  const dir = path.join(productDir, 'inbox');
  let names: string[] = []; try { names = (await readdir(dir)).filter(n => !n.startsWith('.')); } catch { return []; }
  const items: InboxItem[] = [];
  for (const name of names) {
    const st = await stat(path.join(dir, name));
    if (!name.endsWith('.md')) { items.push({ name, type: 'note', title: name, from: 'file', added: st.mtime.toISOString(), status: 'new', refs: [], fields: {}, body: '', size: st.size, mtime: st.mtime.toISOString() }); continue; }
    const md = await readFile(path.join(dir, name), 'utf8');
    let impact: InboxImpact | undefined; try { impact = JSON.parse(await readFile(impactFile(productDir, name), 'utf8')) as InboxImpact; } catch { /* not judged */ }
    items.push({ ...parseItem(name, md), ...(impact ? { impact } : {}), size: st.size, mtime: st.mtime.toISOString() });
  }
  return items.sort((a, b) => b.added.localeCompare(a.added));
}

export function parseItem(name: string, md: string): Omit<InboxItem, 'size' | 'mtime'> {
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/); const head: Record<string, string> = {};
  if (fm) for (const l of fm[1].split('\n')) { const m = l.match(/^([\w-]+):\s*(.*)$/); if (m) head[m[1]] = m[2].trim(); }
  const rest = fm ? md.slice(fm[0].length) : md;
  // "## key" sections become fields; text before the first section is the body
  const fields: Record<string, string> = {}; let body = ''; let cur: string | null = null; const buf: string[] = [];
  const flush = () => { const t = buf.join('\n').trim(); if (cur) fields[cur] = t; else body = t; buf.length = 0; };
  for (const line of rest.split('\n')) { const h = line.match(/^##\s+(.+)$/); if (h) { flush(); cur = h[1].trim().toLowerCase(); } else buf.push(line); }
  flush();
  const type = (['decision', 'requirement', 'rule', 'question', 'note'].includes(head.type) ? head.type : 'note') as InboxType;
  return { name, type, title: head.title || body.split('\n')[0].slice(0, 80) || name, from: head.from || 'unknown', added: head.added || '', status: (head.status as InboxItem['status']) || 'new', refs: (head.refs || '').split(/[,\s]+/).filter(Boolean), session: head.session || undefined, ...(head.raw === 'true' ? { raw: true } : {}), fields, body, filedTo: head['filed-to'] || undefined, node: head.node || undefined };
}

export async function addInboxItem(productDir: string, input: { type?: string; title?: string; text?: string; from?: string; refs?: string[]; session?: string; raw?: boolean; fields?: Record<string, string> }): Promise<string> {
  const type = (['decision', 'requirement', 'rule', 'question', 'note'].includes(input.type ?? '') ? input.type : 'note') as InboxType;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `${stamp}-${type}-${slugify(input.title || input.text?.slice(0, 40) || type)}.md`;
  const dir = path.join(productDir, 'inbox'); await mkdir(dir, { recursive: true });
  const head = ['---', `type: ${type}`, `title: ${(input.title ?? '').replace(/\n/g, ' ')}`, `from: ${input.from ?? 'ui'}`, `added: ${new Date().toISOString()}`, 'status: new', ...(input.refs?.length ? [`refs: ${input.refs.join(', ')}`] : []), ...(input.session ? [`session: ${input.session}`] : []), ...(input.raw ? ['raw: true'] : []), '---', ''];
  const sections = Object.entries(input.fields ?? {}).filter(([, v]) => v?.trim()).map(([k, v]) => `## ${k}\n${v.trim()}\n`);
  await writeAtomic(path.join(dir, name), head.join('\n') + (input.text?.trim() ? input.text.trim() + '\n\n' : '') + sections.join('\n'));
  return name;
}

// Linked on arrival (Jev auto-linking design §2): the item's text against the closest knowledge, the confident ids
// merged into refs (explicit ones first), an untyped note typed when Jev is sure. Runs after the add returned so
// neither `wye inbox add` nor the UI waits for the call; a failure leaves the item as it was.
export async function linkInboxItem(productDir: string, graph: GraphData, name: string, jev: JevClient, searchFn?: SearchFn): Promise<{ refs: string[]; type?: string }> {
  if (!jev.enabled) return { refs: [] };
  const item = (await listInboxItems(productDir)).find(i => i.name === name); if (!item) return { refs: [] };
  const text = [item.title, item.body, ...Object.values(item.fields)].filter(Boolean).join('. ');
  const hits = await judgeText(productDir, graph, text, { jev, limit: 15, exclude: item.refs, searchFn });
  const refs = confidentIds(hits).filter(id => !item.refs.includes(id));
  const patch: Record<string, string> = {};
  if (refs.length) { patch.refs = [...item.refs, ...refs].join(', '); patch['linked-by'] = 'jev'; }
  let type: string | undefined;
  if (item.type === 'note' && !item.raw) { // the head's default: the item came without a type (or as a note — a retype is still reviewed at filing); raw input stays raw
    const k = await jev.judgeKind(text).catch(() => ({ kind: 'note', p: 0 }));
    if (k.p >= LINK_MIN() && ['decision', 'requirement', 'rule', 'question'].includes(k.kind)) { type = k.kind; patch.type = k.kind; }
  }
  if (Object.keys(patch).length) await patchHead(productDir, name, patch);
  return { refs, ...(type ? { type } : {}) };
}

async function patchHead(productDir: string, name: string, patch: Record<string, string>): Promise<void> {
  const f = path.join(productDir, 'inbox', name);
  const md = await readFile(f, 'utf8'); const fm = md.match(/^---\n([\s\S]*?)\n---\n?/); if (!fm) return;
  const lines = fm[1].split('\n'); const seen = new Set<string>();
  const out = lines.map(l => { const m = l.match(/^([\w-]+):/); if (m && m[1] in patch) { seen.add(m[1]); return `${m[1]}: ${patch[m[1]]}`; } return l; });
  for (const [k, v] of Object.entries(patch)) if (!seen.has(k)) out.push(`${k}: ${v}`);
  await writeAtomic(f, '---\n' + out.join('\n') + '\n---\n' + md.slice(fm[0].length));
}
// Impact of raw input on what is known (decision:waterfall.raw-input-stays-raw): the closest nodes by text, judged as
// `wye impact` judges a change — here the change is "nothing before → this input" — and the verdicts that matter
// (update | rework | contradicts | ask) kept in inbox/.impact/<name>.json, never written into a document. `judge`
// is injectable for tests; the route passes lib/impact.js#judgeImpact.
const impactFile = (productDir: string, name: string) => path.join(productDir, 'inbox', '.impact', `${name}.json`);
export type ImpactJudge = (change: { node: string; kind: string; before: string; after: string }, cands: { id: string; kind: string; status?: string; path: string; text: string }[]) => Promise<({ verdict: string; reason: string; question?: string | null } | null)[]>;
export function rawText(item: InboxItem): string { return [item.title, item.body, ...Object.entries(item.fields).map(([k, v]) => `${k}: ${v}`)].filter(s => s?.trim()).join('\n\n'); }
export async function impactInboxItem(productDir: string, graph: GraphData, name: string, deps: { judge: ImpactJudge; searchFn?: SearchFn; limit?: number }): Promise<InboxImpact> {
  const item = (await listInboxItems(productDir)).find(i => i.name === name); if (!item) throw new Error(`inbox item ${name} not found`);
  const text = rawText(item);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const hits = await (deps.searchFn ?? search)(productDir, graph, text, { limit: deps.limit ?? 12 });
  const ids = [...new Set([...item.refs, ...hits.filter(h => h.score >= 0.45).map(h => h.id)])];
  const cands = ids.map(id => byId.get(id)).filter((n): n is GraphNode => !!n && n.defined && n.kind !== 'block').map(n => ({ id: n.id, kind: n.kind, status: n.status, path: '', text: `${n.title ? n.title + '. ' : ''}${n.body}`.slice(0, 1500) }));
  const verdicts = cands.length ? await deps.judge({ node: `inbox:${name}`, kind: 'raw input', before: '(nothing — new input from the person, not in the vault yet)', after: text.slice(0, 4000) }, cands) : [];
  const kept: InboxImpactCandidate[] = [];
  cands.forEach((c, i) => { const v = verdicts[i]; if (!v || !['update', 'rework', 'contradicts', 'ask'].includes(v.verdict)) return; kept.push({ id: c.id, kind: c.kind, title: byId.get(c.id)?.title ?? c.id, verdict: v.verdict as InboxImpactCandidate['verdict'], reason: v.reason, ...(v.question ? { question: v.question } : {}) }); });
  const impact: InboxImpact = { at: new Date().toISOString(), judged: cands.length, candidates: kept };
  await mkdir(path.dirname(impactFile(productDir, name)), { recursive: true });
  await writeAtomic(impactFile(productDir, name), JSON.stringify(impact, null, 1));
  return impact;
}
// Digest (decision:waterfall.raw-request-to-inbox-then-digest): a raw request kept in the inbox as it was said, and a
// Remember session (skill:remember) started on its words at once — the librarian splits it into statements, refines
// what is known, supersedes what changed and raises what contradicts as questions, everything proposed. The item
// names the session; when none can start (no agent on this machine) the item simply waits, as any note does.
export type RememberStarter = (o: { instruction: string; refs: string[]; source: Record<string, string> }) => Promise<{ id: string }>;
export async function digestInboxItem(productDir: string, name: string, start: RememberStarter): Promise<{ session: string | null; error?: string }> {
  const item = (await listInboxItems(productDir)).find(i => i.name === name); if (!item) return { session: null, error: `inbox item ${name} not found` };
  const text = rawText(item);
  try {
    const s = await start({ instruction: text, refs: item.refs, source: { inbox: name, from: item.from } });
    await patchHead(productDir, name, { session: s.id });
    return { session: s.id };
  } catch (e) { return { session: null, error: e instanceof Error ? e.message : String(e) }; }
}
export async function dismissItem(productDir: string, name: string): Promise<void> { await patchHead(productDir, name, { status: 'dismissed' }); }
// A raw item whose digest session has ended has nothing left to review: it leaves the queue as `digested` (still
// listed under All, with its session). Reconciled when the inbox is listed, from the session's status.
export async function settleDigested(productDir: string, items: InboxItem[], sessionStatus: (id: string) => Promise<string | null>): Promise<InboxItem[]> {
  const out: InboxItem[] = [];
  for (const i of items) {
    if (i.raw && i.status === 'new' && i.session && ['done', 'failed'].includes((await sessionStatus(i.session)) ?? '')) { await patchHead(productDir, i.name, { status: 'digested' }); out.push({ ...i, status: 'digested' }); }
    else out.push(i);
  }
  return out;
}
export async function markFiled(productDir: string, name: string, to: { file: string; node: string }): Promise<void> { await patchHead(productDir, name, { status: 'filed', 'filed-to': to.file, node: to.node }); }

// Which document should an item go to, and as which node? The closest existing knowledge decides the document
// (the one most of the top hits live in); the item's type decides the kind; the id comes from the title.
export async function suggestFiling(productDir: string, graph: GraphData, product: string, item: InboxItem, jev?: JevClient, searchFn?: SearchFn): Promise<{ doc: string | null; project: string | null; kind: string; id: string; similar: { id: string; score: number; p?: number }[] }> {
  const kind = item.type === 'requirement' ? 'req' : item.type === 'decision' ? 'decision' : item.type === 'rule' ? 'rule' : item.type === 'question' ? 'question' : 'note';
  const text = [item.title, item.body, ...Object.values(item.fields)].join('. ');
  let hits: { id: string; score: number; p?: number }[] = [];
  // with a Jev client the hits carry its probability (Jev auto-linking design §2), the percentage the filing view shows
  try { hits = jev?.enabled ? await judgeText(productDir, graph, text, { jev, limit: 8, searchFn }) : (await (searchFn ?? search)(productDir, graph, text, { limit: 8 })).map(h => ({ id: h.id, score: h.score })); } catch { /* no model yet */ }
  const votes = new Map<string, number>();
  for (const h of hits) { const n = graph.nodes.find(x => x.id === h.id); const r = n && docRoute(n.file); if (r) votes.set(`${r.project}/${r.doc}`, (votes.get(`${r.project}/${r.doc}`) ?? 0) + h.score * (n!.kind === kind ? 1.5 : 1)); }
  // the kind's home document wins ties: decisions/rules → tech design, requirements/questions → prd
  const prefer = kind === 'req' || kind === 'question' ? /prd/ : /tech|design/;
  const ranked = [...votes].sort((a, b) => b[1] - a[1] || (prefer.test(a[0]) ? -1 : 1));
  const best = ranked[0]?.[0] ?? null;
  const prefix = (graph.nodes.find(n => n.kind === kind && n.defined)?.id.split(':')[1] ?? '').split('.')[0] || product;
  const slug = slugify(item.title).slice(0, 48) || item.type;
  let id = `${kind}:${prefix}.${slug}`; let n = 2; while (graph.nodes.some(x => x.id === id)) id = `${kind}:${prefix}.${slug}-${n++}`;
  return { doc: best ? best.split('/')[1] : null, project: best ? best.split('/')[0] : null, kind, id, similar: hits.slice(0, 5) };
}

// File an item into a document as a node (appended at the end as a yaml block, or a question line), rebuild the
// graph and mark the item filed.
export async function fileItem(productDir: string, product: string, item: InboxItem, target: { file: string; id: string }): Promise<{ id: string; file: string }> {
  const abs = path.join(REPO_ROOT, target.file);
  const kind = target.id.split(':')[0];
  const y = (k: string, v?: string) => v?.trim() ? (v.includes('\n') || v.length > 100 ? `  ${k}: >\n${v.trim().split('\n').map(l => '    ' + l).join('\n')}` : `  ${k}: ${v.trim()}`) : null;
  const today = new Date().toISOString().slice(0, 10);
  const f = item.fields;
  const lines: (string | null)[] = [`- id: ${target.id}`];
  if (kind === 'decision') lines.push(y('title', item.title), '  status: approved', `  date: ${today}`); // its parts follow as child blocks (decision:wf2.decision-free-text)
  else if (kind === 'req') lines.push(y('title', item.title), '  status: proposed'); // its parts follow as child blocks (decision:wf2.req-free-text)
  else if (kind === 'rule') lines.push(y('statement', f.statement || item.body || item.title), y('source', f.source), '  status: proposed');
  else if (kind === 'question') lines.push(y('q', f.q || item.body || item.title), '  status: question');
  else lines.push(y('title', item.title), y('text', item.body));
  if (item.refs.length) lines.push(`  related-to: [${item.refs.join(', ')}]`);
  lines.push(`  from: inbox ${item.name}${item.session ? ` (session ${item.session})` : ''}`);
  // a decision's parts as child blocks under the card, each one a block the person keeps or deletes
  const one = (t?: string) => (t ?? '').replace(/\s+/g, ' ').trim();
  const slug = target.id.slice(target.id.indexOf(':') + 1);
  const parts = kind === 'decision' ? [['choice', one(f.choice || item.body)], ['context', one(f.context)], ['alternative', one(f.alternatives)], ['consequence', one(f.consequences)]].filter(([, t]) => t).map(([k, t]) => `  - ${k}:${slug} ${t}`)
    : kind === 'req' ? [...(one(item.body) && !f.then ? [`  ${one(item.body)}`] : []), ...[['when', one(f.when)], ['then', one(f.then || (f.when ? item.body : ''))], ['unless', one(f.unless)]].filter(([, t]) => t).map(([k, t]) => `  - ${k}:${slug} ${t}`)] : [];
  const block = '\n\n```yaml\n' + lines.filter(Boolean).join('\n') + '\n```\n' + (parts.length ? '\n' + parts.join('\n\n') + '\n' : '');
  await withFileLock(abs, async () => { const md = await readFile(abs, 'utf8'); await writeAtomic(abs, md.replace(/\s+$/, '') + block); });
  await rebuild(productDir);
  await patchHead(productDir, item.name, { status: 'filed', 'filed-to': target.file, node: target.id });
  return { id: target.id, file: target.file };
}
