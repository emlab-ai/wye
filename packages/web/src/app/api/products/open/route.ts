import { NextResponse } from 'next/server';
import { openProduct } from '@/lib/product-transfer';

// op:api.product-open (decision:wf2.product-transfer) — POST { folder, slug? } → a product folder already on disk
// (projects/, or a repo's wye/projects/) becomes a product where it is: a registry entry with `root:`, nothing copied.
// A folder some product already points at answers with that product. → { slug, dir, existing }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { folder?: string; slug?: string };
  try { const r = await openProduct(body.folder ?? '', { slug: body.slug }); return NextResponse.json({ ok: true, ...r }); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return NextResponse.json({ error: m.split(':')[0], message: m.replace(/^\w+: /, '') }, { status: 422 }); }
}
