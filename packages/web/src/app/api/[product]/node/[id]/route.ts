import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { relations, neighborhood } from '@/lib/graph';

export async function GET(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = scope.idx.byId.get(id); if (!node) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const depth = Math.min(3, Math.max(1, Number(new URL(req.url).searchParams.get('depth') ?? 1) || 1));
  // the node's neighbourhood for the graph view: every node within `depth` hops and the edges among them
  const ids = neighborhood(scope.idx, id, depth, false);
  const nodes = [...ids].map(i => scope.idx.byId.get(i)).filter(Boolean).map(n => ({ id: n!.id, kind: n!.kind, title: n!.title, status: n!.status, defined: n!.defined }));
  const edges = scope.graph.edges.filter(e => ids.has(e.from) && ids.has(e.to));
  return NextResponse.json({ node, relations: relations(scope.idx, id), graph: { nodes, edges } });
}
