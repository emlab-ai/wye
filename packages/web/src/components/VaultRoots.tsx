'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

// Documents with one root per vault (req:wf2.workspace-open, rule:vault-roots): the vaults the workspace reaches, nested
// as their folders nest. The vault on screen is open with its documents as the tree the rail always had (`children`);
// another vault opens in place to its documents — read from its own graph when asked — and a click on a document
// goes there. A vault's row itself opens that vault.
export type RailVault = { slug: string; title: string; icon: string; folder: string | null; parent: string | null; path?: string };
type Doc = { slug: string; title: string; icon: string; project: string; children: Doc[] };

export function VaultRoots({ vaults, current, children, filter = '' }: { vaults: RailVault[]; current: string; children: ReactNode; /** the rail's filter field: a vault shows when its title or slug holds the text, or one below it does; the vault on screen always */ filter?: string }) {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [docs, setDocs] = useState<Record<string, Doc[] | 'loading' | { error: string }>>({});
  const [closedCur, setClosedCur] = useState(false);
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem('wf-vaults-open') ?? '{}')); } catch { /* none */ } }, []);
  const load = (slug: string) => { setDocs(d => ({ ...d, [slug]: 'loading' })); fetch(`/api/${slug}/docs/tree`).then(async r => { const j = await r.json(); setDocs(d => ({ ...d, [slug]: r.ok ? j.roots : { error: j.message ?? j.error } })); }).catch(e => setDocs(d => ({ ...d, [slug]: { error: String(e) } }))); };
  useEffect(() => { for (const s of Object.keys(open)) if (open[s] && s !== current && !docs[s]) load(s); }, [open, current]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (slug: string) => { if (slug === current) { setClosedCur(c => !c); return; } setOpen(o => { const n = { ...o, [slug]: !o[slug] }; if (!n[slug]) delete n[slug]; try { localStorage.setItem('wf-vaults-open', JSON.stringify(n)); } catch { /* ignore */ } return n; }); };
  const docRows = (slug: string, items: Doc[], depth: number): ReactNode => items.map(d => {
    const href = `/${slug}/${d.project}/d/${d.slug}`;
    return <li key={`${d.project}/${d.slug}`}>
      <div className={`pg-row vr-doc ${path === href ? 'on' : ''}`} style={{ paddingLeft: 18 + depth * 18 }}><span className="pg-dot">•</span><Link href={href} className="pg-link" draggable={false}><span className="pg-icon">{d.icon}</span><span className="pg-title">{d.title}</span></Link></div>
      {d.children.length > 0 && <ul>{docRows(slug, d.children, depth + 1)}</ul>}
    </li>;
  });
  const q = filter.trim().toLowerCase();
  const hit = (v: RailVault): boolean => !q || v.slug === current || v.title.toLowerCase().includes(q) || v.slug.includes(q) || vaults.some(c => c.parent === v.slug && hit(c));
  const row = (v: RailVault): ReactNode => {
    if (!hit(v)) return null;
    const cur = v.slug === current; const isOpen = cur ? !closedCur : !!open[v.slug];
    const kids = vaults.filter(c => c.parent === v.slug && hit(c)); const mine = docs[v.slug];
    return (
      <li key={v.slug} className={`vr-vault ${cur ? 'cur' : ''}`}>
        <div className={`pg-row vr-row ${cur && path === `/${v.slug}` ? 'on' : ''}`} style={{ paddingLeft: 6 }} title={v.path ?? v.folder ?? undefined}>
          <button className="pg-caret" onClick={() => toggle(v.slug)} aria-label={isOpen ? 'collapse' : 'expand'} aria-expanded={isOpen}>{isOpen ? '▾' : '▸'}</button>
          <Link href={`/${v.slug}`} className="pg-link" draggable={false}><span className="pg-icon">{v.icon || '📦'}</span><span className="pg-title">{v.title}</span></Link>
        </div>
        {isOpen && <div className="vr-body">
          {cur ? children : mine === 'loading' || !mine ? <p className="ft-note" style={{ paddingLeft: 30 }}>…</p> : 'error' in mine ? <p className="ft-note notice" style={{ paddingLeft: 30 }}>{mine.error}</p> : mine.length ? <ul className="pg-tree">{docRows(v.slug, mine, 0)}</ul> : <p className="ft-note" style={{ paddingLeft: 30 }}>no documents yet</p>}
          {kids.length > 0 && <ul className="pg-tree vr-kids">{kids.map(k => row(k))}</ul>}
        </div>}
      </li>
    );
  };
  return <ul className="pg-tree vr-tree">{vaults.filter(v => !v.parent).map(v => row(v))}</ul>;
}
