'use client';
import { useState } from 'react';
import { LAUNCH_OPTIONS, claudeLaunchArgs, codexLaunchArgs, type AgentLaunch, type LaunchSettings } from '@/lib/agent-launch';

// The dispatcher's knobs (decision:wf2.pr-scheduler): how many approved PRs build at once, and which agent builds —
// and how each agent is launched (decision:wf2.agent-launch): its default model, how much it does without asking,
// its effort, and any flags of the person's own.
export function SettingsAgents({ initial, launch: launch0 }: { initial: { parallel: number; agent: string; hooks?: boolean }; launch?: LaunchSettings }) {
  const [parallel, setParallel] = useState(initial.parallel);
  const [agent, setAgent] = useState(initial.agent);
  const [hooks, setHooks] = useState(initial.hooks !== false);
  const [launch, setLaunch] = useState<LaunchSettings>(launch0 ?? {});
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = (a: string, patch: AgentLaunch) => { setLaunch(l => ({ ...l, [a]: { ...l[a], ...patch } })); setMsg(''); };
  const save = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agents: { parallel, agent, hooks }, launch: Object.fromEntries(Object.keys(LAUNCH_OPTIONS).map(a => [a, launch[a] ?? {}])) }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(`Failed: ${j.message ?? j.error}`); return; }
    setParallel(j.agents.parallel); setAgent(j.agents.agent); setHooks(j.agents.hooks !== false); setLaunch(j.launch ?? {}); setMsg('Saved.');
  };
  return (
    <section className="kind-section settings-section">
      <h2>Agents</h2>
      <p className="lede">An approved PR is built by the app: a worker starts on it as soon as a slot is free and its scope does not overlap a PR already building. External <code>wye runner</code> processes take backlog tasks as before.</p>
      <div className="inbox-form">
        <div className="inbox-row"><label className="settings-field">parallel runners <input type="number" min={1} max={8} value={parallel} onChange={e => setParallel(Number(e.target.value))} /></label>
          <label className="settings-field">default agent <select value={agent} onChange={e => setAgent(e.target.value)}><option value="claude-code">Claude Code</option><option value="codex">Codex</option></select></label>
          <label className="settings-field" title="The hooks of every product (the Hooks document): when a node is created, approved, linked… a skill runs on it, a task is made, blocks are added"><input type="checkbox" checked={hooks} onChange={e => setHooks(e.target.checked)} /> hooks fire</label></div>
        <p className="lede" style={{ margin: '10px 0 0' }}>How each agent starts. The model here is the default: a skill, a workflow or a stage that says <code>model:</code> on its card runs that one, and a new conversation can name its own. A librarian reads and proposes whatever the mode; a session that is already running keeps what it started with.</p>
        {Object.entries(LAUNCH_OPTIONS).map(([a, o]) => {
          const l = launch[a] ?? {}; const bin = a === 'codex' ? 'codex exec' : 'claude';
          const added = (a === 'codex' ? codexLaunchArgs(l, { model: l.model?.trim() }) : claudeLaunchArgs(l, { model: l.model?.trim() })).map(x => /[\s"']/.test(x) ? JSON.stringify(x) : x).join(' ');
          return (
            <div className="launch" key={a} data-agent={a}>
              <h3>{o.label}<code>{bin}</code></h3>
              <label htmlFor={`launch-model-${a}`}>model</label>
              <input id={`launch-model-${a}`} className="mono" value={l.model ?? ''} placeholder={`the ${bin.split(' ')[0]} CLI’s own default`} list={`launch-models-${a}`} spellCheck={false} onChange={e => set(a, { model: e.target.value })} />
              <datalist id={`launch-models-${a}`}>{o.models.map(m => <option key={m} value={m} />)}</datalist>
              <label htmlFor={`launch-mode-${a}`}>mode</label>
              <select id={`launch-mode-${a}`} value={l.mode ?? o.modes[0].id} onChange={e => set(a, { mode: e.target.value === o.modes[0].id ? undefined : e.target.value })}>{o.modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
              <label htmlFor={`launch-effort-${a}`}>effort</label>
              <select id={`launch-effort-${a}`} value={l.effort ?? ''} onChange={e => set(a, { effort: e.target.value || undefined })}><option value="">the model’s default</option>{o.efforts.map(x => <option key={x} value={x}>{x}</option>)}</select>
              <label htmlFor={`launch-args-${a}`} title="Any other flag the CLI takes, as you would type it — added after the ones above">more flags</label>
              <input id={`launch-args-${a}`} className="mono" value={l.args ?? ''} placeholder={a === 'codex' ? '-c key=value --profile work' : '--fallback-model sonnet --max-budget-usd 5'} spellCheck={false} onChange={e => set(a, { args: e.target.value })} />
              <p className="launch-cmd">{added ? `${bin} … ${added}` : `${bin} … — nothing added`}</p>
            </div>
          );
        })}
        <div className="sec-actions"><button className="pri" disabled={busy} onClick={save}>Save</button>{msg && <span className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</span>}</div>
      </div>
    </section>
  );
}
