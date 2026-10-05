import { NextResponse } from 'next/server';
import { exportProduct } from '@/lib/product-transfer';

// op:api.product-export (decision:wf2.product-transfer) — GET → the product as one file, <slug>.wye.tgz: _product.md
// (without `root:`), projects/, inbox/, _agent.md. Sessions, change records and the built graph stay on this machine.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  try {
    const { file, data } = await exportProduct(product);
    return new NextResponse(new Uint8Array(data), { headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${file}"`, 'cache-control': 'no-store' } });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: m.startsWith('not_found') ? 'not_found' : 'failed', message: m }, { status: m.startsWith('not_found') ? 404 : 500 });
  }
}
