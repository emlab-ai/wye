'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// A type's statuses, editable (decision:wf2.statuses-per-type): the list every status picker of its instances offers.
// A product type keeps it on its own card; a base kind's is the product's override (in _product.md), and "default"
// puts the base list back.
export function TypeStatuses({ product, slug, statuses, base }: { product: string; slug: string; statuses: string[]; base: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(statuses.join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setText(statuses.join(', ')); }, [statuses]);
  const list = text.split(',').map(s => s.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
  const dirty = list.join(',') !== statuses.join(',');
  const save = async (value: string[] | null) => {
    setBusy(true); setErr('');
    const r = await fetch(`/api/${product}/types/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ statuses: value }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).message ?? 'could not save'); return; }
    router.refresh();
  };
  return (
    <div className="type-statuses">
      <div className="tags">{list.map(s => <span key={s} className={`pill s s-${s}`}>{s}</span>)}</div>
      <p className="type-statuses-edit">
        <input value={text} placeholder="proposed, approved, done" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && dirty && list.length) save(list); }} title="the statuses, comma-separated, in the order the picker shows them" />
        {dirty && list.length > 0 && <button className="save" disabled={busy} onClick={() => save(list)}>{busy ? 'Saving…' : 'Save'}</button>}
        {base && <button className="linkish" disabled={busy} onClick={() => save(null)} title="the base list from schema/base-ontology.md">default</button>}
        {err && <span className="bad">{err}</span>}
      </p>
      <p className="muted small">{base ? 'A base type: a list you save is this product\'s own (in _product.md); default puts the base list back.' : 'Kept on the type\'s card.'} Every status picker of a {slug} offers these.</p>
    </div>
  );
}
