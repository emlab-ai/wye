import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { runVerdicts, verdictLog, verdictsEnabled } from '@/lib/verdicts';

// op:api.verdicts (decision:memory.write-time-verdict). GET → { enabled, log: [verdicts] } the judge log.
// POST { ids: string[], budget? } → { judged, written, verdicts }: the verdict pass for those nodes now, on demand
// (`wf verdicts <id>`), whether or not the pass is on for rebuilds; the lines land under the nodes as usual.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params; const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ enabled: await verdictsEnabled(p.dir), log: await verdictLog(p.dir) });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params; const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { ids?: string[]; budget?: { pairs: number; calls: number } };
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
  if (!ids.length) return NextResponse.json({ error: 'empty', message: 'ids required' }, { status: 400 });
  try { const r = await runVerdicts(p.dir, product, ids, { budget: body.budget ?? { pairs: 30, calls: 4 } }); return NextResponse.json(r); }
  catch (e) { return NextResponse.json({ error: 'judge_failed', message: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
