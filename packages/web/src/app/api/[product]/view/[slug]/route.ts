import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { instanceTable } from '@/lib/instance-table';

// GET → every instance of a type (or node of a kind) as table rows with columns and status counts
// (component:instance-table); a view block in a document fetches this and applies its own filters.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(instanceTable(scope.graph, slug));
}
