'use client';
import { useEffect, useState } from 'react';

// Where a product's folder is (decision:wf2.product-folder): by default under the app's data, or a folder the person
// names — beside the code, in a shared drive — everything but the registry entry moves there.
export function SettingsFolder({ product }: { product: string }) {
  const [info, setInfo] = useState<{ root: string; dir: string; default: string; isDefault: boolean; held: string[] } | null>(null);
  const [root, setRoot] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = () => fetch(`/api/${product}/folder`).then(r => r.ok ? r.json() : null).then(j => { if (j) { setInfo(j); setRoot(j.root); } }).catch(() => {});
  useEffect(() => { load(); }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = async () => {
    if (!info) return;
    const target = root.trim() || info.default;
    if (!window.confirm(`Move this product's documents, graph, sessions and inbox to\n${target}?\nThe app keeps pointing at them from data/products/${product}.`)) return;
    setBusy(true); setMsg('');
    const r = await fetch(`/api/${product}/folder`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ root: root.trim() }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.message ?? j.error}`); return; }
    setMsg(`Moved${j.moved?.length ? ` ${j.moved.join(', ')}` : ''} to ${j.dir}. Reload the page.`); load();
  };
  return (
    <section className="kind-section settings-section">
      <h2>Folder</h2>
      <p className="lede">Where <b>{product}</b> keeps its documents, graph, sessions and inbox. By default under the app&apos;s data; name a folder to keep them elsewhere — beside the code, say — and the app moves them there and points at them.</p>
      <div className="inbox-form">
        <div className="inbox-row"><span className="muted">now: <code>{info?.dir ?? '…'}</code>{info?.isDefault ? ' (default)' : ''}</span></div>
        <div className="inbox-row"><label className="settings-field" style={{ flex: 1 }}>folder <input style={{ width: '100%' }} value={root} placeholder={info?.default ?? ''} onChange={e => setRoot(e.target.value)} /></label></div>
        <div className="sec-actions"><button className="pri" disabled={busy || !info || (root.trim() === (info.root ?? ''))} onClick={move}>{busy ? 'moving…' : root.trim() ? 'Move there' : 'Move back to the default'}</button>{msg && <span className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</span>}</div>
      </div>
    </section>
  );
}
