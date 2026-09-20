// A librarian's questions live on its PR page (decision:wf2.pr-questions-on-the-page): when a refining session raises
// AskUserQuestion, the questions become `question:` cards under the PR's "## Questions" — the question, its header,
// the options with their descriptions, `asked-by: session:<id>#<request>`, status open. The person answers on the page
// (op:api.pr answer) or in the console; either way the card gets `answer`, `by`, status resolved, and once every card
// of one request is answered the tool is answered too, so the session continues. Pure helpers first, then the IO.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { onAsk, onAnswered, getSession, type AskInput } from './sessions';
import { readPrDoc } from './pr-docs';
import { prNumberOf, sectionBody } from './pr-doc';
import { patchYamlCard } from './node-edit';
import { writeAtomic, withFileLock, rebuild } from './write';
import { parseBody } from './graph';
import type { GraphData } from './graph';

export type PrQuestion = { id: string; q: string; header?: string; options: { label: string; description?: string }[]; multi: boolean; status: string; answer?: string; by?: string; askedBy?: string };

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'q';
const fold = (key: string, v: string, indent = '  ') => v.includes('\n') || v.length > 100 || /: |^[-'"[{&*!|>%@`#]/.test(v) ? [`${indent}${key}: >`, ...v.split('\n').map(l => `${indent}  ${l.trim()}`)].join('\n') : `${indent}${key}: ${v}`;

// The cards of one AskUserQuestion, as a yaml fence. Options are "Label — description", separated by " | " (a
// folded yaml value joins lines with spaces, so one line it is).
export function questionCards(prSlug: string, sessionId: string, requestId: string, input: AskInput, taken: Iterable<string> = []): { yaml: string; ids: string[] } {
  const have = new Set(taken); const ids: string[] = []; const cards: string[] = [];
  const num = prNumberOf(prSlug); const base = num ? `question:pr-${num}` : `question:${prSlug}`;
  for (const q of input.questions ?? []) {
    let id = `${base}.${slugOf(q.header || q.question)}`; let n = 2; while (have.has(id)) id = `${base}.${slugOf(q.header || q.question)}-${n++}`;
    have.add(id); ids.push(id);
    const lines = [`- id: ${id}`, fold('q', q.question.trim())];
    if (q.header) lines.push(`  header: ${q.header.trim()}`);
    if (q.options?.length) lines.push(fold('options', q.options.map(o => `${o.label}${o.description ? ` — ${o.description.replace(/\n+/g, ' ')}` : ''}`).join(' | ')));
    if (q.multiSelect) lines.push('  multi: true');
    lines.push(`  asked-by: session:${sessionId}#${requestId}`, '  status: open');
    cards.push(lines.join('\n'));
  }
  return { yaml: cards.length ? '```yaml\n' + cards.join('\n') + '\n```' : '', ids };
}

// Put a fence under "## Questions" — the section is added before Tasks (else appended) when missing.
export function withQuestions(md: string, yaml: string): string {
  if (!yaml) return md;
  const m = md.match(/^## Questions[^\n]*\n/m);
  if (!m || m.index === undefined) {
    const block = `## Questions\n\n_What the librarian needs from you before the request is clear — answer here._\n\n${yaml}\n\n`;
    const next = md.match(/^## Tasks[^\n]*\n/m);
    return next && next.index !== undefined ? `${md.slice(0, next.index)}${block}${md.slice(next.index)}` : `${md.replace(/\s+$/, '')}\n\n${block}`;
  }
  const start = m.index + m[0].length; const rest = md.slice(start); const nextAt = rest.search(/^## /m);
  const end = nextAt === -1 ? md.length : start + nextAt;
  const body = md.slice(start, end).replace(/\s+$/, '');
  return `${md.slice(0, start)}${body}\n\n${yaml}\n${nextAt === -1 ? '' : '\n'}${md.slice(end)}`;
}

// The PR's questions from the graph: every question node defined in its file, the options parsed back.
export function questionsOf(graph: GraphData, file: string): PrQuestion[] {
  const out: PrQuestion[] = [];
  for (const n of graph.nodes) {
    if (n.kind !== 'question' || !n.defined || n.file !== file) continue;
    const rows = parseBody(n.body); const get = (k: string) => rows.find(r => r.key === k)?.value;
    const options = (get('options') ?? '').split(' | ').map(l => l.trim()).filter(Boolean).map(l => { const [label, ...rest] = l.split(' — '); return { label: label.trim(), description: rest.join(' — ').trim() || undefined }; });
    out.push({ id: n.id, q: get('q') ?? n.title, header: get('header'), options, multi: get('multi') === 'true', status: n.status, answer: get('answer'), by: get('by'), askedBy: get('asked-by') });
  }
  return out;
}

// Write the answer on the card (status resolved). Pure over the markdown.
export function withAnswer(md: string, id: string, answer: string, by: string): string {
  return patchYamlCard(md, id, { status: 'resolved', props: { answer, by } }).md;
}

// ---- the IO: the hooks the host fires, and the page's answer

async function fileOf(product: string, ref: string) { const pr = await readPrDoc(product, ref); return pr ? { file: pr.file, slug: pr.slug } : null; }

// A librarian's AskUserQuestion → cards on its PR page.
onAsk(async (productDir, product, sessionId, requestId, input) => {
  const s = await getSession(productDir, sessionId); if (!s?.prDoc || s.role !== 'librarian' || !input.questions?.length) return;
  const at = await fileOf(product, s.prDoc); if (!at) return;
  await withFileLock(at.file, async () => {
    const md = await readFile(at.file, 'utf8');
    const taken = [...md.matchAll(/^- id:\s*(question:[A-Za-z0-9_.\-]+)\s*$/gm)].map(m => m[1]);
    const { yaml } = questionCards(at.slug, sessionId, requestId, input, taken);
    if (yaml) await writeAtomic(at.file, withQuestions(md, yaml));
  });
  await rebuild(productDir);
}, 'pr-questions:ask');

// Answered in the console → the cards take the answers.
onAnswered(async (productDir, product, sessionId, requestId, input) => {
  const s = await getSession(productDir, sessionId); if (!s?.prDoc || !input.answers) return;
  const at = await fileOf(product, s.prDoc); if (!at) return;
  const answers = input.answers;
  await withFileLock(at.file, async () => {
    let md = await readFile(at.file, 'utf8'); const before = md;
    const sec = sectionBody(md, 'Questions') ?? '';
    for (const card of sec.split(/^- id:\s*/m).slice(1)) {
      const id = card.split('\n')[0].trim(); if (!card.includes(`asked-by: session:${sessionId}#${requestId}`)) continue;
      const q = (input.questions ?? []).find(x => card.includes(x.question.trim().split('\n')[0].slice(0, 60)));
      const a = q ? answers[q.question] : undefined; if (!a) continue;
      md = withAnswer(md, id, a, 'person');
    }
    if (md !== before) await writeAtomic(at.file, md);
  });
  await rebuild(productDir);
}, 'pr-questions:answered');

// Answered on the page: the card, then — once every card of that request is answered — the tool.
export async function answerOnPage(productDir: string, product: string, ref: string, graph: GraphData, id: string, answer: string, by: string): Promise<{ askedBy?: string; settled?: { sessionId: string; requestId: string; answers: Record<string, string> } }> {
  const at = await fileOf(product, ref); if (!at) throw new Error(`${ref}: not found`);
  await withFileLock(at.file, async () => { const md = await readFile(at.file, 'utf8'); await writeAtomic(at.file, withAnswer(md, id, answer, by)); });
  await rebuild(productDir);
  const mine = questionsOf(graph, path.relative(REPO_ROOT, at.file)).find(q => q.id === id); if (!mine?.askedBy) return {};
  const m = mine.askedBy.match(/^session:([a-z0-9]+)#(.+)$/); if (!m) return { askedBy: mine.askedBy };
  // the other cards of the same request, as the file is now
  const md = await readFile(at.file, 'utf8'); const sec = sectionBody(md, 'Questions') ?? '';
  const cards = sec.split(/^- id:\s*/m).slice(1).filter(c => c.includes(`asked-by: ${mine.askedBy}`));
  const answers: Record<string, string> = {};
  for (const c of cards) {
    const rows = parseBody(c.replace(/^[^\n]*\n/, '').split('\n').map(l => l.replace(/^  /, '')).join('\n'));
    const q = rows.find(r => r.key === 'q')?.value; const a = c.split('\n')[0].trim() === id ? answer : rows.find(r => r.key === 'answer')?.value;
    if (!q || !a) return { askedBy: mine.askedBy }; // one still open: the tool waits
    answers[q] = a;
  }
  return { askedBy: mine.askedBy, settled: { sessionId: m[1], requestId: m[2], answers } };
}
