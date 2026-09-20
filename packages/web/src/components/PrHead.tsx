'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { useMe } from './WorkList';

type Readiness = { definition: boolean; agreed: boolean; impact: boolean; contradictions: boolean; tasks: boolean; ok: boolean; unagreed: string[]; contradicted: string[] };
type Q = { id: string; q: string; header?: string; options: { label: string; description?: string }[]; multi: boolean; status: string; answer?: string; by?: string; askedBy?: string };
type Pr = { ref: string; node: string; num: number | null; title: string; label: string; status: string; task: string | null; session: string; approvedBy: string | null; approvedAt: string | null; readiness: Readiness; definition: { total: number; agreed: number }; questions: Q[] };

const CHECKS: { key: keyof Readiness; label: string; why: string }[] = [
  { key: 'definition', label: 'definition', why: 'at least one block in Definition' },
  { key: 'agreed', label: 'agreed', why: 'every Definition block approved or resolved' },
  { key: 'impact', label: 'impact', why: 'the impact was computed after the last Definition change' },
  { key: 'contradictions', label: 'no contradiction', why: 'no open contradiction touches a Definition block' },
  { key: 'tasks', label: 'tasks', why: 'at least one task line under Tasks' },
];

// The PR's head (decision:wf2.pr-lifecycle): its status, the readiness list (what must hold before the person
// approves) and the person's moves — Approve (with what is unagreed named, once, when the list is not green), Cancel,
// Reopen; Build once approved (the task's panel); the building session as a link. Refreshes while someone is on it.
export function PrHead({ product, prRef }: { product: string; prRef: string }) {
  const { open } = usePeek();
  const [me] = useMe();
  const [pr, setPr] = useState<Pr | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { try { const r = await fetch(`/api/${product}/pr?ref=${encodeURIComponent(prRef)}`); if (r.ok) setPr(await r.json()); } catch { /* keep what we have */ } }, [product, prRef]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!pr || !['refining', 'building', 'approved'].includes(pr.status)) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [pr, load]);
  useEffect(() => { const h = () => load(); window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h); }, [load]);
  if (!pr) return null;
  const act = async (action: 'approve' | 'cancel' | 'reopen') => {
    setBusy(true); setMsg(''); setConfirm(false);
    const r = await fetch(`/api/${product}/pr`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: prRef, action, by: me || undefined }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    if (action === 'approve') setMsg(j.stopped?.length ? 'approved — the refining conversation was told and stopped' : 'approved');
    await load();
  };
  const approve = () => { if (pr.readiness.ok || confirm) act('approve'); else setConfirm(true); };
  const open_ = pr.questions.filter(q => q.status === 'open');
  const rd = pr.readiness;
  const ended = ['done', 'failed', 'cancelled'].includes(pr.status);
  return (
    <section className={`pr-head s-${pr.status}`}>
      <div className="pr-head-row">
        {pr.num && <span className="pr-num" title={pr.node}>#{pr.num}</span>}
        <StatusPill status={pr.status} />
        {pr.approvedBy && <span className="muted small">approved by {pr.approvedBy}{pr.approvedAt ? ` · ${pr.approvedAt.slice(0, 16).replace('T', ' ')}` : ''}</span>}
        <ul className="pr-checks" aria-label="Readiness">
          {CHECKS.map(c => <li key={c.key} className={rd[c.key] ? 'ok' : 'no'} title={c.why}>{rd[c.key] ? '✓' : '✗'} {c.label}</li>)}
        </ul>
        <span className="pr-acts">
          {(pr.status === 'draft' || pr.status === 'refining') && <>
            <button className="pri" disabled={busy} onClick={approve} title={rd.ok ? 'Approve: the PR is queued for a build' : 'Not everything holds yet — a second click approves anyway'}>{confirm ? `Approve anyway? ${rd.unagreed.length} unagreed, ${rd.contradicted.length} contradicted` : 'Approve'}</button>
            <button disabled={busy} onClick={() => act('cancel')}>Cancel</button>
          </>}
          {pr.status === 'approved' && <>
            {pr.task && <button className="pri" onClick={() => open(pr.task!)} title="Assign the build to a worker from the request task's panel">Build</button>}
            <button disabled={busy} onClick={() => act('reopen')}>Reopen</button>
            <button disabled={busy} onClick={() => act('cancel')}>Cancel</button>
          </>}
          {pr.status === 'building' && pr.session && <button className="linkish" onClick={() => open(`session:${pr.session.split(/\s+/).pop()}`)}>building — conversation {pr.session.split(/\s+/).pop()!.slice(0, 6)}</button>}
          {ended && <button disabled={busy} onClick={() => act('reopen')}>Reopen</button>}
        </span>
      </div>
      {(rd.unagreed.length > 0 || rd.contradicted.length > 0) && !ended && <p className="pr-head-why muted">
        {rd.unagreed.length > 0 && <>not agreed: {rd.unagreed.map(id => <span key={id}><SmartTag id={id} /> </span>)}</>}
        {rd.contradicted.length > 0 && <>· contradicted: {rd.contradicted.map(id => <span key={id}><SmartTag id={id} /> </span>)}</>}
      </p>}
      {msg && <p className="muted small">{msg}</p>}
      {open_.length > 0 && <div className="pr-questions">
        <p className="ask-lead">Wye is asking — the request goes on once you answer.</p>
        {open_.map(q => <PageQuestion key={q.id} product={product} prRef={prRef} q={q} me={me} onDone={load} />)}
      </div>}
    </section>
  );
}

// One open question card of the page (decision:wf2.pr-questions-on-the-page): the options as buttons, "Other" as
// free text; the answer goes on the card and, when the request's last card is answered, to the agent.
function PageQuestion({ product, prRef, q, me, onDone }: { product: string; prRef: string; q: Q; me: string; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const value = [...picked, ...(other.trim() ? [other.trim()] : [])].join(', ');
  const toggle = (label: string) => setPicked(p => q.multi ? (p.includes(label) ? p.filter(x => x !== label) : [...p, label]) : [label]);
  const send = async () => {
    if (!value || busy) return; setBusy(true);
    await fetch(`/api/${product}/pr`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: prRef, action: 'answer', id: q.id, answer: value, by: me || undefined }) });
    setBusy(false); onDone();
  };
  return (
    <div className="ask-q">
      {q.header && <span className="ask-header">{q.header}</span>}
      <p className="ask-text">{q.q}</p>
      <ul className="ask-options" role={q.multi ? 'group' : 'radiogroup'}>
        {q.options.map(o => { const on = picked.includes(o.label); return <li key={o.label}><button type="button" role={q.multi ? 'checkbox' : 'radio'} aria-checked={on} className={`ask-opt ${on ? 'on' : ''}`} onClick={() => toggle(o.label)}><i>{on ? '●' : '○'}</i><span><b>{o.label}</b>{o.description && <small>{o.description}</small>}</span></button></li>; })}
        <li><label className="ask-other"><i>{other.trim() ? '●' : '○'}</i><input value={other} placeholder="Other — type your own answer" onChange={e => setOther(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }} /></label></li>
      </ul>
      <p className="ask-actions"><button className="pri" disabled={!value || busy} onClick={send}>{busy ? 'Sending…' : 'Answer'}</button> <SmartTag id={q.id} /></p>
    </div>
  );
}
