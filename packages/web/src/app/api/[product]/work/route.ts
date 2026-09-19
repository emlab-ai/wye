import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { loadWork, captureTask, taskDetail } from '@/lib/work-io';
import { reconcileStale } from '@/lib/agent-host';

// op:api.work — GET → { items, people, agents }; GET ?id=task:x → one task with its sessions and what they produced (req:exec.done-comes-back): every task with its derived state (req:exec.work-view,
// req:exec.work-states); POST { text, partOf?, project?, ready? } → capture a task line (req:exec.capture,
// req:exec.backlog-for-agents); the session header credits an agent's capture.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await reconcileStale(scope.product.dir);
  const id = new URL(req.url).searchParams.get('id');
  if (id) { const r = await taskDetail(scope, id); return r ? NextResponse.json(r, { headers: { 'cache-control': 'no-store' } }) : NextResponse.json({ error: 'not_found' }, { status: 404 }); }
  return NextResponse.json(await loadWork(scope), { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { text?: string; partOf?: string; project?: string; by?: string; ready?: boolean };
  const session = req.headers.get('x-wf-session') ?? undefined;
  const r = await captureTask(scope, { text: body.text ?? '', partOf: body.partOf, project: body.project, ready: !!body.ready, by: body.by || (session ? `agent session ${session}` : undefined) });
  if (!r.ok) return NextResponse.json({ error: 'invalid', message: r.message }, { status: 422 });
  return NextResponse.json(r, { status: 201 });
}
