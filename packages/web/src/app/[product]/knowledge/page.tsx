import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { HIDDEN_KINDS } from '@/lib/graph';
import { isSystemFile } from '@/lib/doc';
import { KIND_LABELS, KIND_ORDER, kindExample } from '@/lib/knowledge';
import { SmartTag } from '@/components/SmartTag';
import { EmptyState } from '@/components/EmptyState';
import { EmptyAction } from '@/components/EmptyActions';

// Product knowledge: everything the graph knows, by kind, with the newest-looking entries first per kind.
export default async function KnowledgePage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const docIds = new Set(scope.graph.modules.map(m => m.id)); // documents' nodes are pages, not knowledge cards (rule:page-node-line)
  const byKind = new Map<string, typeof scope.graph.nodes>();
  for (const n of scope.graph.nodes) { if (!n.defined || HIDDEN_KINDS.has(n.kind) || n.kind === 'type' || docIds.has(n.id)) continue; if (!byKind.has(n.kind)) byKind.set(n.kind, []); byKind.get(n.kind)!.push(n); }
  const kinds = KIND_ORDER.filter(k => byKind.has(k)).concat([...byKind.keys()].filter(k => !KIND_ORDER.includes(k)));
  // nothing written by a person yet: what the app wrote itself (.wye hooks, workflow stages) still lists below the empty state
  const none = !kinds.some(k => byKind.get(k)!.some(n => !isSystemFile(n.file)));
  return (
    <div className="page">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Knowledge</h1><p className="lede">Everything {scope.product.meta.title} knows, built from its documents.{!none && <> {scope.graph.nodes.filter(n => n.defined).length} nodes, {scope.graph.edges.length} relations.</>} <Link href={`/${product}/types`}>Types →</Link></p></header>
      {none && (
        <EmptyState icon="◈" title="Nothing known yet" actions={<><EmptyAction act="new-page" pri>New document</EmptyAction><EmptyAction act="import">Import code or Markdown</EmptyAction></>}>
          <p>Knowledge is built from the documents. Most of a document is prose; a block with an id becomes a node here, grouped by kind:</p>
          <p><code>{kindExample('goal')}</code></p>
        </EmptyState>)}
      {none && kinds.length > 0 && <p className="muted">Below: what the app wrote for itself — the hooks, templates and workflow stages every product starts with.</p>}
      {kinds.map(k => {
        const items = byKind.get(k)!;
        return (
          <section key={k} className="kind-section">
            <h2><Link href={`/${product}/knowledge/${k}`}>{KIND_LABELS[k] ?? k}</Link> <span className="muted">{items.length}</span></h2>
            <div className="tags">{items.slice(0, 12).map(n => <SmartTag key={n.id} id={n.id} label={n.kind === 'req' ? n.id.slice(4) : n.id} />)}{items.length > 12 && <Link className="more" href={`/${product}/knowledge/${k}`}>all {items.length} →</Link>}</div>
          </section>
        );
      })}
    </div>
  );
}
