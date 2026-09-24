'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType, useNodesState, useEdgesState, type Connection, type Edge, type EdgeMouseHandler, type Node, type NodeChange, type NodeMouseHandler, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutMindMap } from '@/lib/layout';
import { verbsFor, type MapNode, type Spot } from '@/lib/map';
import type { GraphEdge } from '@/lib/graph';
import { EmbeddedCard } from './EmbeddedCard';

// The canvas of a map page (component:map-canvas, req:wf2.map.canvas). Its nodes and edges are the page's own cards and
// the links they carry, so a gesture here is an edit to the knowledge: a double click on the canvas adds a node, the +
// on a node grows a child, dragging between two nodes links them, a click on a link names it, a click on a node opens
// its card. Dragging is the one gesture that is not knowledge — positions are kept locally and flushed to the page's
// Layout section as one silent write once the hand stops (decision:map.layout-is-a-fenced-section), which is what keeps
// the canvas as quick as a mind-map editor.
type TypeLite = { slug: string; props?: { name: string; ref: string | null }[] };
interface Props { product: string; project: string; slug: string; node: string; nodes: MapNode[]; edges: GraphEdge[]; spots: Spot[]; types: TypeLite[] }
type Picture = { nodes: MapNode[]; edges: GraphEdge[]; spots?: Spot[]; id?: string | null };
type NodeData = { kind: string; title: string; status: string; isRef: boolean; onChild: (id: string, at: { x: number; y: number }) => void; onRename: (id: string, title: string) => void };

const FLUSH_MS = 350;         // a hand at rest: the whole Layout section goes in one write
const CHILD_GAP = 90, CHILD_DY = 80, NODE_GUESS = 200;
const kindOf = (id: string) => id.split(':')[0];
const nameOf = (id: string) => id.split(':').slice(1).join(':');

// A node: its kind, its title, and the + that grows a child. Renaming happens in place on a double click — the same
// op:node.edit the card would use, so the card and the canvas never disagree.
function MapCard({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);
  useEffect(() => setDraft(data.title), [data.title]);
  const save = () => { setEditing(false); if (draft.trim() && draft.trim() !== data.title) data.onRename(id, draft.trim()); };
  return (
    <div className={`mnode ${selected ? 'on' : ''} ${data.isRef ? 'is-ref' : ''} s-${data.status || 'none'}`} data-id={id}>
      <Handle type="target" position={Position.Left} />
      <span className="mnode-kind pill k" style={{ background: `var(--k-${data.kind}, var(--k-other))` }}>{data.kind}</span>
      {editing
        ? <input className="mnode-edit" autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(data.title); setEditing(false); } }} />
        : <span className="mnode-title" onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}>{data.title || nameOf(id)}</span>}
      {data.isRef && <span className="mnode-ref" title="This node is written on another page">↗</span>}
      <Handle type="source" position={Position.Right} />
      <button type="button" className="mnode-add nodrag" title="Add a linked node" onClick={e => { e.stopPropagation(); data.onChild(id, { x: e.clientX, y: e.clientY }); }}>+</button>
    </div>
  );
}
const NODE_TYPES = { map: MapCard };

export function MapCanvas({ product, project, slug, node, nodes, edges, spots, types }: Props) {
  const rf = useRef<ReactFlowInstance | null>(null);
  const [pic, setPic] = useState<Picture>({ nodes, edges, spots });
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const kinds = useMemo(() => [...types].map(t => t.slug).sort(), [types]);
  const [kind, setKind] = useState(() => (types.some(t => t.slug === 'req') ? 'req' : types[0]?.slug ?? 'req'));
  // the one popup: a new node (on the canvas or off a parent) or the verb of one edge
  const [pop, setPop] = useState<null | { mode: 'new'; at: { x: number; y: number }; flow: { x: number; y: number }; parent?: string } | { mode: 'verb'; at: { x: number; y: number }; from: string; to: string; was: string }>(null);
  const [title, setTitle] = useState('');
  const [verb, setVerb] = useState('part-of');

  // where each node sits: the page's Layout for the ones it records, dagre for the ones it does not (a card written by
  // hand or by an agent appears in a sensible place instead of at the origin)
  const seeded = useMemo(() => {
    const at = new Map<string, { x: number; y: number }>();
    const missing = pic.nodes.filter(n => !Number.isFinite(n.x) || !Number.isFinite(n.y));
    for (const n of pic.nodes) if (Number.isFinite(n.x) && Number.isFinite(n.y)) at.set(n.id, { x: n.x, y: n.y });
    if (missing.length) {
      const full = pic.nodes.map(n => ({ ...n, section: '', subsection: '', body: '', file: '', line: 0 }));
      const { positions } = layoutMindMap(full, pic.edges, null);
      for (const m of missing) at.set(m.id, positions.get(m.id) ?? { x: 0, y: 0 });
    }
    return { at, missing: missing.map(m => m.id) };
  }, [pic]);

  const send = useCallback(async (body: Record<string, unknown>): Promise<Picture | null> => {
    const r = await fetch(`/api/${product}/${project}/map/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Picture & { ok?: boolean; message?: string; id?: string };
    if (!r.ok) { setMsg(j.message || 'that did not work'); return null; }
    setMsg('');
    if (j.nodes && j.edges) setPic({ nodes: j.nodes, edges: j.edges, spots: j.spots });
    return j;
  }, [product, project, slug]);

  // dragging: positions collected and written once, and always written — a page left mid-drag keeps where things sit
  const queued = useRef(new Map<string, { x: number; y: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback((keepalive = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const moves = [...queued.current].map(([id, p]) => ({ id, ...p }));
    queued.current.clear();
    if (!moves.length) return;
    void fetch(`/api/${product}/${project}/map/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'layout', moves }), keepalive });
  }, [product, project, slug]);
  const queue = useCallback((id: string, x: number, y: number) => {
    queued.current.set(id, { x, y });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), FLUSH_MS);
  }, [flush]);
  useEffect(() => {
    const go = () => flush(true);
    window.addEventListener('pagehide', go);
    return () => { window.removeEventListener('pagehide', go); flush(true); };
  }, [flush]);

  const onChild = useCallback((id: string, at: { x: number; y: number }) => {
    setTitle(''); setPop({ mode: 'new', at, flow: { x: 0, y: 0 }, parent: id });
  }, []);
  const onRename = useCallback((id: string, next: string) => {
    setPic(p => ({ ...p, nodes: p.nodes.map(n => (n.id === id ? { ...n, title: next } : n)) }));   // the canvas shows it at once
    void fetch(`/api/${product}/node/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ props: { title: next } }) });
  }, [product]);

  const computed = useMemo(() => {
    const rfNodes: Node[] = pic.nodes.map(n => ({
      id: n.id, type: 'map', position: seeded.at.get(n.id) ?? { x: 0, y: 0 },
      data: { kind: n.kind, title: n.title, status: n.status, isRef: n.ref, onChild, onRename } satisfies NodeData,
    }));
    const rfEdges: Edge[] = pic.edges.map(e => ({
      id: `${e.from}|${e.verb}|${e.to}`, source: e.from, target: e.to, label: e.verb, type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--line-2)' },
      style: { stroke: e.verb === 'contradicts' ? 'var(--bad)' : 'var(--line-2)' },
      labelStyle: { fontSize: 10, fill: 'var(--muted)' }, labelBgStyle: { fill: 'var(--ground)' }, labelBgPadding: [4, 2] as [number, number],
    }));
    return { rfNodes, rfEdges };
  }, [pic, seeded, onChild, onRename]);
  const [rfNodes, setNodes, onNodesChange] = useNodesState(computed.rfNodes);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(computed.rfEdges);
  useEffect(() => {
    // the picture changed: keep where the hand has put things, take the rest as computed
    setNodes(prev => { const at = new Map(prev.map(n => [n.id, n.position])); return computed.rfNodes.map(n => ({ ...n, position: at.get(n.id) ?? n.position, measured: prev.find(p => p.id === n.id)?.measured })); });
    setEdges(computed.rfEdges);
  }, [computed, setNodes, setEdges]);
  // a card the page does not place yet: dagre put it somewhere, so record that as its position
  const placed = useRef(new Set<string>());
  useEffect(() => {
    const fresh = seeded.missing.filter(id => !placed.current.has(id));
    if (!fresh.length) return;
    for (const id of fresh) { placed.current.add(id); const p = seeded.at.get(id); if (p) queue(id, p.x, p.y); }
  }, [seeded, queue]);

  const onChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    for (const c of changes) if (c.type === 'position' && c.position && c.dragging === false) queue(c.id, c.position.x, c.position.y);
  }, [onNodesChange, queue]);

  // a link drawn between two nodes: written at once with the verb the ontology offers first, then named
  const onConnect = useCallback(async (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    // a link drawn is not yet a link named: `related-to` says only that they belong together, and the popup that opens
    // next is where it is named (decision:map.verbs-from-the-ontology)
    const v = 'related-to';
    setBusy(true);
    const ok = await send({ action: 'link', from: c.source, to: c.target, verb: v });
    setBusy(false);
    if (!ok) return;
    const n = rf.current?.getInternalNode?.(c.target);
    const at = n ? rf.current!.flowToScreenPosition({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y }) : { x: 120, y: 120 };
    setVerb(v); setPop({ mode: 'verb', at, from: c.source, to: c.target, was: v });
  }, [send, types]);

  const onEdgeClick: EdgeMouseHandler = useCallback((e, edge) => {
    const [from, was, to] = String(edge.id).split('|');
    setVerb(was); setPop({ mode: 'verb', at: { x: e.clientX, y: e.clientY }, from, to, was });
  }, []);
  const onNodeClick: NodeMouseHandler = useCallback((_e, n) => { setSel(n.id); setConfirmDrop(false); }, []);
  const onPaneDoubleClick = useCallback((e: React.MouseEvent) => {
    const flow = rf.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 };
    setTitle(''); setPop({ mode: 'new', at: { x: e.clientX, y: e.clientY }, flow });
  }, []);

  // the verbs an edge between these two kinds may take, the ontology's first (decision:map.verbs-from-the-ontology)
  const offered = pop?.mode === 'verb' ? verbsFor(types, kindOf(pop.from), kindOf(pop.to)) : pop?.parent ? verbsFor(types, kind, kindOf(pop.parent)) : [];
  useEffect(() => { if (pop?.mode === 'new' && pop.parent) setVerb(v => (offered.includes(v) ? v : offered[0] ?? 'related-to')); }, [pop, kind]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function createNode() {
    if (pop?.mode !== 'new') return;
    const parent = pop.parent;
    const at = parent ? nextTo(parent) : pop.flow;
    setBusy(true);
    const made = await send({ action: parent ? 'child' : 'node', kind, title: title.trim(), x: at.x, y: at.y, parent, verb: parent ? verb : undefined });
    setBusy(false);
    if (!made) return;
    setTitle('');
    if (made.id) setSel(made.id);
    if (!parent) setPop(null);            // on the canvas: one node per double click
  }
  // where a child goes: to the right of its parent, below the children it already has
  function nextTo(parent: string) {
    const box = rfNodes.find(n => n.id === parent);
    const p = box?.position ?? { x: 0, y: 0 };
    const dx = (box?.measured?.width ?? NODE_GUESS) + CHILD_GAP;
    const kids = pic.edges.filter(e => e.to === parent || e.from === parent).map(e => (e.to === parent ? e.from : e.to));
    const taken = rfNodes.filter(n => kids.includes(n.id) && n.position.x > p.x);
    return { x: p.x + dx, y: p.y + (taken.length ? Math.max(...taken.map(n => n.position.y)) - p.y + CHILD_DY : 0) };
  }
  async function setEdgeVerb(next: string) {
    if (pop?.mode !== 'verb') return;
    const v = next.trim(); if (!v) return;
    setBusy(true);
    if (v !== pop.was) await send({ action: 'verb', from: pop.from, to: pop.to, verb: v, was: pop.was });
    setBusy(false); setPop(null);
  }
  async function unlink() {
    if (pop?.mode !== 'verb') return;
    setBusy(true); await send({ action: 'unlink', from: pop.from, to: pop.to, verb: pop.was }); setBusy(false); setPop(null);
  }
  async function drop(id: string) {
    setBusy(true); const ok = await send({ action: 'drop', id }); setBusy(false);
    if (ok) { setSel(null); setConfirmDrop(false); }
  }
  function addOnCanvas() {
    const box = rf.current?.getViewport();
    const flow = rf.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: box?.x ?? 0, y: box?.y ?? 0 };
    setTitle(''); setPop({ mode: 'new', at: { x: window.innerWidth / 2 - 120, y: 160 }, flow });
  }

  const selected = sel ? pic.nodes.find(n => n.id === sel) ?? null : null;
  return (
    <section className="mwrap">
      <div className="mbar">
        <button type="button" onClick={addOnCanvas}>+ Node</button>
        <button type="button" onClick={() => rf.current?.fitView({ padding: 0.2, maxZoom: 1 })}>Fit</button>
        <span className="muted small">double click to add · hover a node for + · drag between nodes to link · click a link to name it</span>
        {busy && <span className="muted small">saving…</span>}
        {msg && <span className="notice small">{msg}</span>}
      </div>
      <div className="mcanvas" onDoubleClick={e => { if ((e.target as Element).closest('.react-flow__node, .react-flow__edge, .mpop')) return; onPaneDoubleClick(e); }}>
        <ReactFlow
          nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES} onInit={i => { rf.current = i; }}
          onNodesChange={onChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onEdgeClick={onEdgeClick} onNodeClick={onNodeClick} onPaneClick={() => { setPop(null); setSel(null); }}
          fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.1} deleteKeyCode={null} zoomOnDoubleClick={false}
          nodesDraggable nodesConnectable connectionMode={'loose' as never} proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          {pic.nodes.length > 40 && <MiniMap pannable zoomable />}
        </ReactFlow>
        {pop && (
          <div className="mpop" style={{ left: Math.min(pop.at.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300), top: pop.at.y + 12 }} onMouseDown={e => e.stopPropagation()}>
            {pop.mode === 'new' ? <>
              <div className="mpop-head">{pop.parent ? `A node linked to ${nameOf(pop.parent)}` : 'A new node'}</div>
              <label><span>type</span>
                <select value={kind} onChange={e => setKind(e.target.value)}>{kinds.map(k => <option key={k} value={k}>{k}</option>)}</select>
              </label>
              {pop.parent && <label><span>link</span>
                <select value={verb} onChange={e => setVerb(e.target.value)}>{[...new Set([verb, ...offered])].map(v => <option key={v} value={v}>{v}</option>)}</select>
              </label>}
              <input autoFocus placeholder="title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void createNode(); if (e.key === 'Escape') setPop(null); }} />
              <div className="mpop-row">
                <button type="button" onClick={() => void createNode()} disabled={busy || !title.trim()}>Add</button>
                <button type="button" className="linkish" onClick={() => setPop(null)}>Close</button>
              </div>
            </> : <>
              <div className="mpop-head">{nameOf(pop.from)} → {nameOf(pop.to)}</div>
              <div className="mpop-verbs">{offered.map(v => <button key={v} type="button" className={v === pop.was ? 'on' : ''} onClick={() => void setEdgeVerb(v)}>{v}</button>)}</div>
              <input placeholder="another verb" defaultValue="" onKeyDown={e => { if (e.key === 'Enter') void setEdgeVerb((e.target as HTMLInputElement).value); if (e.key === 'Escape') setPop(null); }} />
              <div className="mpop-row">
                <button type="button" className="linkish bad" onClick={() => void unlink()} disabled={busy}>Unlink</button>
                <button type="button" className="linkish" onClick={() => setPop(null)}>Close</button>
              </div>
            </>}
          </div>
        )}
      </div>
      {selected && (
        <aside className="mside">
          <div className="mside-head">
            <span className="pill k" style={{ background: `var(--k-${selected.kind}, var(--k-other))` }}>{selected.kind}</span>
            <code className="small">{selected.id}</code>
            <span className="np-spacer" />
            <button type="button" className="np-x" onClick={() => setSel(null)} aria-label="Close">×</button>
          </div>
          <EmbeddedCard id={selected.id} />
          <div className="mside-foot">
            {selected.ref && <span className="muted small">written on another page</span>}
            <Link className="linkish small" href={`/${product}/graph?focus=${encodeURIComponent(selected.id)}`}>Open in the graph ↗</Link>
            {confirmDrop
              ? <button type="button" className="linkish bad small" onClick={() => void drop(selected.id)} disabled={busy}>{selected.ref ? 'Take it off the map?' : 'Delete the node?'}</button>
              : <button type="button" className="linkish small" onClick={() => setConfirmDrop(true)}>{selected.ref ? 'Take off the map' : 'Delete'}</button>}
          </div>
        </aside>
      )}
    </section>
  );
}
