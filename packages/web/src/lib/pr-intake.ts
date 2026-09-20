// Intake (decision:wf2.pr-intake): the moment a PR page exists, the app reads the product for it — before the
// librarian starts. One model call gives a real title and the request restated as what the person wants; the
// constraint packet and the semantic search give what it touches and what is in force; lib/impact's structural
// candidates give what the change reaches. Written into the page (title, Context, Impact) and put in front of the
// librarian as its first message's "What Wye found", so it continues from there instead of re-explaining.
// Pure helpers first (the prompt, the parser, the section bodies), then the IO.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { loadScope, type Scope } from './scope';
import { packetFor } from './packet';
import { search } from './semantic';
import { parseBody, type GraphNode } from './graph';
import { docRoute } from './doc';
import { readPrDoc } from './pr-docs';
import { setFrontmatter, sectionBody } from './pr-doc';
import { writeAtomic, withFileLock, rebuild } from './write';
import { updateSession } from './sessions';
import { refreshScope } from './pr-scope';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
const lib = () => ({ Graph: req('./lib/graph.js').Graph as any, impact: req('./lib/impact.js') as any, judge: req('./lib/judge.js') as { ask: (prompt: string, o: { model?: string; timeoutMs?: number }) => Promise<string>; nodeText: (n: any) => string } });
export const INTAKE_MODEL = process.env.WF_INTAKE_MODEL || process.env.WF_EXPLAIN_MODEL || 'claude-sonnet-5';

export type Intake = { title: string; want: string; touches: string[]; notes: string[] };
export const READING = '_Wye is reading the product for this request — what it touches, what is in force and what it reaches land here in a moment._';

export function intakePrompt(request: string, near: { id: string; text: string }[], packetMd: string): string {
  return `A person asked for a change to a product whose knowledge (goals, requirements, rules, decisions, questions, pages, components) is kept as typed blocks with ids like req:x.y. Read the request and answer with JSON only — no prose, no code fence:
{"title": "<the request as a title, 4–10 words, what changes, no trailing period>", "want": "<what the person wants, restated plainly in 2–4 sentences: the outcome, who it is for, what it replaces; no mechanism, no questions>", "touches": [<ids from the knowledge below that the change is about or depends on — only ids that appear below>], "notes": [<0–3 one-line observations: an existing block that already covers part of it, or one it contradicts, each naming the id>]}

## The request
${request.trim()}

## Knowledge close to it
${near.map(n => `- ${n.id}: ${n.text.slice(0, 220)}`).join('\n') || '(nothing close)'}

## Constraints in force (computed from the graph)
${packetMd.slice(0, 6000)}`;
}

// lenient: the first {...} in the answer; missing pieces fall back
export function parseIntake(text: string, fallbackTitle: string): Intake {
  const m = text.match(/\{[\s\S]*\}/); let j: any = {};
  try { j = m ? JSON.parse(m[0]) : {}; } catch { j = {}; }
  const str = (v: unknown, d = '') => typeof v === 'string' && v.trim() ? v.trim() : d;
  const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()) : [];
  return { title: str(j.title, fallbackTitle).replace(/[.\s]+$/, '').slice(0, 90) || fallbackTitle, want: str(j.want), touches: list(j.touches), notes: list(j.notes) };
}

const textOf = (n: GraphNode) => { const rows = parseBody(n.body ?? ''); return ['title', 'text', 'statement', 'q', 'description', 'when', 'then', 'choice'].map(k => rows.find(r => r.key === k)?.value ?? '').filter(Boolean).join('. ') || n.title; };

// The Context section: what the person wants, what it touches (per document), what is in force (the packet's lines).
export function contextBody(it: Intake, touched: { id: string; doc: string }[], packetMd: string, from: string): string {
  const byDoc = new Map<string, string[]>(); for (const t of touched) { byDoc.set(t.doc, [...(byDoc.get(t.doc) ?? []), t.id]); }
  const parts: string[] = [];
  if (it.want) parts.push(`**What you want** — ${it.want}`);
  parts.push(byDoc.size ? `**Touches** — ${[...byDoc].map(([doc, ids]) => `${doc}: ${ids.join(', ')}`).join(' · ')}` : '**Touches** — nothing in the product\'s knowledge is close to this yet; the librarian starts from the request alone.');
  if (it.notes.length) parts.push(`**Already there / in the way** — ${it.notes.join(' ')}`);
  // the packet's rule / constraint / decision lines — its open questions are not what governs the request
  // the id never first on the line: a line that starts with an id would define or embed it; "[status] id — text" reads as a tag
  const inForce = packetMd.split('\n').filter(l => /^- (rule|constraint|decision):/.test(l)).slice(0, 12).map(l => { const m = l.match(/^- ([a-z-]+:[A-Za-z0-9_.\-]+)\s*(\[[^\]]*\])?\s*(?:—\s*)?(.*)$/); return m ? `- ${m[2] ?? ''} ${m[1]} — ${m[3]}`.replace(/\s+/g, ' ').replace('- ', '- ') : l.trim(); }).join('\n');
  parts.push(inForce ? `**In force** — the constraints and decisions that govern it:\n${inForce}` : '**In force** — nothing governs this yet.');
  if (from) parts.push(from);
  return parts.join('\n\n');
}

// The Impact section: the structural candidates of the touched ids, best weight first.
export function impactBody(cands: { id: string; from: string; weight: number; path: string }[]): string {
  if (!cands.length) return '_Nothing reached yet — the impact fills in as the Definition takes shape._';
  const seen = new Map<string, { from: string; weight: number; path: string }>();
  for (const c of cands) { const cur = seen.get(c.id); if (!cur || cur.weight < c.weight) seen.set(c.id, c); }
  return [...seen].sort((a, b) => b[1].weight - a[1].weight).slice(0, 30).map(([id, c]) => `- ${id} — ${c.weight} from ${c.from}${c.path ? ` via ${c.path}` : ''}`).join('\n');
}

// Replace a section's body (the heading stays); the section is appended when missing.
export function withSection(md: string, heading: string, body: string): string {
  const m = md.match(new RegExp(`^## ${heading}[^\\n]*\\n`, 'm'));
  if (!m || m.index === undefined) return `${md.replace(/\s+$/, '')}\n\n## ${heading}\n\n${body}\n`;
  const start = m.index + m[0].length; const rest = md.slice(start); const next = rest.search(/^## /m);
  const end = next === -1 ? md.length : start + next;
  return `${md.slice(0, start)}\n${body}\n${next === -1 ? '' : '\n'}${md.slice(end)}`;
}
export function withTitle(md: string, title: string): string {
  return setFrontmatter(md, 'title', title).replace(/^# [^\n]*$/m, `# ${title}`);
}

// ---- IO

// Mark the page as being read (right after it is created, before the response goes back).
export async function markReading(product: string, ref: string): Promise<void> {
  const pr = await readPrDoc(product, ref); if (!pr) return;
  await withFileLock(pr.file, async () => { const md = await readFile(pr.file, 'utf8'); await writeAtomic(pr.file, withSection(md, 'Context', READING)); });
}

// The intake: model + packet + search + impact → the page; returns the "What Wye found" text for the librarian.
export async function runIntake(productDir: string, product: string, sessionId: string, ref: string, request: string, refs: string[]): Promise<string> {
  const scope = await loadScope(product); const pr = await readPrDoc(product, ref);
  if (!scope || !pr) return '';
  const { judge, Graph, impact } = lib();
  const packet = await packetFor(scope, request, refs, { budget: 6000 }).catch(() => ({ markdown: '', packet: { seeds: [] as string[] } }));
  let hits: { id: string; score: number }[] = [];
  try { hits = (await search(scope.product.dir, scope.graph, request, { limit: 12 })).map(h => ({ id: h.id, score: h.score })); } catch { /* no model yet */ }
  const near = hits.map(h => scope.idx.byId.get(h.id)).filter((n): n is GraphNode => !!n?.defined).map(n => ({ id: n.id, text: textOf(n) }));
  const fallbackTitle = (sectionBody(pr.md, 'Request') ?? request).replace(/^>\s?/gm, '').trim().split('\n').find(Boolean)?.slice(0, 90) ?? 'request';
  let it: Intake = { title: fallbackTitle, want: '', touches: [], notes: [] };
  try { it = parseIntake(await judge.ask(intakePrompt(request, near, packet.markdown), { model: INTAKE_MODEL, timeoutMs: 120000 }), fallbackTitle); }
  catch (e) { await updateSession(productDir, sessionId, { line: `intake: the model call failed (${e instanceof Error ? e.message : e}) — the page has the search's context only` }).catch(() => {}); }
  // what it touches: the model's ids that exist, the packet's seeds, the strong hits — grouped by document
  const ids = [...new Set([...it.touches.filter(id => scope.idx.byId.get(id)?.defined), ...packet.packet.seeds, ...hits.filter(h => h.score >= 0.45).map(h => h.id)])].filter(id => !/^(pr|session|block|module):/.test(id)).slice(0, 20);
  const touched = ids.map(id => { const n = scope.idx.byId.get(id)!; const r = docRoute(n.file); return { id, doc: r ? r.doc : path.basename(n.file, '.md') }; });
  const from = (sectionBody(pr.md, 'Request') ?? '').split('\n').find(l => /^_from: /.test(l)) ?? '';
  let cands: { id: string; from: string; weight: number; path: string }[] = [];
  try { const g = new Graph(scope.graph); for (const id of ids.slice(0, 8)) for (const c of impact.structuralCandidates(g, id, { hops: 2, min: 0.5 })) cands.push({ id: c.id, from: id, weight: c.weight, path: c.path }); } catch { cands = []; }
  cands = cands.filter(c => !ids.includes(c.id));
  await withFileLock(pr.file, async () => {
    let md = await readFile(pr.file, 'utf8');
    md = withTitle(md, it.title);
    md = withSection(md, 'Context', contextBody(it, touched, packet.markdown, from));
    md = withSection(md, 'Impact', impactBody(cands));
    await writeAtomic(pr.file, md);
  });
  await rebuild(productDir);
  await refreshScope(productDir, (await loadScope(product))?.graph ?? scope.graph, pr.file).catch(() => []); // the scope from the request's tags, before any Definition
  await updateSession(productDir, sessionId, { line: `intake: "${it.title}" — touches ${ids.length} node(s), reaches ${new Set(cands.map(c => c.id)).size}` }).catch(() => {});
  return `\n## What Wye found (already on the page under Context and Impact)\n${contextBody(it, touched, packet.markdown, '')}\n\nReaches: ${[...new Set(cands.map(c => c.id))].slice(0, 20).join(', ') || 'nothing yet'}.\nContinue from here: do not re-explain the state; propose the Definition and ask what is open.`;
}
