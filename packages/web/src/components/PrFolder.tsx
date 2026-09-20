'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export type PrItem = { slug: string; project: string; title: string; icon: string; status: string; started: string };

// The rail's PRs system folder (req:wf2.ui.plans-folder, rule:prs-folder): opens the product's PRs page;
// under it every request newest first, grouped by where it is — refining · approved · building — the open one marked,
// the ended ones folded under done. The folder collapses with its caret and the choice is remembered per browser.
// No drag, no menu — PRs are made from the command box, not by hand.
export function PrFolder({ product, prs }: { product: string; prs: PrItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem('wf-plans-open') !== '0'); } catch { /* ignore */ } }, []);
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-plans-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const href = `/${product}/prs`;
  // PRs that ended fold under "done" (decision:memory.forgetting): out of the way, one click back; the open one stays visible
  const [showDone, setShowDone] = useState(false);
  useEffect(() => { try { setShowDone(localStorage.getItem('wf-plans-done') === '1'); } catch { /* ignore */ } }, []);
  const toggleDone = () => setShowDone(o => { const n = !o; try { localStorage.setItem('wf-plans-done', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const isEnded = (p: PrItem) => ['done', 'failed', 'cancelled', 'complete'].includes(p.status) && path !== `/${product}/${p.project}/d/${p.slug}`;
  const live = prs.filter(p => !isEnded(p)), ended = prs.filter(isEnded);
  const group = (st: string) => live.filter(p => (st === 'refining' ? ['draft', 'refining', ''].includes(p.status) : p.status === st));
  const groups = [['refining', group('refining')], ['approved', group('approved')], ['building', group('building')]] as const;
  const row = (p: PrItem) => { const h = `/${product}/${p.project}/d/${p.slug}`; return (
    <li key={`${p.project}/${p.slug}`} className={`pf-row s-${p.status} ${path === h ? 'on' : ''}`}>
      <Link href={h} className="pg-link" title={`${p.status}${p.started ? ` · ${p.started.slice(0, 10)}` : ''}`}><span className="pg-icon">{p.icon}</span><span className="pg-title">{p.title}</span></Link>
    </li>); };
  return (
    <li className="pr-folder">
      <div className={`pf-head ${path === href ? 'on' : ''}`}>
        <Link href={href}><i>🗺</i>PRs</Link>
        <button className="pf-caret" onClick={toggle} aria-label={open ? 'collapse PRs' : 'expand PRs'} aria-expanded={open}>{open ? '▾' : '▸'}</button>
      </div>
      {open && <ul className="pf-list">
        {groups.map(([st, rows]) => rows.length > 0 && <li key={st} className={`pf-group pf-${st}`}><span className="pf-group-head muted">{st} <small>{rows.length}</small></span><ul className="pf-list">{rows.map(row)}</ul></li>)}
        {!prs.length && <li className="pf-empty muted">no PRs yet</li>}
        {ended.length > 0 && <li className="pf-done"><button className="pf-done-head" onClick={toggleDone} aria-expanded={showDone}>{showDone ? '▾' : '▸'} done <small>{ended.length}</small></button>{showDone && <ul className="pf-list">{ended.map(row)}</ul>}</li>}
      </ul>}
    </li>
  );
}
