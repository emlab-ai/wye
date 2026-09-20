import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { AGENTS, createSession, listSessions, listRunners } from '@/lib/sessions';
import { startChat, liveState, reconcileStale } from '@/lib/agent-host';
import { askingOf } from '@/lib/asking';
import { createPlanDoc } from '@/lib/plan-docs';
import { plansOf } from '@/lib/plan-doc';
import { loadScope } from '@/lib/scope';
import { stat } from 'node:fs/promises';
import { REPO_ROOT } from '@/lib/products';

// GET → { sessions } — each with its plans from the graph (decision:wf2.plan-per-request); POST { agent, instruction, refs?, source?, images? } → the new session (status queued).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await reconcileStale(p.dir);
  const scope = await loadScope(product);
  const sessions = (await listSessions(p.dir)).map(s => { const live = s.mode === 'chat' ? liveState(s.id) : {}; return { ...s, transcript: undefined, ...live, asking: (live as { live?: boolean }).live ? askingOf(s.transcript ?? []) : undefined, plans: scope ? plansOf(product, scope.graph, s.id) : [] }; });
  return NextResponse.json({ sessions, runners: await listRunners(p.dir), defaults: { cwd: p.meta.repo ?? '', waterfall: REPO_ROOT } }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; instruction?: string; refs?: string[]; source?: Record<string, string>; mode?: 'run' | 'chat'; cwd?: string; plan?: boolean; images?: { name?: string; dataUrl: string }[]; role?: 'worker' | 'librarian' };
  // Ask Wye (req:exec.ask-wye): a librarian session — claude on the host with the librarian prompt, in the Wye repo
  const role = body.role === 'librarian' ? 'librarian' : 'worker';
  const agent = role === 'librarian' ? 'claude-code' : AGENTS.find(a => a.id === body.agent)?.id;
  const instruction = (body.instruction ?? '').trim();
  if (!agent) return NextResponse.json({ error: 'invalid', message: 'unknown agent' }, { status: 422 });
  const images = Array.isArray(body.images) ? body.images.filter(i => i && typeof i.dataUrl === 'string').slice(0, 8) : [];
  if (!instruction && !images.length) return NextResponse.json({ error: 'invalid', message: 'instruction required' }, { status: 422 });
  const mode = body.mode === 'chat' || role === 'librarian' ? 'chat' : 'run';
  const cwd = role === 'librarian' ? REPO_ROOT : body.cwd?.trim() || '';
  if (mode === 'chat') {
    // a conversation always works in a folder: the agent's tools read and write there
    if (!cwd) return NextResponse.json({ error: 'invalid', message: 'a working folder is required' }, { status: 422 });
    try { if (!(await stat(cwd)).isDirectory()) throw new Error(); } catch { return NextResponse.json({ error: 'invalid', message: `folder not found: ${cwd}` }, { status: 422 }); }
  }
  const s = await createSession(p.dir, product, { agent, instruction: instruction || '(image)', refs: (body.refs ?? []).filter(r => typeof r === 'string').slice(0, 50), source: body.source ?? {}, mode, cwd: cwd || undefined, plan: body.plan === true && role !== 'librarian', images, role });
  s.planDoc = (await createPlanDoc(p.dir, product, s)) ?? undefined; // every request that starts work has a plan document before the first message names it (rule:plan-doc)
  if (mode === 'chat') { const started = await startChat(p.dir, product, s.id, { wfUrl: new URL(req.url).origin }); return NextResponse.json(started ?? s, { status: 201 }); }
  return NextResponse.json(s, { status: 201 });
}
