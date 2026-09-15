'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Add a text note (or a pasted conversation) to the product inbox.
export function InboxNote({ product }: { product: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  async function add() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/inbox`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, text }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setTitle(''); setText(''); router.refresh();
  }
  return (
    <div className="inbox-form">
      <input value={title} placeholder="title (optional)" onChange={e => setTitle(e.target.value)} />
      <textarea value={text} rows={6} placeholder="paste a note, a decision, a conversation…" onChange={e => setText(e.target.value)} />
      <div className="sec-actions"><button className="pri" disabled={busy || !text.trim()} onClick={add}>{busy ? 'Adding…' : 'Add to inbox'}</button>{msg && <span className="notice">{msg}</span>}</div>
    </div>
  );
}
