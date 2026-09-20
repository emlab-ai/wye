import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadScope } from '@/lib/scope';
import { typeBySlug, isBaseType } from '@/lib/types';
import { REPO_ROOT } from '@/lib/products';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { newInstanceCard, appendCard } from '@/lib/instances';
import { setTypeProps, type OwnProp } from '@/lib/type-edit';

// POST { slug, title? } → appends a `<type>:<slug>` card (the type's required properties as empty keys) to the type's
// home document — `home:` on the type card, else the document that declares it — and rebuilds the graph.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug: typeSlug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const t = typeBySlug(scope.graph, typeSlug); if (!t) return NextResponse.json({ error: 'not_found', message: 'unknown type' }, { status: 404 });
  const body = (await req.json()) as { slug?: string; title?: string; home?: string };
  const slug = (body.slug ?? '').trim();
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(slug)) return NextResponse.json({ error: 'invalid', message: 'slug must be lowercase letters, digits, dots or dashes' }, { status: 422 });
  const id = `${typeSlug}:${slug}`;
  if (scope.idx.byId.get(id)?.defined) return NextResponse.json({ error: 'conflict', message: `${id} already exists` }, { status: 409 });
  // the home: the type's own, else the document the caller names (`home`: project/doc — an entity made from a
  // selection lands on the page the person is on, req:wf2.editor.entity-from-text), else the declaring document
  const named = body.home ? scope.graph.modules.find(m => m.file.endsWith(`/projects/${body.home!.split('/')[0]}/docs/${body.home!.split('/').slice(1).join('/')}.md`))?.file : '';
  const file = (t.home ? scope.graph.modules.find(m => m.id === t.home || m.file.endsWith('/' + t.home.replace(/^[a-z-]+:/, '') + '.md'))?.file : '') || named || (isBaseType(t) ? '' : t.file);
  if (!file) return NextResponse.json({ error: 'invalid', message: 'the type has no home document — say where it goes' }, { status: 422 });
  const abs = path.join(REPO_ROOT, file);
  await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    await writeAtomic(abs, appendCard(md, newInstanceCard(t, id, body.title ?? '')));
  });
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, id, file });
}

// PUT { props?: OwnProp[], scalars?: { purpose?, extends?, open? } } → rewrites the type card's props block and scalar
// keys in the document that declares it (base types are read-only), then rebuilds the graph.
export async function PUT(req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug: typeSlug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const t = typeBySlug(scope.graph, typeSlug); if (!t) return NextResponse.json({ error: 'not_found', message: 'unknown type' }, { status: 404 });
  if (isBaseType(t)) return NextResponse.json({ error: 'invalid', message: 'base types are declared in schema/base-ontology.md' }, { status: 422 });
  const body = (await req.json()) as { props?: OwnProp[]; scalars?: Record<string, string | null> };
  for (const p of body.props ?? []) if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(p.name.trim())) return NextResponse.json({ error: 'invalid', message: `property name "${p.name}" must be a word` }, { status: 422 });
  const abs = path.join(REPO_ROOT, t.file);
  const r = await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    const out = setTypeProps(md, t.id, body.props ?? null, body.scalars ?? {});
    if (!out.error) await writeAtomic(abs, out.md);
    return out;
  });
  if (r.error) return NextResponse.json({ error: r.error, message: 'type card not found in ' + t.file }, { status: 404 });
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, file: t.file });
}
