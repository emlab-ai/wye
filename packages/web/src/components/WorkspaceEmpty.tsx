'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WorkspaceMenu, type RailWorkspace } from './WorkspaceMenu';
import { FileTree } from './FileTree';
import { FileView } from './FileView';

// A folder that is open and holds no vault yet (req:wf2.workspace-open): the page says so and offers Init Wye here —
// on the folder itself, or on any folder below through the Files tree's menu; the files can be read all the same.
export function WorkspaceEmpty({ workspace }: { workspace: RailWorkspace }) {
  const router = useRouter();
  const [file, setFile] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const init = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/products/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: workspace.folder }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not init'); return; }
      router.push(`/${j.slug}`); router.refresh();
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="ws-empty">
      <nav className="rail ws-empty-rail">
        <div className="rail-ws"><span className="rail-ws-mark">Y</span><span className="rail-ws-name">Wye</span></div>
        <WorkspaceMenu workspace={workspace} />
        <div className="rail-pages-head"><span>Documents</span></div>
        <p className="ft-note" style={{ padding: '2px 16px 10px' }}>No vault in this folder yet.</p>
        <div className="rail-body"><FileTree product="" embedded onOpenFile={setFile} /></div>
      </nav>
      <main className="content">
        {file ? <><button className="ws-empty-back" onClick={() => setFile('')}>← {workspace.name}</button><FileView product="" file={file} /></> : (
          <div className="page">
            <h1>{workspace.name} has no knowledge yet</h1>
            <p className="sub">{workspace.folder}</p>
            <p>Wye found no vault in this folder or below it. A vault is a folder&apos;s own knowledge, kept in <code>.wye/</code> beside its code: what the code must do, the decisions, the open questions, the tasks.</p>
            <p><b>Init Wye here</b> reads the folder into a first, shallow definition — no model is called. For one service of a larger repository, right-click its folder under Files instead, or run <code>wye init</code> in it.</p>
            <div className="sec-actions"><button className="pri" disabled={busy} onClick={init}>{busy ? 'Reading the code…' : 'Init Wye here'}</button>{msg && <span className="notice">{msg}</span>}</div>
          </div>
        )}
      </main>
    </div>
  );
}
