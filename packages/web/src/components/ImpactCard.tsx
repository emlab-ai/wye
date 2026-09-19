'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SmartTag } from './SmartTag';
import { DiffText } from './ChangeList';
import type { ImpactSet, ImpactCandidate, ImpactVerdict } from '@/lib/impact-run';

const ORDER: ImpactVerdict[] = ['update', 'rework', 'contradicts', 'ask', 'unaffected'];
const LABEL: Record<ImpactVerdict, string> = { update: 'Updates proposed', rework: 'Rework — tasks on the Work view', contradicts: 'Contradicts', ask: 'Ask first', unaffected: 'Unaffected' };

// The impact set on a change card (req:exec.impact-set, req:exec.impact-patch): what the edit reaches, grouped by
// verdict — each candidate with its path ("refined-by → satisfied-by", "content", or "by text") and the model's
// reason; an update shows the candidate's text beside the proposed one as a diff, editable, with Apply / Skip and
// Apply all; a rework names the task the app wrote, a contradicts the contradiction, an ask the question. The set
// fills in as verdicts arrive; without a run (impact manual / off) the structural candidates show with an Impact button.
export function ImpactCard({ product, changeId, impact, me }: { product: string; changeId: string; impact?: ImpactSet; me?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Set<ImpactVerdict>>(new Set(['update', 'rework', 'contradicts', 'ask']));
  const [msg, setMsg] = useState<string | null>(null);
  const post = async (body: Record<string, unknown>) => {
    setBusy(String(body.candidate ?? body.action)); setMsg(null);
    const r = await fetch(`/api/${product}/changes/${changeId}/impact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, by: me || undefined }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    router.refresh();
  };
  const cands = impact?.candidates ?? [];
  const judged = cands.filter(c => c.verdict);
  const updates = cands.filter(c => c.verdict === 'update' && !c.outcome && !edits[c.id]);
  const toggle = (v: ImpactVerdict) => setOpen(s => { const x = new Set(s); if (x.has(v)) x.delete(v); else x.add(v); return x; });
  const groups = ORDER.map(v => [v, cands.filter(c => c.verdict === v)] as const).filter(([, cs]) => cs.length);
  const unjudged = cands.filter(c => !c.verdict);
  return (
    <div className="impact">
      <div className="impact-head">
        <strong>Impact</strong>
        {!impact && <span className="muted">not computed</span>}
        {impact && <span className="muted">{cands.length} candidate{cands.length === 1 ? '' : 's'}{judged.length ? ` · ${judged.length} judged` : ''}{impact.status === 'running' && impact.pending ? ` · ${impact.pending} pending…` : ''}{impact.status === 'failed' ? ` · failed: ${impact.error}` : ''}{impact.mode !== 'auto' && impact.status === 'candidates' ? ` · impact ${impact.mode}: not judged` : ''}</span>}
        <span className="impact-acts">
          {(!impact || impact.status === 'candidates' || impact.status === 'failed' || impact.status === 'done') && <button className="linkish" disabled={busy === 'run'} onClick={() => post({ action: 'run' })} title="Judge every candidate against the change with the model">{impact?.status === 'done' ? 'Run again' : 'Impact'}</button>}
          {updates.length > 1 && <button className="linkish" disabled={busy === 'apply-all'} onClick={() => post({ action: 'apply-all' })} title="Apply every unedited update">Apply all ({updates.length})</button>}
        </span>
      </div>
      {msg && <p className="bad small">{msg}</p>}
      {groups.map(([v, cs]) => (
        <div key={v} className={`impact-group ${v}`}>
          <div className="impact-group-head" onClick={() => toggle(v)}><span className="tchev">{open.has(v) ? '▾' : '▸'}</span>{LABEL[v]} <small className="muted">{cs.length}</small></div>
          {open.has(v) && <ul>{cs.map(c => <Candidate key={c.id} c={c} edit={edits[c.id]} setEdit={t => setEdits(e => ({ ...e, [c.id]: t }))} busy={busy === c.id} onApply={(force?: boolean) => post({ action: 'apply', candidate: c.id, text: edits[c.id] || undefined, force })} onSkip={() => post({ action: 'skip', candidate: c.id })} />)}</ul>}
        </div>
      ))}
      {unjudged.length > 0 && (
        <div className="impact-group pending">
          <div className="impact-group-head" onClick={() => toggle('unaffected')}><span className="tchev">▸</span>{impact?.status === 'running' ? 'Waiting for a verdict' : 'Reached, not judged'} <small className="muted">{unjudged.length}</small></div>
          <ul className="impact-plain">{unjudged.slice(0, 30).map(c => <li key={c.id}><SmartTag id={c.id} /> <span className="muted">{c.via === 'text' ? 'by text' : c.path}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Candidate({ c, edit, setEdit, busy, onApply, onSkip }: { c: ImpactCandidate; edit?: string; setEdit: (t: string) => void; busy: boolean; onApply: (force?: boolean) => void; onSkip: () => void }) {
  const [editing, setEditing] = useState(false);
  const proposed = edit ?? c.update?.text ?? '';
  return (
    <li className={`impact-cand ${c.outcome ? 'dealt ' + c.outcome.state : ''}`}>
      <div className="impact-cand-head"><SmartTag id={c.id} /><span className="muted">{c.via === 'text' ? 'by text' : c.path}{c.cached ? ' · cached' : ''}</span>{c.outcome && <span className={`pill s ${c.outcome.state === 'applied' ? 'done' : c.outcome.state === 'skipped' ? 'dismissed' : 'open'}`}>{c.outcome.state}{c.outcome.ref ? ` ${c.outcome.ref}` : ''}</span>}</div>
      {c.reason && <p className="impact-reason">{c.reason}</p>}
      {c.verdict === 'update' && (
        <div className="impact-patch">
          {editing ? <textarea value={proposed} rows={3} onChange={e => setEdit(e.target.value)} /> : <p className="cdiff-box"><DiffText a={c.text} b={proposed} /></p>}
          {c.update?.props && <p className="muted small">properties: {Object.entries(c.update.props).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
          {!c.outcome && <div className="sec-actions"><button className="pri" disabled={busy} onClick={() => onApply()}>Apply</button><button disabled={busy} onClick={() => setEditing(e => !e)}>{editing ? 'Preview' : 'Edit'}</button><button disabled={busy} onClick={onSkip}>Skip</button></div>}
        </div>
      )}
      {c.verdict === 'ask' && c.question && <p className="impact-question">? {c.question}</p>}
    </li>
  );
}
