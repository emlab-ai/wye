'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AGENTS } from '@/lib/session-types';
import type { WorkItem } from '@/lib/work';

// Assign (req:exec.dispatch): a task handed to a worker from where it is listed — a person (worker: is set), an
// agent (a conversation starts with the task, its document and what it serves as refs, the constraint packet in
// the first message), or the runner pool (a queued run session). A held task asks before it re-queues.
// `build` (req:exec.build-from-definition): the task is a plan's request task and that plan's Definition goes with the
// assignment; `unagreed` lists the blocks not yet agreed, so Build says what it is building on anyway.
export function Assign({ product, item, people, me, onClose, onDone, build, unagreed }: { product: string; item: Pick<WorkItem, 'id' | 'title' | 'worker' | 'state' | 'status' | 'blocked' | 'blockedBy'>; people: string[]; me?: string; onClose: () => void; onDone: (session?: string) => void; build?: string; unagreed?: string[] }) {
  const [worker, setWorker] = useState(item.worker && !AGENTS.some(a => a.id === item.worker) ? item.worker : me || AGENTS[0].id);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState(true);
  const [cwd, setCwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  useEffect(() => { try { setCwd(localStorage.getItem(`wf-cwd-${product}`) ?? ''); } catch { /* ignore */ } }, [product]);
  const isAgent = AGENTS.some(a => a.id === worker) || worker === 'runner';
  const chosen = worker === '__other' ? name.trim() : worker;
  const go = async () => {
    if (!chosen || busy) return;
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/work/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: item.id, worker: chosen, note, pr: isAgent && plan && !build, cwd: cwd.trim() || undefined, force, by: me || undefined, build }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.status === 409) { setForce(true); setMsg(`${j.message} — press Assign again to re-queue it.`); return; }
    if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not assign'); return; }
    onDone(j.session);
  };
  const refused = item.status === 'done' ? 'the task is done' : item.blocked ? `blocked by ${item.blockedBy.join(', ')}` : null;
  return createPortal(
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal assign" role="dialog" aria-label="Assign">
        <h3>{build ? 'Build' : 'Assign'} <code>{item.id.replace(/^task:/, '')}</code></h3>
        {build && <p className="muted small">The worker gets the plan&apos;s Definition — every agreed block&apos;s text and id, the edits made while defining — with the constraint packet, and works on the same plan page.{unagreed?.length ? <> <b className="bad">{unagreed.length} block{unagreed.length === 1 ? ' is' : 's are'} not agreed</b> ({unagreed.join(', ')}) — building anyway means building on proposals.</> : ''}</p>}
        <p className="muted assign-title">{item.title}</p>
        {refused ? <p className="bad">Cannot assign: {refused}.</p> : (
          <>
            <label className="assign-row"><span className="muted">to</span>
              <select value={worker} onChange={e => setWorker(e.target.value)}>
                <optgroup label="agents">{AGENTS.filter(a => a.id !== 'clerk').map(a => <option key={a.id} value={a.id}>{a.label} — a conversation</option>)}<option value="runner">Runner pool — queued for wye agent listen</option></optgroup>
                <optgroup label="people">{[...new Set([...(me ? [me] : []), ...people])].map(p => <option key={p} value={p}>{p}</option>)}<option value="__other">someone else…</option></optgroup>
              </select>
              {worker === '__other' && <input value={name} placeholder="name" onChange={e => setName(e.target.value)} autoFocus />}
            </label>
            <textarea className="assign-note" rows={3} placeholder={isAgent ? 'A note for the worker (optional): what matters, where to look' : 'A note (optional)'} value={note} onChange={e => setNote(e.target.value)} />
            {isAgent && worker !== 'runner' && (
              <>
                {!build && <label className="palette-plan"><input type="checkbox" checked={plan} onChange={e => setPlan(e.target.checked)} /> plan first — understand, propose, confirm, then build</label>}
                <input className="palette-cwd" value={cwd} placeholder="working folder (the code repository; the product's repo when empty)" onChange={e => setCwd(e.target.value)} spellCheck={false} />
              </>
            )}
            {item.state === 'queued' || item.state === 'working' ? <p className="muted small">{item.worker ?? 'a worker'} holds it ({item.state}); assigning again re-queues it.</p> : null}
            {msg && <p className="bad">{msg}</p>}
            <div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" onClick={go} disabled={busy || !chosen}>{busy ? (build ? 'Starting…' : 'Assigning…') : force ? 'Assign anyway' : build ? (unagreed?.length ? 'Build anyway' : 'Build') : 'Assign'}</button></div>
          </>
        )}
      </div>
    </div>, document.body);
}
