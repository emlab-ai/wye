import { NextResponse } from 'next/server';
import { loadScope, treeFor } from '@/lib/scope';
import { docRoute, isSystemFile, type DocNode } from '@/lib/doc';

// GET → { roots: [{ slug, title, icon, project, children }] } — the product's documents as the rail's tree, without
// the pages the app writes (.wye/). What the rail asks for when a vault that is not on screen is opened in place
// (rule:vault-roots).
type Item = { slug: string; title: string; icon: string; project: string; children: Item[] };
const icon = (slug: string) => /prd|requirement/.test(slug) ? '📋' : /dev|design|arch/.test(slug) ? '🛠️' : /test/.test(slug) ? '🧪' : /plan/.test(slug) ? '🗺️' : /project/.test(slug) ? '🏠' : '📄';
export async function GET(_req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const item = (d: DocNode): Item => ({ slug: d.slug, title: d.title, icon: icon(d.slug), project: docRoute(d.file)?.project ?? '', children: d.children.filter(c => !isSystemFile(c.file)).map(item) });
  const roots = scope.projects.flatMap(p => treeFor(scope, p.slug).roots.filter(d => !isSystemFile(d.file)).map(item));
  return NextResponse.json({ roots }, { headers: { 'cache-control': 'no-store' } });
}
