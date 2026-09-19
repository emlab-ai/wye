// The review queue is a view over the documents: nodes agents (or people) wrote that nobody has approved yet.
// Decisions, requirements, rules, goals and entities carry `proposed` until approved; questions stay open until
// resolved. Nothing here is stored separately — approving edits the node's status in its document.
import type { GraphData, GraphIndex, GraphNode } from './graph';
import { parseBody, HIDDEN_KINDS } from './graph';
import { docRoute } from './doc';

export type ReviewKind = 'question' | 'decision' | 'req' | 'rule' | 'constraint' | 'lesson' | 'contradiction' | 'goal' | 'entity' | 'other';
// a verdict on the item (decision:memory.write-time-verdict): how it relates to `other`, and the open contradiction node when there is one
export interface ItemVerdict { kind: 'duplicate' | 'refines' | 'contradicts' | 'consistent'; other: string; reason: string; conflict?: string; contradiction?: string; open?: boolean }
export interface ReviewItem { id: string; kind: string; title: string; text: string; status: string; file: string; project: string; doc: string; href: string; line: number; refs: string[]; session?: string; form?: string; fields: Record<string, string>; verdicts?: ItemVerdict[]; checked?: number; classifying?: boolean }

const OPEN_QUESTION = (s: string) => !['resolved', 'rejected', 'done', 'dismissed', 'answered'].includes(s);
const NEEDS_APPROVAL = new Set(['proposed', 'draft', 'unverified']);

export function isReviewable(n: GraphNode, docIds?: Set<string>): boolean {
  if (!n.defined || docIds?.has(n.id) || HIDDEN_KINDS.has(n.kind) || n.kind === 'product') return false;
  if (n.kind === 'question' || n.status === 'question') return OPEN_QUESTION(n.status === 'question' ? 'open' : n.status || 'open');
  // an open contradiction waits for a person like a question does (decision:memory.write-time-verdict)
  if (n.kind === 'contradiction') return OPEN_QUESTION(n.status || 'open');
  return NEEDS_APPROVAL.has(n.status) && ['decision', 'req', 'rule', 'constraint', 'lesson', 'goal', 'entity', 'task'].includes(n.kind) && n.status !== 'unverified';
}

export function reviewQueue(product: string, g: GraphData, idx: GraphIndex): ReviewItem[] {
  const docIds = new Set(g.modules.map(m => m.id)); // a page's node is not a review item, whatever its kind
  return g.nodes.filter(n => isReviewable(n, docIds)).map(n => {
    const rows = parseBody(n.body); const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
    const r = docRoute(n.file);
    const text = get('q') || get('text') || get('statement') || get('reason') || get('choice') || get('description') || get('then') || '';
    const fields: Record<string, string> = {};
    for (const k of ['context', 'choice', 'alternatives', 'consequences', 'when', 'then', 'unless', 'source', 'date', 'supersedes', 'evidence', 'by', 'conflict', 'between']) if (get(k)) fields[k] = get(k);
    return { id: n.id, kind: n.kind, title: get('title') || n.title, text, status: n.kind === 'question' && !n.status ? 'open' : n.status, file: n.file, project: r?.project ?? '', doc: r?.doc ?? '', href: r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(n.id)}` : '', line: n.line, refs: (idx.out.get(n.id) ?? []).filter(e => e.verb !== 'mentions').map(e => e.to).slice(0, 8), session: get('session') || undefined, form: n.form, fields };
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.line - b.line);
}

// The verdicts written under an item (its verdict: and contradiction: content) and how many pairs the judge log holds
// for it; `classifying` when the pass is on and nothing has been judged yet (req:memory.verdicts: "not yet classified").
export function attachVerdicts(items: ReviewItem[], g: GraphData, idx: GraphIndex, log: { b: string; kind: string }[], enabled: boolean): ReviewItem[] {
  const byB = new Map<string, number>(); for (const v of log) byB.set(v.b, (byB.get(v.b) ?? 0) + 1);
  return items.map(it => {
    if (!['decision', 'req', 'rule', 'constraint'].includes(it.kind)) return it;
    const verdicts: ItemVerdict[] = [];
    const contradictions = new Map<string, GraphNode>();
    for (const e of idx.out.get(it.id) ?? []) { if (e.verb !== 'has') continue; const n = idx.byId.get(e.to); if (n?.kind === 'contradiction') contradictions.set(n.id, n); }
    for (const e of idx.out.get(it.id) ?? []) {
      if (e.verb !== 'has') continue; const n = idx.byId.get(e.to); if (!n || n.kind !== 'verdict') continue;
      const rows = parseBody(n.body); const get = (k: string) => rows.find(r => r.key === k)?.value ?? '';
      const m = get('text').match(/^(duplicate|refines|consistent|contradicts)\s+(\S+)\s+—\s+(.*)$/); if (!m) continue;
      const c = [...contradictions.values()].find(x => x.body.includes(m[2]));
      verdicts.push({ kind: m[1] as ItemVerdict['kind'], other: m[2], reason: m[3].replace(/\s*\(kind:.*$/, ''), conflict: get('conflict') || undefined, contradiction: c?.id, open: c ? !['resolved', 'dismissed', 'rejected', 'done'].includes(c.status) : false });
    }
    const checked = byB.get(it.id) ?? 0;
    return { ...it, verdicts, checked, classifying: enabled && !checked && !verdicts.length };
  });
}
