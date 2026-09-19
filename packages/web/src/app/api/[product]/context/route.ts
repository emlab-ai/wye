import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { search } from '@/lib/semantic';

// POST { text, exclude?: string[], limit?, all?, asOf? } → { hits: [{ id, score, semantic, keyword, snippet }], hidden }
// Relevant knowledge for a piece of text, ranked by local semantic + keyword search. Superseded, rejected and retired
// nodes are left out and counted in `hidden` unless `all` (or `asOf: <date>`) asks for them (req:memory.current-by-construction).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { text?: string; exclude?: string[]; limit?: number; all?: boolean; asOf?: string };
  const text = (body.text ?? '').toString();
  if (text.trim().length < 3) return NextResponse.json({ hits: [] });
  try {
    const hits = await search(scope.product.dir, scope.graph, text, { limit: Math.min(30, body.limit ?? 12), exclude: body.exclude, all: !!body.all, asOf: body.asOf ?? null });
    return NextResponse.json({ hits, hidden: hits.hidden ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: 'search_failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
