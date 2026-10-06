'use client';
import { useCallback, useEffect, useState } from 'react';
import { agentStart, serverSetup, type RemoteView } from '@/lib/remote-view';

// App settings › Remote agents (decision:wf2.remote-tunnel, decision:wf2.remote-agents-join): agents on servers reached
// over SSH work with the Wye on this machine. The section is a list of servers — as many as there are — each with a
// reverse tunnel the app opens and keeps up (lib/remote) and where it stands. One tunnel serves every agent on its
// server; each agent joins as a session of its own, so a connected row shows what to run once on the server and what
// to run for each agent. No password can be typed here — ssh runs without a prompt — so a host that needs one says so.
const WORDS: Record<RemoteView['state'], string> = { off: 'off', connecting: 'connecting…', connected: 'connected', failed: 'not connected' };

export function SettingsRemote() {
  const [remotes, setRemotes] = useState<RemoteView[] | null>(null);
  const [port, setPort] = useState(3456);
  const [host, setHost] = useState('');
  const [remotePort, setRemotePort] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const take = (j: { remotes: RemoteView[]; port: number }) => { setRemotes(j.remotes); setPort(j.port); };
  const load = useCallback(async () => { try { const r = await fetch('/api/system/remote', { cache: 'no-store' }); if (r.ok) take(await r.json()); } catch { /* the app is restarting: the next tick asks again */ } }, []);
  // a tunnel that is being opened, or opened again after a drop, changes within seconds; a settled one is only watched
  const moving = (remotes ?? []).some(r => r.state === 'connecting' || (r.on && r.state === 'failed'));
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), moving ? 1500 : 6000); return () => clearInterval(t); }, [load, moving]);
  const act = async (action: 'connect' | 'disconnect' | 'remove', h: string, p?: number) => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/system/remote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, host: h, ...(p ? { port: p } : {}) }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.message ?? j.error ?? r.statusText}`); return false; }
    take(j); return true;
  };
  const add = async () => { if (await act('connect', host.trim(), Number(remotePort) || undefined)) { setHost(''); setRemotePort(''); } };
  const copy = (key: string, text: string) => { void navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500); }); };
  const up = (remotes ?? []).filter(r => r.state === 'connected').length;
  return (
    <section className="kind-section settings-section">
      <h2>Remote agents</h2>
      <p className="lede">Agents running on servers you reach over SSH can work with this Wye and write back to it. Add every server they run on: the app keeps one reverse tunnel per server, and <b>every agent on that server uses it</b> — <code>wye</code> there answers from this machine. Each agent joins as a session of its own, so you see each one in Wye and what it wrote. <a href="https://github.com/emlab-ai/wye/blob/main/docs/remote-agent.md" target="_blank" rel="noreferrer">How it works</a>.</p>
      <div className="inbox-form">
        <h3 className="remote-h">Servers{remotes && remotes.length > 0 && <span className="muted"> {up} of {remotes.length} connected</span>}</h3>
        <ul className="remotes">
          {remotes && remotes.length === 0 && <li className="remote remote-none muted">No servers yet. Add the first one below — and another for each further machine.</li>}
          {(remotes ?? []).map(r => (
            <li key={r.host} className={`remote s-${r.state}`} data-host={r.host} data-state={r.state}>
              <div className="remote-row">
                <span className="remote-dot" aria-hidden="true" />
                <span className="remote-host">{r.host}<span className="muted">:{r.port}</span></span>
                <span className="remote-state">{WORDS[r.state]}{r.message && <span className="remote-why"> — {r.message}</span>}</span>
                <span className="remote-acts">
                  {/* a failure the app does not try again by itself (no such host, no key) waits for the person */}
                  {r.state === 'failed' && !/again in/.test(r.message) ? <button disabled={busy} onClick={() => void act('connect', r.host, r.port)}>Try again</button> : r.on ? <button disabled={busy} onClick={() => void act('disconnect', r.host)}>Disconnect</button> : <button disabled={busy} onClick={() => void act('connect', r.host, r.port)}>Connect</button>}
                  <button disabled={busy} title="Close the tunnel and forget this server" onClick={() => void act('remove', r.host)}>Remove</button>
                </span>
              </div>
              {r.state === 'connected' && (
                <div className="remote-next">
                  <p className="muted">Once on {r.host}:</p>
                  <pre>{serverSetup(r.port)}</pre>
                  <button onClick={() => copy(`${r.host}/setup`, serverSetup(r.port))}>{copied === `${r.host}/setup` ? 'Copied' : 'Copy'}</button>
                  <p className="muted">For each agent you start there — as many as you like, each in its own shell:</p>
                  <pre>{agentStart()}</pre>
                  <button onClick={() => copy(`${r.host}/agent`, agentStart())}>{copied === `${r.host}/agent` ? 'Copied' : 'Copy'}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="inbox-row remote-add">
          <input value={host} placeholder="you@server — or a Host from ~/.ssh/config" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="SSH host" onChange={e => setHost(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && host.trim() && !busy) void add(); }} />
          <label className="settings-field" title={`The port on the server that leads here. Leave it empty to use ${port}, the same as on this machine — links then open there unchanged.`}>port <input type="number" min={1024} max={65535} value={remotePort} placeholder={String(port)} aria-label="Port on the server" onChange={e => setRemotePort(e.target.value)} /></label>
        </div>
        <div className="sec-actions">
          <button className="pri" disabled={busy || !host.trim()} onClick={() => void add()}>Add server</button>
          {msg && <span className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</span>}
        </div>
        <p className="lede remote-caution">The app has no login. While a tunnel is up, every account on that server can read and write your products through it — use this with servers only you use. Your SSH key must already work for the host (<code>ssh {host.trim() || 'you@server'}</code> without a password prompt).</p>
      </div>
    </section>
  );
}
