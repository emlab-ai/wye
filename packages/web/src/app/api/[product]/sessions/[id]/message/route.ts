import { NextResponse } from 'next/server';
import { getProduct, REPO_ROOT } from '@/lib/products';
import { getSession } from '@/lib/sessions';
import { sendMessage, startChat, isLive } from '@/lib/agent-host';

// POST { text } → the person's next message into the conversation (restarts the agent with --resume when it exited).
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const s = await getSession(p.dir, id); if (!s) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { text, refs, link } = (await req.json()) as { text?: string; refs?: string[]; link?: string };
  if (!text?.trim()) return NextResponse.json({ error: 'invalid', message: 'text required' }, { status: 422 });
  const full = [text.trim(), link ? `\nLink: ${link} (resolve it with \`wf resolve\`)` : '', refs?.length ? `Refs: ${refs.join(', ')}` : ''].filter(Boolean).join('\n');
  const wfUrl = new URL(req.url).origin;
  if (!isLive(id)) await startChat(p.dir, product, id, { wfUrl, resume: !!s.agentSessionId, firstMessage: s.agentSessionId ? full : undefined });
  else await sendMessage(id, full, s.cwd || REPO_ROOT);
  return NextResponse.json({ ok: true });
}
