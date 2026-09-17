import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { addInboxItem, listInboxItems } from '@/lib/inbox';

// GET → the inbox items. POST { type?, title?, text?, from?, refs?, session?, fields? } → adds one (agents: wf inbox add).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ items: await listInboxItems(p.dir) }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { type?: string; title?: string; text?: string; from?: string; refs?: string[]; session?: string; fields?: Record<string, string> };
  if (!(body.title ?? '').trim() && !(body.text ?? '').trim() && !Object.values(body.fields ?? {}).some(v => v?.trim())) return NextResponse.json({ error: 'invalid', message: 'a title, text or fields are required' }, { status: 422 });
  const name = await addInboxItem(p.dir, body);
  return NextResponse.json({ ok: true, name }, { status: 201 });
}
