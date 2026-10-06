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
{"title": "<the request as a title, 4–10 words, what changes, no trailing period>", "want": "<what the person wants, restated plainly in 2–4 sentences: the outcome, who it is for, what it replaces; no mechanism, no questions>", "touches": [<ids from the knowledge below that the change is about or depends on — only ids that appear below>], "notes": [<0–3 one-line observations: an existing block that already covers part of it, or one it contradicts, each naming the id inside the sentence, never as its first word>]}

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

// A node as these sections say it: its words first — the page is read without opening each tag — then what it is.
export type Found = { id: string; kind: string; text: string; doc: string };
const KIND: Record<string, string> = { req: 'Requirement', decision: 'Decision', rule: 'Rule', constraint: 'Constraint', question: 'Question', goal: 'Goal', gate: 'Gate', lesson: 'Lesson', entity: 'Entity', task: 'Task', test: 'Test', page: 'Page', component: 'Component', lib: 'Library', op: 'Operation', type: 'Type' };
const kindOf = (k: string) => KIND[k] ?? k[0].toUpperCase() + k.slice(1);
// one line of a node's words: no line breaks, no leading id (a line that opens with an id would define or embed it)
const clip = (t: string, n: number) => { const x = t.replace(/\s+/g, ' ').replace(/^[a-z-]+:[A-Za-z0-9_.\-]+\s*[—:-]?\s*/, '').trim(); return x.length > n ? x.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, '') + '…' : x; };
// a node's words for a person: its text — led by its title only when the text does not already open with it (a prose
// node's title is its own first sentence, and saying it twice reads as a stutter)
export function wordsOf(n: GraphNode): string {
  const rows = parseBody(n.body ?? ''); const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const text = ['text', 'statement', 'q', 'description', 'choice', 'purpose', 'when'].map(get).find(Boolean) ?? '';
  let title = (get('title') || n.title || '').replace(/[:.…\s]+$/, '');
  if (title === n.id.slice(n.id.indexOf(':') + 1)) title = '';   // a card with no title of its own is titled by its slug: not words
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!text) return title;
  return !title || norm(text).startsWith(norm(title).slice(0, 40)) ? text : `${title} — ${text}`;
}
export const foundOf = (n: GraphNode): Found => { const r = docRoute(n.file); return { id: n.id, kind: n.kind, text: wordsOf(n), doc: r ? r.doc : path.basename(n.file, '.md') }; };
// a note from the model as a list line: one that opens with an id would define that node here (a question's card with
// the note as its text), so it is led in
const note = (n: string) => { const t = n.trim(); return /^[a-z-]+:[A-Za-z0-9_.\-]+(\s|$)/.test(t) ? `Note — ${t}` : t; };
// "Decision · Opening a folder gives a product whose edits land in that folder… (decision:wf2.product-transfer)"
const said = (f: Found, n = 150) => `${kindOf(f.kind)} · ${clip(f.text, n) || f.id.slice(f.id.indexOf(':') + 1)} (${f.id})`;

// The Context section of the page (decision:wf2.pr-sections-readable): what the person wants; what it touches as a
// list by page, each node in its own words; what is already there; what is in force as the nodes' own cards (embed
// lines) — the nearest first, the count of the rest said. `docTitle` gives a page's name for its slug.
export const IN_FORCE_SHOWN = 12;
export function contextBody(it: Intake, touched: Found[], inForce: Found[], from: string, docTitle: (doc: string) => string = d => d): string {
  const byDoc = new Map<string, Found[]>(); for (const t of touched) { byDoc.set(t.doc, [...(byDoc.get(t.doc) ?? []), t]); }
  const parts: string[] = [];
  if (it.want) parts.push(`**What you want** — ${it.want}`);
  // everything it touches governs it: those are the cards under In force, not said twice
  if (!byDoc.size && inForce.length) { /* no Touches paragraph */ }
  else parts.push(byDoc.size
    ? `**Touches** — what the request is about, by page:\n\n${[...byDoc].map(([doc, list]) => `- On ${docTitle(doc)}\n${list.map(f => `  - ${said(f)}`).join('\n')}`).join('\n')}`
    : '**Touches** — nothing in the product\'s knowledge is close to this yet; the librarian starts from the request alone.');
  if (it.notes.length) parts.push(`**Already there / in the way**\n${it.notes.map(n => `- ${note(n)}`).join('\n')}`);
  if (inForce.length) {
    const shown = inForce.slice(0, IN_FORCE_SHOWN); const more = inForce.length - shown.length;
    parts.push(`**In force** — the constraints, rules and decisions that govern it:\n\n${shown.map(f => `![[${f.id}]]`).join('\n\n')}${more > 0 ? `\n\n_… and ${more} more further from the request — \`wye packet --for "<the request>"\` lists them all._` : ''}`);
  } else parts.push('**In force** — nothing governs this yet.');
  if (from) parts.push(from);
  return parts.join('\n\n');
}
// What governs the request, most to the point first: the decisions, rules and constraints the request itself touches
// (`first`, in that order), then the other constraints (they bind every request alike), then what the packet reached
// by how many steps away it is — the packet lists each kind by id, and its first dozen were whatever came first in
// the alphabet.
export const GOVERNS = ['constraint', 'decision', 'rule', 'gate'];
export function inForceOf(byKind: Record<string, GraphNode[]>, hops: Map<string, number>, first: string[] = []): GraphNode[] {
  const d = (n: GraphNode) => hops.get(n.id) ?? 9;
  const by = (a: GraphNode, b: GraphNode) => d(a) - d(b) || a.id.localeCompare(b.id);
  const all = GOVERNS.flatMap(k => byKind[k] ?? []); const at = (n: GraphNode) => first.indexOf(n.id);
  const touched = all.filter(n => at(n) >= 0).sort((a, b) => at(a) - at(b));
  const rest = all.filter(n => at(n) < 0);
  return [...touched, ...rest.filter(n => n.kind === 'constraint').sort(by), ...rest.filter(n => n.kind !== 'constraint').sort(by)];
}
// The same for the librarian's first message: plain lines, ids and words — a model reads this, no cards.
export function contextText(it: Intake, touched: Found[], inForce: Found[]): string {
  const parts: string[] = [];
  if (it.want) parts.push(`**What you want** — ${it.want}`);
  parts.push(touched.length ? `**Touches**\n${touched.map(f => `- ${f.id} (${f.doc}) — ${clip(f.text, 160)}`).join('\n')}` : '**Touches** — nothing close yet.');
  if (it.notes.length) parts.push(`**Already there / in the way**\n${it.notes.map(n => `- ${note(n)}`).join('\n')}`);
  parts.push(inForce.length ? `**In force**\n${inForce.slice(0, 20).map(f => `- ${f.id} — ${clip(f.text, 200)}`).join('\n')}` : '**In force** — nothing governs this yet.');
  return parts.join('\n\n');
}

// The Impact section: what a change to the touched nodes reaches, grouped by the node it is reached from, each in its
// own words, strongest first. A node's own content (its context, choice, alternatives — reached "via content") is the
// node itself, not something else the change reaches, and is left out.
export type Reached = { id: string; from: string; weight: number; path: string | string[]; via?: string };
const HOW: Record<string, string> = { governs: 'it governs this', 'governed-by': 'governed by it', refines: 'it refines this', 'refined-by': 'a refinement of it', satisfies: 'it satisfies this', 'satisfied-by': 'satisfied by it', 'depends-on': 'it depends on this', 'depended-on-by': 'depends on it', affects: 'it affects this', 'affected-by': 'affected by it', 'part-of': 'part of it', 'verified-by': 'verifies it', verifies: 'it verifies this' };
export const IMPACT_NEAR = 8, IMPACT_FAR = 3;
export function impactBody(cands: Reached[], find: (id: string) => Found | undefined = () => undefined): string {
  // lib/impact gives the path as its verbs, a list or "a → b"
  const steps = (c: Reached) => (Array.isArray(c.path) ? c.path : String(c.path ?? '').split(/\s*(?:→|,)\s*/)).filter(Boolean);
  const best = new Map<string, Reached>();
  for (const c of cands) { if (c.via === 'content' || steps(c).includes('content')) continue; const cur = best.get(c.id); if (!cur || cur.weight < c.weight) best.set(c.id, c); }
  if (!best.size) return '_Nothing reached yet — the impact fills in as the Definition takes shape._';
  const groups = new Map<string, Reached[]>(); for (const c of [...best.values()].sort((a, b) => b.weight - a.weight)) groups.set(c.from, [...(groups.get(c.from) ?? []), c]);
  const line = (c: Reached) => { const f = find(c.id); const st = steps(c); const how = st.length === 1 ? HOW[st[0]] ?? `via ${st[0]}` : st.length ? `through ${st.join(' › ')}` : ''; return `  - ${f ? said(f) : `(${c.id})`}${how ? ` — ${how}` : ''}`; };
  // what is one step away is read in full; what is further is a few and a count — a decision that governs a
  // requirement reaches every refinement of it, and thirty of those said nothing
  const group = ([from, list]: [string, Reached[]]) => {
    const f = find(from); const near = list.filter(c => steps(c).length <= 1), far = list.filter(c => steps(c).length > 1);
    const shown = [...near.slice(0, IMPACT_NEAR), ...far.slice(0, IMPACT_FAR)]; const more = list.length - shown.length;
    return `- Because it touches ${f ? `${clip(f.text, 110)} (${from})` : `(${from})`}\n${shown.map(line).join('\n')}${more > 0 ? `\n  - … and ${more} more further away — \`wye impact ${from}\` lists them` : ''}`;
  };
  return `What a change here reaches beyond the request itself — worth a look before you approve, nearest first.\n\n${[...groups].slice(0, 8).map(group).join('\n')}`;
}

// Replace a section's body (the heading stays); a missing section goes where it belongs (lib/sections.js, shared with the CLI).
const sections = () => createRequire(path.join(REPO_ROOT, 'package.json'))('./lib/sections.js') as { withSection: (md: string, heading: string, body: string) => string };
export function withSection(md: string, heading: string, body: string): string { return sections().withSection(md, heading, body); }
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
  const packet = await packetFor(scope, request, refs, { budget: 6000 }).catch(() => ({ markdown: '', packet: { seeds: [] as string[], byKind: {} as Record<string, GraphNode[]>, hops: new Map<string, number>() } }));
  let hits: { id: string; score: number }[] = [];
  try { hits = (await search(scope.product.dir, scope.graph, request, { limit: 12 })).map(h => ({ id: h.id, score: h.score })); } catch { /* no model yet */ }
  const near = hits.map(h => scope.idx.byId.get(h.id)).filter((n): n is GraphNode => !!n?.defined).map(n => ({ id: n.id, text: textOf(n) }));
  const fallbackTitle = (sectionBody(pr.md, 'Request') ?? request).replace(/^>\s?/gm, '').trim().split('\n').find(Boolean)?.slice(0, 90) ?? 'request';
  let it: Intake = { title: fallbackTitle, want: '', touches: [], notes: [] };
  try { it = parseIntake(await judge.ask(intakePrompt(request, near, packet.markdown), { model: INTAKE_MODEL, timeoutMs: 120000 }), fallbackTitle); }
  catch (e) { await updateSession(productDir, sessionId, { line: `intake: the model call failed (${e instanceof Error ? e.message : e}) — the page has the search's context only` }).catch(() => {}); }
  // what it touches: the model's ids that exist, the packet's seeds, the strong hits — grouped by document
  const ids = [...new Set([...it.touches.filter(id => scope.idx.byId.get(id)?.defined), ...packet.packet.seeds, ...hits.filter(h => h.score >= 0.45).map(h => h.id)])].filter(id => !/^(pr|session|block|module):/.test(id)).slice(0, 20);
  // what it touches that governs it (a decision, a rule, a constraint in force) is shown as its card under In force;
  // the rest — requirements, goals, pages — as the Touches list
  const governing = inForceOf(packet.packet.byKind, packet.packet.hops, ids);
  const inForce = governing.map(foundOf); const governs = new Set(governing.map(n => n.id));
  const touched = ids.filter(id => !governs.has(id)).map(id => foundOf(scope.idx.byId.get(id)!));
  // a page by its name: the document's title for the slug the node is on
  const titles = new Map(scope.graph.modules.map(m => [docRoute(m.file)?.doc ?? '', m.title])); const docTitle = (d: string) => titles.get(d) || d;
  const find = (id: string) => { const n = scope.idx.byId.get(id); return n?.defined ? foundOf(n) : undefined; };
  const from = (sectionBody(pr.md, 'Request') ?? '').split('\n').find(l => /^_from: /.test(l)) ?? '';
  let cands: Reached[] = [];
  try { const g = new Graph(scope.graph); for (const id of ids.slice(0, 8)) for (const c of impact.structuralCandidates(g, id, { hops: 2, min: 0.5 })) cands.push({ id: c.id, from: id, weight: c.weight, path: c.path, via: c.via }); } catch { cands = []; }
  // not what the request already touches, and not a node's own content (lib/impact: via content)
  // … and not the request's own page: its task and its questions are the request, not what it reaches
  const own = path.relative(REPO_ROOT, pr.file);
  cands = cands.filter(c => !ids.includes(c.id) && c.via !== 'content' && scope.idx.byId.get(c.id)?.file !== own);
  await withFileLock(pr.file, async () => {
    let md = await readFile(pr.file, 'utf8');
    md = withTitle(md, it.title);
    md = withSection(md, 'Context', contextBody(it, touched, inForce, from, docTitle));
    md = withSection(md, 'Impact', impactBody(cands, find));
    await writeAtomic(pr.file, md);
  });
  await rebuild(productDir);
  await refreshScope(productDir, (await loadScope(product))?.graph ?? scope.graph, pr.file).catch(() => []); // the scope from the request's tags, before any Definition
  await updateSession(productDir, sessionId, { line: `intake: "${it.title}" — touches ${ids.length} node(s), reaches ${new Set(cands.map(c => c.id)).size}` }).catch(() => {});
  return `\n## What Wye found (already on the page under Context and Impact)\n${contextText(it, touched, inForce)}\n\nReaches: ${[...new Set(cands.map(c => c.id))].slice(0, 20).join(', ') || 'nothing yet'}.\nContinue from here: do not re-explain the state; propose the Definition and ask what is open.`;
}
