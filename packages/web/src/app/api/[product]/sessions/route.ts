import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { AGENTS, createSession, listSessions, listRunners } from '@/lib/sessions';
import { startChat, isLive } from '@/lib/agent-host';
import { stat } from 'node:fs/promises';
import { REPO_ROOT } from '@/lib/products';

// GET → { sessions } ; POST { agent, instruction, refs?, source? } → the new session (status queued).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sessions = (await listSessions(p.dir)).map(s => ({ ...s, transcript: undefined, live: s.mode === 'chat' && isLive(s.id) }));
  return NextResponse.json({ sessions, runners: await listRunners(p.dir), defaults: { cwd: p.meta.repo ?? '', waterfall: REPO_ROOT } }, { headers: { 'cache-control': 'no-store' } });
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
  const cwd = body.cwd?.trim() || '';
  if (mode === 'chat') {
    // a conversation always works in a folder: the agent's tools read and write there
    if (!cwd) return NextResponse.json({ error: 'invalid', message: 'a working folder is required' }, { status: 422 });
    try { if (!(await stat(cwd)).isDirectory()) throw new Error(); } catch { return NextResponse.json({ error: 'invalid', message: `folder not found: ${cwd}` }, { status: 422 }); }
  }
  const s = await createSession(p.dir, product, { agent, instruction, refs: (body.refs ?? []).filter(r => typeof r === 'string').slice(0, 50), source: body.source ?? {}, mode, cwd: cwd || undefined });
  if (mode === 'chat') { const started = await startChat(p.dir, product, s.id, { wfUrl: new URL(req.url).origin }); return NextResponse.json(started ?? s, { status: 201 }); }
  return NextResponse.json(s, { status: 201 });
}
