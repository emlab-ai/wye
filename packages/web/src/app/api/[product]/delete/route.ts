import { NextResponse } from 'next/server';
import { deleteProduct } from '@/lib/delete-product';

// Delete a product: POST → { trashed, relocated, kept, next, href }. The folder is moved to <data>/_trash, not
// unlinked; a product relocated beside its code keeps that folder (lib/delete-product). `href` is where to land now.
export async function POST(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  try {
    const r = await deleteProduct(product);
    return NextResponse.json({ ok: true, ...r, href: r.next ? `/${r.next}` : '/new' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'not_found') return NextResponse.json({ error: 'not_found', message: `${product} is not here` }, { status: 404 });
    return NextResponse.json({ error: 'failed', message }, { status: 500 });
  }
}
