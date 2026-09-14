import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { loadGraph, loadMarkdown } from '@/lib/load';
import { indexGraph } from '@/lib/graph';
import { documentTree, linkedDocuments, nodeIndex, splitDocument } from '@/lib/doc';
import { hashOf } from '@/lib/write';
import { Document } from '@/components/Document';
import { DocProps } from '@/components/DocProps';

export default async function DocPage({ params }: { params: Promise<{ project: string; doc: string }> }) {
  const { project, doc } = await params;
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const tree = documentTree(g);
  const d = [...tree.byFile.values()].find(x => x.slug === doc); if (!d) notFound();
  const md = await loadMarkdown(p.rootPath, d.file);
  const split = splitDocument(md);
  const hashes = split.segments.map(s => s.type === 'markdown' ? hashOf(s.text) : s.type === 'yaml' ? s.chunks.map(c => hashOf(c.raw)) : null);
  const index = nodeIndex(g);
  const linked = linkedDocuments(g, idx, d.file);
  return (
    <div className="page">
      <DocProps project={p.name} slug={d.slug} file={d.file} fm={split.frontmatter} />
      <Document doc={split} index={index} project={p.name} slug={d.slug} hashes={hashes} />
      {linked.length > 0 && (
        <section className="linked"><h2>Linked documents</h2>
          <ul>{linked.map(l => <li key={l.file}><Link href={`/p/${p.name}/d/${l.slug}`}>{l.title}</Link> <span className="muted">{l.count} links</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
