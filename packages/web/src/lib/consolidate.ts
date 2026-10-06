// Consolidation at session end (decision:memory.consolidate-sessions): what a conversation decided, constrained, asked
// and learned is extracted from the transcript by one model call, diffed against the blocks the session wrote, and the
// misses are filed as proposed blocks — with `by:` the speaker and `evidence:` the transcript events — under the plan
// document's Plan section, so they reach the Inbox with their source. The procedural memory the product had none of:
// a lesson: block per "this broke because …". Off unless _product.md says `consolidate: on` or WF_CONSOLIDATE=1;
// runs detached after the session record is saved; one model call per session end.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, slugOfDir } from './products';
import { onSessionEnd, updateSession } from './sessions';
import type { Session, ChatEvent } from './session-types';
import { loadGraph } from './load';
import { jevClient, type JevClient } from './jev';
import { judgeText, confidentIds, type SearchFn } from './links';
import { writeAtomic, withFileLock } from './write';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const judge = () => req('./lib/judge.js') as { ask: (prompt: string, o?: { model?: string }) => Promise<string>; DEFAULT_MODEL: string };

export type Candidate = { kind: 'decision' | 'constraint' | 'question' | 'lesson'; title: string; text: string; by: 'person' | 'agent'; evidence: number[]; context?: string };

export async function consolidateEnabled(productDir: string): Promise<boolean> {
  if (process.env.WF_CONSOLIDATE === '1') return true;
  if (process.env.WF_CONSOLIDATE === '0') return false;
  try { const md = await readFile(path.join(productDir, '_product.md'), 'utf8'); return /^consolidate:\s*(on|true|yes)\s*$/m.test(md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''); } catch { return false; }
}

// The excerpt, the prompt and the parser live in lib/consolidate.js, shared with the eval suite (eval/own consolidation
// benchmark) so the benchmark measures the prompt the app runs.
const shared = req('./lib/consolidate.js') as { transcriptExcerpt: (events: ChatEvent[], budget?: number) => string; consolidationPrompt: (excerpt: string, written: { id: string; title: string }[]) => string; parseCandidates: (text: string) => Candidate[]; promptHash: () => string };
export const transcriptExcerpt: (events: ChatEvent[], budget?: number) => string = (events, budget) => shared.transcriptExcerpt(events, budget);
export const consolidationPrompt: (excerpt: string, written: { id: string; title: string }[]) => string = (excerpt, written) => shared.consolidationPrompt(excerpt, written);
export const parseCandidates: (text: string) => Candidate[] = text => shared.parseCandidates(text);

const STOP = new Set('the a an and or of to in on for is are be by with as at it its this that these those from into not no we our they their which when then unless while each all any so if than via should must never always'.split(' '));
export function candidateSlug(product: string, c: Candidate, taken: Set<string>): string {
  const words = c.title.toLowerCase().replace(/[`*_#>\[\]()"'.,:;!?]/g, ' ').split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
  const base = `${c.kind}:${product}.${(words.slice(0, 5).join('-') || c.kind).slice(0, 48).replace(/-+$/, '')}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const y = (k: string, v: string | undefined) => v ? `  ${k}: >\n    ${v.replace(/\n+/g, ' ').match(/.{1,110}(\s|$)/g)?.map(x => x.trim()).filter(Boolean).join('\n    ') ?? v}` : '';
// The yaml card of a candidate — proposed (open for a question), with who said it and where
export function candidateCard(id: string, c: Candidate, s: Pick<Session, 'id'>, planId: string, agentName: string, date: string, related: string[] = []): string {
  const evidence = c.evidence.length ? c.evidence.map(n => `session:${s.id}#${n}`).join(', ') : `session:${s.id}`;
  const by = c.by === 'agent' ? `agent:${agentName}` : 'person';
  const lines = [`- id: ${id}`, `  title: ${c.title.replace(/:/g, ' -')}`];
  if (c.kind === 'decision') lines.push(`  date: ${date}`); // its parts follow the card as child blocks (decision:wf2.decision-free-text)
  else if (c.kind === 'question') lines.push(y('q', c.text || c.title), y('context', c.context));
  else lines.push(y('statement', c.text || c.title), y('context', c.context));
  if (related.length) lines.push(`  related-to: [${related.join(', ')}]`); // the knowledge Jev is sure the card is about (Jev auto-linking design §4)
  lines.push(`  status: ${c.kind === 'question' ? 'open' : 'proposed'}`, `  by: ${by}`, `  evidence: [${evidence}]`, ...(planId ? [`  part-of: ${planId}`] : []));
  return lines.filter(Boolean).join('\n');
}
// A decision's parts as child lines under its card (decision:wf2.decision-free-text): choice (its text), context.
export function decisionParts(id: string, c: Candidate): string[] {
  if (c.kind !== 'decision') return [];
  const slug = id.slice(id.indexOf(':') + 1); const one = (t: string) => t.replace(/\s+/g, ' ').trim();
  return [...(c.text ? [`  - choice:${slug} ${one(c.text)}`] : []), ...(c.context ? [`  - context:${slug} ${one(c.context)}`] : [])];
}

// Put the cards into the plan document's Plan section (a yaml fence at its end), before Tasks
// Each card in a fence of its own, its child lines (a decision's parts) indented under the fence.
export function insertIntoPlanSection(md: string, cards: string[], parts: string[][] = []): string {
  const block = cards.map((c, i) => '```yaml\n' + c + '\n```' + (parts[i]?.length ? '\n\n' + parts[i].join('\n\n') : '')).join('\n\n');
  const i = md.indexOf('\n## Plan'); if (i < 0) return md.replace(/\n*$/, '\n\n## Plan\n\n' + block + '\n');
  const j = md.indexOf('\n## ', i + 8);
  const end = j < 0 ? md.length : j;
  const section = md.slice(i, end).replace(/\n*$/, '');
  return md.slice(0, i) + section + '\n\n' + block + '\n' + md.slice(end);
}

// ---- each vault its share (decision:wf2.spanning-session-each-vault-its-share)
// The files a session wrote, with the transcript index of each write: the agent's Edit / Write / MultiEdit /
// NotebookEdit calls (their `file_path`), relative ones against the session's folder.
export function touchedFiles(events: ChatEvent[], cwd = ''): { i: number; file: string }[] {
  const out: { i: number; file: string }[] = [];
  events.forEach((e, i) => {
    if (e.kind !== 'tool_use' || !/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(e.name ?? '')) return;
    const inp = (e.input ?? {}) as { file_path?: unknown; notebook_path?: unknown }; const f = typeof inp.file_path === 'string' ? inp.file_path : typeof inp.notebook_path === 'string' ? inp.notebook_path : '';
    if (f) out.push({ i, file: path.isAbsolute(f) ? f : path.resolve(cwd || '/', f) });
  });
  return out;
}
// The vault folder a candidate belongs to: the vault of the files written in the turns its evidence cites (a turn
// runs from one message of the person to the next); with no write there, of every file the session wrote. One vault:
// that one. Several: the nearest vault above them all. None, or none above them all: `home`, where the session began.
export function vaultFor(c: Pick<Candidate, 'evidence'>, events: ChatEvent[], touched: { i: number; file: string }[], vaultOf: (file: string) => string | null, home: string | null): string | null {
  const users = events.map((e, i) => e.kind === 'user' ? i : -1).filter(i => i >= 0);
  const turn = (n: number): [number, number] => [users.filter(u => u <= n).pop() ?? 0, users.find(u => u > n) ?? events.length];
  const spans = c.evidence.map(turn);
  const near = touched.filter(t => spans.some(([a, b]) => t.i >= a && t.i < b));
  const vaults = [...new Set((near.length ? near : touched).map(t => vaultOf(t.file)).filter((v): v is string => !!v))];
  if (!vaults.length) return home;
  if (vaults.length === 1) return vaults[0];
  // the nearest vault at or above every one of them
  for (let f: string | null = vaults[0]; f; f = vaultOf(path.dirname(f))) if (vaults.every(v => v === f || v.startsWith(f + path.sep))) return f;
  return home;
}

// The run: transcript → candidates → cards filed on the plan; the session log says what happened.
export async function consolidateSession(productDir: string, product: string, s: Session, opts: { model?: string; jev?: JevClient; searchFn?: SearchFn } = {}): Promise<{ candidates: Candidate[]; filed: string[]; doc?: string; /** what went to other vaults: the vault's slug and the ids filed there */ sent?: { vault: string; ids: string[] }[] }> {
  const excerpt = transcriptExcerpt(s.transcript ?? []);
  if (excerpt.length < 200) return { candidates: [], filed: [] };
  const written = (s.artifacts?.blocks ?? []).filter(b => b.change !== 'removed' && /^(decision|constraint|question|lesson|req|rule|task):/.test(b.id)).map(b => ({ id: b.id, title: b.title }));
  const answer = await judge().ask(consolidationPrompt(excerpt, written), { model: opts.model });
  const candidates = parseCandidates(answer).slice(0, 12);
  if (!candidates.length || !s.prDoc) return { candidates, filed: [] };
  // the plan document from the graph: pr:<slug> is the page node, its file the target
  const slug = s.prDoc.split('/')[2]; const graph = await loadGraph(path.join(productDir, '_build/graph.json')).catch(() => null);
  const page = graph?.nodes.find(n => n.id === `pr:${slug}` && n.defined); if (!graph || !page) return { candidates, filed: [] };
  const file = path.join(REPO_ROOT, page.file);
  const taken = new Set(graph.nodes.map(n => n.id));
  const date = new Date().toISOString().slice(0, 10);
  const filed: string[] = []; const cards: string[] = []; const parts: string[][] = [];
  // each vault its share (decision:wf2.spanning-session-each-vault-its-share): a candidate about the files of another
  // vault is filed there — on that vault's Backlog page, which every vault has — and the rest on the request's page
  const touched = touchedFiles(s.transcript ?? [], s.cwd); const elsewhere = new Map<string, Candidate[]>();
  const home = path.basename(productDir) === '.wye' ? path.dirname(productDir) : null;
  let vaultOf: (f: string) => string | null = () => null;
  if (touched.length) { try { const lib = (await import('./workspace')).vaultLib(); vaultOf = f => lib.vaultOf(f); } catch { /* no vault library: everything stays here */ } }
  // each card linked before it is written when a Jev key is stored (Jev auto-linking design §4); a failure leaves the card unlinked
  const jev = opts.jev ?? await jevClient();
  for (const c of candidates) {
    const at = touched.length ? vaultFor(c, s.transcript ?? [], touched, vaultOf, home) : home;
    if (at && at !== home) { elsewhere.set(at, [...(elsewhere.get(at) ?? []), c]); continue; }
    const id = candidateSlug(product, c, taken); taken.add(id); filed.push(id);
    let related: string[] = [];
    if (jev.enabled) { try { related = confidentIds(await judgeText(productDir, graph, `${c.title}. ${c.text}`, { jev, searchFn: opts.searchFn })); } catch (e) { console.warn('jev: consolidation link failed —', e instanceof Error ? e.message : e); } }
    cards.push(candidateCard(id, c, s, page.id, s.agent, date, related)); parts.push(decisionParts(id, c));
  }
  if (cards.length) await withFileLock(file, async () => { const md = await readFile(file, 'utf8'); await writeAtomic(file, insertIntoPlanSection(md, cards, parts)); });
  const sent: { vault: string; ids: string[] }[] = [];
  for (const [folder, list] of elsewhere) {
    const ids = await fileInVault(folder, list, s, date).catch(e => { console.warn(`consolidation: ${folder}: ${e instanceof Error ? e.message : e}`); return null; });
    if (ids) { sent.push({ vault: ids.slug, ids: ids.ids }); filed.push(...ids.ids); }
    // a vault that cannot take them (no Backlog page): they stay with the request rather than being lost
    else { const extra: string[] = [], extraParts: string[][] = []; for (const c of list) { const id = candidateSlug(product, c, taken); taken.add(id); filed.push(id); extra.push(candidateCard(id, c, s, page.id, s.agent, date)); extraParts.push(decisionParts(id, c)); } await withFileLock(file, async () => { const md = await readFile(file, 'utf8'); await writeAtomic(file, insertIntoPlanSection(md, extra, extraParts)); }); }
  }
  return { candidates, filed, doc: s.prDoc, ...(sent.length ? { sent } : {}) };
}

// A vault's share of a session's candidates: proposed cards on its Backlog page (projects/<main>/docs/plan.md), ids
// under its own slug. → the ids written, or null when the vault has no such page.
async function fileInVault(folder: string, list: Candidate[], s: Session, date: string): Promise<{ slug: string; ids: string[] } | null> {
  const { vaultLib } = await import('./workspace'); const { readdir } = await import('node:fs/promises');
  const dir = path.join(folder, '.wye'); const slug = vaultLib().readMeta(folder).slug || path.basename(folder);
  const projects = (await readdir(path.join(dir, 'projects'), { withFileTypes: true }).catch(() => [])).filter(e => e.isDirectory()).map(e => e.name);
  let file = ''; for (const p of [slug, ...projects]) { const f = path.join(dir, 'projects', p, 'docs', 'plan.md'); try { await readFile(f, 'utf8'); file = f; break; } catch { /* next */ } }
  if (!file) return null;
  const graph = await loadGraph(path.join(dir, '_build/graph.json')).catch(() => null);
  const taken = new Set((graph?.nodes ?? []).map(n => n.id)); const ids: string[] = [], cards: string[] = [], parts: string[][] = [];
  for (const c of list) { const id = candidateSlug(slug, c, taken); taken.add(id); ids.push(id); cards.push(candidateCard(id, c, s, '', s.agent, date)); parts.push(decisionParts(id, c)); }
  await withFileLock(file, async () => { const md = await readFile(file, 'utf8'); await writeAtomic(file, insertIntoPlanSection(md, cards, parts)); });
  return { slug, ids };
}

// registered once the module is loaded (lib/agent-host imports it): after the plan's result is written, a done session is consolidated, detached
onSessionEnd(async (productDir, s) => {
  if (s.status !== 'done' || !s.prDoc) return;
  if (!(await consolidateEnabled(productDir))) return;
  const product = slugOfDir(productDir);
  void consolidateSession(productDir, product, s).then(r => updateSession(productDir, s.id, { line: r.filed.length ? `consolidation: ${r.filed.length} block(s) the conversation decided but nobody wrote — filed as proposed on ${r.doc}${r.sent?.length ? `, and in the vault of the files they concern (${r.sent.map(x => `${x.vault}: ${x.ids.length}`).join(', ')})` : ''}: ${r.filed.join(', ')}` : `consolidation: ${r.candidates.length ? 'everything the conversation decided was written' : 'nothing to consolidate'}` })).catch(e => updateSession(productDir, s.id, { line: `consolidation failed: ${e instanceof Error ? e.message : e}` }));
}, 'consolidate');
