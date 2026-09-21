import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';

// op:api.index (decision:wf2.parse-cache) — GET → the product's node index (id, kind, title, status, defined, file,
// doc …) as the column, tags and pickers use it; the ETag is the graph's build time, so a client that has it gets 304.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const etag = `"${scope.graph.generatedAt || 'none'}"`;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
  return NextResponse.json({ index: scope.index }, { headers: { etag, 'cache-control': 'no-cache' } });
}
