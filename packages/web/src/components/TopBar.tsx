'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayout } from './Shell';
import { requestSend } from './CommandBox';

export type DocMeta = { slug: string; title: string; icon: string; project: string; parent?: string; mtime: string };
const PAGES: Record<string, string> = { goals: 'Goals', tasks: 'Tasks', questions: 'Questions', knowledge: 'Knowledge', graph: 'Graph', inbox: 'Inbox', sessions: 'Agents', new: 'New product' };

const ago = (iso: string) => { const m = (Date.now() - Date.parse(iso)) / 60000; if (m < 1) return 'just now'; if (m < 60) return `${Math.round(m)} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`; const d = Math.round(m / 1440); return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString(); };

// The bar above the content, Notion style: sidebar control, breadcrumbs (product › parents › document), last edit,
// copy link and send to agent.
export function TopBar({ product, docs }: { product: { slug: string; title: string; icon: string }; docs: Record<string, DocMeta> }) {
  const path = usePathname(); const { rail, toggleRail, panel, togglePanel } = useLayout();
  const parts = path.split('/').filter(Boolean); // [product, ...]
  const crumbs: { href: string; label: string; icon?: string }[] = [{ href: `/${product.slug}`, label: product.title, icon: product.icon || '◆' }];
  let doc: DocMeta | undefined; let edited = '';
  if (parts[1] && PAGES[parts[1]]) crumbs.push({ href: `/${product.slug}/${parts[1]}`, label: PAGES[parts[1]] });
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
  return (
    <header className="topbar">
      {!rail && <button className="topbar-btn topbar-rail" onClick={toggleRail} title="Open the sidebar (⌘\\)" aria-label="Open sidebar">»</button>}
      <nav className="crumbs-nav" aria-label="Breadcrumb">
        {crumbs.map((c, i) => <span key={c.href + i} className="crumb">{i > 0 && <span className="crumb-sep">/</span>}<Link href={c.href} className={i === crumbs.length - 1 ? 'on' : ''}>{c.icon && <span className="crumb-icon">{c.icon}</span>}{c.label}</Link></span>)}
      </nav>
      <span className="topbar-right">
        {edited && <span className="muted topbar-edited">Edited {edited}</span>}
        {doc && <button className="topbar-btn" onClick={() => requestSend({ refs: [`module:${doc!.slug}`], source: { project: doc!.project, doc: doc!.slug, link } })} title="Send this document to an agent">⇢ agent</button>}
        <button className="topbar-btn" onClick={copy} title="Copy link">⧉</button>
        <button className={`topbar-btn ${panel ? 'on' : ''}`} onClick={togglePanel} title={`${panel ? 'Hide' : 'Show'} the context panel (⌘.)`} aria-label="Toggle context panel">◫</button>
      </span>
    </header>
  );
}
function toast(text: string) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; document.body.appendChild(el);
  setTimeout(() => el.classList.add('on'), 10); setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, 1800);
}
