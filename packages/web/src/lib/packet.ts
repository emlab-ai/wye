// The constraint packet (decision:memory.constraint-packet, req:memory.intake-packet; op:api.packet): everything
// that governs a request, computed structurally — the twin of lib/graph.js#constraints for the app. Seeds are the
// refs a person attached (ids or links) plus the semantic hits for the text; from them every rule, constraint, gate,
// lesson, goal and approved decision within two hops over the governing verbs, plus every open question on those
// nodes. Ended nodes leave by construction (isCurrent); the result is complete, not a top-k.
import type { GraphData, GraphIndex, GraphNode } from './graph';
import { isCurrent, parseBody } from './graph';
import type { Scope } from './scope';
import { listChanges } from './changes';
import { search } from './semantic';
import { resolveLink } from './resolve';
import { docIdOf } from './doc';

export const PACKET_VERBS = new Set(['governs', 'governed-by', 'gated-by', 'gates', 'affects', 'affected-by', 'refines', 'refined-by', 'part-of', 'has', 'depends-on', 'depended-on-by', 'scope', 'constrained-by', 'about', 'lessons', 'applies-to', 'satisfied-by', 'satisfies', 'rationale', 'rationale-for']);
export const PACKET_KINDS = new Set(['rule', 'constraint', 'gate', 'decision', 'goal', 'lesson', 'question']);
const NOT_IN_FORCE = new Set(['proposed', 'draft', 'rejected', 'superseded', 'question']);
const ORDER = ['constraint', 'rule', 'gate', 'decision', 'goal', 'lesson', 'question'];
const LABEL: Record<string, string> = { constraint: 'Constraints (constitution)', rule: 'Rules', gate: 'Gates', decision: 'Decisions (approved)', goal: 'Goals', lesson: 'Lessons', question: 'Open questions' };

export interface Packet { seeds: string[]; byKind: Record<string, GraphNode[]>; questions: GraphNode[]; hidden: number; hops: Map<string, number> }

export function constraintsFor(g: GraphData, idx: GraphIndex, seedIds: string[], opts: { hops?: number; all?: boolean; asOf?: string | null } = {}): Packet {
  const hops = opts.hops ?? 2;
  const seeds = seedIds.filter(id => idx.byId.has(id));
  const dist = new Map(seeds.map(id => [id, 0])); let frontier = seeds;
  for (let d = 1; d <= hops; d++) {
    const nx: string[] = [];
    for (const f of frontier) {
      for (const e of idx.out.get(f) ?? []) if (PACKET_VERBS.has(e.verb) && !dist.has(e.to)) { dist.set(e.to, d); nx.push(e.to); }
      for (const e of idx.inc.get(f) ?? []) if (PACKET_VERBS.has(e.verb) && !dist.has(e.from)) { dist.set(e.from, d); nx.push(e.from); }
    }
    frontier = nx;
  }
  // in force: a decision, constraint or lesson that is not proposed / rejected; rules and gates whatever their status (shown with it)
  const keep = (n: GraphNode) => n.defined && PACKET_KINDS.has(n.kind) && (!['decision', 'constraint', 'lesson'].includes(n.kind) || !NOT_IN_FORCE.has(n.status));
  const reached = [...dist.keys()].map(id => idx.byId.get(id)!).filter(n => n && keep(n));
  // a constraint with no scope binds everything: in the packet whether or not the traversal reached it
  for (const n of g.nodes) if (n.kind === 'constraint' && n.defined && n.status === 'approved' && !dist.has(n.id) && !(idx.out.get(n.id) ?? []).some(e => e.verb === 'scope')) { dist.set(n.id, hops); reached.push(n); }
  const current = opts.all ? reached : reached.filter(n => isCurrent(n, opts.asOf) && !n.archived);
  const hidden = reached.length - current.length;
  const kept = new Set(current.map(n => n.id));
  const open = (n: GraphNode) => n.kind === 'question' && n.defined && ['', 'open', 'question'].includes(n.status);
  // open questions on the seeds, on what was reached and on what is kept
  const questions = g.nodes.filter(n => open(n) && (dist.has(n.id) || (idx.out.get(n.id) ?? []).some(e => dist.has(e.to) || kept.has(e.to)) || (idx.inc.get(n.id) ?? []).some(e => dist.has(e.from) || kept.has(e.from))));
  const byKind: Record<string, GraphNode[]> = {};
  for (const n of current) if (n.kind !== 'question') (byKind[n.kind] ??= []).push(n);
  for (const list of Object.values(byKind)) list.sort((a, b) => (dist.get(a.id) ?? 9) - (dist.get(b.id) ?? 9) || a.id.localeCompare(b.id));
  return { seeds, byKind, questions, hidden, hops: dist };
}

// one line per node: id, status, statement / title, and the source of a rule
export function constraintLine(n: GraphNode): string {
  const rows = parseBody(n.body); const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
  const text = (n.kind === 'question' ? get('q') : n.kind === 'goal' || n.kind === 'decision' ? (n.title || get('title')) : get('statement') || get('text') || n.title) || n.title;
  const src = n.kind === 'rule' ? get('source') : '';
  return `- ${n.id}${n.status ? ' [' + n.status + ']' : ''} — ${text.replace(/\s+/g, ' ').slice(0, 220)}${src ? ` (source: ${src.split(/;\s*/)[0].slice(0, 80)})` : ''}`;
}

// the packet as the markdown the first message carries: the budget is shared — every kind gets an equal share first
// (nearest nodes first), then what is left fills in kind order
export function renderPacket(c: Packet, opts: { budget?: number } = {}): string {
  const budget = opts.budget ?? 10000;
  const groups: [string, GraphNode[]][] = (Object.entries(c.byKind) as [string, GraphNode[]][]).concat(c.questions.length ? [['question', c.questions]] : []).sort((a, b) => (ORDER.indexOf(a[0]) + 1 || 99) - (ORDER.indexOf(b[0]) + 1 || 99));
  const total = groups.reduce((a, [, l]) => a + l.length, 0);
  if (!total) return `_No rules, constraints, decisions or goals govern this yet (seeds: ${c.seeds.join(', ') || 'none'})._`;
  const head = `_Computed from the seeds (${c.seeds.join(', ')}) over governs, gated-by, affects, refines, part-of, depends-on and scope, two hops; complete, not a top-k. ${c.hidden ? c.hidden + ' superseded / retired / archived hidden. ' : ''}Cite these ids; when the request cannot respect one, say so with a question: block next to it._`;
  const lines = groups.map(([k, l]) => ({ k, n: l.length, lines: l.map(constraintLine), shown: 0 }));
  let left = budget - head.length; const share = Math.floor(left / lines.length);
  for (const g of lines) { let used = 0; while (g.shown < g.lines.length && used + g.lines[g.shown].length <= share) { used += g.lines[g.shown].length; g.shown++; } left -= used; }
  for (const g of lines) while (g.shown < g.lines.length && g.lines[g.shown].length <= left) { left -= g.lines[g.shown].length; g.shown++; }
  const parts = [head]; let cut = 0;
  for (const g of lines) { parts.push([`\n### ${LABEL[g.k] ?? g.k} (${g.n})`].concat(g.lines.slice(0, g.shown)).join('\n')); cut += g.n - g.shown; }
  if (cut) parts.push(`\n_… ${cut} more not shown (budget); \`wf packet --for "<text>" --budget 30000\` lists them._`);
  return parts.join('\n');
}

// Seeds for a request: every ref (an id, or a link to a node / document) plus the search hits for the text.
export async function seedsFor(scope: Scope, text: string, refs: string[], opts: { seeds?: number; all?: boolean; asOf?: string | null } = {}): Promise<string[]> {
  const out: string[] = [];
  for (const ref of refs) {
    if (scope.idx.byId.has(ref)) { out.push(ref); continue; }
    try { const j = await resolveLink(scope, ref); if (!j) continue; if (j.node) out.push(j.node.id); else { const id = docIdOf(scope.graph, j.file); if (id) out.push(id); } } catch { /* not a link */ }
  }
  if (text.trim().length >= 3) { try { for (const h of await search(scope.product.dir, scope.graph, text, { limit: opts.seeds ?? 6, all: opts.all, asOf: opts.asOf })) out.push(h.id); } catch { /* no model: refs alone */ } }
  return [...new Set(out)];
}

export async function packetFor(scope: Scope, text: string, refs: string[], opts: { budget?: number; all?: boolean; asOf?: string | null } = {}): Promise<{ markdown: string; packet: Packet }> {
  const seeds = await seedsFor(scope, text, refs, opts);
  const packet = constraintsFor(scope.graph, scope.idx, seeds, opts);
  let markdown = renderPacket(packet, opts);
  // nodes in the packet with an edit nobody accepted yet (decision:exec.change-record): a worker reading them knows
  try {
    const pending = await listChanges(scope.product.dir, { state: 'pending', listed: true });
    const ids = new Set([...Object.values(packet.byKind).flat(), ...packet.questions].map(n => n.id));
    const hit = pending.filter(c => ids.has(c.node));
    if (hit.length) markdown += `\n\n_Changed, pending review (the value above is the new one; the old value is on the change record): ${[...new Set(hit.map(c => `${c.node} (${c.by})`))].join(', ')}._`;
  } catch { /* no change store */ }
  return { markdown, packet };
}
