// "What do we know about this?" (req:exec.explain-anywhere, decision:exec.wye-is-a-role): one librarian turn on a
// node or a text — the constraint packet and the semantic context go to the model with the librarian's brief, and
// the answer is the current state in plain language with the nodes as tags; nothing is proposed or written.
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { loadScope, type Scope } from './scope';
import { packetFor } from './packet';
import { search } from './semantic';
import { parseBody } from './graph';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const judge = () => req('./lib/judge.js') as { ask: (prompt: string, o: { model?: string; timeoutMs?: number }) => Promise<string>; nodeText: (n: any) => string };
export const EXPLAIN_MODEL = process.env.WF_EXPLAIN_MODEL || 'claude-sonnet-5';

const BRIEF = `You are Wye, the librarian of a product's knowledge base (goals, requirements, rules, constraints, decisions, questions, work as typed blocks with ids like req:x.y). Explain the current state of the product around the subject below, for the person who owns it: what the product does today in this area, what is already decided or constrained, what is open (questions, proposed blocks), what is in progress or planned (tasks, plans). Plain language, short paragraphs, the nodes as inline tags (their ids, e.g. req:x.y, rule:z — never in code spans). Say plainly what is thin or missing. Propose nothing; ask nothing. Answer in markdown, 120–300 words.`;

export async function explain(scope: Scope, subject: { id?: string; text?: string }, opts: { model?: string } = {}): Promise<{ explanation: string; refs: string[]; subject: string }> {
  const n = subject.id ? scope.idx.byId.get(subject.id) : undefined;
  const text = n ? `${n.id}: ${judge().nodeText(n)}` : (subject.text ?? '');
  const { markdown, packet } = await packetFor(scope, text, n ? [n.id] : [], { budget: 6000 });
  let hits: { id: string; snippet: string }[] = [];
  try { hits = (await search(scope.product.dir, scope.graph, text, { limit: 10 })).map(h => ({ id: h.id, snippet: h.snippet })); } catch { /* no model yet */ }
  const near = hits.map(h => { const x = scope.idx.byId.get(h.id); const rows = x ? parseBody(x.body) : []; const t = rows.find(r => ['title', 'text', 'statement', 'q', 'description'].includes(r.key))?.value ?? h.snippet; return `- ${h.id}${x?.status ? ` #${x.status}` : ''}: ${t.slice(0, 220)}`; }).join('\n');
  const prompt = `${BRIEF}\n\n## Subject\n${text}\n\n## Constraints in force (computed from the graph)\n${markdown}\n\n## Knowledge closest to the subject\n${near || '(nothing close)'}\n`;
  const answer = await judge().ask(prompt, { model: opts.model ?? EXPLAIN_MODEL, timeoutMs: 120000 });
  const refs = [...new Set([...(n ? [n.id] : []), ...packet.seeds, ...hits.map(h => h.id), ...(answer.match(/\b[a-z-]+:[A-Za-z0-9_.-]+\b/g) ?? []).filter(id => scope.idx.byId.has(id))])];
  return { explanation: answer.trim(), refs, subject: text.slice(0, 200) };
}
export { loadScope };
