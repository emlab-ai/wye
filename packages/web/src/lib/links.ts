// Automatic links (Jev auto-linking design §3): the local search finds candidates for a text, Jev judges each
// ("is the text about it?" → probability), and the ids above LINK_MIN are the links. judgeText is the shared step
// (inbox, editor, consolidation); linksFor is the editor's batch — per block, cached by the text's hash in
// <product>/_build/jev.json so an unchanged block is never judged twice, invalidated when the question wording changes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { search as semanticSearch } from './semantic';
import { parseBody, type GraphData, type GraphNode } from './graph';
import { LINK_MIN, promptVersion, type JevClient } from './jev';

export type JudgedHit = { id: string; score: number; p: number };
export type SearchFn = typeof semanticSearch;
const TEXT_KEYS = ['title', 'text', 'statement', 'q', 'description', 'when', 'then', 'choice'];
// the ContextPanel's own minimum: below this there is nothing to judge
export const MIN_TEXT = 12;

// the sentence Jev sees for a candidate: its prose keys, in the card's order, capped
export function candidateText(n: GraphNode): string {
  const rows = parseBody(n.body ?? '');
  const parts = TEXT_KEYS.map(k => rows.find(r => r.key === k)?.value ?? '').filter(Boolean);
  return (parts.join('. ') || n.title || n.id).slice(0, 400);
}

// the search's hits (or the ones given) with Jev's probability on each; p 0 everywhere when the client is disabled
export async function judgeText(productDir: string, graph: GraphData, text: string, opts: { jev: JevClient; exclude?: string[]; limit?: number; searchFn?: SearchFn; hits?: { id: string; score: number }[] }): Promise<JudgedHit[]> {
  const hits = opts.hits ?? await (opts.searchFn ?? semanticSearch)(productDir, graph, text, { limit: opts.limit ?? 12, exclude: opts.exclude });
  if (!opts.jev.enabled || !hits.length) return hits.map(h => ({ id: h.id, score: h.score, p: 0 }));
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const ps = await opts.jev.judgeLinks(text, hits.map(h => ({ id: h.id, text: candidateText(byId.get(h.id) ?? ({ id: h.id, body: '', title: '' } as GraphNode)) })));
  return hits.map((h, i) => ({ id: h.id, score: h.score, p: ps[i]?.p ?? 0 }));
}

export const confidentIds = (hits: JudgedHit[]): string[] => hits.filter(h => h.p >= LINK_MIN()).map(h => h.id);

type Cache = { version: string; entries: Record<string, { ids: string[]; at: string }> };
const sha = (s: string) => createHash('sha1').update(s).digest('hex');
async function readCache(file: string): Promise<Cache> {
  try { const c = JSON.parse(await readFile(file, 'utf8')) as Cache; if (c.version === promptVersion()) return c; } catch { /* cold */ }
  return { version: promptVersion(), entries: {} };
}

export async function linksFor(productDir: string, graph: GraphData, blocks: { key: string; text: string; linked: string[] }[], jev: JevClient, searchFn?: SearchFn): Promise<Record<string, string[]>> {
  if (!jev.enabled) return {};
  const file = path.join(productDir, '_build/jev.json');
  const cache = await readCache(file); let dirty = false;
  const out: Record<string, string[]> = {};
  for (const b of blocks) {
    const text = b.text.trim(); if (text.length < MIN_TEXT) continue;
    const h = sha(text);
    let ids = cache.entries[h]?.ids;
    if (!ids) {
      try { ids = confidentIds(await judgeText(productDir, graph, text, { jev, searchFn })); } catch (e) { console.warn('jev: link judgement failed —', e instanceof Error ? e.message : e); continue; }
      cache.entries[h] = { ids, at: new Date().toISOString() }; dirty = true;
    }
    const fresh = ids.filter(id => !b.linked.includes(id));
    if (fresh.length) out[b.key] = fresh;
  }
  if (dirty) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(cache)); }
  return out;
}
