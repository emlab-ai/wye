// Ask's retriever (decision:wf2.ask-two-lanes): the store's hybrid search (BM25 + vectors, fused by reciprocal rank),
// ended nodes left out (req:memory.current-by-construction), then one hop along the graph's structural edges — a
// decision brings what it affects, a requirement what satisfies it, a node the passages that mention it — at a share
// of the parent's score; for a question, a cross-encoder reranks the lot against it; finally trimmed to a budget.
import type { ChunkRow, Hit, Source } from './types';
import type { GraphIndex } from '../graph';
import { isCurrent } from '../graph';
import { docRoute } from '../doc';
import { search, getChunks, chunksMentioning, ftsText, type Store } from './store';
import type { Embed, Rerank } from './embed';

export type RetrieveCtx = { product: string; store: Store; idx: GraphIndex; embed: Embed | null; rerank?: Rerank | null };
export type RetrieveOpts = { limit?: number; sources?: Source[]; kind?: string; expand?: boolean; rerank?: boolean; all?: boolean; asOf?: string | null; budgetChars?: number };
export const EXPAND_VERBS = new Set(['affects', 'governs', 'governed-by', 'satisfied-by', 'implements', 'part-of', 'supersedes', 'refines', 'depends-on', 'verified-by', 'resolves']);

export function hrefFor(product: string, c: ChunkRow, idx: GraphIndex): string | null {
  if (c.source === 'node') { const n = idx.byId.get(c.ref); const r = n?.file ? docRoute(n.file.startsWith('/') ? n.file : '/' + n.file) : null; return r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(c.ref)}` : null; }
  if (c.source === 'doc') { const [doc, frag] = c.ref.split('#'); const [project, slug] = doc.split('/'); return `/${product}/${project}/d/${slug}${frag ? '#' + frag : ''}`; }
  if (c.source === 'session') return `/${product}/sessions/${c.ref.split('#')[0]}`;
  return null;
}

export async function retrieve(ctx: RetrieveCtx, q: string, opts: RetrieveOpts = {}): Promise<Hit[]> {
  const limit = opts.limit ?? 25; const { store, idx } = ctx;
  const live = (c: ChunkRow) => c.source !== 'node' || !!opts.all || (() => { const n = idx.byId.get(c.ref); return !n || (isCurrent(n, opts.asOf) && !n.archived); })();
  const hit = (c: ChunkRow, score: number, via?: string): Hit => ({ ...c, score, ...(via ? { via } : {}), href: hrefFor(ctx.product, c, idx) });
  // `kind:` with no text lists that kind
  if (opts.kind && !q.trim()) return (await getChunks(store, [...idx.byId.values()].filter(n => n.kind === opts.kind).map(n => `node:${n.id}`))).filter(live).slice(0, limit).map(c => hit(c, 1));
  // ids typed in the question, whole or as a prefix (`decision:no-em`), come first
  const typed = [...q.matchAll(/(?<![\w:])([a-z][a-z-]*:[\w][\w.\/-]*)/g)].map(m => m[1].replace(/[.]+$/, ''));
  const pinned: string[] = [];
  for (const t of typed) {
    if (idx.byId.has(t)) { pinned.push(t); continue; }
    if (t.split(':')[1].length >= 2) pinned.push(...[...idx.byId.keys()].filter(id => id.startsWith(t)).sort().slice(0, 5));
  }
  if (!ftsText(q) && !pinned.length) return [];       // nothing to search for: stop words, punctuation
  const qvec = ctx.embed ? (await ctx.embed([q.slice(0, 1500)]))[0] : null;
  const hits = new Map<string, Hit>();
  for (const c of await getChunks(store, pinned.map(id => `node:${id}`))) if (live(c) && (!opts.kind || c.ref.startsWith(opts.kind + ':'))) hits.set(c.id, hit(c, Number.MAX_SAFE_INTEGER - hits.size));
  for (const c of await search(store, q, qvec, { limit: Math.max(50, limit * 2), sources: opts.sources, kind: opts.kind })) { if (live(c) && !hits.has(c.id)) hits.set(c.id, hit(c, c.score)); if (hits.size >= limit) break; }
  if (opts.expand) {
    for (const h of [...hits.values()].slice(0, 10)) for (const nid of h.nodes) {
      const near: { id: string; via: string }[] = [];
      for (const e of [...(idx.out.get(nid) ?? []), ...(idx.inc.get(nid) ?? [])]) if (EXPAND_VERBS.has(e.verb)) near.push({ id: `node:${e.from === nid ? e.to : e.from}`, via: `${nid} ${e.verb}` });
      for (const c of await getChunks(store, near.map(x => x.id).filter(id => !hits.has(id)))) if (live(c) && (!opts.sources || opts.sources.includes(c.source))) hits.set(c.id, hit(c, h.score * 0.5, near.find(x => x.id === c.id)!.via));
      if (h.source === 'node') for (const c of await chunksMentioning(store, nid, 3)) if (!hits.has(c.id) && c.source !== 'node' && (!opts.sources || opts.sources.includes(c.source))) hits.set(c.id, hit(c, h.score * 0.4, `mentions ${nid}`));
    }
  }
  let out = [...hits.values()].sort((a, b) => b.score - a.score);
  if (opts.rerank && ctx.rerank && out.length > 1) {
    const pin = out.filter(h => h.score >= Number.MAX_SAFE_INTEGER - 100); out = out.slice(pin.length);
    const top = out.slice(0, 40);
    const scores = await ctx.rerank(q, top.map(h => `${h.title}\n${h.text}`));
    out = [...pin, ...top.map((h, i) => ({ ...h, score: scores[i] })).sort((a, b) => b.score - a.score), ...out.slice(40)];
  }
  if (!opts.budgetChars) return out.slice(0, limit);
  const kept: Hit[] = []; let used = 0;
  for (const h of out) { if (kept.length && used + h.text.length > opts.budgetChars) break; kept.push(h); used += h.text.length; if (kept.length >= limit) break; }
  return kept;
}
