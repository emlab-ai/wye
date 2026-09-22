import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { TEMPLATES } from '@/lib/templates';
import { createDocFromTemplate } from '@/lib/doc-create';
import { rebuild } from '@/lib/write';

// Create a page in a project from a template: POST { title, template, parent, type? } → { slug }. `type` is the page's
// kind (module by default, req:wf2.page.create-typed): the node line becomes <type>:<slug> and the type's required
// properties are written as empty keys.
export async function POST(req: Request, { params }: { params: Promise<{ product: string; project: string }> }) {
  const { product, project } = await params;
  const scope = await loadScope(product, project); if (!scope || !scope.project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { title?: string; template?: string; parent?: string; type?: string };
  const title = (body.title ?? '').trim();
  const template = (body.template ?? 'blank') as typeof TEMPLATES[number];
  if (!title) return NextResponse.json({ error: 'invalid', message: 'title required' }, { status: 422 });
  if (!TEMPLATES.includes(template)) return NextResponse.json({ error: 'invalid', message: 'unknown template' }, { status: 422 });
  const made = await createDocFromTemplate(scope, scope.project, { title, template, parent: body.parent, kind: body.type });
  if (!made.ok) return NextResponse.json({ error: made.error, message: made.message }, { status: made.error === 'conflict' ? 409 : 422 });
  const built = await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, slug: made.slug, node: made.node, rebuilt: built.code === 0 });
}
