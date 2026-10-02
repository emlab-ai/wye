import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadScope } from '@/lib/scope';
import { typeBySlug, isBaseType } from '@/lib/types';
import { REPO_ROOT } from '@/lib/products';
import { writeAtomic, withFileLock, rebuild, patchFrontmatter } from '@/lib/write';
import { setTypeProps, type OwnProp } from '@/lib/type-edit';
import { addInstance, type InstanceInput } from '@/lib/instance-add';

// POST { slug, title?, home?, props? } → a new instance, and where it went (lib/instance-add).
export async function POST(req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug: typeSlug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await addInstance(scope, typeSlug, (await req.json()) as InstanceInput);
  if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
  return NextResponse.json(r);
}

// PUT { props?: OwnProp[], scalars?: { purpose?, extends?, open? } } → rewrites the type card's props block and scalar
// keys in the document that declares it (base types are read-only), then rebuilds the graph.
export async function PUT(req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug: typeSlug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const t = typeBySlug(scope.graph, typeSlug); if (!t) return NextResponse.json({ error: 'not_found', message: 'unknown type' }, { status: 404 });
  const body = (await req.json()) as { props?: OwnProp[]; scalars?: Record<string, string | null>; statuses?: string[] | null };
  // the type's statuses (decision:wf2.statuses-per-type): a base kind's are the product's own, in _product.md (null puts
  // the base list back); a product type's go on its card
  if ('statuses' in body) {
    const list = body.statuses === null ? null : (body.statuses ?? []).map(s => String(s).trim().toLowerCase()).filter(s => /^[a-z][a-z0-9-]*$/.test(s));
    if (list && !list.length) return NextResponse.json({ error: 'invalid', message: 'statuses: one word each, at least one' }, { status: 422 });
    const value = list ? `[${[...new Set(list)].join(', ')}]` : null;
    const abs = isBaseType(t) ? path.join(scope.product.dir, '_product.md') : path.join(REPO_ROOT, t.file);
    const r = await withFileLock(abs, async () => {
      const md = await readFile(abs, 'utf8');
      const out = isBaseType(t) ? patchFrontmatter(md, { [`statuses-${t.slug}`]: value }) : setTypeProps(md, t.id, null, { statuses: value });
      if (!out.error) await writeAtomic(abs, out.md);
      return out;
    });
    if (r.error) return NextResponse.json({ error: r.error, message: `could not write the statuses to ${path.relative(REPO_ROOT, abs)}` }, { status: 422 });
    await rebuild(scope.product.dir);
    return NextResponse.json({ ok: true, statuses: list });
  }
  if (isBaseType(t)) return NextResponse.json({ error: 'invalid', message: 'base types are declared in schema/base-ontology.md' }, { status: 422 });
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
