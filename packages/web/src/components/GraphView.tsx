'use client';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, useNodesState, useEdgesState, type Node, type Edge, type NodeChange, type NodeMouseHandler, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutMindMap, type Size } from '@/lib/layout';
import type { PresetName } from '@/lib/presets';
import type { GraphEdge } from '@/lib/graph';
import { EmbeddedCard } from './EmbeddedCard';

type LiteNode = { id: string; kind: string; title: string; status: string; defined: boolean };
interface Props { product: string; preset: PresetName; focus: string | null; nodes: LiteNode[]; edges: GraphEdge[] }

// A card's box before it is measured: the layout starts from this and settles on the real size.
const CARD_W = 360, CARD_H = 120;

// A node on the canvas is the same editable card the document editor embeds (EmbeddedCard): every field saves in
// place through op:node.edit. The card's "from" line is the drag grip, so its inputs keep their own mouse.
function CardNode({ id, data }: NodeProps<Node<{ focus: boolean }>>) {
  return (
    <div className={`gnode ${data.focus ? 'focus' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <EmbeddedCard id={id} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const NODE_TYPES = { card: CardNode };

// The graph shows the focused node and what links to it directly, as editable cards; nothing floats over the
// canvas. A double click on a card's frame focuses the graph on it.
export function GraphView({ product, preset, focus, nodes, edges }: Props) {
  const router = useRouter();
  const rf = useRef<ReactFlowInstance | null>(null);
  // the cards' measured boxes (React Flow observes them): the layout re-runs as they load and grow
  const [sizes, setSizes] = useState<Map<string, Size>>(() => new Map());
  const computed = useMemo(() => {
    const full = nodes.map(n => ({ ...n, section: '', subsection: '', body: '', file: '', line: 0 }));
    const { positions, treeEdges } = layoutMindMap(full, edges, focus, sizes);
    const rfNodes: Node[] = nodes.map(n => ({
      id: n.id, type: 'card', position: positions.get(n.id)!, data: { focus: n.id === focus }, dragHandle: '.embed-from',
      style: { width: sizes.get(n.id)?.width ?? CARD_W },
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
  }, [nodes, edges, focus, sizes]);
  // React Flow needs to own node state to record measured sizes; re-seed it whenever the computed graph changes,
  // keeping what it measured so the view can fit the cards at once.
  const [rfNodes, setNodes, onNodesChange] = useNodesState(computed.rfNodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(computed.rfEdges);
  useEffect(() => {
    setNodes(prev => { const m = new Map(prev.map(n => [n.id, n.measured])); return computed.rfNodes.map(n => ({ ...n, measured: m.get(n.id) })); });
    setEdges(computed.rfEdges);
    const t = setTimeout(() => rf.current?.fitView({ padding: 0.15 }), 50); return () => clearTimeout(t);
  }, [computed, setNodes, setEdges]);
  const onChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    setSizes(prev => {
      let next: Map<string, Size> | null = null;
      for (const c of changes) {
        if (c.type !== 'dimensions' || !c.dimensions) continue;
        const { width, height } = c.dimensions, old = prev.get(c.id);
        if (old && Math.abs(old.width - width) < 1 && Math.abs(old.height - height) < 1) continue;
        (next ??= new Map(prev)).set(c.id, { width, height });
      }
      return next ?? prev;
    });
  }, [onNodesChange]);
  const onNodeDoubleClick: NodeMouseHandler = useCallback((e, n) => {
    if ((e.target as Element).closest('input, textarea, select, button, a')) return; // a double click in a field selects a word
    router.push(`/${product}/graph?focus=${encodeURIComponent(n.id)}&preset=${preset}`);
  }, [router, product, preset]);

  return (
    <div className="gwrap">
      <div className="gcanvas">
        <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES} onInit={i => { rf.current = i; }} onNodesChange={onChange} onEdgesChange={onEdgesChange} onNodeDoubleClick={onNodeDoubleClick} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.1} nodesDraggable nodesConnectable={false} proOptions={{ hideAttribution: true }}>
          <Background gap={24} />
          <Controls showInteractive={false} />
          {nodes.length > 40 && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
    </div>
  );
}
