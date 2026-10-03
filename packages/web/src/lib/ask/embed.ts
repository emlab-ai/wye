// The local models (transformers.js, cached under .cache/models; nothing leaves the machine): the sentence embedder
// shared by the semantic context search and the Ask index (MiniLM, normalised, so a dot product is the cosine), and
// the cross-encoder Ask uses to rerank passages against a question (decision:wf2.ask-two-lanes).
import path from 'node:path';
import { REPO_ROOT } from '../products';

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBED_DIM = 384;
export const RERANK_MODEL = 'jinaai/jina-reranker-v1-turbo-en';
export type Embed = (texts: string[]) => Promise<number[][]>;
// scores of each text against the query; higher is more relevant
export type Rerank = (query: string, texts: string[]) => Promise<number[]>;

async function tf() {
  const t = await import('@huggingface/transformers');
  t.env.cacheDir = path.join(REPO_ROOT, '.cache/models');
  return t;
}
let embedder: Promise<Embed> | null = null;
export function getEmbedder(): Promise<Embed> {
  if (!embedder) {
    embedder = (async () => {
      const fe = await (await tf()).pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' });
      return async (texts: string[]) => { const out = await fe(texts, { pooling: 'mean', normalize: true }); return out.tolist() as number[][]; };
    })();
    embedder.catch(() => { embedder = null; });   // a failed load (no network on first run) is retried next time
  }
  return embedder;
}
let reranker: Promise<Rerank> | null = null;
export function getReranker(): Promise<Rerank> {
  if (!reranker) {
    reranker = (async () => {
      const t = await tf();
      const tok = await t.AutoTokenizer.from_pretrained(RERANK_MODEL);
      const model = await t.AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, { dtype: 'q8' });
      return async (query: string, texts: string[]) => {
        if (!texts.length) return [];
        const out: number[] = [];
        for (let i = 0; i < texts.length; i += 16) {
          const batch = texts.slice(i, i + 16).map(x => x.slice(0, 2000));
          const { logits } = await model(tok(new Array(batch.length).fill(query), { text_pair: batch, padding: true, truncation: true }));
          out.push(...Array.from(logits.data as Float32Array));
        }
        return out;
      };
    })();
    reranker.catch(() => { reranker = null; });
  }
  return reranker;
}
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
// a vector for the store: float32-rounded, exactly `dim` long
export function toVector(v: ArrayLike<number>, dim: number): number[] {
  const out = Array.from(new Float32Array(Array.from(v).slice(0, dim)));
  while (out.length < dim) out.push(0);
  return out;
}
