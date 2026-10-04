'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DocTree, type TreeItem } from './DocTree';
import { NewPage } from './NewPage';
import { filesOfDrop, type Picked } from './ImportDocs';
import { ThemeButton } from './ThemeSwitch';
import { IconChevronsLeft, IconSettings, IconTarget, IconImport, IconPlus } from './Icons';
import { AgentFolder } from './AgentFolder';
import type { Pin } from '@/lib/pins';
import { PrFolder, type PrItem } from './PrFolder';
import { SkillFolder, type SkillItem } from './SkillFolder';
import { RailSettings } from './RailSettings';
import { systemSlug } from '@/lib/doc';

const MIN_PANE = 96; // the least a pane keeps when the splitter is dragged: a few rows

export type RailProject = { slug: string; title: string; icon: string; kind: string; status: string; main: string; roots: TreeItem[]; docs: { slug: string; title: string }[] };

// The left rail: product switcher, menu (Overview, Search, Goals, Tasks, Knowledge, Types, Graph, Constitution, Questions, Inbox, Agents,
// then the PRs system folder — component:request-folder), then every project's documents as one tree.
export function Rail({ pins = [], mainProject, products, product, projects, prs, views = [], skills = [], skillsPage = null, headings }: { skills?: SkillItem[]; skillsPage?: { project: string; slug: string } | null; views?: { slug: string; title: string; icon: string; project: string }[]; products: { slug: string; title: string; icon: string }[]; product: { slug: string; title: string; icon: string }; projects: RailProject[]; prs: PrItem[]; headings: { doc: string; slug: string; text: string }[]; pins?: Pin[]; mainProject?: string }) {
  const path = usePathname(); const router = useRouter();
  const [newIn, setNewIn] = useState<string | null>(null); // '' = top level, <project>/<slug> = under that document
  // Import… (component:import-docs): the dialog, opened by its button or by files dropped on the documents area
  const [importing, setImporting] = useState<Picked[] | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');
  // every project's documents in one tree; a project is just the folder a document lives in
  const roots = projects.flatMap(p => p.roots);
  const docs = projects.flatMap(p => p.docs.map(d => ({ ...d, project: p.slug })));
  const base = `/${product.slug}`;
  // Hooks is a system view page but configures the product: it goes under Settings, not with Goals and Work
  const hooksSlug = systemSlug('hooks'); const hooks = views.find(v => v.slug === hooksSlug);
  const item = (href: string, label: string, icon: string) => <li><Link href={href} className={path === href ? 'on' : ''}><i>{icon}</i>{label}</Link></li>;
  // the menu pane and the Documents pane share the rail's height: the menu pane takes what it needs (up to ~60%)
  // until the person drags the splitter between them, from then on the height they set, remembered per browser
  const nav = useRef<HTMLElement>(null); const top = useRef<HTMLDivElement>(null); const split = useRef<HTMLDivElement>(null);
  const [topH, setTopH] = useState<number | null>(null); const topRef = useRef<number | null>(null);
  const setTop = (h: number | null) => { topRef.current = h; setTopH(h); };
  useEffect(() => { try { const v = Number(localStorage.getItem('wf-rail-split')); if (v) setTop(v); } catch { /* ignore */ } }, []);
  // the menu pane may take everything but the splitter and a few rows of Documents
  const clampTop = useCallback((h: number) => { const r = nav.current?.getBoundingClientRect(), t = top.current?.getBoundingClientRect(); if (!r || !t) return h; const splitH = split.current?.getBoundingClientRect().height ?? 9; return Math.max(MIN_PANE, Math.min(h, r.bottom - t.top - splitH - 2 - MIN_PANE)); }, []);
  const onSplit = (e: React.MouseEvent) => {
    e.preventDefault(); document.body.classList.add('resizing-y');
    const y0 = e.clientY, h0 = top.current?.getBoundingClientRect().height ?? 0;
    const move = (ev: MouseEvent) => setTop(clampTop(h0 + ev.clientY - y0));
    const up = () => { document.body.classList.remove('resizing-y'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); try { if (topRef.current) localStorage.setItem('wf-rail-split', String(Math.round(topRef.current))); } catch { /* ignore */ } };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const resetSplit = () => { setTop(null); try { localStorage.removeItem('wf-rail-split'); } catch { /* ignore */ } };
  return (
    <nav className="rail" ref={nav}>
      <div className="rail-ws"><span className="rail-ws-mark">Y</span><span className="rail-ws-name">Wye</span><span className="rail-ws-tools"><Link className="rail-theme" href={`/settings?from=${product.slug}`} title="App settings — the theme, agents, keys" aria-label="App settings"><IconSettings /></Link><ThemeButton /><button className="rail-close" onClick={() => window.dispatchEvent(new CustomEvent('wf:rail', { detail: 'toggle' }))} title="Close the sidebar (⌘\\)" aria-label="Close sidebar"><IconChevronsLeft /></button></span></div>
      <div className="rail-space">
        <span className="rail-space-mark">{product.icon || product.title.slice(0, 2).toUpperCase()}</span>
        <select className="rail-space-sel" value={product.slug} onChange={e => router.push(e.target.value === '__new' ? '/new' : `/${e.target.value}`)}>
          {products.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          <option value="__new">+ New product…</option>
        </select>
      </div>
      <div className="rail-top" ref={top} style={topH ? { flex: `0 0 ${topH}px`, maxHeight: 'none' } : undefined}>
      <ul className="rail-menu">
        {item(base, 'Overview', '⌂')}
        {pins.map(p => { const h = `${base}/${p.project}/d/${p.slug}`; return <li key={p.ref} className="rail-pin"><Link href={h} className={path === h ? 'on' : ''} title={`${p.title} — pinned (unpin from the document's ⋯ menu)`}><i>{p.icon}</i><span className="rail-pin-title">{p.title}</span><span className="rail-pin-star" aria-label="pinned">★</span></Link></li>; })}
        {views.length ? views.filter(v => v.slug !== hooksSlug).map(v => <li key={v.slug}><Link href={`${base}/${v.project}/d/${v.slug}`} className={path === `${base}/${v.project}/d/${v.slug}` ? 'on' : ''}><i>{v.icon}</i>{v.title}</Link></li>) : <>{item(`${base}/goals`, 'Goals', '◎')}{item(`${base}/work`, 'Work', '☑')}</>}
        {item(`${base}/knowledge`, 'Knowledge', '◈')}
        {item(`${base}/constitution`, 'Constitution', '§')}
        {item(`${base}/inbox`, 'Inbox', '⇩')}
        <AgentFolder product={product.slug} />
        <PrFolder product={product.slug} prs={prs} />
        <RailSettings href={`${base}/settings`}>
          {item(`${base}/types`, 'Types', '⬡')}
          {hooks && item(`${base}/${hooks.project}/d/${hooks.slug}`, hooks.title, hooks.icon)}
          {skillsPage && <SkillFolder product={product.slug} page={skillsPage} skills={skills} />}
        </RailSettings>
      </ul>
      </div>
      <div className="rail-split" ref={split} role="separator" aria-orientation="horizontal" title="Drag to resize; double-click to reset" onMouseDown={onSplit} onDoubleClick={resetSplit} />
      <div className="rail-pages-head"><span>Documents</span><span className="rail-pages-tools"><button className="rail-reveal" onClick={() => window.dispatchEvent(new Event('wf:reveal-doc'))} title="Show the open document in the tree" aria-label="Show the open document"><IconTarget /></button><button onClick={() => { setNewIn(null); setImporting(importing ? null : []); }} title="Import markdown files, a folder, or code" aria-label="Import"><IconImport /></button><button onClick={() => { setImporting(null); setNewIn(newIn === '' ? null : ''); }} title="New document" aria-label="New document"><IconPlus size={18} /></button></span></div>
      {(importing !== null || newIn !== null) && <NewPage product={product.slug} project={newIn ? newIn.split('/')[0] : mainProject ?? projects[0]?.slug ?? ''} projects={projects.map(p => ({ slug: p.slug, title: p.title }))} docs={docs} defaultParent={newIn ?? ''} initial={importing ?? []} startImport={importing !== null} onClose={() => { setNewIn(null); setImporting(null); }} />}
      <div className={`rail-body ${fileOver ? 'file-over' : ''}`}
        onDragOver={e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!fileOver) setFileOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false); }}
        onDrop={async e => { if (!hasFiles(e)) return; e.preventDefault(); setFileOver(false); const got = await filesOfDrop(e.dataTransfer); if (got.length) { setNewIn(null); setImporting(got); } }}>
        {fileOver && <div className="rail-filedrop">drop to import as documents</div>}
        <DocTree product={product.slug} roots={roots} onAddChild={d => setNewIn(`${d.project}/${d.slug}`)} pinned={pins.map(p => p.ref)} />
        {!roots.length && <p className="muted" style={{ padding: '6px 16px', fontSize: 13 }}>No documents yet. Press + to create one.</p>}
      </div>
    </nav>
  );
}
