import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { instanceTable, mergeTables } from '@/lib/instance-table';
import { workspaceProducts } from '@/lib/workspace';
import { directorOf } from '@/lib/ea/read';

// GET → every instance of a type (or node of a kind) as table rows with columns and status counts
// (component:instance-table); a view block in a document fetches this and applies its own filters.
// ?scope=workspace → the same over every vault of the open workspace (req:wf2.workspace-open): this product's rows
// first, each row with the `vault` it is from.
export async function GET(req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // `owner=me`: the product's director (a product card's `director:`), by id and by every name they go by
  const d = directorOf(scope); const dn = d ? scope.idx.byId.get(d) : undefined;
  const aliases = (dn?.body.match(/^aliases:\s*(.+)$/m)?.[1] ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (new URL(req.url).searchParams.get('scope') === 'workspace') {
    const others = (await workspaceProducts()).filter(p => p.slug !== product);
    const parts = [{ slug: product, title: scope.product.meta.title, table: instanceTable(scope.graph, slug) }];
    for (const o of others) { const sc = await loadScope(o.slug).catch(() => null); if (sc) parts.push({ slug: o.slug, title: o.meta.title, table: instanceTable(sc.graph, slug) }); }
    return NextResponse.json({ ...mergeTables(parts), me: d ? [d, dn?.title ?? '', ...aliases].filter(Boolean) : [] });
  }
  return NextResponse.json({ ...instanceTable(scope.graph, slug), me: d ? [d, dn?.title ?? '', ...aliases].filter(Boolean) : [] });
}
