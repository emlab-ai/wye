import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { instanceTable } from '@/lib/instance-table';
import { directorOf } from '@/lib/ea/read';

// GET → every instance of a type (or node of a kind) as table rows with columns and status counts
// (component:instance-table); a view block in a document fetches this and applies its own filters.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // `owner=me`: the product's director (a product card's `director:`), by id and by every name they go by
  const d = directorOf(scope); const dn = d ? scope.idx.byId.get(d) : undefined;
  const aliases = (dn?.body.match(/^aliases:\s*(.+)$/m)?.[1] ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return NextResponse.json({ ...instanceTable(scope.graph, slug), me: d ? [d, dn?.title ?? '', ...aliases].filter(Boolean) : [] });
}
