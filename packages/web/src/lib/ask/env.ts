// What a query needs for one product: the scope (graph, index), the store brought up to date, the embedder and the
// reranker when their models load — without the embedder search is full-text only and says so.
import { loadScope, type Scope } from '../scope';
import { ensureFresh, getStore } from './refresh';
import { getEmbedder, getReranker, type Embed, type Rerank } from './embed';
import type { RetrieveCtx } from './retrieve';

export async function askEnv(product: string, o: { rerank?: boolean } = {}): Promise<{ scope: Scope; ctx: RetrieveCtx; degraded?: string } | null> {
  const scope = await loadScope(product); if (!scope) return null;
  const st = await ensureFresh(scope.product, scope.graph);
  let embed: Embed | null = null; try { embed = await getEmbedder(); } catch { /* full-text only */ }
  let rerank: Rerank | null = null; if (o.rerank) { try { rerank = await getReranker(); } catch { /* fused order stands */ } }
  return { scope, ctx: { product, store: await getStore(scope.product), idx: scope.idx, embed, rerank }, degraded: st.degraded ?? (embed ? undefined : 'no-vectors') };
}
