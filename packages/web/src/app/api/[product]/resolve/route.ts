import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { resolveLink } from '@/lib/resolve';

// What a link points at, for agents: GET ?link=<url | path#anchor | node id>
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const link = new URL(req.url).searchParams.get('link') ?? '';
  const out = await resolveLink(scope, link);
  return out ? NextResponse.json(out) : NextResponse.json({ error: 'not_found', message: 'no document for that link' }, { status: 404 });
}
