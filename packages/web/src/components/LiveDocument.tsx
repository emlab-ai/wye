'use client';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type DocEditorType from './DocEditor';

// Shows the server-rendered reader until the client is ready, then the single-page editor takes over.
// Of a long page the reader holds the first screen only (`shown`: how much of `body` it is — decision:wf2.first-screen-first);
// a line under it says the rest is on its way, and where the editor cannot open the page at all the rest follows as
// plain text, so the read-only fallback is still the whole page.
export function LiveDocument({ product, project, slug, body, ifMatch, shown, children }: { product: string; project: string; slug: string; body: string; ifMatch: string; shown?: number; children: ReactNode }) {
  // the editor's code is fetched once the page is up, and the reader stays until it is here: with next/dynamic the
  // reader left on hydration and the page was empty while the editor's chunk loaded
  const [Editor, setEditor] = useState<ComponentType<Parameters<typeof DocEditorType>[0]> | null>(null);
  useEffect(() => { let live = true; import('./DocEditor').then(m => { if (live) setEditor(() => m.default); }); return () => { live = false; }; }, []);
  const partial = !!children && shown !== undefined && shown < body.length;
  // a client navigation or a refresh comes without the reader (the page renders it for a full load only): a skeleton
  // holds the place while the editor loads its blocks
  const placeholder = children ? <>{children}{partial && <div className="doc-skeleton muted" aria-busy="true">Loading the rest…</div>}</> : <div className="doc-skeleton muted" aria-busy="true">Loading…</div>;
  if (!Editor) return <>{placeholder}</>;
  const fallback = partial ? <>{children}<pre className="yaml">{body.slice(shown)}</pre></> : placeholder;
  return <Editor product={product} project={project} slug={slug} body={body} ifMatch={ifMatch} fallback={fallback} />;
}
