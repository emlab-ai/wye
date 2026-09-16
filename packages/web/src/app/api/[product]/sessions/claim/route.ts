import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { claimSession } from '@/lib/sessions';

// POST { agent, runner } → the oldest queued session for that agent, now running under the runner; 204 when none.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; runner?: string };
  if (!body.agent || !body.runner) return NextResponse.json({ error: 'invalid', message: 'agent and runner required' }, { status: 422 });
  const s = await claimSession(p.dir, body.agent, body.runner);
  return s ? NextResponse.json(s) : new NextResponse(null, { status: 204 });
}
