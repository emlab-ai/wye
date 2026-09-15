import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { KIND_LABELS, KIND_ORDER } from '@/lib/knowledge';
import { SmartTag } from '@/components/SmartTag';

// Product knowledge: everything the graph knows, by kind, with the newest-looking entries first per kind.
export default async function KnowledgePage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const byKind = new Map<string, typeof scope.graph.nodes>();
  for (const n of scope.graph.nodes) { if (!n.defined || n.kind === 'field' || n.kind === 'module') continue; if (!byKind.has(n.kind)) byKind.set(n.kind, []); byKind.get(n.kind)!.push(n); }
  const kinds = KIND_ORDER.filter(k => byKind.has(k)).concat([...byKind.keys()].filter(k => !KIND_ORDER.includes(k)));
  return (
    <div className="page">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Knowledge</h1><p className="lede">Everything {scope.product.meta.title} knows, built from its documents. {scope.graph.nodes.filter(n => n.defined).length} nodes, {scope.graph.edges.length} relations.</p></header>
      {kinds.map(k => {
        const items = byKind.get(k)!;
        return (
          <section key={k} className="kind-section">
            <h2><Link href={`/${product}/knowledge/${k}`}>{KIND_LABELS[k] ?? k}</Link> <span className="muted">{items.length}</span></h2>
            <div className="tags">{items.slice(0, 12).map(n => <SmartTag key={n.id} id={n.id} label={n.kind === 'req' ? n.id.slice(4) : n.id} />)}{items.length > 12 && <Link className="more" href={`/${product}/knowledge/${k}`}>all {items.length} →</Link>}</div>
          </section>
        );
      })}
      {!kinds.length && <p className="muted">Nothing yet. Write documents, or drop files and notes into the inbox.</p>}
    </div>
  );
}
