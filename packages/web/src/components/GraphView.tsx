'use client';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReactFlow, Background, Controls, MiniMap, Position, useNodesState, useEdgesState, type Node, type Edge, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutMindMap, NODE_H, NODE_W } from '@/lib/layout';
import { PRESETS, type PresetName } from '@/lib/presets';
import type { GraphEdge } from '@/lib/graph';
import { parseBody } from '@/lib/graph';

type LiteNode = { id: string; kind: string; title: string; status: string; defined: boolean };
type Summary = { title: string; kind: string; status: string; defined: boolean; body: string };
interface Props { product: string; preset: PresetName; focus: string | null; nodes: LiteNode[]; edges: GraphEdge[]; summaries: Record<string, Summary> }

export function GraphView({ product, preset, focus, nodes, edges, summaries }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(focus);
  const computed = useMemo(() => {
    const full = nodes.map(n => ({ ...n, section: '', subsection: '', body: '', file: '', line: 0 }));
    const { positions, treeEdges } = layoutMindMap(full, edges, focus);
    const rfNodes: Node[] = nodes.map(n => ({
      id: n.id, position: positions.get(n.id)!, data: { label: n.kind === 'req' ? n.id.slice(4) : n.id },
      style: { width: NODE_W, height: NODE_H, fontSize: 11, fontFamily: 'var(--font-m)', borderRadius: 8, padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        background: n.defined ? `var(--k-${n.kind}, var(--k-other))` : 'var(--surface)', color: n.defined ? '#fff' : 'var(--ink)',
        border: `${n.id === selected ? 3 : 1.5}px ${n.defined ? 'solid' : 'dashed'} ${n.id === selected ? 'var(--accent)' : n.status === 'proposed' ? 'var(--muted)' : n.status === 'question' || n.status === 'drift' ? 'var(--bad)' : `var(--k-${n.kind}, var(--k-other))`}` },
      sourcePosition: Position.Right, targetPosition: Position.Left,
    }));
    const rfEdges: Edge[] = edges.map(e => {
      const tree = treeEdges.has(`${e.from}|${e.verb}|${e.to}`);
      const parent = e.verb === 'refines' ? e.to : e.from, child = e.verb === 'refines' ? e.from : e.to;
      return { id: `${e.from}|${e.verb}|${e.to}`, source: tree ? parent : e.from, target: tree ? child : e.to, label: tree ? undefined : e.verb, type: tree ? 'smoothstep' : 'default',
        style: { stroke: e.verb === 'contradicts' ? 'var(--bad)' : tree ? 'var(--line-2)' : 'var(--accent)', strokeDasharray: e.verb === 'contradicts' ? '4 3' : e.verb === 'mentions' ? '2 3' : undefined, opacity: tree ? 1 : 0.7 },
        labelStyle: { fontSize: 9, fill: 'var(--muted)' }, labelBgStyle: { fill: 'var(--ground)' } };
    });
    return { rfNodes, rfEdges };
  }, [nodes, edges, focus, selected]);
  // React Flow needs to own node state to record measured sizes; re-seed it whenever the computed graph changes.
  const [rfNodes, setNodes, onNodesChange] = useNodesState(computed.rfNodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(computed.rfEdges);
  useEffect(() => { setNodes(computed.rfNodes); setEdges(computed.rfEdges); }, [computed, setNodes, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback((_, n) => setSelected(n.id), []);
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, n) => router.push(`/${product}/graph?focus=${encodeURIComponent(n.id)}&preset=${preset}`), [router, product, preset]);
  const sel = selected ? summaries[selected] : null;

  return (
    <div className="gwrap">
      <div className="gbar">
        {(Object.keys(PRESETS) as PresetName[]).map(p => (
          <Link key={p} href={`/${product}/graph?preset=${p}`} className={`chip ${p === preset && !focus ? 'on' : ''}`}>{p}</Link>
        ))}
        {focus && <span className="chip on">focus: {focus} <Link href={`/${product}/graph?preset=${preset}`}>×</Link></span>}
        <span className="cnt">{nodes.length} nodes · {edges.length} edges</span>
      </div>
      <div className="gcanvas">
        <ReactFlow nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} fitView minZoom={0.1} nodesDraggable nodesConnectable={false}>
          <Background gap={24} />
          <Controls />
          {nodes.length > 40 && <MiniMap pannable zoomable />}
        </ReactFlow>
        {sel && selected && (
          <aside className="gpanel">
            <div className="pills"><span className="pill k" style={{ background: `var(--k-${sel.kind}, var(--k-other))` }}>{sel.kind}</span>{sel.status && <span className={`pill s ${sel.status}`}>{sel.status}</span>}</div>
            <h3>{sel.title || selected}</h3>
            <code>{selected}</code>
            <div className="gp-acts">
              <Link href={`/${product}/n/${encodeURIComponent(selected)}`}>Open page</Link>
              <Link href={`/${product}/graph?focus=${encodeURIComponent(selected)}&preset=${preset}`}>Focus here</Link>
              <button onClick={() => setSelected(null)}>Close</button>
            </div>
            <dl className="props small">{parseBody(sel.body).slice(0, 8).map(r => <div key={r.key} className="prop"><dt>{r.key}</dt><dd><pre>{r.value}</pre></dd></div>)}</dl>
          </aside>
        )}
      </div>
    </div>
  );
}
