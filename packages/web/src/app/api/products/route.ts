import { NextResponse } from 'next/server';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, listProducts } from '@/lib/products';
import { slugify } from '@/lib/templates';
import { createProduct } from '@/lib/product-create';

export async function GET() { return NextResponse.json({ products: (await listProducts()).map(p => ({ slug: p.slug, ...p.meta })) }); }

// Create a product: POST { title, description, icon }
export async function POST(req: Request) {
  const body = (await req.json()) as { title?: string; description?: string; icon?: string };
  const title = (body.title ?? '').trim(); if (!title) return NextResponse.json({ error: 'invalid', message: 'title required' }, { status: 422 });
  const slug = slugify(title);
  try { await access(path.join(DATA_ROOT, 'products', slug)); return NextResponse.json({ error: 'conflict', message: `${slug} exists` }, { status: 409 }); } catch { /* new */ }
  await createProduct({ slug, title, description: body.description, icon: body.icon });
  return NextResponse.json({ ok: true, slug });
}
