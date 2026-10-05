import { NextResponse } from 'next/server';
import { importProduct } from '@/lib/product-transfer';

// op:api.product-import (decision:wf2.product-transfer) — POST <.wye.tgz bytes> [?slug=] → a new product from an
// export: the archive is checked before anything is written, unpacked under a free slug, built. → { slug }
export async function POST(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? undefined;
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length) return NextResponse.json({ error: 'invalid', message: 'no file' }, { status: 422 });
  try { const r = await importProduct(data, { slug }); return NextResponse.json({ ok: true, ...r }); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return NextResponse.json({ error: m.split(':')[0], message: m.replace(/^\w+: /, '') }, { status: 422 }); }
}
