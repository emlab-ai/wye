import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getSession, updateSession, type SessionStatus } from '@/lib/sessions';
import { openInSession, liveState } from '@/lib/agent-host';
import { openTarget } from '@/lib/open-target';
import { prsOf } from '@/lib/pr-doc';
import { loadScope } from '@/lib/scope';

// GET → the session ; PATCH { status?, line?, result? } → appends to the log / changes status (used by runners and Cancel);
// PATCH { open } → navigates the person's browser to a page (op:session.open).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const scope = await loadScope(product);
  return NextResponse.json({ ...s, ...(s.mode === 'chat' ? liveState(s.id) : {}), prs: scope ? prsOf(product, scope.graph, s.id) : [] }, { headers: { 'cache-control': 'no-store' } });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { status?: SessionStatus; line?: string; lines?: string[]; result?: string; runner?: string; open?: string };
  if (body.open !== undefined) {
    const path = openTarget(product, body.open); if (!path) return NextResponse.json({ error: 'invalid', message: 'open wants product/project/doc[#node] or an app URL' }, { status: 422 });
    const live = openInSession(id, path);
    // the live event lands in the transcript; a session without a console keeps the log line instead
    const s = live ? await getSession(p.dir, id) : await updateSession(p.dir, id, { line: `opened ${path} (no live console)` }); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, path, live });
  }
  const ok: SessionStatus[] = ['queued', 'running', 'done', 'failed', 'cancelled'];
  if (body.status && !ok.includes(body.status)) return NextResponse.json({ error: 'invalid', message: 'bad status' }, { status: 422 });
  const s = await updateSession(p.dir, id, body); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(s);
}
