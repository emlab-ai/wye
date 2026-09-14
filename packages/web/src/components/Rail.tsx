'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { DocTree, type TreeItem } from './DocTree';
import { Search } from './Search';
import { NewDoc } from './NewDoc';

// The left rail: workspace, space, a short menu, then the pages tree.
export function Rail({ project, projectTitle, roots, docs, headings, mainSlug }: { project: string; projectTitle: string; roots: TreeItem[]; docs: { slug: string; title: string }[]; headings: { doc: string; slug: string; text: string }[]; mainSlug: string }) {
  const path = usePathname();
  const [showSearch, setShowSearch] = useState(false);
  const [showNew, setShowNew] = useState(false);
  return (
    <nav className="rail">
      <div className="rail-ws"><span className="rail-ws-mark">W</span><span className="rail-ws-name">Waterfall</span></div>
      <div className="rail-space"><span className="rail-space-mark">{projectTitle.slice(0, 2).toUpperCase()}</span><span className="rail-space-name">{projectTitle}</span></div>
      <ul className="rail-menu">
        <li><Link href={`/p/${project}/d/${mainSlug}`} className={path === `/p/${project}/d/${mainSlug}` ? 'on' : ''}><i>⌂</i>Overview</Link></li>
        <li><button onClick={() => setShowSearch(v => !v)} className={showSearch ? 'on' : ''}><i>⌕</i>Search</button></li>
        <li><Link href={`/p/${project}/graph`} className={path.endsWith('/graph') ? 'on' : ''}><i>◎</i>Graph</Link></li>
        <li><button onClick={() => setShowNew(v => !v)}><i>+</i>New page</button></li>
      </ul>
      {showSearch && <div className="rail-search"><Search project={project} docs={docs} headings={headings} /></div>}
      {showNew && <NewDoc project={project} docs={docs} defaultParent={mainSlug} open onClose={() => setShowNew(false)} />}
      <div className="rail-pages-head"><span>Pages</span><button onClick={() => setShowNew(true)} title="New page">+</button></div>
      <div className="rail-body"><DocTree project={project} roots={roots} /></div>
    </nav>
  );
}
