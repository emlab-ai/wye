import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Rail } from '@/components/Rail';
import { PeekProvider } from '@/components/PeekProvider';
import { Shell } from '@/components/Shell';
import { TopBar, type DocMeta } from '@/components/TopBar';
import { LiveRefresh } from '@/components/LiveRefresh';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { listProducts } from '@/lib/products';
import { loadScope, treeFor } from '@/lib/scope';
import { loadMarkdown } from '@/lib/load';
import { outline, splitDocument, docRoute, type DocNode } from '@/lib/doc';
import { REPO_ROOT } from '@/lib/products';
import type { TreeItem } from '@/components/DocTree';

export default async function ProductLayout({ children, params }: { children: ReactNode; params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const products = await listProducts();
  const icons = new Map<string, string>(); const outlines = new Map<string, { level: 2 | 3; text: string; slug: string }[]>();
  await Promise.all(scope.graph.modules.map(async m => { try { const md = await loadMarkdown(REPO_ROOT, m.file); icons.set(m.file, splitDocument(md).frontmatter.icon ?? ''); outlines.set(m.file, outline(md)); } catch { /* file gone */ } }));
  const toItem = (d: DocNode): TreeItem => ({ slug: d.slug, title: d.title, icon: icons.get(d.file) || defaultIcon(d.slug), project: docRoute(d.file)?.project ?? '', children: d.children.map(toItem) });
  const projects = scope.projects.map(p => { const t = treeFor(scope, p.slug); return { slug: p.slug, title: p.meta.title, icon: p.meta.icon || (p.meta.kind === 'goal' ? '🎯' : '📁'), kind: p.meta.kind, status: p.meta.status, main: t.main?.slug ?? '', roots: t.roots.map(toItem), docs: [...t.byFile.values()].filter(d => d.file.includes(`/projects/${p.slug}/docs/`)).map(d => ({ slug: d.slug, title: d.title })) }; });
  const headings = scope.graph.modules.flatMap(m => (outlines.get(m.file) ?? []).map(h => ({ doc: m.file, slug: h.slug, text: h.text })));
  // every document with its parent and last edit, for the top bar's breadcrumbs
  const docs: Record<string, DocMeta> = {};
  const walk = async (d: DocNode, parent?: string) => { const r = docRoute(d.file); let mtime = ''; try { mtime = (await stat(path.join(REPO_ROOT, d.file))).mtime.toISOString(); } catch { /* gone */ } docs[d.slug] = { slug: d.slug, title: d.title, icon: icons.get(d.file) || defaultIcon(d.slug), project: r?.project ?? '', parent, mtime }; for (const c of d.children) await walk(c, d.slug); };
  for (const p of scope.projects) for (const r of treeFor(scope, p.slug).roots) await walk(r);
  return (
    <PeekProvider product={scope.product.slug} index={scope.index}>
      <Shell>
        <Rail products={products.map(p => ({ slug: p.slug, title: p.meta.title, icon: p.meta.icon }))} product={{ slug: scope.product.slug, title: scope.product.meta.title, icon: scope.product.meta.icon }} projects={projects} headings={headings} />
        <LiveRefresh product={scope.product.slug} />
        <main className="content"><TopBar product={{ slug: scope.product.slug, title: scope.product.meta.title, icon: scope.product.meta.icon }} docs={docs} />{children}</main>
      </Shell>
    </PeekProvider>
  );
}

function defaultIcon(slug: string): string {
  if (/prd|requirement/.test(slug)) return '📋';
  if (/dev|design|arch/.test(slug)) return '🛠️';
  if (/test/.test(slug)) return '🧪';
  if (/plan/.test(slug)) return '🗺️';
  if (/project/.test(slug)) return '🏠';
  return '📄';
}
