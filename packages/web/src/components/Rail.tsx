'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DocTree, type TreeItem } from './DocTree';
import { NewPage } from './NewPage';
import { filesOfDrop, type Picked } from './ImportDocs';
import { ThemeButton } from './ThemeSwitch';
import { IconChevronsLeft, IconSettings, IconTarget, IconImport, IconPlus, IconHelp, IconEye, IconRefresh } from './Icons';
import { EmptyState } from './EmptyState';
import { AgentFolder } from './AgentFolder';
import type { Pin } from '@/lib/pins';
import { PrFolder, type PrItem } from './PrFolder';
import { SkillFolder, type SkillItem } from './SkillFolder';
import { RailSettings } from './RailSettings';
import { systemSlug } from '@/lib/doc';
import { WorkspaceMenu, type RailWorkspace } from './WorkspaceMenu';
import { VaultRoots, type RailVault } from './VaultRoots';
import { FileTree } from './FileTree';

const MIN_PANE = 96; // the least a pane keeps when the splitter is dragged: a few rows

export type RailProject = { slug: string; title: string; icon: string; kind: string; status: string; main: string; roots: TreeItem[]; docs: { slug: string; title: string }[] };

// The left rail: the workspace (the open folder, lib/workspace), menu (Overview, Search, Goals, Tasks, Knowledge, Types, Graph, Constitution, Questions, Inbox, Agents,
// then the PRs system folder — component:request-folder), then Documents — one root per vault of the workspace, the
// vault on screen open to its documents as one tree — or, on its Files tab, the open folder's files.
export type RailOnboarding = { done: number; total: number; show: boolean };

export function Rail({ onboarding, pins = [], mainProject, workspace, vaults, product, projects, prs, views = [], skills = [], skillsPage = null, headings }: { skills?: SkillItem[]; skillsPage?: { project: string; slug: string } | null; views?: { slug: string; title: string; icon: string; project: string }[]; workspace: RailWorkspace; vaults: RailVault[]; product: { slug: string; title: string; icon: string }; projects: RailProject[]; prs: PrItem[]; headings: { doc: string; slug: string; text: string }[]; pins?: Pin[]; mainProject?: string; onboarding?: RailOnboarding | null }) {
  const path = usePathname(); const router = useRouter();
  // the lower pane shows one tree at a time (req:wf2.ui.rail-split): the workspaces' documents, or the open folder's files; remembered per browser
  const [pane, setPaneState] = useState<'docs' | 'files'>('docs'); const [filesHidden, setFilesHidden] = useState(false);
  const [find, setFind] = useState({ docs: '', files: '' }); // the pane's filter field: workspaces and documents by title, files by name
  useEffect(() => { try { if (localStorage.getItem('wf-rail-pane') === 'files') setPaneState('files'); } catch { /* ignore */ } }, []);
  const setPane = (p: 'docs' | 'files') => { setPaneState(p); try { localStorage.setItem('wf-rail-pane', p); } catch { /* ignore */ } };
  const [newIn, setNewIn] = useState<string | null>(null); // '' = top level, <project>/<slug> = under that document
  // Import… (component:import-docs): the dialog, opened by its button or by files dropped on the documents area
  const [importing, setImporting] = useState<Picked[] | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');
  // a Quick start step or an empty state asks for the New page sheet (`wf:new-page`, detail.import: on Import)
  useEffect(() => { const h = (e: Event) => { if ((e as CustomEvent<{ import?: boolean } | null>).detail?.import) { setNewIn(null); setImporting([]); } else { setImporting(null); setNewIn(''); } }; window.addEventListener('wf:new-page', h); return () => window.removeEventListener('wf:new-page', h); }, []);
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
      <div className="rail-ws"><span className="rail-ws-mark">Y</span><span className="rail-ws-name">Wye</span><span className="rail-ws-tools"><button className="rail-theme" onClick={() => window.dispatchEvent(new Event('wf:help'))} title="Help — shortcuts, what is where, the Quick start (⌘/)" aria-label="Help"><IconHelp /></button><Link className="rail-theme" href={`/settings?from=${product.slug}`} title="App settings — the theme, agents, keys" aria-label="App settings"><IconSettings /></Link><ThemeButton /><button className="rail-close" onClick={() => window.dispatchEvent(new CustomEvent('wf:rail', { detail: 'toggle' }))} title="Close the sidebar (⌘\\)" aria-label="Close sidebar"><IconChevronsLeft /></button></span></div>
      <WorkspaceMenu workspace={workspace} />
      <div className="rail-top" ref={top} style={topH ? { flex: `0 0 ${topH}px`, maxHeight: 'none' } : undefined}>
      <ul className="rail-menu">
        {item(base, 'Overview', '⌂')}
        <QuickStartItem href={`${base}/start`} on={path === `${base}/start`} product={product.slug} initial={onboarding ?? null} />
        {pins.map(p => { const h = `/${p.product ?? product.slug}/${p.project}/d/${p.slug}`; return <li key={`${p.product ?? ''}/${p.ref}`} className="rail-pin"><Link href={h} className={path === h ? 'on' : ''} title={`${p.title} — pinned${p.vault ? ` in ${p.vault}` : ''} (unpin from the document's ⋯ menu)`}><i>{p.icon}</i><span className="rail-pin-title">{p.title}</span>{p.vault && <span className="vault-chip">{p.vault}</span>}<span className="rail-pin-star" aria-label="pinned">★</span></Link></li>; })}
        {views.length ? views.filter(v => v.slug !== hooksSlug).map(v => <li key={v.slug}><Link href={`${base}/${v.project}/d/${v.slug}`} className={path === `${base}/${v.project}/d/${v.slug}` ? 'on' : ''}><i>{v.icon}</i>{v.title}</Link></li>) : <>{item(`${base}/goals`, 'Goals', '◎')}{item(`${base}/work`, 'Tasks', '☑')}</>}
        {item(`${base}/knowledge`, 'Knowledge', '◈')}
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
      <div className="rail-pages-head rail-pane-tabs" role="tablist">
        <span className="rail-pane-tabset">
          <button role="tab" aria-selected={pane === 'docs'} className={pane === 'docs' ? 'on' : ''} onClick={() => setPane('docs')}>Workspaces</button>
          <button role="tab" aria-selected={pane === 'files'} className={pane === 'files' ? 'on' : ''} onClick={() => setPane('files')}>Files</button>
        </span>
        {pane === 'docs'
          ? <span className="rail-pages-tools"><button className="rail-reveal" onClick={() => window.dispatchEvent(new Event('wf:reveal-doc'))} title="Show the open document in the tree" aria-label="Show the open document"><IconTarget /></button><button onClick={() => { setNewIn(null); setImporting(importing ? null : []); }} title="Import markdown files, a folder, or code" aria-label="Import"><IconImport /></button><button onClick={() => { setImporting(null); setNewIn(newIn === '' ? null : ''); }} title="New document" aria-label="New document"><IconPlus size={18} /></button></span>
          : <span className="rail-pages-tools"><button className={filesHidden ? 'on' : ''} onClick={() => { setFilesHidden(h => !h); window.dispatchEvent(new CustomEvent('wf:files-hidden', { detail: !filesHidden })); }} title={filesHidden ? 'Hide what git ignores and build folders' : 'Show ignored files too (node_modules, build output, .wye)'} aria-pressed={filesHidden} aria-label="Show ignored files"><IconEye /></button><button onClick={() => window.dispatchEvent(new Event('wf:files'))} title="Read the folder again" aria-label="Reload files"><IconRefresh /></button></span>}
      </div>
      <div className="rail-find"><input type="search" value={find[pane]} placeholder={pane === 'docs' ? 'Filter workspaces and documents…' : 'Filter files…'} aria-label={pane === 'docs' ? 'Filter workspaces and documents' : 'Filter files'} onChange={e => setFind(f => ({ ...f, [pane]: e.target.value }))} onKeyDown={e => { if (e.key === 'Escape') setFind(f => ({ ...f, [pane]: '' })); }} /></div>
      {(importing !== null || newIn !== null) && <NewPage product={product.slug} project={newIn ? newIn.split('/')[0] : mainProject ?? projects[0]?.slug ?? ''} projects={projects.map(p => ({ slug: p.slug, title: p.title }))} docs={docs} defaultParent={newIn ?? ''} initial={importing ?? []} startImport={importing !== null} onClose={() => { setNewIn(null); setImporting(null); }} />}
      <div className={`rail-body ${fileOver ? 'file-over' : ''}`}
        onDragOver={e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!fileOver) setFileOver(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false); }}
        onDrop={async e => { if (!hasFiles(e)) return; e.preventDefault(); setFileOver(false); const got = await filesOfDrop(e.dataTransfer); if (got.length) { setNewIn(null); setImporting(got); } }}>
        {fileOver && <div className="rail-filedrop">drop to import as documents</div>}
        {pane === 'docs' && <VaultRoots vaults={vaults.some(v => v.slug === product.slug) ? vaults : [{ slug: product.slug, title: product.title, icon: product.icon, folder: null, parent: null }, ...vaults]} current={product.slug} filter={find.docs}>
          <DocTree product={product.slug} roots={roots} filter={find.docs} onAddChild={d => setNewIn(`${d.project}/${d.slug}`)} pinned={pins.filter(p => !p.product || p.product === product.slug).map(p => p.ref)} />
          {!roots.length && <EmptyState title="No documents yet" actions={<><button className="pri" onClick={() => { setImporting(null); setNewIn(''); }}>New document</button><button onClick={() => { setNewIn(null); setImporting([]); }}>Import</button></>}>Write the product down here, or import Markdown or code. Or drop files on this space.</EmptyState>}
        </VaultRoots>}
        {pane === 'files' && <FileTree product={product.slug} bare filter={find.files} />}
      </div>
    </nav>
  );
}

// The rail's Quick start (docs/superpowers/specs/2026-10-05-onboarding-design.md §2): under Overview, with how many of
// the nine steps are done, while they are not all done and the person has not dismissed it on this machine. The layout
// gives the first count; it follows the app's changes, window focus and a dismissal (`wf:onboarding`).
function QuickStartItem({ href, on, product, initial }: { href: string; on: boolean; product: string; initial: RailOnboarding | null }) {
  const [o, setO] = useState(initial);
  useEffect(() => setO(initial), [initial]);
  useEffect(() => {
    const load = () => { fetch(`/api/${product}/onboarding`).then(r => r.ok ? r.json() : null).then(j => { if (j) setO({ done: j.done, total: j.total, show: j.show }); }).catch(() => {}); };
    const set = (e: Event) => { const j = (e as CustomEvent<RailOnboarding>).detail; if (j) setO({ done: j.done, total: j.total, show: j.show }); };
    window.addEventListener('wf:change', load); window.addEventListener('focus', load); window.addEventListener('wf:onboarding', set);
    return () => { window.removeEventListener('wf:change', load); window.removeEventListener('focus', load); window.removeEventListener('wf:onboarding', set); };
  }, [product]);
  if (!o?.show) return null;
  // a ring that fills as the steps are done
  const r = 6.5, c = 2 * Math.PI * r;
  return <li><Link href={href} className={`rail-qs${on ? ' on' : ''}`} title="Quick start — the first steps with this product"><i><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r={r} fill="none" stroke="var(--line-2)" strokeWidth="2" /><circle cx="8" cy="8" r={r} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${(o.done / o.total) * c} ${c}`} transform="rotate(-90 8 8)" /></svg></i>Quick start<span className="rail-qs-count">{o.done}/{o.total}</span></Link></li>;
}
