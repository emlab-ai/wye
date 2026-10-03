import { NextResponse } from 'next/server';
import { applyCommitmentOp, type CommitmentOp } from '@/lib/ea/commitments';

// op:api.ea-commitment (task:ea.commitment-tracking) — POST { op: move | met | drop, id, to?, why?, on? } → the
// commitment moved (a move line kept under it, due and state set), met (met-on) or dropped (reason kept); a move or a
// drop without a reason is refused (422).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const b = await req.json().catch(() => ({})) as Partial<{ op: string; id: string; to: string; why: string; on: string }>;
  if (!b.id || !['move', 'met', 'drop'].includes(b.op ?? '')) return NextResponse.json({ error: 'invalid', message: 'op (move | met | drop) and id required' }, { status: 422 });
  const r = await applyCommitmentOp(product, { op: b.op, id: b.id, to: b.to ?? '', why: b.why ?? '', ...(b.on ? { on: b.on } : {}) } as CommitmentOp);
  if (!r.ok) return NextResponse.json({ error: 'invalid', message: r.message }, { status: r.status });
  return NextResponse.json(r);
}
