import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { AGENTS, createSession, listSessions } from '@/lib/sessions';

// GET → { sessions } ; POST { agent, instruction, refs?, source? } → the new session (status queued).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ sessions: await listSessions(p.dir) });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; instruction?: string; refs?: string[]; source?: Record<string, string> };
  const agent = AGENTS.find(a => a.id === body.agent)?.id;
  const instruction = (body.instruction ?? '').trim();
  if (!agent) return NextResponse.json({ error: 'invalid', message: 'unknown agent' }, { status: 422 });
  if (!instruction) return NextResponse.json({ error: 'invalid', message: 'instruction required' }, { status: 422 });
  const s = await createSession(p.dir, product, { agent, instruction, refs: (body.refs ?? []).filter(r => typeof r === 'string').slice(0, 50), source: body.source ?? {} });
  return NextResponse.json(s, { status: 201 });
}
