import { NextResponse } from 'next/server';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, listProducts } from '@/lib/products';
import { slugify } from '@/lib/templates';
import { writeAtomic } from '@/lib/write';

export async function GET() { return NextResponse.json({ products: (await listProducts()).map(p => ({ slug: p.slug, ...p.meta })) }); }

// Create a product: POST { title, description, icon }
export async function POST(req: Request) {
  const body = (await req.json()) as { title?: string; description?: string; icon?: string };
  const title = (body.title ?? '').trim(); if (!title) return NextResponse.json({ error: 'invalid', message: 'title required' }, { status: 422 });
  const slug = slugify(title);
  const dir = path.join(DATA_ROOT, 'products', slug);
  try { await access(dir); return NextResponse.json({ error: 'conflict', message: `${slug} exists` }, { status: 409 }); } catch { /* new */ }
  await mkdir(path.join(dir, 'projects'), { recursive: true });
  await mkdir(path.join(dir, 'inbox'), { recursive: true });
  await writeAtomic(path.join(dir, '_product.md'), `---\ntitle: ${title}\nicon: ${body.icon ?? '📦'}\ndescription: ${body.description ?? ''}\n---\n`);
  return NextResponse.json({ ok: true, slug });
}
