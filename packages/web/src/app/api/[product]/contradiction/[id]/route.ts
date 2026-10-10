import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { askOnContradiction, resolveContradiction, sidesOf, type Keep } from '@/lib/contradiction';

// op:api.contradiction (decision:waterfall.contradiction-resolves-into-a-decision) — GET → the two sides and the
// decisions behind each; POST { action: 'resolve', keep: a | b | both | none, why, title? } → the decision written,
// the losing side and its decisions superseded, the contradiction resolved; POST { action: 'ask', q } → a question
// block about both sides, the contradiction still open.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const c = scope.idx.byId.get(decodeURIComponent(id));
  if (!c?.defined || c.kind !== 'contradiction') return NextResponse.json({ error: 'not_found', message: 'not a contradiction' }, { status: 404 });
  return NextResponse.json({ id: c.id, status: c.status, sides: sidesOf(scope.idx, c) });
}
export async function POST(req: Request, { params }: { params: Promise<{ product: string; id: string }> }) {
  const { product, id } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; keep?: Keep; why?: string; title?: string; q?: string; by?: string };
  const by = b.by ?? req.headers.get('x-wf-by') ?? undefined;
  if (b.action === 'ask') {
    const r = await askOnContradiction(scope, decodeURIComponent(id), String(b.q ?? ''), by);
    return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
  }
  if (b.action === 'resolve') {
    if (!['a', 'b', 'both', 'none'].includes(b.keep ?? '')) return NextResponse.json({ error: 'invalid', message: 'keep must be a, b, both or none' }, { status: 422 });
    const r = await resolveContradiction(scope, decodeURIComponent(id), { keep: b.keep!, why: String(b.why ?? ''), title: b.title, by });
    return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
  }
  return NextResponse.json({ error: 'invalid', message: 'action must be resolve or ask' }, { status: 422 });
}
