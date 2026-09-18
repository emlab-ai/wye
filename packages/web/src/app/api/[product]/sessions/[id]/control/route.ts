import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getSession, updateSession, removeFromQueue, setBatch, setItemFresh, dropPending } from '@/lib/sessions';
import { answerPermission, startChat, stopChat, isLive, pumpSession, notifyQueue } from '@/lib/agent-host';

// POST { action: 'stop' | 'close' | 'resume' | 'permission' | 'batch' | 'unqueue' | 'item', requestId?, allow?, input?, itemId?, batch?, fresh? }
// stop: the process ends, the session is done and Resume / a message brings the context back; close: the process
// ends, the waiting items are dropped and the session is cancelled (req:wf2.sessions.stop-from-list); item: the
// fresh mark of a waiting item.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json()) as { action?: string; requestId?: string; allow?: boolean; input?: unknown; itemId?: string; batch?: 'one' | 'all'; fresh?: boolean };
  if (b.action === 'batch' && (b.batch === 'one' || b.batch === 'all')) { await setBatch(p.dir, id, b.batch); await notifyQueue(p.dir, id); pumpSession(id); return NextResponse.json({ ok: true }); }
  if (b.action === 'unqueue' && b.itemId) { const ok = await removeFromQueue(p.dir, id, b.itemId); await notifyQueue(p.dir, id); return NextResponse.json({ ok }); }
  if (b.action === 'item' && b.itemId) { const ok = await setItemFresh(p.dir, id, b.itemId, b.fresh !== false); await notifyQueue(p.dir, id); return NextResponse.json({ ok }); }
  if (b.action === 'stop') { const was = stopChat(id); if (was || s.status === 'running' || s.status === 'queued') await updateSession(p.dir, id, { status: 'done', line: 'stopped by the user — Resume or a message continues with the same context' }); return NextResponse.json({ ok: true }); }
  if (b.action === 'close') { stopChat(id, 'closed by the user — the waiting items are dropped'); const dropped = await dropPending(p.dir, id); await notifyQueue(p.dir, id); await updateSession(p.dir, id, { status: 'cancelled', line: `closed by the user${dropped ? ` — ${dropped} waiting item${dropped === 1 ? '' : 's'} dropped` : ''}` }); return NextResponse.json({ ok: true, dropped }); }
  if (b.action === 'resume') { if (!isLive(id)) await startChat(p.dir, product, id, { wfUrl: new URL(req.url).origin, resume: !!s.agentSessionId }); return NextResponse.json({ ok: true, live: isLive(id) }); }
  if (b.action === 'permission' && b.requestId) return NextResponse.json({ ok: answerPermission(id, b.requestId, !!b.allow, b.input) });
  return NextResponse.json({ error: 'invalid', message: 'unknown action' }, { status: 422 });
}
