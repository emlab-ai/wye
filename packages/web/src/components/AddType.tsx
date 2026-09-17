'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';

export type TypeChoice = { id: string; slug: string };
export type DocChoice = { file: string; label: string };

// "+ add type" on the Types index: writes a `type:<slug>` card (extends, purpose) into the product's ontology document
// and opens the new type in the context column, where its properties are added.
export function AddType({ product, types, docs, home }: { product: string; types: TypeChoice[]; docs: DocChoice[]; home: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('type:node');
  const [purpose, setPurpose] = useState('');
  const [doc, setDoc] = useState(home);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const router = useRouter();
  const { open: peek } = usePeek();
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taken = types.some(t => t.slug === slug);
  if (!open) return <p><button className="linkish" onClick={() => setOpen(true)}>+ add type</button> <span className="muted">→ {docs.find(d => d.file === home)?.label ?? 'ontology.md'}</span></p>;
  const submit = async () => {
    if (!slug || taken) return; setBusy(true); setErr('');
    const r = await fetch(`/api/${product}/types`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, extends: parent, purpose: purpose.trim(), doc: doc || undefined }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).message ?? 'could not write'); return; }
    const { id } = await r.json() as { id: string };
    setName(''); setPurpose(''); setOpen(false); router.refresh(); peek(id);
  };
  return (
    <form className="add-instance add-type" onSubmit={e => { e.preventDefault(); submit(); }}>
      <input autoFocus placeholder="new type…" value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      <code className={taken ? 'bad' : 'muted'}>type:{slug || '…'}{taken ? ' exists' : ''}</code>
      <label className="muted">extends <select value={parent} onChange={e => setParent(e.target.value)} disabled={busy}>{types.map(t => <option key={t.id} value={t.id}>{t.slug}</option>)}</select></label>
      <input placeholder="purpose — what instances of this type are" value={purpose} onChange={e => setPurpose(e.target.value)} disabled={busy} style={{ minWidth: 280 }} />
      {docs.length > 0 && <label className="muted">in <select value={doc} onChange={e => setDoc(e.target.value)} disabled={busy}>{!home && <option value="">new ontology.md</option>}{docs.map(d => <option key={d.file} value={d.file}>{d.label}</option>)}</select></label>}
      <button type="submit" disabled={!slug || taken || busy}>{busy ? 'Adding…' : 'Add'}</button>
      <button type="button" className="linkish" onClick={() => setOpen(false)}>Cancel</button>
      {err && <span className="bad">{err}</span>}
    </form>
  );
}
