import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Rail } from '@/components/Rail';
import { SYSTEM_VIEWS, ensureViewPages, viewPageId } from '@/lib/pr-docs';
import { PeekProvider } from '@/components/PeekProvider';
import { Shell } from '@/components/Shell';
import { TopBar, type DocMeta } from '@/components/TopBar';
import { LiveRefresh } from '@/components/LiveRefresh';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { listProducts } from '@/lib/products';
import { loadScope, treeFor } from '@/lib/scope';
import { isBaseType, isImplicit } from '@/lib/types';
import { loadMarkdown } from '@/lib/load';
import { outline, splitDocument, docRoute, type DocNode } from '@/lib/doc';
import { REPO_ROOT } from '@/lib/products';
import type { TreeItem } from '@/components/DocTree';
import type { PrItem } from '@/components/PrFolder';
import { prsPageId } from '@/lib/pr-doc';
import { waitingReasons } from '@/lib/dispatch';

export default async function ProductLayout({ children, params }: { children: ReactNode; params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const products = await listProducts();
  const fm = new Map<string, Record<string, string>>(); const outlines = new Map<string, { level: 2 | 3; text: string; slug: string }[]>();
  await Promise.all(scope.graph.modules.map(async m => { try { const md = await loadMarkdown(REPO_ROOT, m.file); fm.set(m.file, splitDocument(md).frontmatter); outlines.set(m.file, outline(md)); } catch { /* file gone */ } }));
  const icons = { get: (file: string) => fm.get(file)?.icon ?? '' };
  const toItem = (d: DocNode): TreeItem => ({ slug: d.slug, node: d.module.id, title: d.title, icon: icons.get(d.file) || defaultIcon(d.slug), project: docRoute(d.file)?.project ?? '', children: d.children.map(toItem) });
  // the project's PRs page is a system folder (rule:prs-folder): it and its sub-documents leave the Documents
  // tree, and the requests go to the rail's PRs folder, every project together, newest first
  const prs: PrItem[] = [];
  // the system view pages (Goals, Work) live in the project that holds PRs (else the first) and leave the tree too
  const viewProject = scope.projects.find(p => scope.graph.modules.some(m => m.id === prsPageId(p.slug))) ?? scope.projects[0];
  if (viewProject) { try { await ensureViewPages(viewProject); } catch { /* read-only tree */ } }
  const views = viewProject ? SYSTEM_VIEWS.map(v => ({ slug: v.slug, title: v.title, icon: v.icon, project: viewProject.slug })) : [];
  const viewIds = new Set(viewProject ? SYSTEM_VIEWS.map(v => viewPageId(viewProject.slug, v.slug)) : []);
  const withoutPrs = (items: DocNode[], project: string): DocNode[] => items.filter(d => {
    if (viewIds.has(d.module.id)) return false;
    if (d.module.id !== prsPageId(project)) return true;
    for (const c of d.children) { const f = fm.get(c.file) ?? {}; prs.push({ slug: c.slug, project, title: c.title, icon: icons.get(c.file) || defaultIcon(c.slug), status: f.status ?? '', started: f.started ?? '', waiting: waitingReasons(scope.product.slug)[`${scope.product.slug}/${project}/${c.slug}`] }); }
    return false;
  }).map(d => ({ ...d, children: withoutPrs(d.children, project) }));
  const projects = scope.projects.map(p => { const t = treeFor(scope, p.slug); return { slug: p.slug, title: p.meta.title, icon: p.meta.icon || (p.meta.kind === 'goal' ? '🎯' : '📁'), kind: p.meta.kind, status: p.meta.status, main: t.main?.slug ?? '', roots: withoutPrs(t.roots, p.slug).map(toItem), docs: [...t.byFile.values()].filter(d => d.file.includes(`/projects/${p.slug}/docs/`)).map(d => ({ slug: d.slug, title: d.title })) }; });
  prs.sort((a, b) => b.started.localeCompare(a.started) || a.title.localeCompare(b.title));
  const headings = scope.graph.modules.flatMap(m => (outlines.get(m.file) ?? []).map(h => ({ doc: m.file, slug: h.slug, text: h.text })));
  // every document with its parent and last edit, for the top bar's breadcrumbs
  const docs: Record<string, DocMeta> = {};
  const walk = async (d: DocNode, parent?: string) => { const r = docRoute(d.file); let mtime = ''; try { mtime = (await stat(path.join(REPO_ROOT, d.file))).mtime.toISOString(); } catch { /* gone */ } docs[d.slug] = { slug: d.slug, node: d.module.id, title: d.title, icon: icons.get(d.file) || defaultIcon(d.slug), project: r?.project ?? '', parent, mtime }; for (const c of d.children) await walk(c, d.slug); };
  for (const p of scope.projects) for (const r of treeFor(scope, p.slug).roots) await walk(r);
  // the product's own types with the columns a table of them shows: every declared property but the root type's
  const ownTypes = (scope.graph.types ?? []).filter(t => !isBaseType(t)).map(t => ({ slug: t.slug, cols: t.props.filter(p => !isImplicit(p)).map(p => ({ name: p.name, type: p.type, enum: p.enum, ref: p.ref, required: p.required })) }));
  return (
    <PeekProvider product={scope.product.slug} index={scope.index} kinds={scope.graph.kinds} types={ownTypes}>
      <Shell>
        <Rail products={products.map(p => ({ slug: p.slug, title: p.meta.title, icon: p.meta.icon }))} product={{ slug: scope.product.slug, title: scope.product.meta.title, icon: scope.product.meta.icon }} projects={projects} prs={prs} views={views} headings={headings} />
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
  if (/^pr-|plan/.test(slug)) return '🗺️';
  if (/project/.test(slug)) return '🏠';
  return '📄';
}
