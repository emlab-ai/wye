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
  const [newIn, setNewIn] = useState<string | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [pTitle, setPTitle] = useState(''); const [pKind, setPKind] = useState('project'); const [busy, setBusy] = useState(false);
  const base = `/${product.slug}`;
  const item = (href: string, label: string, icon: string) => <li><Link href={href} className={path === href ? 'on' : ''}><i>{icon}</i>{label}</Link></li>;
  async function createProject() {
    setBusy(true);
    const r = await fetch(`/api/${product.slug}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: pTitle, kind: pKind }) });
    const j = await r.json(); setBusy(false);
    if (r.ok) { setNewProject(false); setPTitle(''); router.push(`/${product.slug}/${j.slug}`); router.refresh(); }
  }
  return (
    <nav className="rail">
      <div className="rail-ws"><span className="rail-ws-mark">W</span><span className="rail-ws-name">Waterfall</span></div>
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
        {item(`${base}/graph`, 'Graph', '⌬')}
        {item(`${base}/inbox`, 'Inbox', '⇩')}
        {item(`${base}/sessions`, 'Sessions', '⚡')}
      </ul>
      {showSearch && <div className="rail-search"><Search product={product.slug} projects={projects.map(p => ({ slug: p.slug, docs: p.docs }))} headings={headings} /></div>}
      <div className="rail-pages-head"><span>Projects</span><button onClick={() => setNewProject(v => !v)} title="New project">+</button></div>
      {newProject && (
        <div className="newdoc-form form">
          <label><span>title</span><input autoFocus value={pTitle} placeholder="e.g. Inventory" onChange={e => setPTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createProject(); }} /></label>
          <label><span>kind</span><select value={pKind} onChange={e => setPKind(e.target.value)}><option value="project">project</option><option value="goal">goal</option></select></label>
          <div className="sec-actions"><button className="pri" disabled={busy || !pTitle.trim()} onClick={createProject}>Create</button><button onClick={() => setNewProject(false)}>Cancel</button></div>
        </div>
      )}
      <div className="rail-body">
        {projects.map(p => (
          <div key={p.slug} className="rail-project">
            <div className={`rail-project-head ${path.startsWith(`${base}/${p.slug}`) ? 'on' : ''}`}>
              <Link href={`${base}/${p.slug}`} className="rail-project-link"><span className="pg-icon">{p.icon}</span><span className="pg-title">{p.title}</span>{p.kind === 'goal' && <span className="rail-kind">goal</span>}</Link>
              <button className="rail-mini" title="New page" onClick={() => setNewIn(newIn === p.slug ? null : p.slug)}>+</button>
            </div>
            {newIn === p.slug && <NewDoc product={product.slug} project={p.slug} docs={p.docs} defaultParent={p.main} open onClose={() => setNewIn(null)} />}
            <DocTree base={`${base}/${p.slug}`} roots={p.roots} />
          </div>
        ))}
        {!projects.length && <p className="muted" style={{ padding: '6px 16px', fontSize: 13 }}>No projects yet. Press + to create one.</p>}
      </div>
    </nav>
  );
}
