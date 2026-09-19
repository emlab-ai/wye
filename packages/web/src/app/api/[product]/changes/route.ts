import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { listChanges, changedSince, type ChangeState } from '@/lib/changes';

// op:api.changes — GET [?state=pending|accepted|reverted] [&node=id] [&all=1] → { changes } — the change records
// (req:exec.change-kept), each with `stale` when the node moved on since (req:exec.change-review); tracking-only
// records are out unless all=1.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const state = (sp.get('state') || undefined) as ChangeState | undefined;
  const list = await listChanges(scope.product.dir, { state, node: sp.get('node') || undefined, listed: sp.get('all') !== '1' });
  return NextResponse.json({ changes: list.map(r => ({ ...r, stale: r.state === 'pending' && changedSince(r, scope.idx.byId.get(r.node)), exists: !!scope.idx.byId.get(r.node)?.defined })) }, { headers: { 'cache-control': 'no-store' } });
}
