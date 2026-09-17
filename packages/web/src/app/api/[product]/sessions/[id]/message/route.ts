import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getSession } from '@/lib/sessions';
import { sendMessage, startChat, isLive } from '@/lib/agent-host';

// POST { text, refs?, link? } → into the session's persistent queue; the agent takes it when idle (one at a time or
// as a batch, per the session's setting). If the agent is not running it is resumed and takes the queue.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { text, refs, link } = (await req.json()) as { text?: string; refs?: string[]; link?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'invalid', message: 'text required' }, { status: 422 });
  const r = await sendMessage(p.dir, id, { text: text.trim(), refs, link });
  if (!isLive(id) && s.status !== 'cancelled') await startChat(p.dir, product, id, { wfUrl: new URL(req.url).origin, resume: !!s.agentSessionId });
  return NextResponse.json({ ok: true, position: r.position, live: isLive(id) });
}
