import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { hooksOf } from '@/lib/hooks';
import { listFirings, hooksEnabled, runHook } from '@/lib/hooks-run';

// op:api.hooks (decision:wf2.hooks-and-skills) — GET → the product's hooks (id, title, on, where, actions, once, status)
// with their firings (node, event, at, depth, what ran); ?node=<id> narrows the firings to one node — what a column shows.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = new URL(req.url).searchParams.get('node');
  const firings = (await listFirings(scope.product.dir)).filter(f => !node || f.node === node);
  // with ?node= the hooks are the ones that can fire on that node's kind (what the column's Hooks section shows)
  const kind = node ? scope.idx.byId.get(node)?.kind ?? node.split(':')[0] : null;
  const hooks = hooksOf(scope.graph).filter(h => !kind || h.on.kind === '*' || h.on.kind === kind).map(h => ({ ...h, on: `${h.on.kind}.${h.on.event}`, firings: firings.filter(f => f.hook === h.id).length }));
  return NextResponse.json({ on: await hooksEnabled(), hooks, firings: firings.slice(-200) }, { headers: { 'cache-control': 'no-store' } });
}

// POST { hook, node } → the hook fires on the node now ("Run now"), the once rule set aside; returns the firings.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json().catch(() => ({})) as { hook?: string; node?: string };
  if (!b.hook || !b.node) return NextResponse.json({ error: 'invalid', message: 'hook and node required' }, { status: 422 });
  try { const firings = await runHook(product, b.hook, b.node); return NextResponse.json({ ok: true, firings }); }
  catch (e) { return NextResponse.json({ error: 'invalid', message: e instanceof Error ? e.message : String(e) }, { status: 422 }); }
}
