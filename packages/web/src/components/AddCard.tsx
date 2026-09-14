'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CARD_KINDS, skeleton, type CardKind } from '@/lib/kinds';

// "+ card": pick a kind and a slug; the card is inserted from its skeleton and is immediately editable in place.
export function AddCard({ project, slug, segment, mode }: { project: string; slug: string; segment: number; mode: 'append' | 'insert-after' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CardKind>('req');
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function add() {
    const s = id.trim().replace(/^[a-z-]+:/, '');
    if (!s) { setMsg('Give the card a slug'); return; }
    setBusy(true); setMsg(null);
    const body = skeleton(kind, s);
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mode === 'append' ? { op: 'append-chunk', segment, body } : { op: 'insert-yaml-after-segment', segment, body }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.error}`); return; }
    setOpen(false); setId(''); router.refresh();
  }
  if (!open) return <div className="addcard"><button onClick={() => setOpen(true)}>+ card</button></div>;
  return (
    <div className="addcard open">
      <select value={kind} onChange={e => setKind(e.target.value as CardKind)}>{CARD_KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
      <input autoFocus value={id} placeholder="slug, e.g. inv.sale.hold" onChange={e => setId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setOpen(false); }} />
      <button className="pri" disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add'}</button>
      <button disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      {msg && <span className="notice">{msg}</span>}
    </div>
  );
}
