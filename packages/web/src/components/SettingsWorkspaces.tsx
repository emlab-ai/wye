'use client';
import { useCallback, useEffect, useState } from 'react';
import type { RemoteView } from '@/lib/remote-view';

// App settings › Remote workspaces (plan:remote-workspaces): a Wye on another machine opened from this one — a box
// reached over SSH (its Wye checked and started there, a forward tunnel to it) or the address of a Wye served elsewhere
// with its proxy's password. Opening one loads that Wye itself (decision:waterfall.remote-ws.window-loads-the-box): in the
// window it takes the window's place (the Workspace menu switches back), in a browser it opens in a tab. The rows are the
// workspace rows of the same remotes list as Remote agents (decision:waterfall.remote-ws.one-list).
const WORDS: Record<RemoteView['state'], string> = { off: 'off', connecting: 'connecting…', connected: 'connected', failed: 'not connected' };

export function SettingsWorkspaces() {
  const [rows, setRows] = useState<RemoteView[] | null>(null);
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const isUrl = /^https?:\/\//i.test(target.trim());
  const take = (j: { remotes: RemoteView[] }) => setRows(j.remotes.filter(r => r.use === 'workspace'));
  const load = useCallback(async () => { try { const r = await fetch('/api/system/remote', { cache: 'no-store' }); if (r.ok) take(await r.json()); } catch { /* restarting */ } }, []);
  const moving = (rows ?? []).some(r => r.state === 'connecting');
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), moving ? 1500 : 8000); return () => clearInterval(t); }, [load, moving]);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/system/remote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.message ?? j.error ?? r.statusText}`); return false; }
    take(j); return true;
  };
  const add = async () => {
    const t = target.trim();
    const body = { action: 'workspace-connect', ...(isUrl ? { url: t, ...(user.trim() ? { user: user.trim(), password } : {}) } : { host: t }), ...(name.trim() ? { name: name.trim() } : {}) };
    if (await post(body)) { setTarget(''); setName(''); setUser(''); setPassword(''); }
  };
  const again = (r: RemoteView) => post({ action: 'workspace-connect', name: r.name, ...(r.url ? { url: r.url, ...(r.user ? { user: r.user } : {}) } : { host: r.host, port: r.port }) });
  return (
    <section className="kind-section settings-section">
      <h2>Remote workspaces</h2>
      <p className="lede">Open a Wye that runs on another machine: a dev box you reach over SSH — Wye there is checked and started for you, and a tunnel brings it here — or the address of a Wye served for a team. What you read and write there is that machine&apos;s. In the window, <b>Workspace</b> in the menu switches between this machine and each workspace; from the terminal, <code>wye --workspace &lt;name&gt; …</code>.</p>
      <div className="inbox-form">
        <ul className="remotes">
          {rows && rows.length === 0 && <li className="remote remote-none muted">No workspaces yet.</li>}
          {(rows ?? []).map(r => (
            <li key={r.name} className={`remote s-${r.state}`} data-workspace={r.name} data-state={r.state}>
              <div className="remote-row">
                <span className="remote-dot" aria-hidden="true" />
                <span className="remote-host">{r.name} <span className="muted">{r.url ?? r.host}{r.version ? ` · wye ${r.version}` : ''}</span></span>
                <span className="remote-state">{WORDS[r.state]}{r.message && <span className="remote-why"> — {r.message}</span>}</span>
                <span className="remote-acts">
                  {r.state === 'connected' && r.open && <a className="remote-open" href={r.open} target="_blank" rel="noreferrer">Open</a>}
                  {r.on && r.state !== 'failed' ? <button disabled={busy} onClick={() => void post({ action: 'workspace-disconnect', name: r.name })}>Disconnect</button> : <button disabled={busy} onClick={() => void again(r)}>{r.state === 'failed' ? 'Try again' : 'Connect'}</button>}
                  <button disabled={busy} title={r.url ? 'Forget this workspace and its stored password' : 'Close the tunnel and forget this workspace'} onClick={() => void post({ action: 'workspace-remove', name: r.name })}>Remove</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="inbox-row remote-add">
          <input value={target} placeholder="you@devbox — or https://wye.example.com" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="Box or address" onChange={e => setTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && target.trim() && !busy) void add(); }} />
          <input value={name} placeholder="name" spellCheck={false} aria-label="Workspace name" onChange={e => setName(e.target.value)} style={{ maxWidth: 120 }} />
        </div>
        {isUrl && (
          <div className="inbox-row remote-add">
            <input value={user} placeholder="user (the proxy's)" autoComplete="off" spellCheck={false} aria-label="User" onChange={e => setUser(e.target.value)} />
            <input value={password} type="password" placeholder="password" autoComplete="new-password" aria-label="Password" onChange={e => setPassword(e.target.value)} />
          </div>
        )}
        <div className="sec-actions">
          <button className="pri" disabled={busy || !target.trim()} onClick={() => void add()}>{isUrl ? 'Add address' : 'Add box'}</button>
          {msg && <span className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</span>}
        </div>
        <p className="lede remote-caution">A box needs your SSH key to work without a password prompt and <code>wye</code> 0.8 or later installed there. An address&apos;s password is kept on this machine only, readable by you alone (<code>~/.wye/credentials.json</code>).</p>
      </div>
    </section>
  );
}
