'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { outline, docRoute } from '@/lib/doc';
import { KindPill, StatusPill } from './Pills';

// A document in the right column: its title, status, first paragraph and outline, so a link can be checked
// without leaving the page; headings jump into the document.
export function DocPeek({ id, href }: { id: string; href: string }) {
  const { product, index } = usePeek();
  const e = index[id];
  const [body, setBody] = useState<string | null>(null);
  useEffect(() => {
    const r = e?.file ? docRoute(e.file) : null; if (!r) return;
    let live = true; setBody(null);
    fetch(`/api/${product}/${r.project}/doc/${r.doc}`).then(x => x.ok ? x.json() : null).then(j => { if (live && j) setBody(j.body); });
    return () => { live = false; };
  }, [product, e?.file]);
  const heads = body ? outline(body) : [];
  const intro = body ? firstParagraph(body) : '';
  return (
    <article className="docpeek">
      <header><KindPill kind="module" /><StatusPill status={e?.status ?? ''} /><code className="cid">{id}</code></header>
      <h3><Link href={href}>{e?.title ?? id}</Link></h3>
      {body === null ? <p className="muted">loading…</p> : <>
        {intro && <p className="docpeek-intro">{intro}</p>}
        {heads.length > 0 && <ul className="docpeek-outline">{heads.map(h => <li key={h.slug} className={`l${h.level}`}><Link href={`${href}#${h.slug}`}>{h.text}</Link></li>)}</ul>}
        {!intro && !heads.length && <p className="muted">an empty document</p>}
      </>}
    </article>
  );
}
function firstParagraph(body: string): string {
  const lines = body.split('\n'); let fence = false; const para: string[] = [];
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence || /^#/.test(l) || /^\s*<!--/.test(l) || /^\s*([-*+]|\d+[.)])\s/.test(l) || /^\s*\|/.test(l)) { if (para.length) break; continue; }
    if (!l.trim()) { if (para.length) break; continue; }
    if (/^[a-z-]+:[A-Za-z0-9_.\-]+\s/.test(l.trim())) { if (para.length) break; continue; } // node lines are not prose
    para.push(l.trim());
  }
  return para.join(' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').slice(0, 400);
}
