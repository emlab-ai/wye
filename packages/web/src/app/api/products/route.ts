import { NextResponse } from 'next/server';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT, listProducts } from '@/lib/products';
import { slugify } from '@/lib/templates';
import { createProduct } from '@/lib/product-create';
import { productFromCode } from '@/lib/product-from-code';

export async function GET() { return NextResponse.json({ products: (await listProducts()).map(p => ({ slug: p.slug, ...p.meta })) }); }

// Create a product: POST { title, description, icon, folder?, repo? } — with `folder`, the product's documents live in
// that folder (`root:` in its _product.md, lib/product-create) instead of the app's data; with `repo`, from that code folder the way `wye init`
// does (lib/product-from-code): `repo:` set, a first definition read from the folder, the graph built
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: string; description?: string; icon?: string; repo?: string; folder?: string };
  if (body.repo !== undefined) {
    try { const r = await productFromCode({ title: body.title ?? '', repo: body.repo, icon: body.icon, description: body.description }); return NextResponse.json({ ok: true, slug: r.slug }); }
    catch (e) { const m = e instanceof Error ? e.message : String(e); const code = m.split(':')[0]; return NextResponse.json({ error: code === 'conflict' ? 'conflict' : 'invalid', message: m.replace(/^\w+: /, '') }, { status: code === 'conflict' ? 409 : 422 }); }
  }
  const title = (body.title ?? '').trim(); if (!title) return NextResponse.json({ error: 'invalid', message: 'title required' }, { status: 422 });
  const slug = slugify(title);
  try { await access(path.join(DATA_ROOT, 'products', slug)); return NextResponse.json({ error: 'conflict', message: `${slug} exists` }, { status: 409 }); } catch { /* new */ }
  try { await createProduct({ slug, title, description: body.description, icon: body.icon, root: body.folder }); }
  catch (e) { const m = e instanceof Error ? e.message : String(e); return NextResponse.json({ error: 'invalid', message: m.replace(/^\w+: /, '') }, { status: 422 }); }
  return NextResponse.json({ ok: true, slug });
}
