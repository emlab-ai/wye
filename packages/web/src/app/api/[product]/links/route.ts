import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { jevClient } from '@/lib/jev';
import { linksFor } from '@/lib/links';

// POST { blocks: [{ key, text, linked }] } → { links: { [key]: ids } } — the ids Jev is sure each block is about
// (Jev auto-linking design §3), judged over the local search's candidates, cached by text. {} without a key.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const c = await jevClient(); if (!c.enabled) return NextResponse.json({ links: {} });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { blocks?: { key: string; text: string; linked?: string[] }[] };
  const blocks = (body.blocks ?? []).filter(b => b && typeof b.key === 'string' && typeof b.text === 'string').slice(0, 40).map(b => ({ key: b.key, text: b.text, linked: b.linked ?? [] }));
  return NextResponse.json({ links: await linksFor(scope.product.dir, scope.graph, blocks, c) });
}
