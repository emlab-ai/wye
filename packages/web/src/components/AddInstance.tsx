'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// "+ add" on a type page: writes a `<type>:<slug>` row into the type's home document — its collection document, created
// on the first instance and titled with the type's plural (decision:ontology.collection-document) — and says where it went.
export function AddInstance({ product, slug, required, home, plural }: { product: string; slug: string; required: string[]; home: { href: string; title: string } | null; plural: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [went, setWent] = useState<{ id: string; href: string; title: string; created: boolean } | null>(null);
  const router = useRouter();
  const idSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const where = home ? <Link href={home.href}>{home.title}</Link> : <>a new <b>{plural}</b> document, the home of every {slug} from then on</>;
  const note = went && <span className="muted add-went"><code>{went.id}</code> went to <Link href={went.href}>{went.title}</Link>{went.created ? ' (new — the home of every ' + slug + ' from now on)' : ''}</span>;
  if (!open) return <p><button className="linkish" onClick={() => setOpen(true)}>+ add {slug}</button> <span className="muted">→ {where}</span> {note}</p>;
  const submit = async () => {
    if (!idSlug) return; setBusy(true); setErr('');
    const r = await fetch(`/api/${product}/types/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: idSlug, title: name.trim() }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.message ?? 'could not write'); return; }
    if (j.doc) setWent({ id: j.id, href: `/${product}/${j.doc.project}/d/${j.doc.doc}`, title: j.doc.title, created: !!j.created });
    setName(''); setOpen(false); router.refresh();
  };
  return (
    <form className="add-instance" onSubmit={e => { e.preventDefault(); submit(); }}>
      <input autoFocus placeholder={`new ${slug}…`} value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      <code className="muted">{slug}:{idSlug || '…'}</code>
      <button type="submit" disabled={!idSlug || busy}>Add</button>
      <button type="button" className="linkish" onClick={() => setOpen(false)}>Cancel</button>
      <span className="muted">a row in {where}{required.length ? ` with ${required.join(', ')}` : ''}</span>
      {err && <span className="bad">{err}</span>}
    </form>
  );
}
