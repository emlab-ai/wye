'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CARD_KINDS, skeleton, type CardKind } from '@/lib/kinds';

// "+ card" after a yaml block (append) or after a prose section (new yaml block).
export function AddCard({ project, slug, segment, mode }: { project: string; slug: string; segment: number; mode: 'append' | 'insert-after' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CardKind>('req');
  const [id, setId] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function pick(k: CardKind, s: string) { setKind(k); setId(s); setBody(skeleton(k, s || 'new-slug')); }
  async function save() {
    if (!id.trim()) { setMsg('Give the card a slug'); return; }
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mode === 'append' ? { op: 'append-chunk', segment, body } : { op: 'insert-yaml-after-segment', segment, body }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.error}`); return; }
    setOpen(false); setBody(''); setId(''); router.refresh();
  }
  if (!open) return <div className="addcard"><button onClick={() => { setOpen(true); pick('req', ''); }}>+ card</button></div>;
  return (
    <div className="card editing addcard-form">
      <div className="form">
        <label><span>kind</span><select value={kind} onChange={e => pick(e.target.value as CardKind, id)}>{CARD_KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <label><span>slug</span><input value={id} placeholder="e.g. inv.sale.hold or fifo-oldest-first" onChange={e => pick(kind, e.target.value)} /></label>
        <label><span>yaml</span><textarea value={body} rows={Math.min(16, body.split('\n').length + 2)} onChange={e => setBody(e.target.value)} /></label>
      </div>
      <div className="sec-actions">
        <button className="pri" disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add card'}</button>
        <button disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        {msg && <span className="notice">{msg}</span>}
      </div>
    </div>
  );
}
