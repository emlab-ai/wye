import { NextResponse } from 'next/server';
import { getProduct, REPO_ROOT } from '@/lib/products';
import { getSession } from '@/lib/sessions';
import { sendMessage, startChat, isLive } from '@/lib/agent-host';

// POST { text } → the person's next message into the conversation (restarts the agent with --resume when it exited).
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'invalid', message: 'text required' }, { status: 422 });
  const wfUrl = new URL(req.url).origin;
  if (!isLive(id)) await startChat(p.dir, product, id, { wfUrl, resume: !!s.agentSessionId, firstMessage: s.agentSessionId ? text : undefined });
  else await sendMessage(id, text, s.cwd || REPO_ROOT);
  if (isLive(id) && s.agentSessionId && !s.transcript?.length) { /* first turn already sent as the resume message */ }
  return NextResponse.json({ ok: true });
}
