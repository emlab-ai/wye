// A contradiction resolves into a decision (decision:waterfall.contradiction-resolves-into-a-decision): two nodes
// cannot both hold, and what settles it is a person's choice — which side holds, and why — written as a decision
// block that supersedes the losing side and the decisions that stood only behind it, so memory stays consistent:
// nothing keeps saying what was decided against. A side that is not settled yet is asked about: a question block
// linked to both sides, the contradiction open until it is answered. Pure where it can be (sidesOf, planOf); the
// writes go through editNode and addInstance like every other edit.
import { parseBody, type GraphIndex, type GraphNode } from './graph';
import type { Scope } from './scope';
import { editNode } from './node-edit';
import { addInstance } from './instance-add';

export type Side = { id: string; kind: string; title: string; status: string; defined: boolean };
export type BehindDecision = { id: string; title: string; status: string; side: 'a' | 'b' | 'both'; verb: string };
export type Sides = { a: Side; b: Side; decisions: BehindDecision[] };
export type Keep = 'a' | 'b' | 'both' | 'none' | 'custom';   // custom: the person writes how it is resolved; nothing is superseded for them
export type Resolution = { keep: Keep; why: string; title?: string; by?: string };
// what resolving will write, before it is written — the decision card and the statuses it changes
export type Plan = { decision: { slug: string; title: string; props: Record<string, string> }; supersede: string[]; refines?: [string, string]; resolution: string };

const idsOf = (v: string) => v.replace(/^\[|\]$/g, '').split(/[,\s]+/).map(s => s.trim()).filter(s => /^[a-z][a-z0-9-]*:\S+$/.test(s));
const side = (idx: Pick<GraphIndex, 'byId'>, id: string): Side => { const n = idx.byId.get(id); return { id, kind: n?.kind ?? id.split(':')[0], title: n?.title || id, status: n?.status ?? '', defined: !!n?.defined }; };

// The two sides a contradiction is between — its `between:` key, else the two ids its text names — and the decisions
// behind each: a decision linked to the side by any edge but `has` and `mentions` (affects, governs, supersedes,
// part-of, satisfied-by, evidence …), in either direction. One behind both sides is marked so: it is not superseded
// when one side loses.
export function sidesOf(idx: Pick<GraphIndex, 'byId' | 'out' | 'inc'>, c: Pick<GraphNode, 'id' | 'body' | 'title'>): Sides | null {
  const rows = parseBody(c.body ?? '');
  let ids = idsOf(rows.find(r => r.key === 'between')?.value ?? '');
  if (ids.length < 2) ids = idsOf((rows.find(r => r.key === 'text')?.value ?? c.title ?? '').replace(/—.*$/, '')).filter(id => id !== c.id);
  if (ids.length < 2) return null;
  const [a, b] = ids;
  const behind = (id: string): Map<string, string> => {
    const out = new Map<string, string>();
    const own = (x: string) => x === a || x === b;   // a side that is itself a decision is not "behind" the other side
    for (const e of idx.out.get(id) ?? []) if (e.verb !== 'has' && e.verb !== 'mentions' && e.to.startsWith('decision:') && !own(e.to)) out.set(e.to, e.verb);
    for (const e of idx.inc.get(id) ?? []) if (e.verb !== 'has' && e.verb !== 'mentions' && e.from.startsWith('decision:') && !own(e.from)) out.set(e.from, e.verb);
    return out;
  };
  const da = behind(a), db = behind(b);
  const decisions: BehindDecision[] = [];
  for (const [id, verb] of da) { const n = idx.byId.get(id); if (!n?.defined) continue; decisions.push({ id, title: n.title || id, status: n.status, side: db.has(id) ? 'both' : 'a', verb }); }
  for (const [id, verb] of db) { if (da.has(id)) continue; const n = idx.byId.get(id); if (!n?.defined) continue; decisions.push({ id, title: n.title || id, status: n.status, side: 'b', verb }); }
  return { a: side(idx, a), b: side(idx, b), decisions };
}

// What resolving writes: the decision that records the choice, with `affects:` both sides, `supersedes:` what loses
// (the losing side and the decisions that stood only behind it), `resolves:` the contradiction; and for "both hold",
// the kept side `refines:` the other instead; for "custom" the person's text is the whole resolution and nothing is
// superseded for them. Nothing is superseded that stands behind both sides. The why is optional for the fixed choices
// (the text is then the title); a custom resolution is its text.
export function planOf(product: string, c: Pick<GraphNode, 'id'>, s: Sides, r: Resolution): Plan {
  const key = c.id.replace(/^contradiction:/, '').replace(/^[a-z0-9-]+\./, '');
  const slug = `${product}.resolve-${key}`.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').slice(0, 80);
  const loser = r.keep === 'a' ? [s.b] : r.keep === 'b' ? [s.a] : r.keep === 'none' ? [s.a, s.b] : [];
  const behindLoser = s.decisions.filter(d => (r.keep === 'a' && d.side === 'b') || (r.keep === 'b' && d.side === 'a') || (r.keep === 'none' && d.side !== 'both'));
  const supersede = [...loser.map(x => x.id), ...behindLoser.map(d => d.id)];
  const why = r.why.replace(/\s+/g, ' ').trim();
  const title = (r.title ?? '').trim() || (r.keep === 'a' ? `${s.a.title} holds; ${s.b.title} is superseded` : r.keep === 'b' ? `${s.b.title} holds; ${s.a.title} is superseded` : r.keep === 'both' ? `${s.a.title} and ${s.b.title} both hold — the first refines the second` : r.keep === 'none' ? `Neither ${s.a.title} nor ${s.b.title} holds` : (why.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? why).slice(0, 160));
  const props: Record<string, string> = { status: 'approved', by: r.by || 'the person', date: new Date().toISOString().slice(0, 10), affects: `[${s.a.id}, ${s.b.id}]`, resolves: c.id, evidence: c.id, text: why || title };
  if (supersede.length) props.supersedes = `[${supersede.join(', ')}]`;
  const refines: [string, string] | undefined = r.keep === 'both' ? [s.a.id, s.b.id] : undefined;
  return { decision: { slug, title: title.slice(0, 160), props }, supersede, refines, resolution: `${r.keep === 'both' ? 'both hold' : r.keep === 'none' ? 'neither holds' : r.keep === 'custom' ? title : `${r.keep === 'a' ? s.a.id : s.b.id} holds`} — decision:${slug}` };
}

const SUPERSEDED: Record<string, string> = { goal: 'non-goal', task: 'done', question: 'resolved' };   // kinds whose status list has no superseded
export async function resolveContradiction(scope: Scope, cid: string, r: Resolution): Promise<{ ok: true; decision: string; superseded: string[] } | { ok: false; status: number; message: string }> {
  const c = scope.idx.byId.get(cid);
  if (!c?.defined || c.kind !== 'contradiction') return { ok: false, status: 404, message: `${cid} is not a contradiction of this product` };
  if (r.keep === 'custom' && !r.why.trim()) return { ok: false, status: 422, message: 'say how it is resolved — that text is the decision' };
  const s = sidesOf(scope.idx, c); if (!s) return { ok: false, status: 422, message: `${cid} does not say which two nodes it is between` };
  const p = planOf(scope.product.slug, c, s, r);
  const made = await addInstance(scope, 'decision', { slug: p.decision.slug, title: p.decision.title, status: 'approved', props: p.decision.props, rebuild: false });
  if (!made.ok) return { ok: false, status: made.status, message: made.message };
  const superseded: string[] = [];
  for (const id of p.supersede) {
    const n = scope.idx.byId.get(id); if (!n?.defined) continue;
    const e = await editNode(scope, id, { status: SUPERSEDED[n.kind] ?? 'superseded', props: { 'superseded-by': made.id } });
    if (e.ok) superseded.push(id);
  }
  if (p.refines) await editNode(scope, p.refines[0], { props: { refines: p.refines[1] } });
  const done = await editNode(scope, cid, { status: 'resolved', props: { resolution: p.resolution, 'resolved-by': made.id } });
  if (!done.ok) return { ok: false, status: 422, message: done.message };
  return { ok: true, decision: made.id, superseded };
}

// A specific question about the contradiction: a question block `about:` both sides and `part-of:` the contradiction,
// which stays open and names the question, so the next person sees what is being asked instead of asking it again.
export async function askOnContradiction(scope: Scope, cid: string, q: string, by?: string): Promise<{ ok: true; question: string } | { ok: false; status: number; message: string }> {
  const c = scope.idx.byId.get(cid);
  if (!c?.defined || c.kind !== 'contradiction') return { ok: false, status: 404, message: `${cid} is not a contradiction of this product` };
  const text = q.replace(/\s+/g, ' ').trim(); if (!text) return { ok: false, status: 422, message: 'ask something' };
  const s = sidesOf(scope.idx, c);
  const key = cid.replace(/^contradiction:/, '').replace(/^[a-z0-9-]+\./, '');
  const n = (scope.idx.inc.get(cid) ?? []).filter(e => e.verb === 'part-of' && e.from.startsWith('question:')).length + 1;
  const made = await addInstance(scope, 'question', { slug: `${scope.product.slug}.${key}-${n}`.toLowerCase(), title: text.slice(0, 160), status: 'open', props: { q: text, ...(s ? { about: `[${s.a.id}, ${s.b.id}]` } : {}), 'part-of': cid, ...(by ? { by } : {}) }, rebuild: false });
  if (!made.ok) return { ok: false, status: made.status, message: made.message };
  const prior = parseBody(c.body ?? '').find(r => r.key === 'asked')?.value ?? '';
  await editNode(scope, cid, { props: { asked: prior ? `[${idsOf(prior).concat(made.id).join(', ')}]` : made.id } });
  return { ok: true, question: made.id };
}
