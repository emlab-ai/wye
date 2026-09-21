import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { hooksOf } from '@/lib/hooks';
import { listFirings, hooksOn } from '@/lib/hooks-run';

// op:api.hooks (decision:wf2.hooks-and-skills) — GET → the product's hooks (id, title, on, where, actions, once, status)
// with their firings (node, event, at, depth, what ran); ?node=<id> narrows the firings to one node — what a column shows.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = new URL(req.url).searchParams.get('node');
  const firings = (await listFirings(scope.product.dir)).filter(f => !node || f.node === node);
  const hooks = hooksOf(scope.graph).map(h => ({ ...h, on: `${h.on.kind}.${h.on.event}`, firings: firings.filter(f => f.hook === h.id).length }));
  return NextResponse.json({ on: hooksOn(), hooks, firings: firings.slice(-200) }, { headers: { 'cache-control': 'no-store' } });
}
