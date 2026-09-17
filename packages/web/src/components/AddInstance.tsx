'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// "+ add" on a type page: writes a `<type>:<slug>` card with the type's required properties into the type's home document.
export function AddInstance({ product, slug, required, home }: { product: string; slug: string; required: string[]; home: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const router = useRouter();
  const idSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!open) return <p><button className="linkish" onClick={() => setOpen(true)}>+ add {slug}</button> <span className="muted">→ {home}</span></p>;
  const submit = async () => {
    if (!idSlug) return; setBusy(true); setErr('');
    const r = await fetch(`/api/${product}/types/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: idSlug, title: name.trim() }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).message ?? 'could not write'); return; }
    setName(''); setOpen(false); router.refresh();
  };
  return (
    <form className="add-instance" onSubmit={e => { e.preventDefault(); submit(); }}>
      <input autoFocus placeholder={`new ${slug}…`} value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      <code className="muted">{slug}:{idSlug || '…'}</code>
      <button type="submit" disabled={!idSlug || busy}>Add</button>
      <button type="button" className="linkish" onClick={() => setOpen(false)}>Cancel</button>
      <span className="muted">writes a card to {home}{required.length ? ` with ${required.join(', ')}` : ''}</span>
      {err && <span className="bad">{err}</span>}
    </form>
  );
}
