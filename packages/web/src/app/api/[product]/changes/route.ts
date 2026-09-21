import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { listChanges, changedSince, mutateChange, type ChangeState } from '@/lib/changes';

// op:api.changes — GET [?state=pending|accepted|reverted] [&node=id] [&all=1] → { changes } — the change records
// (req:exec.change-kept), each with `stale` when the node moved on since (req:exec.change-review); tracking-only
// records are out unless all=1. POST { action: 'accept-all', ids?: string[], by?: string } accepts every pending record
// named (else every pending one) — the way out of a long list of a person's own edits.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const state = (sp.get('state') || undefined) as ChangeState | undefined;
  const list = await listChanges(scope.product.dir, { state, node: sp.get('node') || undefined, listed: sp.get('all') !== '1' });
  return NextResponse.json({ changes: list.map(r => ({ ...r, stale: r.state === 'pending' && changedSince(r, scope.idx.byId.get(r.node)), exists: !!scope.idx.byId.get(r.node)?.defined })) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: string[]; by?: string };
  if (body.action !== 'accept-all') return NextResponse.json({ error: 'invalid', message: 'action must be accept-all' }, { status: 422 });
  const pending = await listChanges(scope.product.dir, { state: 'pending' });
  const want = body.ids?.length ? new Set(body.ids) : null;
  const by = body.by?.trim() || 'person'; const now = new Date().toISOString(); let n = 0;
  for (const r of pending) { if (want && !want.has(r.id)) continue; await mutateChange(scope.product.dir, r.id, c => { c.state = 'accepted'; c.acceptedBy = by; c.acceptedAt = now; }); n++; }
  return NextResponse.json({ ok: true, accepted: n });
}
