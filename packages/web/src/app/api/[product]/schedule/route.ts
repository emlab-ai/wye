import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { scheduleOf, setPaused, runNow } from '@/lib/hooks-clock';

// op:api.schedule (decision:wf2.scheduler-runs-agents) — GET → the product's scheduled jobs (its time hooks): what each
// runs, on which agent, next and last run, paused or not. POST { hook, action: 'run' | 'pause' | 'resume' }.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  return NextResponse.json({ jobs: await scheduleOf(product) });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { hook?: string; action?: string };
  if (!b.hook || !['run', 'pause', 'resume'].includes(b.action ?? '')) return NextResponse.json({ error: 'invalid', message: 'hook and action run|pause|resume required' }, { status: 422 });
  if (b.action === 'run') { const f = await runNow(product, b.hook); return NextResponse.json({ ok: true, firings: f.length, sessions: f.flatMap(x => x.actions.map(a => a.session).filter(Boolean)) }); }
  return NextResponse.json({ ok: true, paused: await setPaused(p.dir, b.hook, b.action === 'pause') });
}
