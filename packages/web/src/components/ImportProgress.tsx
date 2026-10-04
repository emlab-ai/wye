'use client';
import { useCallback, useEffect, useState } from 'react';

type Batch = { requestSlug: string; total: number; done: number; current: string | null; stopped: boolean; legacy: boolean };

// The head of an import page (lib:import-run): how far the background import got, the file an agent has now, and
// Pause / Resume — the controls live here, on the import itself; the rail only shows that it runs.
export function ImportProgress({ product, slug }: { product: string; slug: string }) {
  const [b, setB] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/${product}/imports`, { cache: 'no-store' }); if (r.ok) setB(((await r.json()) as { batches: Batch[] }).batches.find(x => x.requestSlug === slug) ?? null); } catch { /* keep */ }
  }, [product, slug]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [load]);
  if (!b) return null;
  const act = async (action: 'stop' | 'resume') => {
    setBusy(true);
    try { await fetch(`/api/${product}/imports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, action }) }); await load(); } finally { setBusy(false); }
  };
  const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
  return (
    <div className={`import-progress ${b.stopped ? 'paused' : 'running'}`}>
      <div className="ip-line">
        <b>{b.stopped ? 'Paused' : 'Importing'}</b>
        <span>{b.done} of {b.total} files</span>
        {!b.stopped && b.current && <span className="muted">· an agent is on <code>{b.current}</code></span>}
        {b.stopped && <span className="muted">· the files left wait here; nothing new starts</span>}
        <span className="ip-actions">
          {b.stopped
            ? <button className="pri" disabled={busy} onClick={() => void act('resume')}>Resume</button>
            : !b.legacy && <button disabled={busy} onClick={() => void act('stop')} title="No further file starts; the one an agent has now finishes (or cancel its session)">Pause</button>}
        </span>
      </div>
      <div className="ip-bar"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
