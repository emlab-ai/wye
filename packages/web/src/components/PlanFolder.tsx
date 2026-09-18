'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export type PlanItem = { slug: string; project: string; title: string; icon: string; status: string; started: string };

// The rail's Plans system folder (req:wf2.ui.plans-folder, rule:plans-folder): the last entry of the menu opens the
// product's Plans page; under it every plan document newest first, the open one marked. The folder collapses with
// its caret and the choice is remembered per browser. No drag, no menu — plans are made by requests, not by hand.
export function PlanFolder({ product, plans }: { product: string; plans: PlanItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem('wf-plans-open') !== '0'); } catch { /* ignore */ } }, []);
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-plans-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const href = `/${product}/plans`;
  return (
    <li className="plan-folder">
      <div className={`pf-head ${path === href ? 'on' : ''}`}>
        <Link href={href}><i>🗺</i>Plans</Link>
        <button className="pf-caret" onClick={toggle} aria-label={open ? 'collapse plans' : 'expand plans'} aria-expanded={open}>{open ? '▾' : '▸'}</button>
      </div>
      {open && <ul className="pf-list">
        {plans.map(p => { const h = `/${product}/${p.project}/d/${p.slug}`; return (
          <li key={`${p.project}/${p.slug}`} className={`pf-row s-${p.status} ${path === h ? 'on' : ''}`}>
            <Link href={h} className="pg-link" title={`${p.status}${p.started ? ` · ${p.started.slice(0, 10)}` : ''}`}><span className="pg-icon">{p.icon}</span><span className="pg-title">{p.title}</span></Link>
          </li>); })}
        {!plans.length && <li className="pf-empty muted">no plans yet</li>}
      </ul>}
    </li>
  );
}
