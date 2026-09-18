import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getSession, saveAttachment } from '@/lib/sessions';
import { sendMessage, startChat, restartFresh, isLive } from '@/lib/agent-host';

// POST { text, refs?, link?, images?, fresh?, plan? } → into the session's persistent queue; the agent takes it when idle
// (one at a time or as a batch, per the session's setting). If the agent is not running it is resumed and takes the
// queue. `fresh` clears the context first (rule:clean-slate): the agent restarts from nothing and gets the message
// as a first message, with the plan-first section when `plan` is set.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { text, refs, link, images, fresh, plan } = (await req.json()) as { text?: string; refs?: string[]; link?: string; images?: { name?: string; dataUrl: string }[]; fresh?: boolean; plan?: boolean };
  if (!text?.trim() && !images?.length) return NextResponse.json({ error: 'invalid', message: 'text or an image required' }, { status: 422 });
  const names: string[] = [];
  for (const im of (images ?? []).slice(0, 8)) { const n = await saveAttachment(p.dir, id, im.name ?? 'image', im.dataUrl); if (n) names.push(n); }
  const item = { text: (text ?? '').trim() || (names.length ? '(image)' : ''), refs, link, images: names };
  const wfUrl = new URL(req.url).origin;
  if (fresh) { await restartFresh(p.dir, product, id, item, { wfUrl, plan: plan === true }); return NextResponse.json({ ok: true, position: 0, live: isLive(id) }); }
  const r = await sendMessage(p.dir, id, item);
  if (!isLive(id) && s.status !== 'cancelled') await startChat(p.dir, product, id, { wfUrl, resume: !!s.agentSessionId });
  return NextResponse.json({ ok: true, position: r.position, live: isLive(id) });
}
