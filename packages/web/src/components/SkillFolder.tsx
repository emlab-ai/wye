'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type SkillItem = { slug: string; project: string; title: string; role: string; takes: string; status: string };

// The rail's Skills system folder (decision:wf2.hooks-and-skills): opens the project's Skills page; under it every
// skill document, by title; "+" makes a new one from the template. Collapses like the PRs folder, remembered per browser.
export function SkillFolder({ product, page, skills }: { product: string; page: { project: string; slug: string }; skills: SkillItem[] }) {
  const path = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem('wf-skills-open') !== '0'); } catch { /* ignore */ } }, []);
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-skills-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const href = `/${product}/${page.project}/d/${page.slug}`;
  const [busy, setBusy] = useState(false);
  // the new skill's title is asked in the list itself (the desktop app has no window.prompt)
  const [naming, setNaming] = useState(false); const [title, setTitle] = useState('');
  const add = async () => {
    if (!title.trim()) { setNaming(false); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/${product}/skills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title.trim(), project: page.project }) });
      const j = await r.json(); if (j.slug) router.push(`/${product}/${page.project}/d/${j.slug}`); router.refresh();
    } finally { setBusy(false); setNaming(false); setTitle(''); }
  };
  return (
    <li className="pr-folder skill-folder">
      <div className={`pf-head ${path === href ? 'on' : ''}`}>
        <button className="pf-caret" onClick={toggle} aria-label={open ? 'collapse Skills' : 'expand Skills'} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <Link href={href}><i>✦</i>Skills</Link>
        <button className="pf-add" onClick={() => { setOpen(true); setNaming(true); }} disabled={busy} title="New skill" aria-label="new skill">+</button>
      </div>
      {open && <ul className="pf-list">
        {naming && <li className="pf-new"><input autoFocus className="pf-new-in" value={title} placeholder="New skill — its title, then Enter" disabled={busy}
          onChange={e => setTitle(e.target.value)} onBlur={() => { if (!title.trim()) setNaming(false); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(); } else if (e.key === 'Escape') { setNaming(false); setTitle(''); } }} /></li>}
        {skills.map(s => { const h = `/${product}/${s.project}/d/${s.slug}`; return (
          <li key={`${s.project}/${s.slug}`} className={`pf-row s-${s.status} ${path === h ? 'on' : ''}`}>
            <Link href={h} className="pg-link" title={`${s.role}${s.takes ? ` · on ${s.takes}` : ''}${s.status === 'paused' ? ' · paused' : ''}`}><span className="pg-icon">{s.role === 'worker' ? '🛠' : '✦'}</span><span className="pg-title">{s.title}</span></Link>
          </li>); })}
        {!skills.length && <li className="pf-empty muted">no skills yet</li>}
      </ul>}
    </li>
  );
}
