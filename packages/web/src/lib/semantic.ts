// Local semantic search over a product's knowledge: every defined node (title + text) is embedded once with a small
// sentence model that runs in-process (transformers.js, MiniLM, ~23 MB, cached under .cache/models); vectors are
// cached in the product's _build/embeddings.json and refreshed when graph.json is newer. Queries blend cosine
// similarity with a keyword score so ids, code names and rare terms still rank. Nothing leaves the machine.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { GraphData, GraphNode } from './graph';
import { parseBody } from './graph';
import { REPO_ROOT } from './products';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const PROSE_KEYS = ['text', 'title', 'statement', 'description', 'when', 'then', 'unless', 'q', 'choice', 'context', 'purpose', 'intent', 'note'];

type Entry = { id: string; hash: string; vec: number[] };
type Cache = { model: string; entries: Record<string, Entry> };
export type Hit = { id: string; score: number; semantic: number; keyword: number; snippet: string };

let embedder: Promise<(texts: string[]) => Promise<number[][]>> | null = null;
function getEmbedder() {
  if (!embedder) embedder = (async () => {
    const tf = await import('@huggingface/transformers');
    tf.env.cacheDir = path.join(REPO_ROOT, '.cache/models');
    const fe = await tf.pipeline('feature-extraction', MODEL, { dtype: 'q8' });
    return async (texts: string[]) => { const out = await fe(texts, { pooling: 'mean', normalize: true }); return out.tolist() as number[][]; };
  })();
  return embedder;
}

// The text that represents a node: its title, then its prose fields, markdown links reduced to labels.
export function nodeText(n: GraphNode): string {
  const rows = parseBody(n.body);
  const parts = [n.title];
  for (const k of PROSE_KEYS) { const r = rows.find(x => x.key === k); if (r && r.value !== n.title) parts.push(r.value); }
  return parts.join('. ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1500);
}

const hashOf = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const indexes = new Map<string, Promise<{ nodes: GraphNode[]; texts: Map<string, string>; vecs: Map<string, number[]> }>>();

async function buildIndex(productDir: string, graph: GraphData) {
  const nodes = graph.nodes.filter(n => n.defined && n.kind !== 'field' && n.kind !== 'module');
  const texts = new Map(nodes.map(n => [n.id, nodeText(n)]));
  const file = path.join(productDir, '_build/embeddings.json');
  let cache: Cache = { model: MODEL, entries: {} };
  try { const c = JSON.parse(await readFile(file, 'utf8')) as Cache; if (c.model === MODEL) cache = c; } catch { /* cold */ }
  const stale = nodes.filter(n => cache.entries[n.id]?.hash !== hashOf(texts.get(n.id)!));
  if (stale.length) {
    const embed = await getEmbedder();
    for (let i = 0; i < stale.length; i += 64) {
      const batch = stale.slice(i, i + 64);
      const vecs = await embed(batch.map(n => texts.get(n.id)!));
      batch.forEach((n, k) => { cache.entries[n.id] = { id: n.id, hash: hashOf(texts.get(n.id)!), vec: vecs[k].map(x => Math.round(x * 1e4) / 1e4) }; });
    }
    for (const id of Object.keys(cache.entries)) if (!texts.has(id)) delete cache.entries[id];
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(cache));
  }
  return { nodes, texts, vecs: new Map(nodes.map(n => [n.id, cache.entries[n.id].vec])) };
}

// One index per product, rebuilt when graph.json changes (its mtime is part of the key).
export async function getIndex(productDir: string, graph: GraphData) {
  let key = productDir;
  try { key += ':' + (await stat(path.join(productDir, '_build/graph.json'))).mtimeMs; } catch { /* no graph yet */ }
  if (!indexes.has(key)) { for (const k of indexes.keys()) if (k.startsWith(productDir + ':')) indexes.delete(k); indexes.set(key, buildIndex(productDir, graph)); }
  return indexes.get(key)!;
}

const STOP = new Set('the a an and or of to in on for is are be by with as at it its this that these those from into not no we our they their which when then unless while each all any so if than via'.split(' '));
export function keywords(q: string): string[] {
  return [...new Set(q.toLowerCase().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').split(/[^a-z0-9_.:-]+/).map(w => w.replace(/^[.:-]+|[.:-]+$/g, '')).filter(w => w.length > 2 && !STOP.has(w)))];
}
function keywordScore(words: string[], text: string, id: string): number {
  if (!words.length) return 0;
  const t = text.toLowerCase(); const i = id.toLowerCase();
  let hit = 0; for (const w of words) if (t.includes(w) || i.includes(w)) hit += w.length > 6 ? 1.5 : 1;
  return hit / words.length;
}

// Rank nodes for a piece of text. `exclude` drops the node being edited and ids already linked from it.
export async function search(productDir: string, graph: GraphData, q: string, opts: { limit?: number; exclude?: string[] } = {}): Promise<Hit[]> {
  const query = q.replace(/\s+/g, ' ').trim();
  if (query.length < 3) return [];
  const idx = await getIndex(productDir, graph);
  const [qv] = await (await getEmbedder())([query.slice(0, 1500)]);
  const words = keywords(query);
  const ex = new Set(opts.exclude ?? []);
  const hits: Hit[] = [];
  for (const n of idx.nodes) {
    if (ex.has(n.id)) continue;
    const v = idx.vecs.get(n.id)!; let dot = 0; for (let i = 0; i < v.length; i++) dot += v[i] * qv[i];
    const kw = keywordScore(words, idx.texts.get(n.id)!, n.id);
    const score = 0.7 * dot + 0.3 * Math.min(1, kw);
    hits.push({ id: n.id, score, semantic: dot, keyword: kw, snippet: idx.texts.get(n.id)!.slice(0, 160) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 12);
}
