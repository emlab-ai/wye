// The inbox: knowledge candidates (decisions, requirements, rules, questions, notes) that agents and people drop in.
// Nothing enters the documents from here without a review: an item is filed into a document as a node, or dismissed.
import { mkdir, readdir, readFile, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { slugify } from './templates';
import { writeAtomic, rebuild, withFileLock } from './write';
import { REPO_ROOT } from './products';
import { search } from './semantic';
import type { GraphData } from './graph';
import { docRoute } from './doc';

export type InboxType = 'decision' | 'requirement' | 'rule' | 'question' | 'note';
export interface InboxItem { name: string; type: InboxType; title: string; from: string; added: string; status: 'new' | 'filed' | 'dismissed'; refs: string[]; session?: string; fields: Record<string, string>; body: string; filedTo?: string; node?: string; size: number; mtime: string }

const FIELD_KEYS = ['context', 'choice', 'alternatives', 'consequences', 'when', 'then', 'unless', 'statement', 'source', 'q'];

export async function listInboxItems(productDir: string): Promise<InboxItem[]> {
  const dir = path.join(productDir, 'inbox');
  let names: string[] = []; try { names = (await readdir(dir)).filter(n => !n.startsWith('.')); } catch { return []; }
  const items: InboxItem[] = [];
  for (const name of names) {
    const st = await stat(path.join(dir, name));
    if (!name.endsWith('.md')) { items.push({ name, type: 'note', title: name, from: 'file', added: st.mtime.toISOString(), status: 'new', refs: [], fields: {}, body: '', size: st.size, mtime: st.mtime.toISOString() }); continue; }
    const md = await readFile(path.join(dir, name), 'utf8');
    items.push({ ...parseItem(name, md), size: st.size, mtime: st.mtime.toISOString() });
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
  return { name, type, title: head.title || body.split('\n')[0].slice(0, 80) || name, from: head.from || 'unknown', added: head.added || '', status: (head.status as InboxItem['status']) || 'new', refs: (head.refs || '').split(/[,\s]+/).filter(Boolean), session: head.session || undefined, fields, body, filedTo: head['filed-to'] || undefined, node: head.node || undefined };
}

export async function addInboxItem(productDir: string, input: { type?: string; title?: string; text?: string; from?: string; refs?: string[]; session?: string; fields?: Record<string, string> }): Promise<string> {
  const type = (['decision', 'requirement', 'rule', 'question', 'note'].includes(input.type ?? '') ? input.type : 'note') as InboxType;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `${stamp}-${type}-${slugify(input.title || input.text?.slice(0, 40) || type)}.md`;
  const dir = path.join(productDir, 'inbox'); await mkdir(dir, { recursive: true });
  const head = ['---', `type: ${type}`, `title: ${(input.title ?? '').replace(/\n/g, ' ')}`, `from: ${input.from ?? 'ui'}`, `added: ${new Date().toISOString()}`, 'status: new', ...(input.refs?.length ? [`refs: ${input.refs.join(', ')}`] : []), ...(input.session ? [`session: ${input.session}`] : []), '---', ''];
  const sections = Object.entries(input.fields ?? {}).filter(([, v]) => v?.trim()).map(([k, v]) => `## ${k}\n${v.trim()}\n`);
  await writeAtomic(path.join(dir, name), head.join('\n') + (input.text?.trim() ? input.text.trim() + '\n\n' : '') + sections.join('\n'));
  return name;
}

async function patchHead(productDir: string, name: string, patch: Record<string, string>): Promise<void> {
  const f = path.join(productDir, 'inbox', name);
  const md = await readFile(f, 'utf8'); const fm = md.match(/^---\n([\s\S]*?)\n---\n?/); if (!fm) return;
  const lines = fm[1].split('\n'); const seen = new Set<string>();
  const out = lines.map(l => { const m = l.match(/^([\w-]+):/); if (m && m[1] in patch) { seen.add(m[1]); return `${m[1]}: ${patch[m[1]]}`; } return l; });
  for (const [k, v] of Object.entries(patch)) if (!seen.has(k)) out.push(`${k}: ${v}`);
  await writeAtomic(f, '---\n' + out.join('\n') + '\n---\n' + md.slice(fm[0].length));
}
export async function dismissItem(productDir: string, name: string): Promise<void> { await patchHead(productDir, name, { status: 'dismissed' }); }

// Which document should an item go to, and as which node? The closest existing knowledge decides the document
// (the one most of the top hits live in); the item's type decides the kind; the id comes from the title.
export async function suggestFiling(productDir: string, graph: GraphData, product: string, item: InboxItem): Promise<{ doc: string | null; project: string | null; kind: string; id: string; similar: { id: string; score: number }[] }> {
  const kind = item.type === 'requirement' ? 'req' : item.type === 'decision' ? 'decision' : item.type === 'rule' ? 'rule' : item.type === 'question' ? 'question' : 'note';
  const text = [item.title, item.body, ...Object.values(item.fields)].join('. ');
  let hits: { id: string; score: number }[] = [];
  try { hits = (await search(productDir, graph, text, { limit: 8 })).map(h => ({ id: h.id, score: h.score })); } catch { /* no model yet */ }
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
  if (kind === 'decision') lines.push(y('title', item.title), y('context', f.context || item.body), y('choice', f.choice), y('alternatives', f.alternatives), y('consequences', f.consequences), '  status: approved', `  date: ${today}`);
  else if (kind === 'req') lines.push(y('title', item.title), y('when', f.when), y('then', f.then || item.body), y('unless', f.unless), '  status: proposed');
  else if (kind === 'rule') lines.push(y('statement', f.statement || item.body || item.title), y('source', f.source), '  status: proposed');
  else if (kind === 'question') lines.push(y('q', f.q || item.body || item.title), '  status: question');
  else lines.push(y('title', item.title), y('text', item.body));
  if (item.refs.length) lines.push(`  related-to: [${item.refs.join(', ')}]`);
  lines.push(`  from: inbox ${item.name}${item.session ? ` (session ${item.session})` : ''}`);
  const block = '\n\n```yaml\n' + lines.filter(Boolean).join('\n') + '\n```\n';
  await withFileLock(abs, async () => { const md = await readFile(abs, 'utf8'); await writeAtomic(abs, md.replace(/\s+$/, '') + block); });
  await rebuild(productDir);
  await patchHead(productDir, item.name, { status: 'filed', 'filed-to': target.file, node: target.id });
  return { id: target.id, file: target.file };
}
