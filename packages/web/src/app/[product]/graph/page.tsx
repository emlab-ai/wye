import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { PRESETS, visibleSubgraph, type PresetName } from '@/lib/presets';
import { GraphView } from '@/components/GraphView';

export default async function GraphPage({ params, searchParams }: { params: Promise<{ product: string }>; searchParams: Promise<{ focus?: string; preset?: string }> }) {
  const { product } = await params; const sp = await searchParams;
  const scope = await loadScope(product); if (!scope) notFound();
  const preset = (sp.preset && sp.preset in PRESETS ? sp.preset : 'Requirements') as PresetName;
  const focus = sp.focus ? decodeURIComponent(sp.focus) : null;
  const { nodes, edges } = visibleSubgraph(scope.graph, scope.idx, preset, focus);
  const summaries = Object.fromEntries(nodes.map(n => [n.id, { title: n.title, kind: n.kind, status: n.status, defined: n.defined, body: n.body.slice(0, 1200) }]));
  return <GraphView product={product} preset={preset} focus={focus} nodes={nodes.map(n => ({ id: n.id, kind: n.kind, title: n.title, status: n.status, defined: n.defined }))} edges={edges} summaries={summaries} />;
}
