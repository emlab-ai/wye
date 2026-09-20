import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { getSession, saveAttachment, takeFromQueue } from '@/lib/sessions';
import { sendMessage, startChat, restartFresh, isLive } from '@/lib/agent-host';

// POST { text, refs?, link?, images?, fresh? } → into the session's persistent queue; the agent takes it when idle
// (one at a time or as a batch, per the session's setting). If the agent is not running it is resumed and takes the
// queue. `fresh` rides on the item (req:wf2.sessions.fresh-in-queue): when its turn comes the agent restarts from
// nothing first — at once when idle, after the open turn when busy — and gets it as a first message, with the
// plan-first section when `plan` is set.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { text, refs, link, images, fresh } = (await req.json()) as { text?: string; refs?: string[]; link?: string; images?: { name?: string; dataUrl: string }[]; fresh?: boolean };
  if (!text?.trim() && !images?.length) return NextResponse.json({ error: 'invalid', message: 'text or an image required' }, { status: 422 });
  const names: string[] = [];
  for (const im of (images ?? []).slice(0, 8)) { const n = await saveAttachment(p.dir, id, im.name ?? 'image', im.dataUrl); if (n) names.push(n); }
  const item = { text: (text ?? '').trim() || (names.length ? '(image)' : ''), refs, link, images: names, ...(fresh ? { fresh: true } : {}) };
  const wfUrl = new URL(req.url).origin;
  const r = await sendMessage(p.dir, id, item);
  if (!isLive(id) && (s.status !== 'cancelled' || fresh)) {
    // no process: a fresh item at the head of the queue starts a new agent with it; anything else resumes the old one
    const cur = await getSession(p.dir, id); const next = (cur?.queue ?? []).find(q => !q.sentAt);
    if (next?.fresh) await restartFresh(p.dir, product, id, await takeFromQueue(p.dir, id), { wfUrl });
    else await startChat(p.dir, product, id, { wfUrl, resume: !!s.agentSessionId });
  }
  return NextResponse.json({ ok: true, position: r.position, live: isLive(id) });
}
