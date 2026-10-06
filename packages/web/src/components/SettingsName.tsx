'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// A product's name: its title, icon and description (_product.md). Its address — /<slug> — stays as it is.
export function SettingsName({ product, title, icon, description }: { product: string; title: string; icon: string; description: string }) {
  const router = useRouter();
  const [v, setV] = useState({ title, icon, description }); const [was, setWas] = useState({ title, icon, description });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const dirty = v.title.trim() !== was.title || v.icon.trim() !== was.icon || v.description.trim() !== was.description;
  const save = async () => {
    if (!dirty || !v.title.trim()) return;
    setBusy(true); setMsg('');
    const r = await fetch(`/api/${product}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.message ?? j.error}`); return; }
    const now = { title: j.title, icon: j.icon, description: j.description }; setV(now); setWas(now); setMsg('Saved.'); router.refresh();
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void save(); };
  return (
    <section className="kind-section settings-section">
      <h2>Name</h2>
      <p className="lede">What this product is called in the rail and everywhere it is listed. Its address stays <code>/{product}</code>, so links to it keep working.</p>
      <div className="inbox-form">
        <div className="inbox-row">
          <label className="settings-field">icon <input style={{ width: 56 }} value={v.icon} maxLength={8} placeholder="📦" onChange={e => setV({ ...v, icon: e.target.value })} onKeyDown={onKey} /></label>
          <label className="settings-field" style={{ flex: 1 }}>title <input style={{ width: '100%' }} value={v.title} placeholder={product} onChange={e => setV({ ...v, title: e.target.value })} onKeyDown={onKey} /></label>
        </div>
        <div className="inbox-row"><label className="settings-field" style={{ flex: 1 }}>description <input style={{ width: '100%' }} value={v.description} placeholder="one line about it" onChange={e => setV({ ...v, description: e.target.value })} onKeyDown={onKey} /></label></div>
        <div className="sec-actions"><button className="pri" disabled={busy || !dirty || !v.title.trim()} onClick={save}>{busy ? 'saving…' : 'Save'}</button>{msg && <span className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</span>}</div>
      </div>
    </section>
  );
}
