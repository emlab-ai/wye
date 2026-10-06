'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { detailOf } from '@/lib/change';

type NewPage = { id: string; title: string; project: string; doc: string };

// A toast for a page that arrived from outside — an agent's `wye doc create`, a plan from /wye-plan, a file dropped
// in the folder: the change event names the documents new in this build (lib/graph-delta#newPages), and the person
// sees it wherever they are, with Open to go there at once. The page on screen is never announced; a toast goes on
// its own after a while, or when Open or × is pressed.
export function NewPageToasts({ product }: { product: string }) {
  const router = useRouter(); const path = usePathname();
  const [pages, setPages] = useState<NewPage[]>([]);
  useEffect(() => {
    const onChange = (e: Event) => {
      const d = detailOf(e); const fresh = d.graph?.pages ?? [];
      if (!fresh.length) return;
      const here = decodeURIComponent(path ?? '');
      const add = fresh.map(p => ({ id: p.id, title: p.title, ...routeOf(p.file) })).filter((p): p is NewPage => !!p.project && here !== `/${product}/${p.project}/d/${p.doc}`);
      if (!add.length) return;
      setPages(xs => [...xs.filter(x => !add.some(a => a.id === x.id)), ...add]);
      for (const p of add) setTimeout(() => setPages(xs => xs.filter(x => x.id !== p.id)), 20000);
    };
    window.addEventListener('wf:change', onChange);
    return () => window.removeEventListener('wf:change', onChange);
  }, [product, path]);
  if (!pages.length) return null;
  const go = (p: NewPage) => { setPages(xs => xs.filter(x => x.id !== p.id)); router.push(`/${product}/${p.project}/d/${p.doc}`); };
  return (
    <div className="qtoasts newpage" aria-live="polite">
      {pages.map(p => (
        <div key={p.id} className="qtoast newpage" role="button" onClick={() => go(p)} title={`open ${p.id}`}>
          <div className="qtoast-head"><span className="qtoast-dot" />new page · {p.id.slice(0, p.id.indexOf(':'))}<button className="qtoast-x" onClick={e => { e.stopPropagation(); setPages(xs => xs.filter(x => x.id !== p.id)); }} title="hide">×</button></div>
          <div className="qtoast-q">{p.title}</div>
          <div className="qtoast-sub muted">{p.project} / {p.doc} — click to open</div>
        </div>
      ))}
    </div>
  );
}
// a document's route from its file, as lib/doc#docRoute reads it — repeated here so the client needs no node modules
function routeOf(file: string): { project: string; doc: string } | null {
  const m = file.match(/\/projects\/([^/]+)\/(docs|\.wye)\/([^/]+)\.md$/);
  return m ? { project: m[1], doc: (m[2] === '.wye' ? '~' : '') + m[3] } : null;
}
