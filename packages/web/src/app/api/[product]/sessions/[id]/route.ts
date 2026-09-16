import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getSession, updateSession, type SessionStatus } from '@/lib/sessions';

// GET → the session ; PATCH { status?, line?, result? } → appends to the log / changes status (used by runners and Cancel).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(s, { headers: { 'cache-control': 'no-store' } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { status?: SessionStatus; line?: string; lines?: string[]; result?: string; runner?: string };
  const ok: SessionStatus[] = ['queued', 'running', 'done', 'failed', 'cancelled'];
  if (body.status && !ok.includes(body.status)) return NextResponse.json({ error: 'invalid', message: 'bad status' }, { status: 422 });
  const s = await updateSession(p.dir, id, body); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(s);
}
