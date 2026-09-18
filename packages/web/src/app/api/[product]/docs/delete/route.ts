import { NextResponse } from 'next/server';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { loadScope } from '@/lib/scope';
import { documentTree, docRoute } from '@/lib/doc';
import { REPO_ROOT } from '@/lib/products';
import { subtree } from '@/lib/doc-ops';
import { rebuild } from '@/lib/write';

// Delete a document from the tree: POST { id } → { removed, dangling, href }. The document and every document under
// it go (decision:wf2.tree-delete-subtree); `dangling` counts the references from the remaining documents to nodes
// the removed pages defined; `href` is the parent page (or the product) for a person who was on a removed page.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { id?: string };
  const tree = documentTree(scope.graph);
  const doc = [...tree.byFile.values()].find(d => d.module.id === body.id); if (!doc) return NextResponse.json({ error: 'not_found', message: 'document not found' }, { status: 404 });
  const gone = subtree(doc); const files = new Set(gone.map(d => d.file));
  const fileOf = new Map(scope.graph.nodes.map(n => [n.id, n.file]));
  const dangling = scope.graph.edges.filter(e => files.has(fileOf.get(e.to) ?? '') && !files.has(fileOf.get(e.from) ?? '') && fileOf.has(e.from)).length;
  const parent = [...tree.byFile.values()].find(d => d.children.includes(doc));
  const pr = parent ? docRoute(parent.file) : null;
  for (const d of gone) await unlink(path.join(REPO_ROOT, d.file));
  await rebuild(scope.product.dir);
  return NextResponse.json({ ok: true, removed: gone.map(d => d.module.id), dangling, href: pr ? `/${product}/${pr.project}/d/${pr.doc}` : `/${product}` });
}
