import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { nextForRunner } from '@/lib/work-io';

// op:api.work.next — GET [?goal=] → the oldest ready, unblocked, unassigned task (req:exec.ready-for-runners);
// POST { agent, runner, goal? } → takes it: a queued run session for that agent with the task assigned, 204 when none
// (or when the product says `auto-take: off`).
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const goal = new URL(req.url).searchParams.get('goal') ?? undefined;
  const r = await nextForRunner(scope, { goal, wfUrl: new URL(req.url).origin });
  return NextResponse.json({ task: r.task, off: !!r.off }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { agent?: string; runner?: string; goal?: string };
  if (!body.agent || !body.runner) return NextResponse.json({ error: 'invalid', message: 'agent and runner required' }, { status: 422 });
  const r = await nextForRunner(scope, { goal: body.goal, take: { agent: body.agent, runner: body.runner }, wfUrl: new URL(req.url).origin });
  if (!r.task || !r.session) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ task: r.task.id, session: r.session });
}
