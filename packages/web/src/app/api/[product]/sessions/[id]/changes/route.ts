import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { getSession } from '@/lib/sessions';
import { sessionChanges, changeCounts } from '@/lib/session-changes';

// GET → every block the session added, changed or removed, per document, joined with the current graph
// (op:api.sessions.changes); `wf session changes <id>` and the Changes view read this.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(scope.product.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const groups = sessionChanges(s, scope.graph);
  return NextResponse.json({ id: s.id, status: s.status, counts: changeCounts(groups), groups }, { headers: { 'cache-control': 'no-store' } });
}
