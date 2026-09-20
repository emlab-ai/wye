// Consolidation at session end (decision:memory.consolidate-sessions): what a conversation decided, constrained, asked
// and learned is extracted from the transcript by one model call, diffed against the blocks the session wrote, and the
// misses are filed as proposed blocks — with `by:` the speaker and `evidence:` the transcript events — under the plan
// document's Plan section, so they reach the Inbox with their source. The procedural memory the product had none of:
// a lesson: block per "this broke because …". Off unless _product.md says `consolidate: on` or WF_CONSOLIDATE=1;
// runs detached after the session record is saved; one model call per session end.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { onSessionEnd, updateSession } from './sessions';
import type { Session, ChatEvent } from './session-types';
import { loadGraph } from './load';
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
export function candidateCard(id: string, c: Candidate, s: Pick<Session, 'id'>, planId: string, agentName: string, date: string): string {
  const evidence = c.evidence.length ? c.evidence.map(n => `session:${s.id}#${n}`).join(', ') : `session:${s.id}`;
  const by = c.by === 'agent' ? `agent:${agentName}` : 'person';
  const lines = [`- id: ${id}`, `  title: ${c.title.replace(/:/g, ' -')}`];
  if (c.kind === 'decision') lines.push(y('context', c.context), y('choice', c.text), `  date: ${date}`);
  else if (c.kind === 'question') lines.push(y('q', c.text || c.title), y('context', c.context));
  else lines.push(y('statement', c.text || c.title), y('context', c.context));
  lines.push(`  status: ${c.kind === 'question' ? 'open' : 'proposed'}`, `  by: ${by}`, `  evidence: [${evidence}]`, `  part-of: ${planId}`);
  return lines.filter(Boolean).join('\n');
}

// Put the cards into the plan document's Plan section (a yaml fence at its end), before Tasks
export function insertIntoPlanSection(md: string, cards: string[]): string {
  const block = '```yaml\n' + cards.join('\n') + '\n```';
  const i = md.indexOf('\n## Plan'); if (i < 0) return md.replace(/\n*$/, '\n\n## Plan\n\n' + block + '\n');
  const j = md.indexOf('\n## ', i + 8);
  const end = j < 0 ? md.length : j;
  const section = md.slice(i, end).replace(/\n*$/, '');
  return md.slice(0, i) + section + '\n\n' + block + '\n' + md.slice(end);
}

// The run: transcript → candidates → cards filed on the plan; the session log says what happened.
export async function consolidateSession(productDir: string, product: string, s: Session, opts: { model?: string } = {}): Promise<{ candidates: Candidate[]; filed: string[]; doc?: string }> {
  const excerpt = transcriptExcerpt(s.transcript ?? []);
  if (excerpt.length < 200) return { candidates: [], filed: [] };
  const written = (s.artifacts?.blocks ?? []).filter(b => b.change !== 'removed' && /^(decision|constraint|question|lesson|req|rule|task):/.test(b.id)).map(b => ({ id: b.id, title: b.title }));
  const answer = await judge().ask(consolidationPrompt(excerpt, written), { model: opts.model });
  const candidates = parseCandidates(answer).slice(0, 12);
  if (!candidates.length || !s.planDoc) return { candidates, filed: [] };
  // the plan document from the graph: plan:<slug> is the page node, its file the target
  const slug = s.planDoc.split('/')[2]; const graph = await loadGraph(path.join(productDir, '_build/graph.json')).catch(() => null);
  const page = graph?.nodes.find(n => n.id === `plan:${slug}` && n.defined); if (!graph || !page) return { candidates, filed: [] };
  const file = path.join(REPO_ROOT, page.file);
  const taken = new Set(graph.nodes.map(n => n.id));
  const date = new Date().toISOString().slice(0, 10);
  const filed: string[] = []; const cards: string[] = [];
  for (const c of candidates) { const id = candidateSlug(product, c, taken); taken.add(id); filed.push(id); cards.push(candidateCard(id, c, s, page.id, s.agent, date)); }
  await withFileLock(file, async () => { const md = await readFile(file, 'utf8'); await writeAtomic(file, insertIntoPlanSection(md, cards)); });
  return { candidates, filed, doc: s.planDoc };
}

// registered once the module is loaded (lib/agent-host imports it): after the plan's result is written, a done session is consolidated, detached
onSessionEnd(async (productDir, s) => {
  if (s.status !== 'done' || !s.planDoc) return;
  if (!(await consolidateEnabled(productDir))) return;
  const product = path.basename(productDir);
  void consolidateSession(productDir, product, s).then(r => updateSession(productDir, s.id, { line: r.filed.length ? `consolidation: ${r.filed.length} block(s) the conversation decided but nobody wrote — filed as proposed on ${r.doc}: ${r.filed.join(', ')}` : `consolidation: ${r.candidates.length ? 'everything the conversation decided was written' : 'nothing to consolidate'}` })).catch(e => updateSession(productDir, s.id, { line: `consolidation failed: ${e instanceof Error ? e.message : e}` }));
}, 'consolidate');
