import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope, treeFor } from '@/lib/scope';
import { loadMarkdown } from '@/lib/load';
import { REPO_ROOT } from '@/lib/products';
import { docRoute, linkedDocuments, splitDocument } from '@/lib/doc';
import { bodyOf, hashOf } from '@/lib/write';
import { DocumentReader } from '@/components/DocumentReader';
import { DocProps } from '@/components/DocProps';
import { LiveDocument } from '@/components/LiveDocument';
import { DocNotFound } from '@/components/DocNotFound';

export default async function DocPage({ params }: { params: Promise<{ product: string; project: string; doc: string }> }) {
  const { product, project, doc } = await params;
  const scope = await loadScope(product, project); if (!scope) notFound();
  const tree = treeFor(scope, project);
  // a document that is not there — never was, or was deleted outside the app while open — is a notice in place of the
  // content, not a 404 boundary: the layout (top bar, rail, tabs) stays and the next live refresh brings the document
  // back when its file reappears (decision:wf2.deleted-outside-stays-put)
  const d = [...tree.byFile.values()].find(x => x.slug === doc && docRoute(x.file)?.project === project);
  if (!d) return <DocNotFound slug={doc} project={project} />;
  const md = await loadMarkdown(REPO_ROOT, d.file).catch(() => null); // gone between the graph and this render
  if (md === null) return <DocNotFound slug={doc} project={project} />;
  const split = splitDocument(md);
  const body = bodyOf(md);
  const linked = linkedDocuments(scope.graph, scope.idx, d.file);
  return (
    <div className="page">
      <DocProps product={product} project={project} slug={d.slug} file={d.file} fm={split.frontmatter} node={d.module.id} types={scope.graph.types ?? []} />
      <LiveDocument product={product} project={project} slug={d.slug} body={body} ifMatch={hashOf(body)}>
        <DocumentReader doc={split} index={scope.index} />
      </LiveDocument>
      {linked.length > 0 && (
        <section className="linked"><h2>Linked pages</h2>
          <ul>{linked.map(l => { const r = docRoute(l.file); return <li key={l.file}><Link href={r ? `/${product}/${r.project}/d/${r.doc}` : '#'}>{l.title}</Link> <span className="muted">{l.count} links{r && r.project !== project ? ` · ${r.project}` : ''}</span></li>; })}</ul>
        </section>
      )}
    </div>
  );
}
