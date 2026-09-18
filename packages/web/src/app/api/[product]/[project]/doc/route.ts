import { NextResponse } from 'next/server';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope, treeFor } from '@/lib/scope';
import { REPO_ROOT } from '@/lib/products';
import { instantiate, slugify, TEMPLATES } from '@/lib/templates';
import { rebuild, writeAtomic } from '@/lib/write';

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
  const kind = (body.type ?? 'module').trim();
  const type = (scope.graph.types ?? []).find(t => t.slug === kind);
  if (!type) return NextResponse.json({ error: 'invalid', message: `unknown type ${kind}` }, { status: 422 });
  const tree = treeFor(scope, project);
  const parentDoc = body.parent ? [...tree.byFile.values()].find(x => x.slug === body.parent) : undefined;
  const slug = slugify(title);
  const abs = path.join(scope.project.docsDir, `${slug}.md`);
  try { await access(abs); return NextResponse.json({ error: 'conflict', message: `${slug}.md exists` }, { status: 409 }); } catch { /* new */ }
  const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs', `${template}.md`), 'utf8');
  let md = instantiate(tpl, { title, slug, parent: parentDoc ? parentDoc.module.id : '', date: new Date().toISOString().slice(0, 10), kind, props: type.props.filter(p => p.required && !['title', 'status'].includes(p.name)).map(p => p.name) });
  if (!parentDoc) md = md.replace(/^part-of: \n/m, '').replace(/\npart-of: $/m, '');
  // a typed page's card is its frontmatter (rule:page-node-line); the template's module card would shadow it
  if (kind !== 'module') md = md.replace(new RegExp('\\n```yaml\\nid: ' + kind + ':' + slug + '\\n[\\s\\S]*?\\n```\\n'), '\n');
  await mkdir(scope.project.docsDir, { recursive: true });
  await writeAtomic(abs, md);
  const built = await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, slug, node: `${kind}:${slug}`, rebuilt: built.code === 0 });
}
