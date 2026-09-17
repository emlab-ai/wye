import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadScope } from '@/lib/scope';
import { typeBySlug, isBaseType } from '@/lib/types';
import { REPO_ROOT } from '@/lib/products';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { newInstanceCard, appendCard } from '@/lib/instances';

// POST { slug, title? } → appends a `<type>:<slug>` card (the type's required properties as empty keys) to the type's
// home document — `home:` on the type card, else the document that declares it — and rebuilds the graph.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug: typeSlug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const t = typeBySlug(scope.graph, typeSlug); if (!t) return NextResponse.json({ error: 'not_found', message: 'unknown type' }, { status: 404 });
  const body = (await req.json()) as { slug?: string; title?: string };
  const slug = (body.slug ?? '').trim();
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(slug)) return NextResponse.json({ error: 'invalid', message: 'slug must be lowercase letters, digits, dots or dashes' }, { status: 422 });
  const id = `${typeSlug}:${slug}`;
  if (scope.idx.byId.get(id)?.defined) return NextResponse.json({ error: 'conflict', message: `${id} already exists` }, { status: 409 });
  const file = t.home ? scope.graph.modules.find(m => m.id === t.home || m.file.endsWith('/' + t.home.replace(/^module:/, '') + '.md'))?.file : (isBaseType(t) ? '' : t.file);
  if (!file) return NextResponse.json({ error: 'invalid', message: 'the type has no home document' }, { status: 422 });
  const abs = path.join(REPO_ROOT, file);
  await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    await writeAtomic(abs, appendCard(md, newInstanceCard(t, id, body.title ?? '')));
  });
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, id, file });
}
