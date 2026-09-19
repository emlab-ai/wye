import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { getChange, mutateChange, changedSince, revertPatch, claimWrite, saveChange } from '@/lib/changes';
import { editNode } from '@/lib/node-edit';
import { randomBytes } from 'node:crypto';

// op:api.changes — GET → one record; POST { action: 'accept' | 'revert' | 'reopen', by? } (req:exec.change-review):
// Accept marks the record accepted (nothing else moves); Revert writes `before` back through the writer, marks the
// record reverted and records the revert as a change of its own, accepted; a record whose node moved on since is
// refused with the old value (paste it by hand) unless `force`.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await getChange(scope.product.dir, id); if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ...r, stale: changedSince(r, scope.idx.byId.get(r.node)), exists: !!scope.idx.byId.get(r.node)?.defined }, { headers: { 'cache-control': 'no-store' } });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await getChange(scope.product.dir, id); if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { action?: string; by?: string; force?: boolean };
  const by = body.by?.trim() || req.headers.get('x-wf-by') || 'person';
  const now = new Date().toISOString();
  if (body.action === 'accept') {
    await mutateChange(scope.product.dir, id, c => { c.state = 'accepted'; c.acceptedBy = by; c.acceptedAt = now; });
    return NextResponse.json({ ok: true, state: 'accepted' });
  }
  if (body.action === 'reopen') {
    await mutateChange(scope.product.dir, id, c => { c.state = 'pending'; delete c.acceptedBy; delete c.acceptedAt; });
    return NextResponse.json({ ok: true, state: 'pending' });
  }
  if (body.action === 'revert') {
    const cur = scope.idx.byId.get(r.node);
    if (!cur?.defined) return NextResponse.json({ error: 'gone', message: 'the node is no longer defined — the old value is on the record, paste it by hand', before: r.before }, { status: 409 });
    if (changedSince(r, cur) && !body.force) return NextResponse.json({ error: 'stale', message: 'the node changed since this record — look again; revert with force to write the old value anyway', before: r.before }, { status: 409 });
    claimWrite(r.node, { by, silent: true }); // the revert is recorded below, not by the watcher
    const w = await editNode(scope, r.node, revertPatch(r));
    if (!w.ok) return NextResponse.json({ error: w.error, message: w.message }, { status: 422 });
    await mutateChange(scope.product.dir, id, c => { c.state = 'reverted'; c.revertedBy = by; c.revertedAt = now; });
    // the revert is a change of its own, accepted (req:exec.change-review)
    await saveChange(scope.product.dir, { ...r, id: randomBytes(5).toString('hex'), before: r.after, after: r.before, by, session: undefined, at: now, updatedAt: now, state: 'accepted', acceptedBy: by, acceptedAt: now, revertOf: r.id, impact: undefined });
    return NextResponse.json({ ok: true, state: 'reverted', line: w.line });
  }
  return NextResponse.json({ error: 'invalid', message: 'unknown action' }, { status: 422 });
}
