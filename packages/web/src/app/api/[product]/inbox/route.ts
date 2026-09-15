import { NextResponse } from 'next/server';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getProduct } from '@/lib/products';
import { slugify } from '@/lib/templates';
import { writeAtomic } from '@/lib/write';

// Add a note to the inbox: POST { title?, text, from? } → writes inbox/<timestamp>-<slug>.md
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { title?: string; text?: string; from?: string };
  const text = (body.text ?? '').trim(); if (!text) return NextResponse.json({ error: 'invalid', message: 'text required' }, { status: 422 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `${stamp}-${slugify(body.title || text.slice(0, 40))}.md`;
  const dir = path.join(p.dir, 'inbox'); await mkdir(dir, { recursive: true });
  await writeAtomic(path.join(dir, name), `---\ntitle: ${body.title ?? ''}\nfrom: ${body.from ?? 'ui'}\nadded: ${new Date().toISOString()}\n---\n\n${text}\n`);
  return NextResponse.json({ ok: true, name });
}
