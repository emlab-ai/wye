import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getSession, updateSession, removeFromQueue, setBatch } from '@/lib/sessions';
import { answerPermission, startChat, stopChat, isLive, pumpSession, notifyQueue } from '@/lib/agent-host';

// POST { action: 'stop' | 'resume' | 'permission', requestId?, allow?, input? }
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json()) as { action?: string; requestId?: string; allow?: boolean; input?: unknown; itemId?: string; batch?: 'one' | 'all' };
  if (b.action === 'batch' && (b.batch === 'one' || b.batch === 'all')) { await setBatch(p.dir, id, b.batch); await notifyQueue(p.dir, id); pumpSession(id); return NextResponse.json({ ok: true }); }
  if (b.action === 'unqueue' && b.itemId) { const ok = await removeFromQueue(p.dir, id, b.itemId); await notifyQueue(p.dir, id); return NextResponse.json({ ok }); }
  if (b.action === 'stop') { stopChat(id); await updateSession(p.dir, id, { status: 'cancelled' }); return NextResponse.json({ ok: true }); }
  if (b.action === 'resume') { if (!isLive(id)) await startChat(p.dir, product, id, { wfUrl: new URL(req.url).origin, resume: !!s.agentSessionId }); return NextResponse.json({ ok: true, live: isLive(id) }); }
  if (b.action === 'permission' && b.requestId) return NextResponse.json({ ok: answerPermission(id, b.requestId, !!b.allow, b.input) });
  return NextResponse.json({ error: 'invalid', message: 'unknown action' }, { status: 422 });
}
