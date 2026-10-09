import { NextResponse } from 'next/server';
import { writeAnalytics } from '@/lib/analytics-write';

// op:api.analytics-write (decision:waterfall.analytics-from-words) — POST { ask, query? } → { query, cards }: an
// analytics page's query line an agent wrote from the words, checked once on the server; 422 with why when it could not.
export const maxDuration = 120;
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = (await req.json().catch(() => ({}))) as { ask?: string; query?: string };
  try {
    const r = await writeAnalytics(product, { ask: String(b.ask ?? ''), query: b.query }, req.signal);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: 'invalid', message: r.message, query: r.query }, { status: 422 });
  } catch (e) { return NextResponse.json({ error: 'agent', message: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
