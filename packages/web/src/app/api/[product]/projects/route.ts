import { NextResponse } from 'next/server';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getProduct } from '@/lib/products';
import { loadScope, mainProject } from '@/lib/scope';
import { slugify } from '@/lib/templates';
import { writeAtomic } from '@/lib/write';

// GET → the product's projects, and which one is main (the rail's first; lib/scope#mainProject) so a caller with no
// project named — `wye import`, `wye deepen` — can default to it instead of hardcoding a slug.
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const main = mainProject(scope);
  return NextResponse.json({ main: main?.slug ?? '', projects: scope.projects.map(p => ({ slug: p.slug, title: p.meta.title, kind: p.meta.kind, status: p.meta.status })) });
}

// Create a project (or goal) in a product: POST { title, kind, description }
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { title?: string; kind?: string; description?: string };
  const title = (body.title ?? '').trim(); if (!title) return NextResponse.json({ error: 'invalid', message: 'title required' }, { status: 422 });
  const kind = body.kind === 'goal' ? 'goal' : 'project';
  const slug = slugify(title);
  const dir = path.join(p.dir, 'projects', slug);
  try { await access(dir); return NextResponse.json({ error: 'conflict', message: `${slug} exists` }, { status: 409 }); } catch { /* new */ }
  await mkdir(path.join(dir, 'docs'), { recursive: true });
  await writeAtomic(path.join(dir, '_project.md'), `---\ntitle: ${title}\nkind: ${kind}\nstatus: proposed\nicon: ${kind === 'goal' ? '🎯' : '📁'}\ndescription: ${body.description ?? ''}\n---\n`);
  return NextResponse.json({ ok: true, slug });
}
