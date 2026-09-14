import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { loadGraph, loadMarkdown } from '@/lib/load';
import { indexGraph } from '@/lib/graph';
import { documentTree, linkedDocuments, nodeIndex, splitDocument } from '@/lib/doc';
import { Document } from '@/components/Document';
import { StatusPill } from '@/components/Pills';

export default async function DocPage({ params }: { params: Promise<{ project: string; doc: string }> }) {
  const { project, doc } = await params;
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const tree = documentTree(g);
  const d = [...tree.byFile.values()].find(x => x.slug === doc); if (!d) notFound();
  const md = await loadMarkdown(p.rootPath, d.file);
  const split = splitDocument(md);
  const index = nodeIndex(g);
  const linked = linkedDocuments(g, idx, d.file);
  const fm = split.frontmatter;
  return (
    <div className="page">
      <header className="doc-head">
        <div className="pills"><span className="pill k" style={{ background: 'var(--k-module)' }}>document</span><StatusPill status={fm.status ?? ''} /></div>
        <h1>{fm.title ?? d.title}</h1>
        <p className="sub">{d.file}{fm['last-verified'] && <> · verified {fm['last-verified']}</>}{fm.owner && <> · {fm.owner}</>}</p>
      </header>
      <Document doc={split} index={index} />
      {linked.length > 0 && (
        <section className="linked"><h2>Linked documents</h2>
          <ul>{linked.map(l => <li key={l.file}><Link href={`/p/${p.name}/d/${l.slug}`}>{l.title}</Link> <span className="muted">{l.count} links</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
