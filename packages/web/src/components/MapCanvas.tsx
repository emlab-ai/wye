'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReactFlow, Background, BaseEdge, Controls, MiniMap, Handle, Position, MarkerType, getBezierPath, useInternalNode, useNodesState, useEdgesState, type Connection, type Edge, type EdgeMouseHandler, type EdgeProps, type Node, type NodeChange, type NodeMouseHandler, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutMindMap } from '@/lib/layout';
import { edgeEnds, type Side } from '@/lib/floating';
import { verbsFor, type MapNode, type Spot } from '@/lib/map';
import type { GraphEdge } from '@/lib/graph';
import { usePeek } from './PeekProvider';
import { EmbeddedCard } from './EmbeddedCard';

// The canvas of a map page (component:map-canvas, req:wf2.map.canvas). Its nodes and edges are the page's own cards and
// the links they carry, so a gesture here is an edit to the knowledge: a double click on the canvas adds a node, the +
// on a node grows a child, dragging between two nodes links them, a click on a link names it, a right click on a node
// removes it, and a click on a node shows it in the app's own Context panel
// (decision:map.selection-goes-to-the-context-panel) rather than in a second card floating over the canvas. Dragging is the one gesture that is not knowledge — positions are kept locally and flushed to the page's
// Layout section as one silent write once the hand stops (decision:map.layout-is-a-fenced-section), which is what keeps
// the canvas as quick as a mind-map editor.
type TypeLite = { slug: string; props?: { name: string; ref: string | null }[] };
interface Props { product: string; project: string; slug: string; nodes: MapNode[]; edges: GraphEdge[]; spots: Spot[]; types: TypeLite[]; children?: ReactNode }
type Picture = { nodes: MapNode[]; edges: GraphEdge[]; spots?: Spot[]; id?: string | null };
type NodeData = { kind: string; title: string; status: string; isRef: boolean; near: boolean; open: boolean; onChild: (id: string, at: { x: number; y: number }) => void; onRename: (id: string, title: string) => void; onOpen: (id: string, open: boolean) => void };

const FLUSH_MS = 350;         // a hand at rest: the whole Layout section goes in one write
const CHILD_GAP = 90, CHILD_DY = 80, NODE_GUESS = 200;
const NEAR = 70;              // how close the pointer comes before a node offers its +, in canvas pixels
const CARD_W = 360;           // an opened node is the editor's card, at the width the graph page gives it
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const POS: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const kindOf = (id: string) => id.split(':')[0];
const nameOf = (id: string) => id.split(':').slice(1).join(':');

// A node: its kind, its title, and the + that grows a child. The + appears while the pointer is near the node — not
// only while it is over it, which made the + impossible to reach: it sits beside the card, and crossing the gap would
// have taken the hover away. Renaming happens in place on a double click — the same op:node.edit the card would use, so
// the card and the canvas never disagree. Opened (decision:map.a-node-opens-into-its-card), the node becomes the very
// card the editor and the graph page show, editable field by field, and its "from" line is the drag grip so the fields
// keep their own mouse.
function MapCard({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);
  useEffect(() => setDraft(data.title), [data.title]);
  const save = () => { setEditing(false); if (draft.trim() && draft.trim() !== data.title) data.onRename(id, draft.trim()); };
  const frame = `mnode ${selected ? 'on' : ''} ${data.near || selected ? 'near' : ''} ${data.isRef ? 'is-ref' : ''} s-${data.status || 'none'}`;
  const fold = (
    <button type="button" className="mnode-fold nodrag" title={data.open ? 'Show the title alone' : 'Show the whole card'}
      onClick={e => { e.stopPropagation(); data.onOpen(id, !data.open); }}>{data.open ? '⌃' : '⌄'}</button>
  );
  if (data.open) return (
    <div className={`${frame} open`} data-id={id}>
      {SIDES.map(p => <Handle key={p} id={p} type="source" position={POS[p]} />)}
      {fold}
      <EmbeddedCard id={id} />
    </div>
  );
  return (
    <div className={frame} data-id={id}>
      {SIDES.map(p => <Handle key={p} id={p} type="source" position={POS[p]} />)}
      <span className="mnode-kind pill k" style={{ background: `var(--k-${data.kind}, var(--k-other))` }}>{data.kind}</span>
      {editing
        ? <input className="mnode-edit" autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(data.title); setEditing(false); } }} />
        : <span className="mnode-title" onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}>{data.title || nameOf(id)}</span>}
      {data.isRef && <span className="mnode-ref" title="This node is written on another page">↗</span>}
      {fold}
      <button type="button" className="mnode-add nodrag" title="Add a linked node" onClick={e => { e.stopPropagation(); data.onChild(id, { x: e.clientX, y: e.clientY }); }}>+</button>
    </div>
  );
}
const NODE_TYPES = { map: MapCard };

// A link drawn from the side of one card that faces the other (decision:map.links-take-the-nearest-sides): the ends are
// geometry, not handles, so dragging a card around never leaves an edge sweeping round it.
function FloatingEdge({ source, target, markerEnd, style, label, labelStyle, labelBgStyle }: EdgeProps) {
  const a = useInternalNode(source), b = useInternalNode(target);
  if (!a || !b) return null;
  const box = (n: NonNullable<typeof a>) => ({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w: n.measured.width ?? NODE_GUESS, h: n.measured.height ?? 36 });
  const { from, to } = edgeEnds(box(a), box(b));
  const [path, labelX, labelY] = getBezierPath({ sourceX: from.x, sourceY: from.y, sourcePosition: POS[from.side], targetX: to.x, targetY: to.y, targetPosition: POS[to.side] });
  return <BaseEdge path={path} markerEnd={markerEnd} style={style} label={label} labelX={labelX} labelY={labelY} labelStyle={labelStyle} labelShowBg labelBgStyle={labelBgStyle} labelBgPadding={[4, 2]} labelBgBorderRadius={4} />;
}
const EDGE_TYPES = { floating: FloatingEdge };

export function MapCanvas({ product, project, slug, nodes, edges, spots, types, children }: Props) {
  const rf = useRef<ReactFlowInstance | null>(null);
  const [pic, setPic] = useState<Picture>({ nodes, edges, spots });
  const { select, setShowContext } = usePeek();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(false);
  const [sure, setSure] = useState(false);
  const kinds = useMemo(() => [...types].map(t => t.slug).sort(), [types]);
  const [kind, setKind] = useState(() => (types.some(t => t.slug === 'req') ? 'req' : types[0]?.slug ?? 'req'));
  // the one popup: a new node (on the canvas or off a parent) or the verb of one edge
  const [pop, setPop] = useState<null | { mode: 'new'; at: { x: number; y: number }; flow: { x: number; y: number }; parent?: string } | { mode: 'verb'; at: { x: number; y: number }; from: string; to: string; was: string } | { mode: 'node'; at: { x: number; y: number }; id: string; isRef: boolean }>(null);
  const [title, setTitle] = useState('');
  const [verb, setVerb] = useState('part-of');
  const [near, setNear] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(spots.filter(sp => sp.open).map(sp => sp.id)));

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
    if (j.nodes && j.edges) {
      setPic({ nodes: j.nodes, edges: j.edges, spots: j.spots });
      if (j.spots) setOpen(new Set(j.spots.filter(sp => sp.open).map(sp => sp.id)));
    }
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

  const onOpen = useCallback((id: string, want: boolean) => {
    setOpen(cur => { const next = new Set(cur); if (want) next.add(id); else next.delete(id); return next; });
    void fetch(`/api/${product}/${project}/map/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'open', id, open: want }) });
  }, [product, project, slug]);
  const onChild = useCallback((id: string, at: { x: number; y: number }) => {
    setTitle(''); setPop({ mode: 'new', at, flow: { x: 0, y: 0 }, parent: id });
  }, []);
  // the node the pointer is near enough to offer its + (in flow coordinates, so it holds at any zoom)
  const onMove = useCallback((e: React.MouseEvent) => {
    const i = rf.current; if (!i) return;
    const p = i.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    let hit: string | null = null, best = NEAR;
    for (const n of i.getNodes()) {
      const w = n.measured?.width ?? NODE_GUESS, h = n.measured?.height ?? 36;
      const dx = Math.max(n.position.x - p.x, 0, p.x - (n.position.x + w));
      const dy = Math.max(n.position.y - p.y, 0, p.y - (n.position.y + h));
      const d = Math.hypot(dx, dy);
      if (d <= best) { best = d; hit = n.id; }
    }
    setNear(cur => (cur === hit ? cur : hit));
  }, []);
  const onRename = useCallback((id: string, next: string) => {
    setPic(p => ({ ...p, nodes: p.nodes.map(n => (n.id === id ? { ...n, title: next } : n)) }));   // the canvas shows it at once
    void fetch(`/api/${product}/node/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ props: { title: next } }) });
  }, [product]);

  const computed = useMemo(() => {
    const rfNodes: Node[] = pic.nodes.map(n => ({
      id: n.id, type: 'map', position: seeded.at.get(n.id) ?? { x: 0, y: 0 },
      data: { kind: n.kind, title: n.title, status: n.status, isRef: n.ref, near: n.id === near, open: open.has(n.id), onChild, onRename, onOpen } satisfies NodeData,
      ...(open.has(n.id) ? { style: { width: CARD_W }, dragHandle: '.embed-from' } : {}),
    }));
    const rfEdges: Edge[] = pic.edges.map(e => ({
      id: `${e.from}|${e.verb}|${e.to}`, source: e.from, target: e.to, label: e.verb, type: 'floating',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--line-2)' },
      style: { stroke: e.verb === 'contradicts' ? 'var(--bad)' : 'var(--line-2)' },
      labelStyle: { fontSize: 10, fill: 'var(--muted)' }, labelBgStyle: { fill: 'var(--ground)' }, labelBgPadding: [4, 2] as [number, number],
    }));
    return { rfNodes, rfEdges };
  }, [pic, seeded, near, open, onChild, onRename, onOpen]);
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
  // a click on a node is the same selection a click on a block makes (rule:block-select): the Context panel the app
  // already has shows the node, its links and its content — the canvas never grows a card of its own
  const onNodeClick: NodeMouseHandler = useCallback((_e, n) => { setPop(null); setShowContext(true); select(n.id); }, [select, setShowContext]);
  const onNodeContextMenu: NodeMouseHandler = useCallback((e, n) => {
    e.preventDefault();
    setSure(false);
    setPop({ mode: 'node', at: { x: e.clientX, y: e.clientY }, id: n.id, isRef: !!pic.nodes.find(x => x.id === n.id)?.ref });
  }, [pic]);
  const onPaneDoubleClick = useCallback((e: React.MouseEvent) => {
    const flow = rf.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 };
    setTitle(''); setPop({ mode: 'new', at: { x: e.clientX, y: e.clientY }, flow });
  }, []);

  // the verbs an edge between these two kinds may take, the ontology's first (decision:map.verbs-from-the-ontology)
  const offered = pop?.mode === 'verb' ? verbsFor(types, kindOf(pop.from), kindOf(pop.to)) : pop?.mode === 'new' && pop.parent ? verbsFor(types, kind, kindOf(pop.parent)) : [];
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
    if (made.id) { setShowContext(true); select(made.id); }
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
    if (ok) { setSure(false); setPop(null); }
  }
  function addOnCanvas() {
    const box = rf.current?.getViewport();
    const flow = rf.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: box?.x ?? 0, y: box?.y ?? 0 };
    setTitle(''); setPop({ mode: 'new', at: { x: window.innerWidth / 2 - 120, y: 160 }, flow });
  }

  return (
    <section className="mwrap">
      <div className="mbar">
        <button type="button" onClick={addOnCanvas}>+ Node</button>
        <button type="button" onClick={() => rf.current?.fitView({ padding: 0.2, maxZoom: 1 })}>Fit</button>
        <span className="muted small">double click to add · + beside a node for a child · drag between nodes to link · click a link to name it · right click to remove</span>
        {busy && <span className="muted small">saving…</span>}
        {msg && <span className="notice small">{msg}</span>}
        <span className="mbar-gap" />
        <button type="button" className={text ? 'on' : ''} onClick={() => setText(t => !t)}>{text ? 'Map' : 'Page text'}</button>
      </div>
      <div className="mcanvas" onMouseMove={onMove} onMouseLeave={() => setNear(null)} onDoubleClick={e => { if ((e.target as Element).closest('.react-flow__node, .react-flow__edge, .mpop')) return; onPaneDoubleClick(e); }}>
        <ReactFlow
          nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} onInit={i => { rf.current = i; }}
          onNodesChange={onChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onEdgeClick={onEdgeClick} onNodeClick={onNodeClick} onNodeContextMenu={onNodeContextMenu} onPaneClick={() => setPop(null)}
          fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.1} deleteKeyCode={null} zoomOnDoubleClick={false}
          nodesDraggable nodesConnectable connectionMode={'loose' as never} proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          {pic.nodes.length > 40 && <MiniMap pannable zoomable />}
        </ReactFlow>
        {pop && (
          <div className="mpop" style={{ left: Math.min(pop.at.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300), top: pop.at.y + 12 }} onMouseDown={e => e.stopPropagation()}>
            {pop.mode === 'node' ? <>
              <div className="mpop-head">{pop.id}</div>
              <div className="mpop-row">
                {sure
                  ? <button type="button" className="bad" onClick={() => void drop(pop.id)} disabled={busy}>{pop.isRef ? 'Take it off?' : 'Delete it?'}</button>
                  : <button type="button" onClick={() => setSure(true)}>{pop.isRef ? 'Take off the map' : 'Delete'}</button>}
                <button type="button" className="linkish" onClick={() => setPop(null)}>Close</button>
              </div>
            </> : pop.mode === 'new' ? <>
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
        {text && <div className="msheet">{children}</div>}
      </div>
    </section>
  );
}
