'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Delete a product. The folder is moved to the data folder's _trash rather than unlinked (lib/delete-product), and a
// product whose documents live beside its code keeps that folder — so the confirmation says which of the two this is.
// Typing the slug arms the button: this takes every project, document and session the product holds.
export function DeleteProduct({ product, title, relocated, dir }: { product: string; title: string; relocated: boolean; dir: string }) {
  const router = useRouter();
  const [typed, setTyped] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const remove = async () => {
    setBusy(true); setMsg('');
    const r = await fetch(`/api/${product}/delete`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setMsg(`Failed: ${j.message ?? j.error}`); return; }
    router.push(j.href); router.refresh();
  };
  return (
    <section className="kind-section settings-section">
      <h2 style={{ color: 'var(--bad)' }}>Delete this product</h2>
      {relocated
        ? <p className="lede"><b>{title}</b> keeps its documents at <code>{dir}</code>, beside your code. Deleting it here removes it from the app and moves its registry entry to the data folder&apos;s <code>_trash</code>. <b>That folder is left exactly where it is</b> — nothing in it is touched, and pointing a product at it again brings everything back.</p>
        : <p className="lede">Every project, document, session and inbox item <b>{title}</b> holds goes with it. The folder is moved to the data folder&apos;s <code>_trash</code>, not erased, so it can be fetched back from Finder — but the app will not show it again.</p>}
      <div className="inbox-form">
        <div className="inbox-row"><label className="settings-field" style={{ flex: 1 }}>type <code>{product}</code> to confirm <input style={{ width: '100%' }} value={typed} placeholder={product} onChange={e => setTyped(e.target.value)} /></label></div>
        <div className="sec-actions"><button className="pri" style={typed.trim() === product ? { background: 'var(--bad)', borderColor: 'var(--bad)' } : undefined} disabled={busy || typed.trim() !== product} onClick={remove}>{busy ? 'deleting…' : `Delete ${title}`}</button>{msg && <span className="notice">{msg}</span>}</div>
      </div>
    </section>
  );
}
