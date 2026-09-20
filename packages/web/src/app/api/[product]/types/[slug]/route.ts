import { NextResponse } from 'next/server';
import path from 'node:path';
import { access, mkdir, readFile } from 'node:fs/promises';
import { loadScope } from '@/lib/scope';
import { typeBySlug, isBaseType } from '@/lib/types';
import { REPO_ROOT } from '@/lib/products';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { newInstanceCard, appendCard, pluralTitle, collectionDoc, appendRow, hasTable, newInstanceRow } from '@/lib/instances';
import { instantiate, slugify } from '@/lib/templates';
import { docRoute } from '@/lib/doc';
import { setTypeProps, type OwnProp } from '@/lib/type-edit';

// POST { slug, title?, home? } → a new instance, and where it went. A product type's instance is a row of the type's
// collection document (decision:ontology.collection-document, req:ontology.instance-home): the document `home:` on the
// type card names, else one titled with the type's plural, created in the project that declares the type on the first
// instance and written as `home:` so every later path lands there. A base kind (goal, decision, task…) has no
// collection: its card goes to `home` — the page the caller is on (req:wf2.editor.entity-from-text). The graph rebuilds.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; slug: string }> }) {
  const { product, slug: typeSlug } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const t = typeBySlug(scope.graph, typeSlug); if (!t) return NextResponse.json({ error: 'not_found', message: 'unknown type' }, { status: 404 });
  const body = (await req.json()) as { slug?: string; title?: string; home?: string };
  const slug = (body.slug ?? '').trim();
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(slug)) return NextResponse.json({ error: 'invalid', message: 'slug must be lowercase letters, digits, dots or dashes' }, { status: 422 });
  const id = `${typeSlug}:${slug}`;
  if (scope.idx.byId.get(id)?.defined) return NextResponse.json({ error: 'conflict', message: `${id} already exists` }, { status: 409 });
  const moduleFile = (ref: string) => scope.graph.modules.find(m => m.id === ref || m.file.endsWith('/' + ref.replace(/^[a-z-]+:/, '') + '.md'))?.file ?? '';
  let file = t.home ? moduleFile(t.home) : '';
  let created = false;
  if (!file && !isBaseType(t)) {
    // the first instance: the collection document in the declaring project (an existing document of that slug is
    // taken as it is), then `home:` on the type card
    const project = scope.projects.find(p => p.slug === docRoute(t.file)?.project) ?? scope.projects[0];
    if (!project) return NextResponse.json({ error: 'invalid', message: 'the product has no project to hold the collection document' }, { status: 422 });
    const title = pluralTitle(t), docSlug = slugify(title);
    file = path.posix.join(project.docsRel, `${docSlug}.md`);
    const abs = path.join(REPO_ROOT, file);
    try { await access(abs); } catch {
      const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs/blank.md'), 'utf8');
      const md = instantiate(tpl, { title, slug: docSlug, parent: '', date: new Date().toISOString().slice(0, 10) }).replace(/^part-of: \n/m, '').replace(/\npart-of: $/m, '');
      await mkdir(project.docsDir, { recursive: true });
      await writeAtomic(abs, collectionDoc(md, typeSlug));
      created = true;
    }
    const homeId = scope.graph.modules.find(m => m.file === file)?.id ?? `module:${docSlug}`;
    const typeAbs = path.join(REPO_ROOT, t.file);
    await withFileLock(typeAbs, async () => {
      const out = setTypeProps(await readFile(typeAbs, 'utf8'), t.id, null, { home: homeId });
      if (!out.error) await writeAtomic(typeAbs, out.md);
    });
  }
  if (!file && body.home) file = scope.graph.modules.find(m => m.file.endsWith(`/projects/${body.home!.split('/')[0]}/docs/${body.home!.split('/').slice(1).join('/')}.md`))?.file ?? '';
  if (!file) return NextResponse.json({ error: 'invalid', message: 'the type has no home document — say where it goes' }, { status: 422 });
  const abs = path.join(REPO_ROOT, file);
  let row = false;
  await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    // a row of the type's table when the document has one (a product type's collection always does), else a card
    row = created || hasTable(md, typeSlug);
    await writeAtomic(abs, row ? appendRow(md, typeSlug, newInstanceRow(id, body.title ?? '')) : appendCard(md, newInstanceCard(t, id, body.title ?? '')));
  });
  await rebuild(scope.product.dir);
  const route = docRoute(file);
  const doc = route ? { ...route, title: scope.graph.modules.find(m => m.file === file)?.title || (created ? pluralTitle(t) : route.doc) } : null;
  return NextResponse.json({ ok: true, id, file, doc, created, row });
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
