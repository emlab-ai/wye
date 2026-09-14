'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { docSlug } from '@/lib/doc';

export function Search({ project, docs, headings }: { project: string; docs: { slug: string; title: string }[]; headings: { doc: string; slug: string; text: string }[] }) {
  const { index } = usePeek(); const router = useRouter();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return [];
    const out: { label: string; sub: string; href: string }[] = [];
    for (const d of docs) if (d.title.toLowerCase().includes(needle)) out.push({ label: d.title, sub: 'document', href: `/p/${project}/d/${d.slug}` });
    for (const h of headings) if (h.text.toLowerCase().includes(needle)) out.push({ label: h.text, sub: `heading · ${h.doc}`, href: `/p/${project}/d/${h.doc}#${h.slug}` });
    const nodes = Object.values(index).filter(e => e.id.toLowerCase().includes(needle) || e.title.toLowerCase().includes(needle)).sort((a, b) => Number(b.defined) - Number(a.defined) || a.id.localeCompare(b.id));
    for (const e of nodes.slice(0, 15)) out.push({ label: e.title || e.id, sub: e.id + (e.status ? ' · ' + e.status : ''), href: e.file ? `/p/${project}/d/${docSlug(e.file)}#n-${encodeURIComponent(e.id)}` : `/p/${project}/graph?focus=${encodeURIComponent(e.id)}` });
    return out.slice(0, 20);
  }, [needle, docs, headings, index, project]);
  return (
    <div className="search">
      <input type="search" placeholder="Search documents, headings, ids…" value={q} onChange={e => setQ(e.target.value)} />
      {hits.length > 0 && <ul className="hits">{hits.map((h, i) => <li key={i}><button onClick={() => { setQ(''); router.push(h.href); }}><span>{h.label}</span><small>{h.sub}</small></button></li>)}</ul>}
    </div>
  );
}
