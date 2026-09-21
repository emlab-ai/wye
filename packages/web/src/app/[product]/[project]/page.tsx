import Link from 'next/link';
import { GoneNotice } from '@/components/GoneNotice';
import { loadScope, treeFor } from '@/lib/scope';

// Project overview: its pages. Opens the main page directly when there is one.
export default async function ProjectPage({ params }: { params: Promise<{ product: string; project: string }> }) {
  const { product, project } = await params;
  const scope = await loadScope(product, project);
  if (!scope || !scope.project) { const all = await loadScope(product); return <GoneNotice what="project" slug={project} product={product} projects={(all?.projects ?? []).map(p => ({ slug: p.slug, title: p.meta.title, icon: p.meta.icon }))} />; }
  const tree = treeFor(scope, project);
  const docs = [...tree.byFile.values()].filter(d => d.file.includes(`/projects/${project}/docs/`)).sort((a, b) => a.title.localeCompare(b.title));
  const p = scope.project;
  return (
    <div className="page">
      <header className="doc-head">
        <div className="doc-title-row"><span className="prop-in icon" style={{ opacity: 1 }}>{p.meta.icon || (p.meta.kind === 'goal' ? '🎯' : '📁')}</span><h1 className="prop-in h1">{p.meta.title}</h1></div>
        <p className="sub">{p.meta.kind}{p.meta.status ? ` · ${p.meta.status}` : ''} · {docs.length} pages</p>
        {p.meta.description && <p className="lede">{p.meta.description}</p>}
      </header>
      <section>
        <h2>Pages</h2>
        <ul className="klist">
          {docs.map(d => <li key={d.slug}><Link className="klist-page" href={`/${product}/${project}/d/${d.slug}`}>{d.title}</Link></li>)}
          {!docs.length && <li className="muted">No pages yet. Press + next to the project in the rail.</li>}
        </ul>
      </section>
    </div>
  );
}
