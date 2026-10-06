'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FolderField } from './FolderPicker';

// Add a product (decision:wf2.product-transfer, decision:wf2.workspace-is-the-top), on /new and on the Welcome: Init
// Wye in a code folder — its own vault in .wye/ beside the code, the way `wye init` there makes one (or, when asked,
// a product in Wye's own data that only reads the folder — lib/product-from-code); make a blank one; open a folder as
// the workspace — every vault in it a root of Documents (a folder that is itself a product kept the old way opens as
// that product); or import a .wye.tgz someone exported. A new product lands on its Quick start.
export type Way = 'code' | 'new' | 'open' | 'import';
const WAYS: { key: Way; label: string }[] = [{ key: 'code', label: 'From your code' }, { key: 'new', label: 'New' }, { key: 'open', label: 'Open a folder' }, { key: 'import', label: 'Import a file' }];

export function AddProduct({ start = 'new', cancel = true }: { start?: Way; cancel?: boolean }) {
  const router = useRouter();
  const [way, setWay] = useState<Way>(start);
  const [title, setTitle] = useState(''); const [icon, setIcon] = useState('📦'); const [description, setDescription] = useState('');
  const [folder, setFolder] = useState(''); const [home, setHome] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const [inData, setInData] = useState(false); // From your code: keep the knowledge in Wye's data instead of the folder's .wye/
  const done = (slug: string) => { router.push(`/${slug}/start`); router.refresh(); };
  const send = async (r: Promise<Response>) => {
    setBusy(true); setMsg(null);
    try { const res = await r; const j = await res.json().catch(() => ({})); if (!res.ok) { setMsg(j.message ?? j.error ?? 'failed'); return; } if (j.slug) done(j.slug); else { router.push('/'); router.refresh(); } }
    catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  const post = (url: string, body: object) => send(fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const fromCode = () => inData ? post('/api/products', { title, icon, repo: folder }) : post('/api/products/init', { folder, ...(title.trim() ? { title: title.trim() } : {}) });
  const create = () => post('/api/products', { title, icon, description, ...(home.trim() ? { folder: home.trim() } : {}) });
  const open = () => post('/api/workspace', { folder, auto: true });
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
        <p className="lede">Wye reads the folder into a first, shallow definition: its modules, pages, components, operations and tests. No model is called. The knowledge is kept in the folder itself, in <code>.wye/</code> beside the code — a vault — so it is committed and moves with the code; <code>wye init</code> in that folder does the same. Afterwards, an agent can deepen each module into requirements.</p>
        <div className="form">
          <label><span>folder</span><FolderField autoFocus title="The code folder" value={folder} placeholder="~/code/my-app  (or one service: ~/code/mono/services/payments)" onChange={v => { setFolder(v); setMsg(null); }} onEnter={() => { if (folder.trim() && (title.trim() || !inData)) fromCode(); }} /></label>
          <label><span>title</span><input value={title} placeholder={inData ? 'e.g. My app' : 'optional — the folder\'s name'} onChange={e => { setTitle(e.target.value); setMsg(null); }} /></label>
          <label className="add-product-check"><span>keep it</span><span><input type="checkbox" checked={inData} onChange={e => setInData(e.target.checked)} /> in Wye&apos;s own data, not in the folder <span className="muted small">— nothing is written into the folder; the knowledge stays on this machine</span></span></label>
        </div>
        {actions(inData ? 'Read the code' : 'Init Wye here', 'Reading the code…', fromCode, !!folder.trim() && (!!title.trim() || !inData))}
      </>}
      {way === 'new' && <>
        <p className="lede">An empty product. Write its first document, or import code or Markdown into it later.</p>
        <div className="form">
          <label><span>icon</span><input value={icon} onChange={e => setIcon(e.target.value)} style={{ width: 60 }} /></label>
          <label><span>title</span><input autoFocus value={title} placeholder="e.g. My app" onChange={e => { setTitle(e.target.value); setMsg(null); }} onKeyDown={e => { if (e.key === 'Enter' && title.trim()) create(); }} /></label>
          <label><span>description</span><textarea value={description} rows={3} onChange={e => setDescription(e.target.value)} /></label>
          <label><span>folder</span><FolderField title="Where the product is kept" value={home} placeholder="optional — e.g. ~/code/my-app/wye" onChange={v => { setHome(v); setMsg(null); }} onEnter={() => { if (title.trim()) create(); }} /></label>
        </div>
        <p className="muted small add-product-note">Where the product&apos;s documents are kept. Empty: in Wye&apos;s own data folder. A folder of yours — beside the code, in a repo — is made if it is not there, and edits land in it.</p>
        {actions('Create product', 'Creating…', create, !!title.trim())}
      </>}
      {way === 'open' && <>
        <p className="lede">Any folder on this machine — a repository, a monorepo, one service of it. Wye opens it as the workspace: every vault it finds there (a folder&apos;s <code>.wye/</code>) is a root in Documents, and the folder&apos;s files are under Files. Nothing is copied; edits land in the folder. A folder with no vault yet offers Init Wye here.</p>
        <div className="form">
          <label><span>folder</span><FolderField autoFocus title="Open a folder" value={folder} placeholder="~/code/my-monorepo" onChange={v => { setFolder(v); setMsg(null); }} onEnter={() => { if (folder.trim()) open(); }} /></label>
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
