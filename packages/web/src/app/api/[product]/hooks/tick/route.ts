import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { tick } from '@/lib/hooks-clock';

// op:api.hooks-tick (decision:ea.time-based-hooks) — POST { now?: iso } → one tick of the hooks clock for the product
// ("run the clock now"; a test's chosen instant): the time hooks whose slot moved, fired or only recorded, and why.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!(await getProduct(product))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = await req.json().catch(() => ({})) as { now?: string };
  const now = b.now ? new Date(b.now) : new Date();
  if (Number.isNaN(now.getTime())) return NextResponse.json({ error: 'invalid', message: 'now must be an ISO time' }, { status: 422 });
  try { return NextResponse.json({ ok: true, now: now.toISOString(), ticks: await tick(product, now) }); }
  catch (e) { return NextResponse.json({ error: 'invalid', message: e instanceof Error ? e.message : String(e) }, { status: 422 }); }
}
