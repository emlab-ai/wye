import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope, treeFor } from '@/lib/scope';
import { KIND_LABELS } from '@/lib/knowledge';

// Product overview: description, projects, and the knowledge counts.
export default async function ProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const counts: Record<string, number> = {};
  for (const n of scope.graph.nodes) if (n.defined && n.kind !== 'field' && n.kind !== 'prop' && n.kind !== 'module') counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  return (
    <div className="page">
      <header className="doc-head">
        <div className="doc-title-row"><span className="prop-in icon" style={{ opacity: 1 }}>{scope.product.meta.icon || '📦'}</span><h1 className="prop-in h1">{scope.product.meta.title}</h1></div>
        {scope.product.meta.description && <p className="lede">{scope.product.meta.description}</p>}
      </header>
      <section>
        <h2>Projects</h2>
        <div className="cards-grid">
          {scope.projects.map(p => { const t = treeFor(scope, p.slug); return (
            <Link key={p.slug} href={`/${product}/${p.slug}`} className="tile">
              <div className="tile-head"><span className="pg-icon">{p.meta.icon || (p.meta.kind === 'goal' ? '🎯' : '📁')}</span><b>{p.meta.title}</b>{p.meta.kind === 'goal' && <span className="rail-kind">goal</span>}</div>
              {p.meta.description && <p>{p.meta.description}</p>}
              <small>{[...t.byFile.values()].filter(d => d.file.includes(`/projects/${p.slug}/docs/`)).length} pages{p.meta.status ? ` · ${p.meta.status}` : ''}</small>
            </Link>
          ); })}
          {!scope.projects.length && <p className="muted">No projects yet. Use + in the rail.</p>}
        </div>
      </section>
      <section>
        <h2><Link href={`/${product}/knowledge`}>Knowledge</Link></h2>
        <div className="cards-grid">
          {Object.entries(KIND_LABELS).filter(([k]) => counts[k]).map(([k, label]) => (
            <Link key={k} href={`/${product}/knowledge/${k}`} className="tile small"><b style={{ color: `var(--k-${k}, var(--ink))` }}>{counts[k]}</b><span>{label}</span></Link>
          ))}
        </div>
      </section>
    </div>
  );
}
