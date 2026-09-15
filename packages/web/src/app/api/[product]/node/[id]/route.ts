import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { relations } from '@/lib/graph';

export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id: raw } = await params; const id = decodeURIComponent(raw);
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = scope.idx.byId.get(id); if (!node) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ node, relations: relations(scope.idx, id) });
}
