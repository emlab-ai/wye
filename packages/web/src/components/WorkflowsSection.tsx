'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { LIVE_RUN, RunRow, useRuns } from './RunPanel';

type Stage = { id: string; title: string; produces: string[]; gate: string; until: { kind: string }[] };
type Workflow = { id: string; title: string; takes: string[]; status: string; stages: Stage[]; bad: string[] };

// The column's Workflows section (decision:wf2.workflow-is-a-skill), beside the Hooks one: the workflows that run on
// this node's kind — what each stage produces and who advances it — with Run, and the runs already live on this node
// with their readiness. An `until` line the engine cannot read is shown here, before it gates anything.
export function WorkflowsSection({ id }: { id: string }) {
  const { product } = usePeek();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const { runs, reload } = useRuns(product, id);
  useEffect(() => {
    let live = true;
    fetch(`/api/${product}/workflows?node=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : { workflows: [] })
      .then(j => { if (live) setWorkflows(j.workflows ?? []); }).catch(() => { if (live) setWorkflows([]); });
    return () => { live = false; };
  }, [id, product]);
  const mine = runs.filter(r => LIVE_RUN.has(r.status));
  if (!workflows.length && !mine.length) return null;
  const start = async (workflow: string, again = false) => {
    setBusy(workflow); setMsg('');
    const r = await fetch(`/api/${product}/workflows`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow, on: id, again }) });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) { setMsg(j.message ?? 'could not start the run'); return; }
    reload();
  };
  return (
    <section className="hooks-sec">
      <h4><button className="linkish" onClick={() => setShow(s => !s)}>{show ? '▾' : '▸'} Workflows <span className="muted">{workflows.length}{mine.length ? ` · ${mine.length} running` : ''}</span></button></h4>
      {(show || mine.length > 0) && <ul className="hooks-list">
        {mine.map(r => <li key={r.id} className="hook-row"><RunRow product={product} run={r} reload={reload} /></li>)}
        {show && workflows.map(w => (
          <li key={w.id} className={`hook-row s-${w.status}`}>
            <div className="hook-head">
              <strong>{w.title}</strong>
              <span className="muted">{w.stages.length} stages{w.status === 'paused' ? ' · paused' : ''}</span>
              <button className="mini" disabled={!!busy || w.status === 'paused'} onClick={() => start(w.id, mine.some(r => r.workflow === w.id))} title="Run this workflow on this node: the first stage starts and waits for you">{busy === w.id ? 'starting…' : 'Run'}</button>
            </div>
            <div className="hook-do muted">{w.stages.map(s => `${s.title}${s.produces.length ? ` → ${s.produces.join(', ')}` : ''}${s.gate === 'auto' ? ' (auto)' : ''}`).join(' · ')}</div>
            {w.bad.map(b => <div key={b} className="notice small">{b} — not a criterion this engine knows</div>)}
          </li>
        ))}
        {msg && <li className="bad small">{msg}</li>}
      </ul>}
    </section>
  );
}
