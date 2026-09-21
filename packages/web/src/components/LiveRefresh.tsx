'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Follows the product on disk: when an agent or an editor writes a document, the graph, the inbox or a session,
// the server-rendered parts of the page (rail, lists, panels) refresh on their own.
export function LiveRefresh({ product }: { product: string }) {
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const es = new EventSource(`/api/${product}/events`);
    es.addEventListener('change', e => {
      const j = JSON.parse((e as MessageEvent).data) as { kinds: string[]; files: string[] };
      // documents trigger a rebuild whose graph.json change arrives next; refresh once on the graph (or straight
      // away for inbox/session changes) so lists and the rail show the new state
      // one refresh per burst: a save's graph, change-record and session writes land within a second of each other
      if (j.kinds.includes('graph') || j.kinds.includes('inbox') || j.kinds.includes('session') || j.kinds.includes('change')) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; router.refresh(); }, 800);
      }
      if (j.kinds.includes('doc')) { const f = j.files.find(x => x.endsWith('.md')); if (f) { setFlash(f.split('/').pop()!.replace(/\.md$/, '')); setTimeout(() => setFlash(null), 2500); } }
      window.dispatchEvent(new CustomEvent('wf:change', { detail: j }));
    });
    return () => { es.close(); if (timer.current) clearTimeout(timer.current); };
  }, [product, router]);
  return flash ? <div className="live-flash" title="changed on disk">⟳ {flash} updated</div> : null;
}
