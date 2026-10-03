import { NextResponse } from 'next/server';
import { askEnv } from '@/lib/ask/env';
import { retrieve } from '@/lib/ask/retrieve';
import { SOURCES, type Source } from '@/lib/ask/types';

export const dynamic = 'force-dynamic';
// GET ?q=&kind=req&source=a,b&limit=&expand=1&rerank=1&all=1&asOf= → { hits, degraded? } (decision:wf2.ask-in-search-panel): the
// typing-time search over nodes, document passages, code and sessions — no language model; `rerank` runs the local
// cross-encoder over the top hits (agents and the eval use it; the panel does not while typing).
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params; const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim(); const kind = (sp.get('kind') ?? '').trim();
  if (q.length < 2 && !kind) return NextResponse.json({ hits: [] });
  const rerank = sp.get('rerank') === '1';
  const env = await askEnv(product, { rerank }); if (!env) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sources = (sp.get('source') ?? '').split(',').filter((s): s is Source => (SOURCES as string[]).includes(s));
  try {
    const hits = await retrieve(env.ctx, q, { limit: Math.min(60, Number(sp.get('limit')) || 30), sources: sources.length ? sources : undefined, kind: kind || undefined, expand: sp.get('expand') === '1', rerank, all: sp.get('all') === '1', asOf: sp.get('asOf') });
    return NextResponse.json({ hits, ...(env.degraded ? { degraded: env.degraded } : {}) });
  } catch (err) { return NextResponse.json({ error: 'search_failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
