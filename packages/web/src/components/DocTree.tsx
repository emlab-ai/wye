'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type DragEvent } from 'react';

export type TreeItem = { slug: string; node: string; title: string; icon: string; project: string; children: TreeItem[] };
type Zone = 'before' | 'into' | 'after';
type Drag = { slug: string; node: string }; // the dragged document: its slug and its node id (rule:page-node-line)
type Over = { slug: string; zone: Zone };
// What every row shares with the tree. Rows are a module-level component (Row) on purpose: a component defined
// inside DocTree's render would take a new identity on every state change, so setDrag on dragstart would remount
// every row — and Chrome ends a native drag the moment its source node leaves the document (bug:dnd-remount).
type Tree = { product: string; path: string; closed: Record<string, boolean>; toggle: (slug: string) => void; drag: Drag | null; over: Over | null;
  setDrag: (d: Drag | null) => void; setOver: (o: Over | null) => void; move: (id: string, parent: string | null, rel?: { before?: string; after?: string }) => void; onAddChild: (parent: TreeItem) => void };

// Docmost-style document tree: chevron for documents with children, a dot for leaves, an emoji icon, the title.
// Rows can be dragged: onto a row nests the document under it, between rows reorders; a hover "+" adds a child.
export function DocTree({ product, roots, onAddChild }: { product: string; roots: TreeItem[]; onAddChild: (parent: TreeItem) => void }) {
  const path = usePathname(); const router = useRouter();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [rootOver, setRootOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { try { setClosed(JSON.parse(localStorage.getItem('wf-tree-closed') ?? '{}')); } catch { /* ignore */ } }, []);
  const toggle = (slug: string) => setClosed(c => { const n = { ...c, [slug]: !c[slug] }; try { localStorage.setItem('wf-tree-closed', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const move = async (id: string, parent: string | null, rel?: { before?: string; after?: string }) => {
    setMsg(null); const slug = find(roots, id)?.slug;
    const r = await fetch(`/api/${product}/docs/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, parent, ...rel }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    if (j.href && slug && path.endsWith(`/d/${slug}`) && j.href !== path) router.push(j.href);
    router.refresh();
  };
  const tree: Tree = { product, path, closed, toggle, drag, over, setDrag, setOver, move, onAddChild };
  return (
    <div className="pg-wrap">
      <ul className="pg-tree">{roots.map(r => <Row key={r.slug} d={r} depth={0} parent={null} tree={tree} />)}</ul>
      {drag && <div className={`pg-rootdrop ${rootOver ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setRootOver(true); }} onDragLeave={() => setRootOver(false)} onDrop={e => { e.preventDefault(); setRootOver(false); const src = e.dataTransfer.getData('text/plain') || drag.node; setDrag(null); move(src, null); }}>drop here for top level</div>}
      {msg && <p className="notice pg-msg">{msg}</p>}
    </div>
  );
}

const zoneOf = (e: DragEvent<HTMLDivElement>): Zone => { const r = e.currentTarget.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'; };

function Row({ d, depth, parent, tree }: { d: TreeItem; depth: number; parent: TreeItem | null; tree: Tree }) {
  const { product, path, closed, toggle, drag, over, setDrag, setOver, move, onAddChild } = tree;
  const href = `/${product}/${d.project}/d/${d.slug}`; const on = path === href;
  const open = !closed[d.slug];
  const id = d.node;
  const dropClass = over?.slug === d.slug ? `drop-${over.zone}` : '';
  return (
    <li>
      <div className={`pg-row ${on ? 'on' : ''} ${drag?.slug === d.slug ? 'dragging' : ''} ${dropClass}`} style={{ paddingLeft: 18 + depth * 18 }} draggable
           onDragStart={e => { setDrag({ slug: d.slug, node: id }); e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }}
           onDragEnd={() => { setDrag(null); setOver(null); }}
           onDragOver={e => { if (!drag || drag.slug === d.slug) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const zone = zoneOf(e); if (over?.slug !== d.slug || over.zone !== zone) setOver({ slug: d.slug, zone }); }}
           onDragLeave={() => { if (over?.slug === d.slug) setOver(null); }}
           onDrop={e => {
             e.preventDefault(); const src = e.dataTransfer.getData('text/plain') || (drag ? drag.node : ''); const zone = zoneOf(e); setOver(null); setDrag(null);
             if (!src || src === id) return;
             if (zone === 'into') move(src, id); else move(src, parent ? parent.node : null, zone === 'before' ? { before: id } : { after: id });
           }}>
        {d.children.length ? <button className="pg-caret" onClick={() => toggle(d.slug)} aria-label={open ? 'collapse' : 'expand'}>{open ? '▾' : '▸'}</button> : <span className="pg-dot">•</span>}
        <Link href={href} className="pg-link" draggable={false}><span className="pg-icon">{d.icon}</span><span className="pg-title">{d.title}</span></Link>
        <button className="pg-add" title="Add a sub-document" onClick={() => onAddChild(d)}>+</button>
      </div>
      {d.children.length > 0 && open && <ul>{d.children.map(c => <Row key={c.slug} d={c} depth={depth + 1} parent={d} tree={tree} />)}</ul>}
    </li>
  );
}

function find(items: TreeItem[], node: string): TreeItem | undefined { for (const d of items) { if (d.node === node) return d; const c = find(d.children, node); if (c) return c; } return undefined; }
