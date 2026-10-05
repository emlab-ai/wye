import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { PRESETS, visibleSubgraph, type PresetName } from '@/lib/presets';
import { GraphView } from '@/components/GraphView';
import { HIDDEN_KINDS } from '@/lib/graph';
import { isSystemFile } from '@/lib/doc';
import { kindExample } from '@/lib/knowledge';
import { EmptyState } from '@/components/EmptyState';
import { EmptyAction } from '@/components/EmptyActions';

export default async function GraphPage({ params, searchParams }: { params: Promise<{ product: string }>; searchParams: Promise<{ focus?: string; preset?: string }> }) {
  const { product } = await params; const sp = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  const preset = (sp.preset && sp.preset in PRESETS ? sp.preset : 'Requirements') as PresetName;
  const focus = sp.focus ? decodeURIComponent(sp.focus) : null;
  const { nodes, edges } = visibleSubgraph(scope.graph, scope.idx, preset, focus);
  // an empty canvas says why: no block a person wrote yet (teach), or none of this preset's kinds (a filter)
  if (!nodes.length && !focus) {
    const blocks = scope.graph.nodes.some(n => n.defined && !HIDDEN_KINDS.has(n.kind) && n.kind !== 'module' && n.kind !== 'type' && !isSystemFile(n.file));
    return (
      <div className="page">{blocks
        ? <p className="muted">Nothing in the {preset} view. <a href={`/${product}/graph?preset=Everything`}>Everything →</a></p>
        : <EmptyState icon="⇄" title="No graph yet" actions={<EmptyAction act="new-page">New document</EmptyAction>}>
            <p>The graph draws the blocks and the links between them. It appears once a document has blocks with ids that refer to each other:</p>
            <p><code>{kindExample('test')}</code></p>
          </EmptyState>}
      </div>
    );
  }
  return <GraphView product={product} preset={preset} focus={focus} nodes={nodes.map(n => ({ id: n.id, kind: n.kind, title: n.title, status: n.status, defined: n.defined }))} edges={edges} />;
}
