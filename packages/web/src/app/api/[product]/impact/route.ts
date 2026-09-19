import { NextResponse } from 'next/server';
import { whatIf } from '@/lib/impact-run';

// op:api.impact — POST { id, after, judge? } → the impact set of a hypothetical edit (req:exec.impact-for-agents,
// `wf impact <id> --after`): candidates with paths at once, verdicts from the model when judge is not false; nothing
// is written.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json()) as { id?: string; after?: string; judge?: boolean };
  if (!body.id || typeof body.after !== 'string') return NextResponse.json({ error: 'invalid', message: 'id and after required' }, { status: 422 });
  const r = await whatIf(product, body.id, body.after, { judge: body.judge !== false });
  if (!r) return NextResponse.json({ error: 'not_found', message: `${body.id} is not defined` }, { status: 404 });
  return NextResponse.json(r);
}
