'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type DragEvent } from 'react';

export type TreeItem = { slug: string; title: string; icon: string; project: string; children: TreeItem[] };
type Zone = 'before' | 'into' | 'after';

// Docmost-style document tree: chevron for documents with children, a dot for leaves, an emoji icon, the title.
// Rows can be dragged: onto a row nests the document under it, between rows reorders; a hover "+" adds a child.
export function DocTree({ product, roots, onAddChild }: { product: string; roots: TreeItem[]; onAddChild: (parent: TreeItem) => void }) {
  const path = usePathname(); const router = useRouter();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ slug: string; zone: Zone } | null>(null);
  const [rootOver, setRootOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { try { setClosed(JSON.parse(localStorage.getItem('wf-tree-closed') ?? '{}')); } catch { /* ignore */ } }, []);
  const toggle = (slug: string) => setClosed(c => { const n = { ...c, [slug]: !c[slug] }; try { localStorage.setItem('wf-tree-closed', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const move = async (id: string, parent: string | null, rel?: { before?: string; after?: string }) => {
    setMsg(null);
    const r = await fetch(`/api/${product}/docs/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, parent, ...rel }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    if (j.href && path.endsWith(`/d/${id.replace(/^module:/, '')}`) && j.href !== path) router.push(j.href);
    router.refresh();
  };
  const zoneOf = (e: DragEvent<HTMLDivElement>): Zone => { const r = e.currentTarget.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'; };
  const Item = ({ d, depth, parent, siblings }: { d: TreeItem; depth: number; parent: TreeItem | null; siblings: TreeItem[] }) => {
    const href = `/${product}/${d.project}/d/${d.slug}`; const on = path === href;
    const open = !closed[d.slug];
    const id = `module:${d.slug}`;
    const dropClass = over?.slug === d.slug ? `drop-${over.zone}` : '';
    return (
      <li>
        <div className={`pg-row ${on ? 'on' : ''} ${drag === d.slug ? 'dragging' : ''} ${dropClass}`} style={{ paddingLeft: 18 + depth * 18 }} draggable
             onDragStart={e => { setDrag(d.slug); e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }}
             onDragEnd={() => { setDrag(null); setOver(null); }}
             onDragOver={e => { if (!drag || drag === d.slug) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const zone = zoneOf(e); if (over?.slug !== d.slug || over.zone !== zone) setOver({ slug: d.slug, zone }); }}
             onDragLeave={() => { if (over?.slug === d.slug) setOver(null); }}
             onDrop={e => {
               e.preventDefault(); const src = e.dataTransfer.getData('text/plain') || (drag ? `module:${drag}` : ''); const zone = zoneOf(e); setOver(null); setDrag(null);
               if (!src || src === id) return;
               if (zone === 'into') move(src, id); else move(src, parent ? `module:${parent.slug}` : null, zone === 'before' ? { before: id } : { after: id });
             }}>
          {d.children.length ? <button className="pg-caret" onClick={() => toggle(d.slug)} aria-label={open ? 'collapse' : 'expand'}>{open ? '▾' : '▸'}</button> : <span className="pg-dot">•</span>}
          <Link href={href} className="pg-link" draggable={false}><span className="pg-icon">{d.icon}</span><span className="pg-title">{d.title}</span></Link>
          <button className="pg-add" title="Add a sub-document" onClick={() => onAddChild(d)}>+</button>
        </div>
        {d.children.length > 0 && open && <ul>{d.children.map(c => <Item key={c.slug} d={c} depth={depth + 1} parent={d} siblings={d.children} />)}</ul>}
        {void siblings}
      </li>
    );
  };
  return (
    <div className="pg-wrap">
      <ul className="pg-tree">{roots.map(r => <Item key={r.slug} d={r} depth={0} parent={null} siblings={roots} />)}</ul>
      {drag && <div className={`pg-rootdrop ${rootOver ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setRootOver(true); }} onDragLeave={() => setRootOver(false)} onDrop={e => { e.preventDefault(); setRootOver(false); const src = e.dataTransfer.getData('text/plain') || `module:${drag}`; setDrag(null); move(src, null); }}>drop here for top level</div>}
      {msg && <p className="notice pg-msg">{msg}</p>}
    </div>
  );
}
