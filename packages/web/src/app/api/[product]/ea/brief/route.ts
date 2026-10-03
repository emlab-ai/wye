import { NextResponse } from 'next/server';
import { runBrief, type BriefKind } from '@/lib/ea/brief-run';

// op:api.ea-brief (req:ea.daily-brief, req:ea.weekly-pace, req:ea.one-on-one-prep) — POST { kind: daily | weekly |
// 1on1, date?, person?, write?, project? } → the brief's markdown; with write the page under Briefs (replaced when it
// exists) and the day's snapshot. Reads every other product, writes none of them (constraint:ea.reads-other-products-only).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json().catch(() => ({})) as Partial<{ kind: string; date: string; person: string; write: boolean; project: string }>;
  if (!['daily', 'weekly', '1on1'].includes(b.kind ?? '')) return NextResponse.json({ error: 'invalid', message: 'kind is daily, weekly or 1on1' }, { status: 422 });
  try {
    const r = await runBrief(product, { kind: b.kind as BriefKind, date: b.date, person: b.person, write: !!b.write, project: b.project });
    if (!r.ok) return NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
    return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
