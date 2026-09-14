'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ModuleGroup } from '@/lib/graph';

export interface SidebarProps { project: string; projectTitle: string; tree: ModuleGroup[]; counts: { nodes: number; reqs: number; drift: number; questions: number } }

export function Sidebar({ project, projectTitle, tree, counts }: SidebarProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const path = usePathname();
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => !needle ? tree : tree.map(m => ({
    ...m, sections: m.sections.map(s => ({ ...s, nodes: s.nodes.filter(n => n.id.toLowerCase().includes(needle) || n.title.toLowerCase().includes(needle)) })).filter(s => s.nodes.length),
  })).filter(m => m.sections.length), [tree, needle]);
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !(o[k] ?? false) }));
  const isOpen = (k: string, dflt: boolean) => needle ? true : (open[k] ?? dflt);
  return (
    <nav className="sidebar">
      <div className="sb-head">
        <Link href={`/p/${project}`} className="sb-title">{projectTitle}</Link>
        <div className="sb-sub">{counts.nodes} nodes · {counts.reqs} reqs</div>
        <input className="sb-search" type="search" placeholder="Search ids and titles…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="sb-fixed">
          <Link href={`/p/${project}/graph`} className={path.endsWith('/graph') ? 'on' : ''}>Graph</Link>
          <Link href={`/p/${project}/graph?preset=Drift`}>Drift <b>{counts.drift}</b></Link>
          <span title="questions">Questions <b>{counts.questions}</b></span>
        </div>
      </div>
      <div className="sb-tree">
        {filtered.map(m => (
          <div key={m.module.id} className="sb-mod">
            <button className="sb-row lvl0" onClick={() => toggle(m.module.id)} aria-expanded={isOpen(m.module.id, true)}>
              <i className="dot" style={{ background: 'var(--k-module)' }} /> {m.module.title}
            </button>
            {isOpen(m.module.id, true) && m.sections.map(s => {
              const key = m.module.id + '|' + s.title;
              const dflt = s.title.startsWith('R');
              return (
                <div key={key}>
                  <button className="sb-row lvl1" onClick={() => toggle(key)} aria-expanded={isOpen(key, dflt)}>
                    <span className="caret">{isOpen(key, dflt) ? '▾' : '▸'}</span> {s.title} <span className="cnt">{s.nodes.length}</span>
                  </button>
                  {isOpen(key, dflt) && s.nodes.map(n => {
                    const href = `/p/${project}/n/${encodeURIComponent(n.id)}`;
                    return (
                      <Link key={n.id} href={href} className={`sb-row lvl2 ${path === href ? 'on' : ''}`} title={n.id}>
                        <i className="dot" style={{ background: `var(--k-${n.kind}, var(--k-other))` }} />
                        <span className="t">{n.title || n.id}</span>
                        {n.status && n.status !== 'shipped' && <span className={`st ${n.status}`}>{n.status}</span>}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
