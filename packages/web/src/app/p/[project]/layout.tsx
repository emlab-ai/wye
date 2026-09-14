import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { type TreeItem } from '@/components/DocTree';
import { Rail } from '@/components/Rail';
import { PeekProvider } from '@/components/PeekProvider';
import { getProject } from '@/lib/projects';
import { loadGraph, loadMarkdown } from '@/lib/load';
import { documentTree, nodeIndex, outline, splitDocument, type DocNode } from '@/lib/doc';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project);
  if (!p) notFound();
  const g = await loadGraph(p.graphPath);
  const tree = documentTree(g);
  const outlines = new Map<string, ReturnType<typeof outline>>();
  const icons = new Map<string, string>();
  await Promise.all([...tree.byFile.values()].map(async d => { const md = await loadMarkdown(p.rootPath, d.file); outlines.set(d.file, outline(md)); icons.set(d.file, splitDocument(md).frontmatter.icon ?? ''); }));
  const toItem = (d: DocNode): TreeItem => ({ slug: d.slug, title: d.title, icon: icons.get(d.file) || defaultIcon(d.slug), children: d.children.map(toItem) });
  const roots = tree.roots.map(toItem);
  const docs = [...tree.byFile.values()].map(d => ({ slug: d.slug, title: d.title }));
  const headings = [...tree.byFile.values()].flatMap(d => (outlines.get(d.file) ?? []).map(h => ({ doc: d.slug, slug: h.slug, text: h.text })));
  const index = nodeIndex(g);
  return (
    <PeekProvider project={p.name} index={index}>
      <div className="shell">
        <Rail project={p.name} projectTitle={p.title} roots={roots} docs={docs} headings={headings} mainSlug={tree.main?.slug ?? docs[0]?.slug ?? ''} />
        <main className="content">{children}</main>
      </div>
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
