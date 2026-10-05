'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

// Add a product (decision:wf2.product-transfer): make a new one, open a product folder already on disk where it is
// (a teammate's, a clone, a repo's wye/ folder), or import a .wye.tgz someone exported.
type Way = 'new' | 'open' | 'import';
const WAYS: { key: Way; label: string }[] = [{ key: 'new', label: 'New' }, { key: 'open', label: 'Open a folder' }, { key: 'import', label: 'Import a file' }];

export default function NewProductPage() { return <Suspense><AddProduct /></Suspense>; }

function AddProduct() {
  const router = useRouter();
  const start = useSearchParams().get('way') as Way | null;
  const [way, setWay] = useState<Way>(start && WAYS.some(w => w.key === start) ? start : 'new');
  const [title, setTitle] = useState(''); const [icon, setIcon] = useState('📦'); const [description, setDescription] = useState('');
  const [folder, setFolder] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const done = (slug: string) => { router.push(`/${slug}`); router.refresh(); };
  const send = async (r: Promise<Response>) => {
    setBusy(true); setMsg(null);
    try { const res = await r; const j = await res.json().catch(() => ({})); if (!res.ok) { setMsg(j.message ?? j.error ?? 'failed'); return; } done(j.slug); }
    catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  const create = () => send(fetch('/api/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, icon, description }) }));
  const open = () => send(fetch('/api/products/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder }) }));
  const importIt = () => file && send(fetch('/api/products/import', { method: 'POST', headers: { 'content-type': 'application/gzip' }, body: file }));
  return (
    <div className="page" style={{ maxWidth: 600, margin: '60px auto' }}>
      <h1 className="prop-in h1" style={{ margin: '0 0 12px' }}>Add a product</h1>
      <div className="seg-group" role="tablist" style={{ marginBottom: 18 }}>
        {WAYS.map(w => <button key={w.key} type="button" role="tab" aria-selected={way === w.key} className={`seg${way === w.key ? ' on' : ''}`} onClick={() => { setWay(w.key); setMsg(null); }}>{w.label}</button>)}
      </div>
      {way === 'new' && <>
        <div className="form">
          <label><span>icon</span><input value={icon} onChange={e => setIcon(e.target.value)} style={{ width: 60 }} /></label>
          <label><span>title</span><input autoFocus value={title} placeholder="e.g. Kitchen POS" onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} /></label>
          <label><span>description</span><textarea value={description} rows={3} onChange={e => setDescription(e.target.value)} /></label>
        </div>
        <div className="sec-actions"><button className="pri" disabled={busy || !title.trim()} onClick={create}>{busy ? 'Creating…' : 'Create product'}</button><button onClick={() => router.back()}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
      </>}
      {way === 'open' && <>
        <p className="lede">A product folder that is already on this machine — a teammate&apos;s clone, a repo that keeps its product in <code>wye/</code>, an unpacked export. Wye uses it where it is: nothing is copied, and edits land in that folder.</p>
        <div className="form">
          <label><span>folder</span><input autoFocus value={folder} placeholder="~/code/shop  (or ~/code/shop/wye)" onChange={e => setFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && folder.trim()) open(); }} /></label>
        </div>
        <div className="sec-actions"><button className="pri" disabled={busy || !folder.trim()} onClick={open}>{busy ? 'Opening…' : 'Open'}</button><button onClick={() => router.back()}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
      </>}
      {way === 'import' && <>
        <p className="lede">A <code>.wye.tgz</code> made with Export (a product&apos;s Settings). It becomes a new product here, a copy: its documents, inbox and agent instructions; the graph is rebuilt.</p>
        <div className="form">
          <label><span>file</span><input type="file" accept=".tgz,.gz,application/gzip" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        <div className="sec-actions"><button className="pri" disabled={busy || !file} onClick={importIt}>{busy ? 'Importing…' : 'Import'}</button><button onClick={() => router.back()}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
      </>}
    </div>
  );
}
