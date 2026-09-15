'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Create a product.
export default function NewProductPage() {
  const router = useRouter();
  const [title, setTitle] = useState(''); const [icon, setIcon] = useState('📦'); const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  async function create() {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, icon, description }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    router.push(`/${j.slug}`); router.refresh();
  }
  return (
    <div className="page" style={{ maxWidth: 560, margin: '60px auto' }}>
      <h1 className="prop-in h1" style={{ margin: '0 0 12px' }}>New product</h1>
      <div className="form">
        <label><span>icon</span><input value={icon} onChange={e => setIcon(e.target.value)} style={{ width: 60 }} /></label>
        <label><span>title</span><input autoFocus value={title} placeholder="e.g. YesSensei POS" onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} /></label>
        <label><span>description</span><textarea value={description} rows={3} onChange={e => setDescription(e.target.value)} /></label>
      </div>
      <div className="sec-actions"><button className="pri" disabled={busy || !title.trim()} onClick={create}>{busy ? 'Creating…' : 'Create product'}</button><button onClick={() => router.back()}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
    </div>
  );
}
