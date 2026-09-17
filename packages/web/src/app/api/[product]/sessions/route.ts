import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { AGENTS, createSession, listSessions, listRunners } from '@/lib/sessions';
import { startChat } from '@/lib/agent-host';

// GET → { sessions } ; POST { agent, instruction, refs?, source? } → the new session (status queued).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ sessions: await listSessions(p.dir), runners: await listRunners(p.dir) }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; instruction?: string; refs?: string[]; source?: Record<string, string>; mode?: 'run' | 'chat'; cwd?: string };
  const agent = AGENTS.find(a => a.id === body.agent)?.id;
  const instruction = (body.instruction ?? '').trim();
  if (!agent) return NextResponse.json({ error: 'invalid', message: 'unknown agent' }, { status: 422 });
  if (!instruction) return NextResponse.json({ error: 'invalid', message: 'instruction required' }, { status: 422 });
  const mode = body.mode === 'chat' ? 'chat' : 'run';
  const s = await createSession(p.dir, product, { agent, instruction, refs: (body.refs ?? []).filter(r => typeof r === 'string').slice(0, 50), source: body.source ?? {}, mode, cwd: body.cwd?.trim() || undefined });
  if (mode === 'chat') { const started = await startChat(p.dir, product, s.id, { wfUrl: new URL(req.url).origin }); return NextResponse.json(started ?? s, { status: 201 }); }
  return NextResponse.json(s, { status: 201 });
}
