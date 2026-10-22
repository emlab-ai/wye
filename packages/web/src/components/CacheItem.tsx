'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

// The open product's cache on the status bar (req:waterfall.cache-size.status-bar): its size on disk; a click opens
// each part with its size and Clear and rebuild, which deletes what rebuilds without a model call and builds it again
// (lib/cache). Hidden off a product's pages. Polled every minute, every two seconds while a rebuild runs.
type Part = { key: string; label: string; bytes: number; clears: boolean; shared?: boolean };
type Info = { product: string; folder?: string; parts: Part[]; total: number; clearable: number; rebuilding: boolean };

export const size = (b: number) => b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)} GB` : b >= 1000 * 1024 ? `${(b / 2 ** 20).toFixed(b >= 10 * 2 ** 20 ? 0 : 1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : b ? `${b} B` : '—';
const NOT_PRODUCTS = new Set(['', 'api', 'settings', 'new']);   // the app's own top-level routes

export function CacheItem() {
  const slug = (usePathname() ?? '/').split('/')[1] ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const product = NOT_PRODUCTS.has(slug) ? '' : slug;
  useEffect(() => {
    setInfo(null); if (!product) return;
    let alive = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      let next: Info | null = null;
      try { const r = await fetch(`/api/${encodeURIComponent(product)}/cache`); if (r.ok) next = await r.json(); } catch { /* keeps what it has */ }
      if (!alive) return;
      if (next) setInfo(next);
      timer = setTimeout(load, next?.rebuilding ? 2000 : 60_000);
    };
    void load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [product, busy]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  if (!product || !info) return null;
  const clear = async () => {
    setBusy(true); setError('');
    try { const r = await fetch(`/api/${encodeURIComponent(product)}/cache`, { method: 'POST' }); if (r.ok) setInfo(await r.json()); else setError('Could not clear the cache.'); }
    catch { setError('Could not reach the app.'); }
    setBusy(false);
  };
  const rebuilding = busy || info.rebuilding;
  const row = (p: Part) => <div key={p.key} className={`sb-cache-part ${p.clears ? '' : 'kept'}`}><span>{p.label}</span><span className="muted">{p.clears ? '' : p.shared ? 'shared, kept' : 'kept'}</span><b>{size(p.bytes)}</b></div>;
  return (
    <div className={`sb-cache ${open ? 'open' : ''}`} ref={box}>
      <button type="button" className="sb-cache-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} title="This product's cache on disk — click for the parts">
        <span className="muted">Cache</span> {size(info.total)}{rebuilding && <span className="muted"> · rebuilding</span>}
      </button>
      {open && (
        <div className="sb-pop sb-pop-right" role="dialog" aria-label="Cache">
          <div className="sb-pop-head"><b>Cache</b><span className="muted">{size(info.total)} on disk</span></div>
          {info.folder && <div className="sb-cache-where" title={`${info.folder} — every vault's cache is under the Wye home; wye cache list shows them all`}>{info.folder}</div>}
          <div className="sb-row"><div className="sb-row-head"><b>Rebuilt by Clear</b><span className="muted">{size(info.clearable)}</span></div>{info.parts.filter(p => p.clears).map(row)}</div>
          <div className="sb-row"><div className="sb-row-head"><b>Kept</b><span className="muted">history, model judgements, models</span></div>{info.parts.filter(p => !p.clears).map(row)}</div>
          <div className="sb-cache-foot">
            <button type="button" disabled={rebuilding} onClick={() => void clear()}>{rebuilding ? 'Rebuilding…' : 'Clear and rebuild'}</button>
            <span className="muted">{error || 'The graph comes back at once; the search index fills in the background.'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
