import { NextResponse } from 'next/server';
import { readFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { loadScope } from '@/lib/scope';
import { documentTree, docRoute, type DocNode } from '@/lib/doc';
import { REPO_ROOT } from '@/lib/products';
import { patchFrontmatter, rebuild, writeAtomic } from '@/lib/write';

// Move a document in the tree: POST { id: "module:<slug>", parent: "module:<slug>" | null, before?: id, after?: id }.
// Sets the document's part-of (or clears it for top level), moves the file into the parent's project when they
// differ, and renumbers `order:` among the new siblings so before/after sticks.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { id?: string; parent?: string | null; before?: string; after?: string };
  const tree = documentTree(scope.graph);
  const byId = new Map([...tree.byFile.values()].map(d => [d.module.id, d]));
  const doc = body.id ? byId.get(body.id) : undefined; if (!doc) return NextResponse.json({ error: 'not_found', message: 'document not found' }, { status: 404 });
  const parent = body.parent ? byId.get(body.parent) : null; if (body.parent && !parent) return NextResponse.json({ error: 'not_found', message: 'parent not found' }, { status: 404 });
  const descends = (d: DocNode, id: string): boolean => d.module.id === id || d.children.some(c => descends(c, id));
  if (parent && descends(doc, parent.module.id)) return NextResponse.json({ error: 'invalid', message: 'a document cannot be moved under itself' }, { status: 422 });
  // 1. the file may have to move to the parent's project
  let file = doc.file;
  const targetProject = parent ? docRoute(parent.file)?.project : docRoute(doc.file)?.project;
  const ownProject = docRoute(doc.file)?.project;
  if (targetProject && ownProject && targetProject !== ownProject) {
    const pr = scope.projects.find(p => p.slug === targetProject); if (!pr) return NextResponse.json({ error: 'not_found', message: 'target project not found' }, { status: 404 });
    const dest = path.join(pr.docsDir, path.basename(doc.file));
    try { await access(dest); return NextResponse.json({ error: 'conflict', message: `${path.basename(doc.file)} already exists in ${targetProject}` }, { status: 409 }); } catch { /* free */ }
    await rename(path.join(REPO_ROOT, doc.file), dest);
    file = path.relative(REPO_ROOT, dest);
  }
  // 2. parent link
  const md = await readFile(path.join(REPO_ROOT, file), 'utf8');
  const r1 = patchFrontmatter(md, { 'part-of': parent ? parent.module.id : null });
  if (r1.error) return NextResponse.json({ error: 'invalid', message: 'document has no frontmatter' }, { status: 422 });
  // 3. order among the new siblings
  const siblings = (parent ? parent.children : tree.roots).filter(d => d.module.id !== doc.module.id);
  let at = siblings.length;
  if (body.before) { const i = siblings.findIndex(d => d.module.id === body.before); if (i >= 0) at = i; }
  else if (body.after) { const i = siblings.findIndex(d => d.module.id === body.after); if (i >= 0) at = i + 1; }
  const ordered = [...siblings.slice(0, at), doc, ...siblings.slice(at)];
  let out = r1.md;
  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i]; const order = String((i + 1) * 10);
    if (d.module.id === doc.module.id) { out = patchFrontmatter(out, { order }).md; continue; }
    const cur = d.module.body.match(/^order:\s*(-?\d+)/m)?.[1];
    if (cur !== order) { const smd = await readFile(path.join(REPO_ROOT, d.file), 'utf8'); const r = patchFrontmatter(smd, { order }); if (!r.error) await writeAtomic(path.join(REPO_ROOT, d.file), r.md); }
  }
  await writeAtomic(path.join(REPO_ROOT, file), out);
  await rebuild(scope.product.dir);
  const route = docRoute(file);
  return NextResponse.json({ ok: true, file, href: route ? `/${product}/${route.project}/d/${route.doc}` : null });
}
