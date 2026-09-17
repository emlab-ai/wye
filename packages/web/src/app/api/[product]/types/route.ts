import { NextResponse } from 'next/server';
import path from 'node:path';
import { access, mkdir, readFile } from 'node:fs/promises';
import { loadScope } from '@/lib/scope';
import { typeBySlug, ontologyDoc } from '@/lib/types';
import { REPO_ROOT } from '@/lib/products';
import { instantiate } from '@/lib/templates';
import { writeAtomic, withFileLock, rebuild } from '@/lib/write';
import { newTypeCard, appendTypeCard } from '@/lib/type-edit';

// POST { slug, extends?, purpose?, doc?, project? } → appends a `type:<slug>` card (extends, purpose) to the product's
// ontology document — `doc` when given, else ontology.md, else the document that declares its types, else a new
// ontology.md in `project` (the first project when none) — and rebuilds the graph. Properties come after, through PUT
// on the type.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { slug?: string; extends?: string; purpose?: string; doc?: string; project?: string };
  const slug = (body.slug ?? '').trim();
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) return NextResponse.json({ error: 'invalid', message: 'slug must be lowercase letters, digits or dashes' }, { status: 422 });
  const id = `type:${slug}`;
  if (typeBySlug(scope.graph, slug) || scope.idx.byId.get(id)?.defined) return NextResponse.json({ error: 'conflict', message: `${id} already exists` }, { status: 409 });
  const parent = (body.extends ?? 'type:node').trim();
  if (!typeBySlug(scope.graph, parent.replace(/^type:/, ''))) return NextResponse.json({ error: 'invalid', message: `${parent} is not a type` }, { status: 422 });

  let file = body.doc ? scope.graph.modules.find(m => m.file === body.doc)?.file : ontologyDoc(scope.graph);
  if (body.doc && !file) return NextResponse.json({ error: 'invalid', message: 'unknown document' }, { status: 422 });
  if (!file) {
    // no ontology yet: start one in the project
    const project = body.project ? scope.projects.find(p => p.slug === body.project) : scope.projects[0];
    if (!project) return NextResponse.json({ error: 'invalid', message: 'the product has no project to hold an ontology document' }, { status: 422 });
    file = path.posix.join(project.docsRel, 'ontology.md');
    const abs = path.join(REPO_ROOT, file);
    try { await access(abs); } catch {
      const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs/blank.md'), 'utf8');
      const md = instantiate(tpl, { title: 'Ontology', slug: 'ontology', parent: '', date: new Date().toISOString().slice(0, 10) }).replace(/^part-of: module:\n/m, '').replace(/\npart-of: module:$/m, '');
      await mkdir(project.docsDir, { recursive: true });
      await writeAtomic(abs, md);
    }
  }
  const abs = path.join(REPO_ROOT, file);
  await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    await writeAtomic(abs, appendTypeCard(md, newTypeCard(id, parent.startsWith('type:') ? parent : 'type:' + parent, body.purpose ?? '')));
  });
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, id, file });
}
