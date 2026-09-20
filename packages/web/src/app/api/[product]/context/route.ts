import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { search } from '@/lib/semantic';
import { jevClient, LINK_MIN } from '@/lib/jev';
import { judgeText } from '@/lib/links';

// POST { text, exclude?: string[], limit?, all?, asOf?, judge? } → { hits: [{ id, score, semantic, keyword, snippet, p? }], hidden, jev?, min? }
// Relevant knowledge for a piece of text, ranked by local semantic + keyword search. Superseded, rejected and retired
// nodes are left out and counted in `hidden` unless `all` (or `asOf: <date>`) asks for them (req:memory.current-by-construction).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { text?: string; exclude?: string[]; limit?: number; all?: boolean; asOf?: string; judge?: boolean };
  const text = (body.text ?? '').toString();
  if (text.trim().length < 3) return NextResponse.json({ hits: [] });
  try {
    const hits = await search(scope.product.dir, scope.graph, text, { limit: Math.min(30, body.limit ?? 12), exclude: body.exclude, all: !!body.all, asOf: body.asOf ?? null });
    // with `judge` and a Jev key, each hit carries Jev's probability (Jev auto-linking design §3) — what the editor
    // will link on blur is what lies at or above `min`
    const c = body.judge ? await jevClient() : null;
    if (c?.enabled && hits.length) {
      const p = new Map((await judgeText(scope.product.dir, scope.graph, text, { jev: c, hits })).map(h => [h.id, h.p]));
      return NextResponse.json({ hits: hits.map(h => ({ ...h, p: p.get(h.id) })), hidden: hits.hidden ?? 0, jev: true, min: LINK_MIN() });
    }
    return NextResponse.json({ hits, hidden: hits.hidden ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: 'search_failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
