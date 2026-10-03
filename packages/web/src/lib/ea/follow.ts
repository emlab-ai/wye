// The follow scan (decision:ea.follow-is-owner-or-tag, task:ea.follow-scan): what the director follows in every other
// product — each open task, commitment, question, proposed decision or risk whose owner (a task's worker too) is one of
// the names the director goes by there, or whose text carries `@follow`. Pure over one product's graph; the IO
// (ea/follow-run) reads the graphs and never writes into them (constraint:ea.reads-other-products-only).
import type { GraphData, GraphIndex, GraphNode } from '../graph';
import { isCurrent } from '../graph';
import { cardValue } from '../hooks';
import { docRoute } from '../doc';
import { listValue, namesMatch, norm } from './model';

export type FollowPerson = { id?: string; name: string };
export type FollowItem = { product: string; project: string; doc: string; link: string; id: string; kind: string; title: string; status: string; owner: string; why: 'owner' | '@follow'; people: FollowPerson[]; meeting?: string; due?: string };

export const FOLLOW_KINDS = ['task', 'commitment', 'question', 'decision', 'risk'];
export const CLOSED = new Set(['done', 'resolved', 'dismissed', 'rejected', 'cancelled', 'retired', 'superseded', 'shipped', 'met', 'dropped', 'complete', 'deprecated']);
export const FOLLOW_TAG = /(^|[^\w@/])@follow\b/i;
const PERSON_KINDS = new Set(['person', 'employee', 'people', 'member']);

// Open: not closed by its status (or a commitment's state); a decision only while proposed — once decided there is
// nothing left to follow.
export function isOpenItem(n: Pick<GraphNode, 'kind' | 'status' | 'body' | 'since' | 'until' | 'supersededBy'>, kind = n.kind): boolean {
  if (kind === 'decision') return n.status === 'proposed';
  if (CLOSED.has(n.status) || CLOSED.has(cardValue(n.body, 'state').trim())) return false;
  return isCurrent(n);
}

// The kind a node counts as: its own when it is one of the five, else the first of them its type extends.
function followKind(g: Pick<GraphData, 'types'>, n: GraphNode): string | null {
  if (FOLLOW_KINDS.includes(n.kind)) return n.kind;
  const t = (g.types ?? []).find(x => x.slug === n.kind);
  return t?.chain.map(c => c.replace(/^type:/, '')).find(k => FOLLOW_KINDS.includes(k)) ?? null;
}

export function followScan(product: string, g: GraphData, idx: GraphIndex, names: string[]): FollowItem[] {
  const out: FollowItem[] = [];
  // a name written as plain text (`owner: bo`) is the product's person of that name when it has one
  const persons = g.nodes.filter(n => n.defined && PERSON_KINDS.has(n.kind));
  const personNamed = (v: string) => idx.byId.get(v) ?? persons.find(p => namesMatch(v, [cardValue(p.body, 'name'), p.title, p.id.slice(p.id.lastIndexOf('.') + 1), ...listValue(cardValue(p.body, 'aliases'))].filter(Boolean).map(norm)));
  for (const n of g.nodes) {
    if (!n.defined || n.archived || n.form === 'block') continue;
    const kind = followKind(g, n); if (!kind || !isOpenItem(n, kind)) continue;
    const owner = cardValue(n.body, 'owner').trim() || n.owner || '';
    const worker = kind === 'task' ? cardValue(n.body, 'worker').trim() : '';
    const why = namesMatch(owner, names) || namesMatch(worker, names) ? 'owner' : FOLLOW_TAG.test(`${n.title}\n${n.body}`) ? '@follow' : null;
    if (!why) continue;
    const r = docRoute(n.file); if (!r) continue;
    const people: FollowPerson[] = [];
    const seen = new Set<string>();
    const add = (p: FollowPerson) => { const k = p.id ?? norm(p.name); if (!k || seen.has(k) || namesMatch(p.id ?? p.name, names)) return; seen.add(k); people.push(p); };
    // the people it links to, its requester and its writer (an agent, a hook or a skill is nobody to answer)
    for (const e of idx.out.get(n.id) ?? []) { const t = idx.byId.get(e.to); if (t && PERSON_KINDS.has(t.kind)) add({ id: t.id, name: cardValue(t.body, 'name').trim() || t.title }); }
    for (const k of ['requester', 'by']) { const v = cardValue(n.body, k).trim() || (k === 'by' ? n.by ?? '' : ''); if (v && !/^(agent|hook|skill|workflow|session|person)$|^(agent|hook|skill|workflow|session):/.test(v)) { const t = personNamed(v); add(t ? { id: t.id, name: cardValue(t.body, 'name').trim() || t.title } : { name: v }); } }
    if (why === '@follow' && owner && !/^unassigned$/i.test(owner)) { const t = personNamed(owner); add(t ? { id: t.id, name: cardValue(t.body, 'name').trim() || t.title } : { name: owner }); }
    const from = cardValue(n.body, 'from').trim();
    const meeting = /^meeting:/.test(from) ? from : undefined;
    const due = cardValue(n.body, 'due').trim();
    out.push({ product, project: r.project, doc: r.doc, link: `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(n.id)}`, id: n.id, kind, title: n.title || n.id, status: n.status, owner: owner || worker, why, people, ...(meeting ? { meeting } : {}), ...(due ? { due } : {}) });
  }
  return out.sort((a, b) => a.product.localeCompare(b.product) || a.link.localeCompare(b.link));
}
