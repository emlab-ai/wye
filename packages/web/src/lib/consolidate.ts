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

// The conversation as the judge reads it: the person's and the agent's words, numbered by transcript index (`#n` is
// the evidence key, session:<id>#<n>), tools and thinking left out, the middle cut when it is long.
export function transcriptExcerpt(events: ChatEvent[], budget = 40000): string {
  const rows = events.map((e, i) => ({ i, e })).filter(({ e }) => (e.kind === 'user' || e.kind === 'assistant' || e.kind === 'summary') && (e.text || e.prompt)).map(({ i, e }) => `#${i} ${e.kind === 'user' ? 'PERSON' : 'AGENT'}: ${(e.text || e.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 2500)}`);
  const total = rows.reduce((a, r) => a + r.length + 1, 0);
  if (total <= budget) return rows.join('\n');
  // keep messages from both ends, the first and the last alternately, until the budget is spent
  const keep = new Set<number>(); let used = 0, lo = 0, hi = rows.length - 1;
  while (lo <= hi) { const i = keep.size % 2 === 0 ? lo++ : hi--; if (used + rows[i].length + 1 > budget) break; keep.add(i); used += rows[i].length + 1; }
  const out: string[] = []; let gap = 0;
  rows.forEach((r, i) => { if (keep.has(i)) { if (gap) out.push(`… (${gap} messages left out) …`); gap = 0; out.push(r); } else gap++; });
  if (gap) out.push(`… (${gap} messages left out) …`);
  return out.join('\n');
}

export function consolidationPrompt(excerpt: string, written: { id: string; title: string }[]): string {
  return `Below is a conversation between a person and a coding agent working on a product whose knowledge (requirements, rules, decisions, constraints, questions) is kept as typed blocks in documents. Read it and list what it produced as knowledge:
- decision: something the person or the agent settled ("let's do X", "no, Y instead", "we go with Z") — title, and text = the choice with its reason
- constraint: a standing rule about the product or how it is built stated as always/never ("always Z", "we never …")
- question: something raised and left open (no answer in the conversation)
- lesson: something learned the hard way ("this broke because …", "it turned out that …", "next time …")
Only knowledge about the product and how it is built — not the agent's step-by-step narration, not task progress. Attribute each to "person" or "agent" (who said or decided it) and cite the message numbers (#n) where it is said as evidence.

Then compare with the blocks the session already wrote into the documents (listed below by id and title) and output ONLY the candidates that none of those blocks already carries. If everything was written, output [].

Answer with a JSON array only — no prose, no code fence: [{"kind": "decision|constraint|question|lesson", "title": "<one line, max 90 chars>", "text": "<one paragraph>", "context": "<one sentence: what prompted it, optional>", "by": "person|agent", "evidence": [<message numbers>]}]

Blocks already written by this session:
${written.length ? written.map(w => `- ${w.id} — ${w.title}`).join('\n') : '(none)'}

Conversation:
${excerpt}
`;
}

export function parseCandidates(text: string): Candidate[] {
  const m = String(text).match(/\[[\s\S]*\]/); if (!m) return [];
  let arr: any[]; try { arr = JSON.parse(m[0]); } catch { return []; }
  return arr.filter(c => c && ['decision', 'constraint', 'question', 'lesson'].includes(c.kind) && c.title).map(c => ({ kind: c.kind, title: String(c.title).replace(/\s+/g, ' ').trim().slice(0, 110), text: String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200), context: c.context ? String(c.context).replace(/\s+/g, ' ').trim().slice(0, 400) : undefined, by: c.by === 'agent' ? 'agent' : 'person', evidence: Array.isArray(c.evidence) ? c.evidence.map(Number).filter(Number.isInteger) : [] }));
}

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
});
