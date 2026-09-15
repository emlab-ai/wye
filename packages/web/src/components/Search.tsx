'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { docRoute } from '@/lib/doc';

export function Search({ product, projects, headings }: { product: string; projects: { slug: string; docs: { slug: string; title: string }[] }[]; headings: { doc: string; slug: string; text: string }[] }) {
  const { index } = usePeek(); const router = useRouter();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return [];
    const out: { label: string; sub: string; href: string }[] = [];
    for (const p of projects) for (const d of p.docs) if (d.title.toLowerCase().includes(needle)) out.push({ label: d.title, sub: `page · ${p.slug}`, href: `/${product}/${p.slug}/d/${d.slug}` });
    for (const h of headings) { const r = docRoute(h.doc); if (r && h.text.toLowerCase().includes(needle)) out.push({ label: h.text, sub: `heading · ${r.doc}`, href: `/${product}/${r.project}/d/${r.doc}#${h.slug}` }); }
    const nodes = Object.values(index).filter(e => e.id.toLowerCase().includes(needle) || e.title.toLowerCase().includes(needle)).sort((a, b) => Number(b.defined) - Number(a.defined) || a.id.localeCompare(b.id));
    for (const e of nodes.slice(0, 15)) { const r = e.file ? docRoute(e.file) : null; out.push({ label: e.title || e.id, sub: e.id + (e.status ? ' · ' + e.status : ''), href: r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(e.id)}` : `/${product}/graph?focus=${encodeURIComponent(e.id)}` }); }
    return out.slice(0, 20);
  }, [needle, projects, headings, index, product]);
  return (
    <div className="search">
      <input type="search" autoFocus placeholder="Search pages, headings, ids…" value={q} onChange={e => setQ(e.target.value)} />
      {hits.length > 0 && <ul className="hits">{hits.map((h, i) => <li key={i}><button onClick={() => { setQ(''); router.push(h.href); }}><span>{h.label}</span><small>{h.sub}</small></button></li>)}</ul>}
    </div>
  );
}
