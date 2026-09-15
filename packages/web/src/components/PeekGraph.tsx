'use client';
import { useCallback, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, Position, useNodesState, useEdgesState, type Node, type Edge, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutMindMap, NODE_H, NODE_W } from '@/lib/layout';
import type { GraphEdge } from '@/lib/graph';

export type LiteNode = { id: string; kind: string; title: string; status: string; defined: boolean };

// The open node's neighbourhood as a small mind map inside the panel; clicking a node opens it in the panel.
export function PeekGraph({ focus, nodes, edges, onPick }: { focus: string; nodes: LiteNode[]; edges: GraphEdge[]; onPick: (id: string) => void }) {
  const computed = useMemo(() => {
    const full = nodes.map(n => ({ ...n, section: '', subsection: '', body: '', file: '', line: 0 }));
    const { positions } = layoutMindMap(full, edges, focus);
    const rfNodes: Node[] = nodes.map(n => ({
      id: n.id, position: positions.get(n.id)!, data: { label: n.id }, title: n.title,
      style: { width: NODE_W, height: NODE_H, fontSize: 11, fontFamily: 'var(--font-m)', borderRadius: 8, padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
        background: n.defined ? `var(--k-${n.kind}, var(--k-other))` : 'var(--surface)', color: n.defined ? '#fff' : 'var(--ink)',
        border: `${n.id === focus ? 3 : 1.5}px ${n.defined ? 'solid' : 'dashed'} ${n.id === focus ? 'var(--accent)' : `var(--k-${n.kind}, var(--k-other))`}` },
      sourcePosition: Position.Right, targetPosition: Position.Left,
    }));
    const rfEdges: Edge[] = edges.map(e => ({
      id: `${e.from}|${e.verb}|${e.to}`, source: e.from, target: e.to, label: e.verb, type: 'default',
      style: { stroke: e.verb === 'contradicts' ? 'var(--bad)' : e.from === focus || e.to === focus ? 'var(--accent)' : 'var(--line-2)', strokeDasharray: e.verb === 'contradicts' ? '4 3' : undefined },
      labelStyle: { fontSize: 9, fill: 'var(--muted)' }, labelBgStyle: { fill: 'var(--ground)' },
    }));
    return { rfNodes, rfEdges };
  }, [nodes, edges, focus]);
  const [rfNodes, setNodes, onNodesChange] = useNodesState(computed.rfNodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(computed.rfEdges);
  useEffect(() => { setNodes(computed.rfNodes); setEdges(computed.rfEdges); }, [computed, setNodes, setEdges]);
  const onNodeClick: NodeMouseHandler = useCallback((_, n) => { if (n.id !== focus) onPick(n.id); }, [focus, onPick]);
  return (
    <div className="peek-graph">
      <ReactFlow key={focus} nodes={rfNodes} edges={rfEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} nodesDraggable nodesConnectable={false} proOptions={{ hideAttribution: true }}>
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
