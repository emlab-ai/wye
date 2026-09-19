import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { explain } from '@/lib/explain';

// op:api.explain (req:exec.explain-anywhere) — POST { id } | { text } → { explanation, refs }: one librarian turn,
// the current state around a node or a text with the nodes as tags; nothing written.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { id?: string; text?: string };
  if (body.id && !scope.idx.byId.get(body.id)?.defined) return NextResponse.json({ error: 'not_found', message: `${body.id} is not defined` }, { status: 404 });
  if (!body.id && !body.text?.trim()) return NextResponse.json({ error: 'invalid', message: 'id or text required' }, { status: 422 });
  try { return NextResponse.json(await explain(scope, body)); } catch (e) { return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
