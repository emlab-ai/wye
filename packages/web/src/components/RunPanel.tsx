'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';

// One run of a workflow, as a person reads it (decision:wf2.run-holds-the-state): which stage of how many, the
// readiness of that stage row by row with the ids that hold each one back, and the moves that are the person's —
// Advance (refused by the engine unless the rows are green), Reopen a stage, Skip with it recorded, Retry a blocked
// one, Cancel. Used by the document's run strip and by a node's column; readiness comes from the API, computed there.
export type RunView = {
  id: string; workflow: string; on: string; stage: string; status: string; produced: string[]; sessions: string[]; log: string[];
  workflowTitle: string; stageTitle: string; onTitle: string; step: number; of: number;
  readiness: { ok: boolean; rows: { label: string; ok: boolean; blocking: string[] }[] }; stages: { id: string; title: string }[];
};
export const LIVE_RUN = new Set(['running', 'waiting', 'blocked']);

// The runs on a node, refreshed whenever the graph or a session changes (the watcher's events reach us as wf:change).
export function useRuns(product: string, node: string | null): { runs: RunView[]; reload: () => void } {
  const [runs, setRuns] = useState<RunView[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const h = (e: Event) => { const k = (e as CustomEvent<{ kinds: string[] }>).detail.kinds; if (k.includes('graph') || k.includes('session')) setVersion(v => v + 1); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, []);
  useEffect(() => {
    let live = true;
    const url = `/api/${product}/runs${node ? `?node=${encodeURIComponent(node)}` : ''}`;
    fetch(url).then(r => r.ok ? r.json() : { runs: [] }).then(j => { if (live) setRuns(j.runs ?? []); }).catch(() => { if (live) setRuns([]); });
    return () => { live = false; };
  }, [product, node, version]);
  return { runs, reload: () => setVersion(v => v + 1) };
}

export function RunRow({ product, run, reload }: { product: string; run: RunView; reload: () => void }) {
  const { open } = usePeek();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [back, setBack] = useState('');
  const move = async (action: string, stage?: string) => {
    setBusy(action); setMsg('');
    const r = await fetch(`/api/${product}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run: run.id, action, stage }) });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) { setMsg(j.message ?? `could not ${action}`); return; }
    reload();
  };
  const ready = run.readiness;
  const done = !LIVE_RUN.has(run.status);
  return (
    <div className={`run-row s-${run.status}`}>
      <div className="run-head">
        <SmartTag id={run.id} />
        <strong className="run-wf">{run.workflowTitle}</strong>
        <span className="muted">stage {run.step} of {run.of} · {run.stageTitle}{run.status === 'blocked' ? ' · blocked' : done ? ` · ${run.status}` : ''}</span>
        {!done && <span className="muted small">{ready.ok ? 'ready to advance' : `${ready.rows.filter(r => r.ok).length} of ${ready.rows.length} ready`}</span>}
        {!done && <span className="run-acts">
          {run.status === 'blocked'
            ? <button className="pri" disabled={!!busy} onClick={() => move('retry')} title="Run this stage's work again">{busy === 'retry' ? '…' : 'Retry'}</button>
            : <button className="pri" disabled={!!busy || !ready.ok} onClick={() => move('advance')} title={ready.ok ? 'Advance: the next stage starts' : 'Not ready yet — the rows below say what is missing'}>{busy === 'advance' ? '…' : 'Advance'}</button>}
          <select value={back} disabled={!!busy} onChange={e => { const s = e.target.value; setBack(''); if (s) void move('reopen', s); }} title="Go back to a stage — its pass is kept in the log">
            <option value="">Reopen…</option>
            {run.stages.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button disabled={!!busy} onClick={() => move('skip')} title="Advance without the criterion being met — recorded in the log as an override">{busy === 'skip' ? '…' : 'Skip'}</button>
          <button disabled={!!busy} onClick={() => move('cancel')} title="Stop this run">{busy === 'cancel' ? '…' : 'Cancel'}</button>
        </span>}
      </div>
      {!done && <ul className="run-rows">
        {ready.rows.map((row, i) => (
          <li key={i} className={row.ok ? 'ok' : 'no'}>
            {row.ok ? '✓' : '·'} {row.label}
            {row.blocking.length > 0 && <span className="muted"> — {row.blocking.map(id => /^[a-z-]+:/.test(id) ? <SmartTag key={id} id={id} /> : <span key={id}>{id}</span>)}</span>}
          </li>
        ))}
      </ul>}
      {run.produced.length > 0 && <div className="run-made muted small">produced {run.produced.map(id => <SmartTag key={id} id={id} />)}</div>}
      {run.sessions.length > 0 && <div className="run-made muted small">{run.sessions.map(s => <button key={s} className="linkish" onClick={() => open(`session:${s}`)}>conversation {s.slice(0, 6)}</button>)}</div>}
      {run.log.length > 0 && <div className="run-log muted small">{run.log[run.log.length - 1]}</div>}
      {msg && <p className="bad small">{msg}</p>}
    </div>
  );
}
