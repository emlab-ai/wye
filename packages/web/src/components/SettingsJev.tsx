'use client';
import { useState } from 'react';

// The Jev key (Jev auto-linking design §0): masked field, Save / Remove, and Test — one real question with the stored
// key, its round trip shown. A stored key is what switches auto-linking on; there is no other toggle.
export function SettingsJev({ initial }: { initial: { set: boolean; last4: string } }) {
  const [state, setState] = useState(initial);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const put = async (k: string) => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jev: { key: k } }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.message ?? j.error}`); return; }
    setState(j.jev); setKey(''); setMsg(k ? 'Saved.' : 'Removed.');
  };
  const test = async () => {
    setBusy(true); setMsg('Testing…');
    const r = await fetch('/api/settings/jev/test', { method: 'POST' }); const j = await r.json(); setBusy(false);
    setMsg(r.ok ? `OK · ${j.ms} ms · ${j.model}` : `Failed: ${j.error}`);
  };
  return (
    <section className="kind-section settings-section">
      <h2>Jev (TypeSafe AI)</h2>
      <p className="lede">With a key stored, new inbox items, document blocks you edit and consolidation cards are linked to the closest existing knowledge automatically — Jev judges each candidate the local search finds, and a link is written above 85 % probability. Without a key nothing changes. Keys: <a href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">console.typesafe.ai/keys</a>.</p>
      <div className="inbox-form">
        <div className="inbox-row"><input type="password" autoComplete="off" value={key} placeholder={state.set ? `key stored · •••• ${state.last4}` : 'paste an API key'} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && key.trim()) put(key.trim()); }} /></div>
        <div className="sec-actions">
          <button className="pri" disabled={busy || !key.trim()} onClick={() => put(key.trim())}>Save</button>
          <button disabled={busy || !state.set} onClick={test}>Test</button>
          <button disabled={busy || !state.set} onClick={() => put('')}>Remove</button>
          {msg && <span className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</span>}
        </div>
      </div>
    </section>
  );
}
