import Link from 'next/link';
import { loadScope, treeFor } from '@/lib/scope';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@/lib/products';
import { docRoute, splitDocument, type DocNode } from '@/lib/doc';
import { HIDDEN_KINDS } from '@/lib/graph';
import { KIND_LABELS } from '@/lib/knowledge';

// Product overview: description, its top-level documents (decision:wf2.no-projects), and the knowledge counts.
export default async function ProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return null; // the layout shows the notice
  const counts: Record<string, number> = {};
  for (const n of scope.graph.nodes) if (n.defined && !HIDDEN_KINDS.has(n.kind) && n.kind !== 'module') counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  // the top-level documents (decision:wf2.no-projects), each with how many pages are under it
  const roots = scope.projects.flatMap(p => treeFor(scope, p.slug).roots).filter(d => !d.file.includes('/.wye/'));
  const count = (d: DocNode): number => d.children.reduce((n, c) => n + 1 + count(c), 0);
  const fmOf = (file: string) => { try { return splitDocument(readFileSync(path.join(REPO_ROOT, file), 'utf8')).frontmatter; } catch { return {} as Record<string, string>; } };
  return (
    <div className="page">
      <header className="doc-head">
        <div className="doc-title-row"><span className="prop-in icon" style={{ opacity: 1 }}>{scope.product.meta.icon || '📦'}</span><h1 className="prop-in h1">{scope.product.meta.title}</h1></div>
        {scope.product.meta.description && <p className="lede">{scope.product.meta.description}</p>}
      </header>
      <section>
        <h2>Documents</h2>
        <div className="cards-grid">
          {roots.map(d => { const r = docRoute(d.file); if (!r) return null; return (
            <Link key={d.file} href={`/${product}/${r.project}/d/${r.doc}`} className="tile">
              <div className="tile-head"><span className="pg-icon">{fmOf(d.file).icon || '📄'}</span><b>{d.title}</b></div>
              {fmOf(d.file).description && <p>{fmOf(d.file).description}</p>}
              <small>{count(d)} pages</small>
            </Link>
          ); })}
          {!roots.length && <p className="muted">No documents yet. Use + in the rail.</p>}
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
