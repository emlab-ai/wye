import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { indexGraph } from '@/lib/graph';
import { loadGraph } from '@/lib/load';
import { PRESETS, visibleSubgraph, type PresetName } from '@/lib/presets';
import { GraphView } from '@/components/GraphView';

export default async function GraphPage({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ focus?: string; preset?: string }> }) {
  const { project } = await params; const sp = await searchParams;
  const p = getProject(project); if (!p) notFound();
  const preset = (sp.preset && sp.preset in PRESETS ? sp.preset : 'Requirements') as PresetName;
  const focus = sp.focus ? decodeURIComponent(sp.focus) : null;
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const { nodes, edges } = visibleSubgraph(g, idx, preset, focus);
  const summaries = Object.fromEntries(nodes.map(n => [n.id, { title: n.title, kind: n.kind, status: n.status, defined: n.defined, body: n.body.slice(0, 1200) }]));
  return <GraphView project={p.name} preset={preset} focus={focus} nodes={nodes.map(n => ({ id: n.id, kind: n.kind, title: n.title, status: n.status, defined: n.defined }))} edges={edges} summaries={summaries} />;
}
