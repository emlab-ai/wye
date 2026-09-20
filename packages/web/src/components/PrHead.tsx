'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { useMe } from './WorkList';

type Readiness = { definition: boolean; agreed: boolean; impact: boolean; contradictions: boolean; tasks: boolean; ok: boolean; unagreed: string[]; contradicted: string[] };
type Pr = { ref: string; node: string; status: string; task: string | null; session: string; approvedBy: string | null; approvedAt: string | null; readiness: Readiness; definition: { total: number; agreed: number } };

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
  const rd = pr.readiness;
  const ended = ['done', 'failed', 'cancelled'].includes(pr.status);
  return (
    <section className={`pr-head s-${pr.status}`}>
      <div className="pr-head-row">
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
    </section>
  );
}
