import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/products';
import { heartbeatRunner, listRunners } from '@/lib/sessions';

// GET → online runners. POST { name, agent, host, pid, cwd, startedAt, busy?, gone? } → heartbeat (or sign off).
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ runners: await listRunners(p.dir) }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json()) as { name?: string; agent?: string; host?: string; pid?: number; cwd?: string; startedAt?: string; busy?: string; gone?: boolean };
  if (!b.name || !b.agent) return NextResponse.json({ error: 'invalid', message: 'name and agent required' }, { status: 422 });
  const runners = await heartbeatRunner(p.dir, { name: b.name, agent: b.agent, host: b.host ?? '', pid: b.pid ?? 0, cwd: b.cwd ?? '', startedAt: b.startedAt ?? new Date().toISOString(), busy: b.busy }, !!b.gone);
  return NextResponse.json({ runners });
}
