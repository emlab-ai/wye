import Link from 'next/link';
import { loadScope, treeFor } from '@/lib/scope';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@/lib/products';
import { docRoute, splitDocument, type DocNode } from '@/lib/doc';
import { HIDDEN_KINDS } from '@/lib/graph';
import { KIND_LABELS } from '@/lib/knowledge';
import { readOnboarding } from '@/lib/onboarding-io';
import { quickStartLinks } from '@/lib/quick-start-links';
import { QuickStartCard } from '@/components/QuickStartCard';
import { NewDocumentActions } from '@/components/QuickStart';
import { EmptyState } from '@/components/EmptyState';

// Product overview: the Quick start card while it has steps left, description, its top-level documents
// (decision:wf2.no-projects), and the knowledge counts.
export default async function ProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) return null; // the layout shows the notice
  const counts: Record<string, number> = {};
  // the product's own blocks: the base ontology's types (schema/) are the app's, not something this product knows
  for (const n of scope.graph.nodes) if (n.defined && !HIDDEN_KINDS.has(n.kind) && n.kind !== 'module' && /(^|\/)projects\//.test(n.file)) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  // the top-level documents (decision:wf2.no-projects), each with how many pages are under it
  const roots = scope.projects.flatMap(p => treeFor(scope, p.slug).roots).filter(d => !d.file.includes('/.wye/'));
  const count = (d: DocNode): number => d.children.reduce((n, c) => n + 1 + count(c), 0);
  const kinds = Object.entries(KIND_LABELS).filter(([k]) => counts[k]);
  const onboarding = await readOnboarding(product).catch(() => null);
  const fmOf = (file: string) => { try { return splitDocument(readFileSync(path.join(REPO_ROOT, file), 'utf8')).frontmatter; } catch { return {} as Record<string, string>; } };
  return (
    <div className="page">
      <header className="doc-head">
        <div className="doc-title-row"><span className="prop-in icon" style={{ opacity: 1 }}>{scope.product.meta.icon || '📦'}</span><h1 className="prop-in h1">{scope.product.meta.title}</h1></div>
        {scope.product.meta.description && <p className="lede">{scope.product.meta.description}</p>}
      </header>
      {onboarding?.show && <QuickStartCard product={scope.product.slug} initial={onboarding} links={quickStartLinks(scope)} bare={!roots.length} />}
      <section>
        <h2>Documents</h2>
        {roots.length > 0 && <div className="cards-grid">
          {roots.map(d => { const r = docRoute(d.file); if (!r) return null; return (
            <Link key={d.file} href={`/${product}/${r.project}/d/${r.doc}`} className="tile">
              <div className="tile-head"><span className="pg-icon">{fmOf(d.file).icon || '📄'}</span><b>{d.title}</b></div>
              {fmOf(d.file).description && <p>{fmOf(d.file).description}</p>}
              <small>{count(d)} pages</small>
            </Link>
          ); })}
        </div>}
        {!roots.length && <EmptyState icon="📄" title="No documents yet" actions={<NewDocumentActions />}>
          <p>A document is Markdown in this product’s folder: prose, with an id on the lines that matter, like <code>req:search.fast</code>. Agents read it before they build, and what they learn comes back to it.</p>
        </EmptyState>}
      </section>
      <section>
        <h2><Link href={`/${product}/knowledge`}>Knowledge</Link></h2>
        {!kinds.length && <p className="muted">The blocks with an id, counted by kind, once the documents have some.</p>}
        <div className="cards-grid">
          {kinds.map(([k, label]) => (
            <Link key={k} href={`/${product}/knowledge/${k}`} className="tile small"><b style={{ color: `var(--k-${k}, var(--ink))` }}>{counts[k]}</b><span>{label}</span></Link>
          ))}
        </div>
      </section>
    </div>
  );
}
