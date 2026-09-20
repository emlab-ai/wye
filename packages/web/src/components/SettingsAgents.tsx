'use client';
import { useState } from 'react';

// The dispatcher's knobs (decision:wf2.pr-scheduler): how many approved PRs build at once, and which agent builds.
export function SettingsAgents({ initial }: { initial: { parallel: number; agent: string } }) {
  const [parallel, setParallel] = useState(initial.parallel);
  const [agent, setAgent] = useState(initial.agent);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agents: { parallel, agent } }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.message ?? j.error}`); return; }
    setParallel(j.agents.parallel); setAgent(j.agents.agent); setMsg('Saved.');
  };
  return (
    <section className="kind-section settings-section">
      <h2>Agents</h2>
      <p className="lede">An approved PR is built by the app: a worker starts on it as soon as a slot is free and its scope does not overlap a PR already building. External <code>wye runner</code> processes take backlog tasks as before.</p>
      <div className="inbox-form">
        <div className="inbox-row"><label className="settings-field">parallel runners <input type="number" min={1} max={8} value={parallel} onChange={e => setParallel(Number(e.target.value))} /></label>
          <label className="settings-field">default agent <select value={agent} onChange={e => setAgent(e.target.value)}><option value="claude-code">Claude Code</option><option value="codex">Codex</option></select></label></div>
        <div className="sec-actions"><button className="pri" disabled={busy} onClick={save}>Save</button>{msg && <span className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</span>}</div>
      </div>
    </section>
  );
}
