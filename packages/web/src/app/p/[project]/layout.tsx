import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DocTree, type TreeItem } from '@/components/DocTree';
import { Search } from '@/components/Search';
import { PeekProvider } from '@/components/PeekProvider';
import { getProject } from '@/lib/projects';
import { loadGraph, loadMarkdown } from '@/lib/load';
import { documentTree, nodeIndex, outline, type DocNode } from '@/lib/doc';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project);
  if (!p) notFound();
  const g = await loadGraph(p.graphPath);
  const tree = documentTree(g);
  const outlines = new Map<string, TreeItem['outline']>();
  await Promise.all([...tree.byFile.values()].map(async d => { outlines.set(d.file, outline(await loadMarkdown(p.rootPath, d.file))); }));
  const toItem = (d: DocNode): TreeItem => ({ slug: d.slug, title: d.title, outline: outlines.get(d.file) ?? [], children: d.children.map(toItem) });
  const roots = tree.roots.map(toItem);
  const docs = [...tree.byFile.values()].map(d => ({ slug: d.slug, title: d.title }));
  const headings = [...tree.byFile.values()].flatMap(d => (outlines.get(d.file) ?? []).map(h => ({ doc: d.slug, slug: h.slug, text: h.text })));
  const index = nodeIndex(g);
  const reqs = g.nodes.filter(n => n.kind === 'req' && n.defined).length;
  return (
    <PeekProvider project={p.name} index={index}>
      <div className="shell">
        <nav className="rail">
          <div className="rail-head">
            <Link href={`/p/${p.name}`} className="rail-title">{p.title}</Link>
            <div className="rail-sub">{docs.length} documents · {reqs} requirements · {Object.keys(index).length} nodes</div>
            <Search project={p.name} docs={docs} headings={headings} />
          </div>
          <div className="rail-body"><DocTree project={p.name} roots={roots} /></div>
          <div className="rail-foot"><Link href={`/p/${p.name}/graph`}>Graph</Link><Link href={`/p/${p.name}/graph?preset=Drift`}>Drift</Link></div>
        </nav>
        <main className="content">{children}</main>
      </div>
    </PeekProvider>
  );
}
