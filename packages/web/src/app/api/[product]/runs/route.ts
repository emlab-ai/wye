import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { advanceRun, cancelRun, listRuns, reopenRun, retryRun, runsOnNode } from '@/lib/runs-run';

// op:api.runs (decision:wf2.run-holds-the-state) — GET → every run with its stage, its status and the readiness of
// that stage (computed here, never stored); ?node=<id> narrows to the runs on one node, which is what the run strip
// and a column show.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const node = new URL(req.url).searchParams.get('node');
  const runs = node ? await runsOnNode(scope, node) : await listRuns(scope);
  return NextResponse.json({ runs }, { headers: { 'cache-control': 'no-store' } });
}

// POST { run, action, stage? } → the person's move: advance (refused unless the stage is ready), skip (advance and say
// so in the log), reopen a stage, retry a blocked one, cancel.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json().catch(() => ({})) as { run?: string; action?: string; stage?: string };
  if (!b.run || !b.action) return NextResponse.json({ error: 'invalid', message: 'run and action required' }, { status: 422 });
  const by = 'person';
  try {
    if (b.action === 'advance' || b.action === 'skip') { const r = await advanceRun(product, b.run, { by, skip: b.action === 'skip' }); return NextResponse.json({ ok: true, ...r }); }
    if (b.action === 'reopen') { if (!b.stage) return NextResponse.json({ error: 'invalid', message: 'stage required to reopen' }, { status: 422 }); await reopenRun(product, b.run, b.stage, { by }); return NextResponse.json({ ok: true, stage: b.stage, status: 'running' }); }
    if (b.action === 'retry') { await retryRun(product, b.run, { by }); return NextResponse.json({ ok: true, status: 'running' }); }
    if (b.action === 'cancel') { await cancelRun(product, b.run, { by }); return NextResponse.json({ ok: true, status: 'cancelled' }); }
    return NextResponse.json({ error: 'invalid', message: `unknown action ${b.action}` }, { status: 422 });
  } catch (e) { return NextResponse.json({ error: 'invalid', message: e instanceof Error ? e.message : String(e) }, { status: 422 }); }
}
