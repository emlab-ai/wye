import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { refreshGraph, graphFor } from '@/lib/build';
import { refresh } from '@/lib/ask/refresh';

export const dynamic = 'force-dynamic';

// POST → `wye refresh` (req:waterfall.cache-home.manage): the quick refresh after a branch switch or anything else
// that changed the files behind the app's back — the documents against the last build's manifest, the graph built
// again when any changed (not recorded as edits), then the Ask index over every source, re-reading only the files
// whose content changed. Answers with what it re-read and rebuilt.
export async function POST(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const p = await getProduct((await params).product);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const t0 = Date.now();
  const graph = await refreshGraph(p.dir);
  const cached = await graphFor(p.dir);
  if (!cached) return NextResponse.json({ error: 'no_graph', message: 'the graph could not be built — wye check says why' }, { status: 500 });
  const index = await refresh(p, cached.graph, { batch: 50 });
  return NextResponse.json({ product: p.slug, graph: { ...graph, nodes: cached.graph.nodes.length }, index, ms: Date.now() - t0 });
}
