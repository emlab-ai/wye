'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DocTree, type TreeItem } from './DocTree';
import { Search } from './Search';
import { NewDoc } from './NewDoc';

export type RailProject = { slug: string; title: string; icon: string; kind: string; status: string; main: string; roots: TreeItem[]; docs: { slug: string; title: string }[] };

// The left rail: product switcher, menu (Overview, Search, Knowledge, Graph, Inbox), then projects with their pages.
export function Rail({ products, product, projects, headings }: { products: { slug: string; title: string; icon: string }[]; product: { slug: string; title: string; icon: string }; projects: RailProject[]; headings: { doc: string; slug: string; text: string }[] }) {
  const path = usePathname(); const router = useRouter();
  const [showSearch, setShowSearch] = useState(false);
  const [newIn, setNewIn] = useState<string | null>(null); // '' = top level, slug = under that document
  // every project's documents in one tree; a project is just the folder a document lives in
  const roots = projects.flatMap(p => p.roots);
  const docs = projects.flatMap(p => p.docs.map(d => ({ ...d, project: p.slug })));
  const base = `/${product.slug}`;
  const item = (href: string, label: string, icon: string) => <li><Link href={href} className={path === href ? 'on' : ''}><i>{icon}</i>{label}</Link></li>;
  return (
    <nav className="rail">
      <div className="rail-ws"><span className="rail-ws-mark">W</span><span className="rail-ws-name">Waterfall</span><button className="rail-close" onClick={() => window.dispatchEvent(new CustomEvent('wf:rail', { detail: 'toggle' }))} title="Close the sidebar (⌘\\)" aria-label="Close sidebar">«</button></div>
      <div className="rail-space">
        <span className="rail-space-mark">{product.icon || product.title.slice(0, 2).toUpperCase()}</span>
        <select className="rail-space-sel" value={product.slug} onChange={e => router.push(e.target.value === '__new' ? '/new' : `/${e.target.value}`)}>
          {products.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          <option value="__new">+ New product…</option>
        </select>
      </div>
      <ul className="rail-menu">
        {item(base, 'Overview', '⌂')}
        <li><button onClick={() => setShowSearch(v => !v)} className={showSearch ? 'on' : ''}><i>⌕</i>Search</button></li>
        {item(`${base}/goals`, 'Goals', '◎')}
        {item(`${base}/tasks`, 'Tasks', '☑')}
        {item(`${base}/knowledge`, 'Knowledge', '◈')}
        {item(`${base}/types`, 'Types', '⬡')}
        {item(`${base}/graph`, 'Graph', '⌬')}
        {item(`${base}/questions`, 'Questions', '?')}
        {item(`${base}/inbox`, 'Inbox', '⇩')}
        {item(`${base}/sessions`, 'Sessions', '⚡')}
      </ul>
      {showSearch && <div className="rail-search"><Search product={product.slug} projects={projects.map(p => ({ slug: p.slug, docs: p.docs }))} headings={headings} /></div>}
      <div className="rail-pages-head"><span>Documents</span><button onClick={() => setNewIn(newIn === '' ? null : '')} title="New document">+</button></div>
      {newIn !== null && <NewDoc product={product.slug} project={docs.find(d => d.slug === newIn)?.project ?? projects[0]?.slug ?? ''} projects={projects.map(p => ({ slug: p.slug, title: p.title }))} docs={docs} defaultParent={newIn} open onClose={() => setNewIn(null)} />}
      <div className="rail-body">
        <DocTree product={product.slug} roots={roots} onAddChild={d => setNewIn(d.slug)} />
        {!roots.length && <p className="muted" style={{ padding: '6px 16px', fontSize: 13 }}>No documents yet. Press + to create one.</p>}
      </div>
    </nav>
  );
}
