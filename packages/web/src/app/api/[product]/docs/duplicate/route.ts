import { NextResponse } from 'next/server';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope } from '@/lib/scope';
import { documentTree, docRoute } from '@/lib/doc';
import { REPO_ROOT } from '@/lib/products';
import { copySlug, duplicateMarkdown } from '@/lib/doc-ops';
import { patchFrontmatter, rebuild, writeAtomic } from '@/lib/write';

// Duplicate a document from the tree: POST { id } → { slug, node, href }. The copy sits next to the original in the
// same project (<slug>-copy.md, title "… (copy)", same part-of, order just after), every id the document defines
// takes the copy's suffix so the copy is a page of its own (rule:tree-menu).
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { id?: string };
  const tree = documentTree(scope.graph);
  const doc = [...tree.byFile.values()].find(d => d.module.id === body.id); if (!doc) return NextResponse.json({ error: 'not_found', message: 'document not found' }, { status: 404 });
  const route = docRoute(doc.file); if (!route) return NextResponse.json({ error: 'invalid', message: 'not a project document' }, { status: 422 });
  const taken = new Set([...tree.byFile.values()].filter(d => docRoute(d.file)?.project === route.project).map(d => d.slug));
  const slug = copySlug(doc.slug, taken);
  const dest = path.join(REPO_ROOT, path.dirname(doc.file), `${slug}.md`);
  try { await access(dest); return NextResponse.json({ error: 'conflict', message: `${slug}.md exists` }, { status: 409 }); } catch { /* free */ }
  const ids = scope.graph.nodes.filter(n => n.defined && n.file === doc.file).map(n => n.id);
  const md = await readFile(path.join(REPO_ROOT, doc.file), 'utf8');
  let out = duplicateMarkdown(md, { ids, slug: doc.slug, newSlug: slug });
  const order = doc.module.body.match(/^order:\s*(-?\d+)/m)?.[1];
  if (order) { const r = patchFrontmatter(out, { order: String(Number(order) + 5) }); if (!r.error) out = r.md; }
  await writeAtomic(dest, out);
  await rebuild(scope.product.dir);
  const kind = doc.module.id.split(':')[0];
  return NextResponse.json({ ok: true, slug, node: `${kind}:${slug}`, href: `/${product}/${route.project}/d/${slug}` });
}
