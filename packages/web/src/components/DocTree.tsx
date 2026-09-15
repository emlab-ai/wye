'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export type TreeItem = { slug: string; title: string; icon: string; children: TreeItem[] };

// Docmost-style page tree: chevron for pages with children, a dot for leaves, an emoji icon, the title.
export function DocTree({ base, roots }: { base: string; roots: TreeItem[] }) {
  const path = usePathname();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setClosed(JSON.parse(localStorage.getItem('wf-tree-closed') ?? '{}')); } catch { /* ignore */ } }, []);
  const toggle = (slug: string) => setClosed(c => { const n = { ...c, [slug]: !c[slug] }; try { localStorage.setItem('wf-tree-closed', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const Item = ({ d, depth }: { d: TreeItem; depth: number }) => {
    const href = `${base}/d/${d.slug}`; const on = path === href;
    const open = !closed[base + d.slug];
    return (
      <li>
        <div className={`pg-row ${on ? 'on' : ''}`} style={{ paddingLeft: 18 + depth * 18 }}>
          {d.children.length ? <button className="pg-caret" onClick={() => toggle(base + d.slug)} aria-label={open ? 'collapse' : 'expand'}>{open ? '▾' : '▸'}</button> : <span className="pg-dot">•</span>}
          <Link href={href} className="pg-link"><span className="pg-icon">{d.icon}</span><span className="pg-title">{d.title}</span></Link>
        </div>
        {d.children.length > 0 && open && <ul>{d.children.map(c => <Item key={c.slug} d={c} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  return <ul className="pg-tree">{roots.map(r => <Item key={r.slug} d={r} depth={0} />)}</ul>;
}
