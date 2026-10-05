'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Add a product (decision:wf2.product-transfer), on /new and on the Welcome: read one from a code folder the way
// `wye init` does (lib/product-from-code), make a blank one, open a product folder already on disk where it is (a
// teammate's, a clone, a repo's wye/ folder), or import a .wye.tgz someone exported. Every way lands on the product's
// Quick start.
export type Way = 'code' | 'new' | 'open' | 'import';
const WAYS: { key: Way; label: string }[] = [{ key: 'code', label: 'From your code' }, { key: 'new', label: 'New' }, { key: 'open', label: 'Open a folder' }, { key: 'import', label: 'Import a file' }];

export function AddProduct({ start = 'new', cancel = true }: { start?: Way; cancel?: boolean }) {
  const router = useRouter();
  const [way, setWay] = useState<Way>(start);
  const [title, setTitle] = useState(''); const [icon, setIcon] = useState('📦'); const [description, setDescription] = useState('');
  const [folder, setFolder] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const done = (slug: string) => { router.push(`/${slug}/start`); router.refresh(); };
  const send = async (r: Promise<Response>) => {
    setBusy(true); setMsg(null);
    try { const res = await r; const j = await res.json().catch(() => ({})); if (!res.ok) { setMsg(j.message ?? j.error ?? 'failed'); return; } done(j.slug); }
    catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  const post = (url: string, body: object) => send(fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const fromCode = () => post('/api/products', { title, icon, repo: folder });
  const create = () => post('/api/products', { title, icon, description });
  const open = () => post('/api/products/open', { folder });
  const importIt = () => file && send(fetch('/api/products/import', { method: 'POST', headers: { 'content-type': 'application/gzip' }, body: file }));
  const actions = (label: string, busyLabel: string, go: () => void, ready: boolean) => (
    <div className="sec-actions"><button className="pri" disabled={busy || !ready} onClick={go}>{busy ? busyLabel : label}</button>{cancel && <button onClick={() => router.back()}>Cancel</button>}{msg && <span className="notice">{msg}</span>}</div>
  );
  return (
    <div className="add-product">
      <div className="seg-group" role="tablist">
        {WAYS.map(w => <button key={w.key} type="button" role="tab" aria-selected={way === w.key} className={`seg${way === w.key ? ' on' : ''}`} onClick={() => { setWay(w.key); setMsg(null); }}>{w.label}</button>)}
      </div>
      {way === 'code' && <>
        <p className="lede">Wye reads the folder into a first, shallow definition: its modules, pages, components, operations and tests. No model is called and nothing in the folder changes. Afterwards, an agent can deepen each module into requirements.</p>
        <div className="form">
          <label><span>title</span><input autoFocus value={title} placeholder="e.g. Kitchen POS" onChange={e => setTitle(e.target.value)} /></label>
          <label><span>folder</span><input value={folder} placeholder="~/code/kitchen-pos" spellCheck={false} onChange={e => setFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && title.trim() && folder.trim()) fromCode(); }} /></label>
        </div>
        {actions('Read the code', 'Reading the code…', fromCode, !!title.trim() && !!folder.trim())}
      </>}
      {way === 'new' && <>
        <p className="lede">An empty product. Write its first document, or import code or Markdown into it later.</p>
        <div className="form">
          <label><span>icon</span><input value={icon} onChange={e => setIcon(e.target.value)} style={{ width: 60 }} /></label>
          <label><span>title</span><input autoFocus value={title} placeholder="e.g. Kitchen POS" onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && title.trim()) create(); }} /></label>
          <label><span>description</span><textarea value={description} rows={3} onChange={e => setDescription(e.target.value)} /></label>
        </div>
        {actions('Create product', 'Creating…', create, !!title.trim())}
      </>}
      {way === 'open' && <>
        <p className="lede">A product folder that is already on this machine — a teammate&apos;s clone, a repo that keeps its product in <code>wye/</code>, an unpacked export. Wye uses it where it is: nothing is copied, and edits land in that folder.</p>
        <div className="form">
          <label><span>folder</span><input autoFocus value={folder} placeholder="~/code/shop  (or ~/code/shop/wye)" spellCheck={false} onChange={e => setFolder(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && folder.trim()) open(); }} /></label>
        </div>
        {actions('Open', 'Opening…', open, !!folder.trim())}
      </>}
      {way === 'import' && <>
        <p className="lede">A <code>.wye.tgz</code> made with Export (a product&apos;s Settings). It becomes a new product here, a copy: its documents, inbox and agent instructions; the graph is rebuilt.</p>
        <div className="form">
          <label><span>file</span><input type="file" accept=".tgz,.gz,application/gzip" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        {actions('Import', 'Importing…', importIt, !!file)}
      </>}
    </div>
  );
}
