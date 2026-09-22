'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';

export type TreeItem = { slug: string; node: string; title: string; icon: string; project: string; tasks?: { done: number; total: number }; children: TreeItem[] };
type Zone = 'before' | 'into' | 'after';
type Drag = { slug: string; node: string }; // the dragged document: its slug and its node id (rule:page-node-line)
type Over = { slug: string; zone: Zone };
type Menu = { d: TreeItem; x: number; y: number }; // the row's context menu (rule:tree-menu), anchored where it was asked for
// What every row shares with the tree. Rows are a module-level component (Row) on purpose: a component defined
// inside DocTree's render would take a new identity on every state change, so setDrag on dragstart would remount
// every row — and Chrome ends a native drag the moment its source node leaves the document (bug:dnd-remount).
type Tree = { product: string; path: string; closed: Record<string, boolean>; toggle: (slug: string) => void; drag: Drag | null; over: Over | null;
  setDrag: (d: Drag | null) => void; setOver: (o: Over | null) => void; move: (id: string, parent: string | null, rel?: { before?: string; after?: string }) => void; onAddChild: (parent: TreeItem) => void; openMenu: (m: Menu) => void };

// Docmost-style document tree: chevron for documents with children, a dot for leaves, an emoji icon, the title.
// Rows can be dragged: onto a row nests the document under it, between rows reorders; a hover "+" adds a child;
// right-click (or the hover "⋯") opens a menu: duplicate the document, delete it with everything under it.
export function DocTree({ product, roots, onAddChild }: { product: string; roots: TreeItem[]; onAddChild: (parent: TreeItem) => void }) {
  const path = usePathname(); const router = useRouter();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [rootOver, setRootOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  useEffect(() => { // a press outside the menu, Escape or a scroll closes it (React's own listeners sit on document too, so the target is checked, not propagation)
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target instanceof Node && menuEl.current?.contains(e.target))) setMenu(null); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); };
  }, [menu]);
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
  const duplicate = async (d: TreeItem) => {
    setMsg(null); setMenu(null);
    const r = await fetch(`/api/${product}/docs/duplicate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: d.node }) });
    const j = await r.json(); if (!r.ok) { setMsg(j.message ?? j.error); return; }
    router.push(j.href); router.refresh();
  };
  const remove = async (d: TreeItem) => {
    setMenu(null); const below = descendants(d); const n = below.length;
    if (!window.confirm(n ? `Delete "${d.title}" and its ${n} sub-document${n === 1 ? '' : 's'}? This cannot be undone here.` : `Delete "${d.title}"? This cannot be undone here.`)) return;
    setMsg(null);
    const r = await fetch(`/api/${product}/docs/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: d.node }) });
    const j = await r.json(); if (!r.ok) { setMsg(j.message ?? j.error); return; }
    if (j.dangling) setMsg(`${j.dangling} reference${j.dangling === 1 ? '' : 's'} from other documents to the deleted pages now dangle`);
    if ([d, ...below].some(x => path === `/${product}/${x.project}/d/${x.slug}`)) router.push(j.href);
    router.refresh();
  };
  const tree: Tree = { product, path, closed, toggle, drag, over, setDrag, setOver, move, onAddChild, openMenu: setMenu };
  return (
    <div className="pg-wrap">
      {menu && <div ref={menuEl} className="pg-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
        <button role="menuitem" onClick={() => duplicate(menu.d)}>Duplicate</button>
        <button role="menuitem" className="danger" onClick={() => remove(menu.d)}>Delete{menu.d.children.length ? ` (with ${descendants(menu.d).length} below)` : ''}</button>
      </div>}
      <ul className="pg-tree">{roots.map(r => <Row key={r.slug} d={r} depth={0} parent={null} tree={tree} />)}</ul>
      {drag && <div className={`pg-rootdrop ${rootOver ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setRootOver(true); }} onDragLeave={() => setRootOver(false)} onDrop={e => { e.preventDefault(); setRootOver(false); const src = e.dataTransfer.getData('text/plain') || drag.node; setDrag(null); move(src, null); }}>drop here for top level</div>}
      {msg && <p className="notice pg-msg">{msg}</p>}
    </div>
  );
}

const zoneOf = (e: DragEvent<HTMLDivElement>): Zone => { const r = e.currentTarget.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'; };

function Row({ d, depth, parent, tree }: { d: TreeItem; depth: number; parent: TreeItem | null; tree: Tree }) {
  const { product, path, closed, toggle, drag, over, setDrag, setOver, move, onAddChild, openMenu } = tree;
  const href = `/${product}/${d.project}/d/${d.slug}`; const on = path === href;
  const open = !closed[d.slug];
  const id = d.node;
  const dropClass = over?.slug === d.slug ? `drop-${over.zone}` : '';
  const onMenu = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); openMenu(e.type === 'contextmenu' ? { d, x: e.clientX, y: e.clientY } : { d, x: b.left, y: b.bottom + 2 }); };
  return (
    <li>
      <div className={`pg-row ${on ? 'on' : ''} ${drag?.slug === d.slug ? 'dragging' : ''} ${dropClass}`} style={{ paddingLeft: 18 + depth * 18 }} draggable onContextMenu={onMenu}
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
        <Link href={href} className="pg-link" draggable={false} title={d.tasks?.total ? `${d.tasks.done}/${d.tasks.total} tasks done` : undefined}><span className="pg-icon">{d.icon}</span><span className="pg-title">{d.title}</span>{!!d.tasks?.total && <span className="pg-prog">{d.tasks.done}/{d.tasks.total}</span>}</Link>
        <button className="pg-more" title="More…" aria-label="More" onClick={onMenu}>⋯</button>
        <button className="pg-add" title="Add a sub-document" onClick={() => onAddChild(d)}>+</button>
      </div>
      {d.children.length > 0 && open && <ul>{d.children.map(c => <Row key={c.slug} d={c} depth={depth + 1} parent={d} tree={tree} />)}</ul>}
    </li>
  );
}

function descendants(d: TreeItem): TreeItem[] { return d.children.flatMap(c => [c, ...descendants(c)]); }
function find(items: TreeItem[], node: string): TreeItem | undefined { for (const d of items) { if (d.node === node) return d; const c = find(d.children, node); if (c) return c; } return undefined; }
