import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { AGENTS, handoffSession } from '@/lib/sessions';

// POST { agent, note? } → a new queued session for `agent` that continues this one.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; note?: string };
  if (!AGENTS.some(a => a.id === body.agent)) return NextResponse.json({ error: 'invalid', message: 'unknown agent' }, { status: 422 });
  const child = await handoffSession(p.dir, product, id, body.agent!, body.note ?? '');
  return child ? NextResponse.json(child, { status: 201 }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
