'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

// Settings in the rail is a folder: what configures the product — Types, Hooks, Skills — sits under it, folded with it.
export function RailSettings({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem('wf-settings-open') !== '0'); } catch { /* ignore */ } }, []);
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-settings-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  return (
    <li className="pr-folder settings-folder">
      <div className={`pf-head ${path === href ? 'on' : ''}`}>
        <button className="pf-caret" onClick={toggle} aria-label={open ? 'collapse Settings' : 'expand Settings'} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <Link href={href}><i>⚙</i>Settings</Link>
      </div>
      {open && <ul className="pf-list rail-sub">{children}</ul>}
    </li>
  );
}
