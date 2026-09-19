'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayout } from './Shell';
import { requestSend } from './CommandBox';
import { TabStrip, type Tab } from './Tabs';

export type DocMeta = { slug: string; node: string; title: string; icon: string; project: string; parent?: string; mtime: string };
const PAGES: Record<string, string> = { goals: 'Goals', tasks: 'Tasks', questions: 'Questions', knowledge: 'Knowledge', graph: 'Graph', inbox: 'Inbox', sessions: 'Agents', plans: 'Plans', new: 'New product', types: 'Types', search: 'Search' };
const PAGE_ICONS: Record<string, string> = { goals: '◎', tasks: '☑', questions: '?', knowledge: '◈', graph: '⌬', inbox: '⇩', sessions: '⚡', types: '○', search: '⌕', plans: '🗺️' };

const ago = (iso: string) => { const m = (Date.now() - Date.parse(iso)) / 60000; if (m < 1) return 'just now'; if (m < 60) return `${Math.round(m)} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`; const d = Math.round(m / 1440); return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString(); };

// Back and forward through the browser's history (req:wf2.ui.history-nav): the Navigation API says whether there is
// anywhere to go when the browser has it; otherwise back is possible once the history has more than one entry and
// forward is always offered. ⌘[ / ⌘] do the same.
type Nav = { canGoBack: boolean; canGoForward: boolean; addEventListener: (t: string, h: () => void) => void; removeEventListener: (t: string, h: () => void) => void };
function useHistoryNav(path: string) {
  const [can, setCan] = useState({ back: false, forward: true });
  useEffect(() => {
    const nav = (window as unknown as { navigation?: Nav }).navigation;
    const read = () => setCan(nav ? { back: nav.canGoBack, forward: nav.canGoForward } : { back: window.history.length > 1, forward: true });
    read();
    // the entry changes inside Next's own history patch (an insertion effect on router.refresh): update after it
    const later = () => { setTimeout(read, 0); };
    nav?.addEventListener('currententrychange', later);
    return () => nav?.removeEventListener('currententrychange', later);
  }, [path]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key === '[') { e.preventDefault(); window.history.back(); } else if (e.key === ']') { e.preventDefault(); window.history.forward(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  return can;
}

// The pages open in the content column, as tabs (req:wf2.ui.tabs): every navigation inside the product opens a
// tab next to the current one (or brings back the tab that already shows the page); a click on a tab goes there,
// × closes it and shows its neighbour. Remembered per product in this browser.
type PageTab = { href: string; label: string; icon: string };
function usePageTabs(product: string, path: string, label: string, icon: string) {
  const router = useRouter();
  const key = `wf-tabs:${product}`;
  const [tabs, setTabs] = useState<PageTab[] | null>(null);
  const lastPath = useRef(path); // the tab that was current before this navigation: the new tab opens after it
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); setTabs(Array.isArray(v) ? v : []); } catch { setTabs([]); } }, [key]);
  // the current page: its tab gets the fresh title, or a new tab opens after the one that was current
  useEffect(() => {
    if (tabs === null || !path.startsWith(`/${product}`)) return;
    setTabs(cur => {
      const list = cur ?? [];
      const i = list.findIndex(t => t.href === path);
      let next: PageTab[];
      if (i >= 0) next = list[i].label === label && list[i].icon === icon ? list : list.map((t, k) => k === i ? { ...t, label, icon } : t);
      else { const at = list.findIndex(t => t.href === lastPath.current); next = [...list]; next.splice(at >= 0 ? at + 1 : list.length, 0, { href: path, label, icon }); }
      lastPath.current = path;
      if (next !== list) { try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  }, [tabs === null, path, label, icon, product, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback((href: string) => {
    setTabs(cur => {
      const list = cur ?? []; const i = list.findIndex(t => t.href === href); if (i < 0) return list;
      const next = list.filter(t => t.href !== href);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      if (href === path) { const to = next[i] ?? next[i - 1]; lastPath.current = to?.href ?? `/${product}`; router.push(to?.href ?? `/${product}`); }
      return next;
    });
  }, [key, path, product, router]);
  return { tabs: tabs ?? [], pick: (href: string) => { if (href !== path) router.push(href); }, close };
}

// The bar above the content, Notion style: sidebar control, back / forward, breadcrumbs (product › parents ›
// document), last edit, copy link and send to agent.
export function TopBar({ product, docs }: { product: { slug: string; title: string; icon: string }; docs: Record<string, DocMeta> }) {
  const path = usePathname(); const { rail, toggleRail, panel, togglePanel } = useLayout();
  const can = useHistoryNav(path);
  const parts = path.split('/').filter(Boolean); // [product, ...]
  const crumbs: { href: string; label: string; icon?: string }[] = [{ href: `/${product.slug}`, label: product.title, icon: product.icon || '◆' }];
  let doc: DocMeta | undefined; let edited = '';
  if (parts[1] === 'sessions' && parts[2]) { crumbs.push({ href: `/${product.slug}/sessions`, label: PAGES.sessions }, { href: `/${product.slug}/sessions/${parts[2]}`, label: `session ${parts[2].slice(0, 6)}` }); if (parts[3]) crumbs.push({ href: path, label: parts[3] }); }
  else if (parts[1] === 'types' && parts[2]) crumbs.push({ href: `/${product.slug}/types`, label: PAGES.types }, { href: path, label: parts[2] });
  else if (parts[1] && PAGES[parts[1]]) crumbs.push({ href: `/${product.slug}/${parts[1]}`, label: PAGES[parts[1]] });
  else if (parts[1] === 'knowledge' && parts[2]) crumbs.push({ href: `/${product.slug}/knowledge`, label: 'Knowledge' }, { href: path, label: parts[2] });
  else if (parts[1] && parts[2] === 'd' && parts[3]) {
    doc = docs[parts[3]];
    const chain: DocMeta[] = []; let cur: DocMeta | undefined = doc; const seen = new Set<string>();
    while (cur && !seen.has(cur.slug)) { seen.add(cur.slug); chain.unshift(cur); cur = cur.parent ? docs[cur.parent] : undefined; }
    for (const d of chain) crumbs.push({ href: `/${product.slug}/${d.project}/d/${d.slug}`, label: d.title, icon: d.icon });
    if (!chain.length) crumbs.push({ href: path, label: parts[3] });
    if (doc) edited = ago(doc.mtime);
  } else if (parts[1]) crumbs.push({ href: `/${product.slug}/${parts[1]}`, label: parts[1] });
  const link = typeof window !== 'undefined' ? window.location.origin + path : path;
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); } };
  const last = crumbs[crumbs.length - 1];
  const pages = usePageTabs(product.slug, path, last.label, last.icon ?? PAGE_ICONS[parts[1] ?? ''] ?? '');
  const pageTabs: Tab[] = pages.tabs.map(t => ({ key: t.href, label: t.label, icon: t.icon || undefined, title: t.href }));
  return (
    <div className="topframe">
    <TabStrip label="Open pages" tabs={pageTabs} active={path} onPick={pages.pick} onClose={pages.close}
      before={!rail ? <button className="topbar-btn topbar-rail" onClick={toggleRail} title="Open the sidebar (⌘\\)" aria-label="Open sidebar">»</button> : undefined}
      after={<button className={`topbar-btn ${panel ? 'on' : ''}`} onClick={togglePanel} title={`${panel ? 'Hide' : 'Show'} the context panel (⌘.)`} aria-label="Toggle context panel">◫</button>} />
    <header className="topbar">
      <span className="topbar-nav">
        <button className="topbar-btn" onClick={() => window.history.back()} disabled={!can.back} title="Back (⌘[)" aria-label="Back">‹</button>
        <button className="topbar-btn" onClick={() => window.history.forward()} disabled={!can.forward} title="Forward (⌘])" aria-label="Forward">›</button>
      </span>
      <nav className="crumbs-nav" aria-label="Breadcrumb">
        {crumbs.map((c, i) => <span key={c.href + i} className="crumb">{i > 0 && <span className="crumb-sep">/</span>}<Link href={c.href} className={i === crumbs.length - 1 ? 'on' : ''}>{c.icon && <span className="crumb-icon">{c.icon}</span>}{c.label}</Link></span>)}
      </nav>
      <span className="topbar-right">
        {edited && <span className="muted topbar-edited">Edited {edited}</span>}
        {doc && <button className="topbar-btn" onClick={() => requestSend({ refs: [doc!.node], source: { project: doc!.project, doc: doc!.slug, link } })} title="Send this document to an agent">⇢ agent</button>}
        <button className="topbar-btn" onClick={copy} title="Copy link">⧉</button>
      </span>
    </header>
    </div>
  );
}
function toast(text: string) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; document.body.appendChild(el);
  setTimeout(() => el.classList.add('on'), 10); setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, 1800);
}
