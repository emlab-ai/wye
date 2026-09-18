import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { getSession } from '@/lib/sessions';
import { liveState } from '@/lib/agent-host';
import { sessionPage } from '@/lib/session-page';

// GET → what the session page shows: the session (transcript left out) and its todo rows, blocks by kind and opened
// pages joined with the current graph (op:api.sessions.page); component:session-page refetches this while live.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(scope.product.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const data = sessionPage(s, scope.graph);
  return NextResponse.json({ session: { ...s, transcript: undefined, log: [], ...(s.mode === 'chat' ? liveState(s.id) : {}) }, ...data }, { headers: { 'cache-control': 'no-store' } });
}
