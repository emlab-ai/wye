import { NextResponse } from 'next/server';
import { askEnv } from '@/lib/ask/env';
import { retrieve } from '@/lib/ask/retrieve';
import { SOURCES, type Hit, type Source } from '@/lib/ask/types';
import { workspaceProducts } from '@/lib/workspace';
import { indexBuilt } from '@/lib/ask/refresh';

export const dynamic = 'force-dynamic';
// GET ?q=&kind=req&source=a,b&limit=&expand=1&rerank=1&all=1&asOf= → { hits, degraded? } (decision:wf2.ask-in-search-panel): the
// typing-time search over nodes, document passages, code and sessions — no language model; `rerank` runs the local
// cross-encoder over the top hits (agents and the eval use it; the panel does not while typing).
// &scope=workspace adds the best hits of the other vaults of the open workspace (req:wf2.workspace-open), each named
// by its `vault`, after this product's own.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params; const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim(); const kind = (sp.get('kind') ?? '').trim();
  if (q.length < 2 && !kind) return NextResponse.json({ hits: [] });
  const rerank = sp.get('rerank') === '1';
  const env = await askEnv(product, { rerank }); if (!env) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sources = (sp.get('source') ?? '').split(',').filter((s): s is Source => (SOURCES as string[]).includes(s));
  try {
    const hits = await retrieve(env.ctx, q, { limit: Math.min(60, Number(sp.get('limit')) || 30), sources: sources.length ? sources : undefined, kind: kind || undefined, expand: sp.get('expand') === '1', rerank, all: sp.get('all') === '1', asOf: sp.get('asOf') });
    let indexing = !!env.indexing;
    if (sp.get('scope') === 'workspace') {
      // the other vaults answer together, each within a short budget: one whose index is still being built (a fresh
      // vault embeds every page first) keeps building in the background and joins the next search instead
      const others = (await workspaceProducts()).filter(p => p.slug !== product);
      const budget = <T,>(p: Promise<T>): Promise<T | null> => Promise.race([p, new Promise<null>(res => setTimeout(() => res(null), 1500))]);
      const far = await Promise.all(others.map(async o => {
        try {
          // a vault never indexed here: its first index is built now, in the background, never on this request
          if (!(await indexBuilt(o))) { indexing = true; void askEnv(o.slug, { rerank: false }).catch(() => {}); return []; }
          const e = await budget(askEnv(o.slug, { rerank: false })); if (!e) { indexing = true; return []; }
          const r = await budget(retrieve(e.ctx, q, { limit: 8, sources: sources.length ? sources : undefined, kind: kind || undefined, all: sp.get('all') === '1', asOf: sp.get('asOf') })); if (!r) return [];
          return r.map(h => ({ ...h, vault: o.slug, vaultTitle: o.meta.title }) as Hit);
        } catch { return []; } // a vault that cannot be searched is left out
      }));
      hits.push(...far.flat().sort((a, b) => b.score - a.score).slice(0, 24));
    }
    return NextResponse.json({ hits, ...(env.degraded ? { degraded: env.degraded } : {}), ...(indexing ? { indexing: true } : {}) });
  } catch (err) { return NextResponse.json({ error: 'search_failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
