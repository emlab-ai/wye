'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill, KindPill } from './Pills';
import { wordDiff } from '@/lib/diff';
import type { ChangeRecord } from '@/lib/changes';
import type { ItemVerdict } from '@/lib/review';
import type { ImpactSet } from '@/lib/impact-run';
import { changeSegments, impactSummary, verdictSummary } from '@/lib/review-summary';
import { ImpactCard } from './ImpactCard';

export type ChangeView = Omit<ChangeRecord, 'impact'> & { stale: boolean; exists: boolean; verdicts?: ItemVerdict[]; impact?: ImpactSet };
const FRAME = ['part-of', 'refines', 'satisfied-by', 'governs', 'affects', 'scope', 'when', 'then', 'unless'];

export function DiffText({ a, b }: { a: string; b: string }) {
  return <span className="cdiff">{wordDiff(a, b).map((r, i) => r.kind === 'same' ? <span key={i}>{r.text}</span> : r.kind === 'del' ? <del key={i}>{r.text}</del> : <ins key={i}>{r.text}</ins>)}</span>;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Changes in the Inbox (component:change-card, req:exec.change-kept, req:exec.change-review), laid out for a
// person's decision (rule:review-readable): the title, then what changed — status as pills, a property as old → new,
// a text as a word diff — then only what asks for a decision: open conflicts on the new value and the impact's one
// line (opened when something needs action). Who, when, the id, the unchanged frame, every other verdict and the
// full impact set are under "details" — nothing on the surface that is not part of the decision. A record whose node moved on since says so before Accept.
export function ChangeList({ product, changes, me }: { product: string; changes: ChangeView[]; me?: string }) {
  const { open } = usePeek(); const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const act = async (c: ChangeView, action: 'accept' | 'revert', force = false) => {
    setBusy(c.id); setMsg(m => ({ ...m, [c.id]: '' }));
    const r = await fetch(`/api/${product}/changes/${c.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, by: me || undefined, force }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setMsg(m => ({ ...m, [c.id]: `${j.message ?? j.error}${j.before ? ` — old value: ${j.before.text}` : ''}` })); return; }
    router.refresh();
  };
  if (!changes.length) return null;
  return (
    <section className="changes">
      <h3 className="review-group-head">Changes <span className="muted">{changes.length} edit{changes.length === 1 ? '' : 's'} of existing blocks</span></h3>
      <ul className="change-items">
        {changes.map(c => {
          const v = verdictSummary(c.verdicts);
          const blocked = v.open.length > 0;
          const imp = impactSummary(c.impact);
          const segs = changeSegments(c);
          const title = c.after.title && c.after.title !== c.node ? c.after.title : c.node;
          // a prose node's title is its clipped first sentence: when the text is what changed, the diff is the title
          const clipped = c.changed.includes('text') && title.length >= 50 && c.after.text.replace(/\s+/g, ' ').startsWith(title.replace(/[…. ]+$/, '').slice(0, 50));
          const frame = [`status ${c.after.status || '—'}`, ...FRAME.filter(k => !c.changed.includes(k) && c.after.props[k]).map(k => `${k}: ${c.after.props[k].slice(0, 120)}`)];
          return (
            <li key={c.id} className={`change-item ${c.stale ? 'stale' : ''}`}>
              <div className={`review-head ${clipped ? 'long' : ''}`} onClick={() => open(c.node)}>
                <KindPill kind={c.kind} />
                {!clipped && <span className="review-title">{title}</span>}
                {clipped && <span className="review-title"><DiffText a={c.before.text} b={c.after.text} /></span>}
                {c.stale && <span className="pill s at-risk" title="the node was edited again after this record — look again before you accept">changed since</span>}
                {!c.exists && <span className="pill s blocked">node gone</span>}
              </div>
              <dl className="change-diff">
                {segs.filter(s => !(clipped && s.kind === 'text')).map(s => (
                  <div key={s.key} className="change-row">
                    <dt>{s.label}</dt>
                    <dd>{s.kind === 'text' ? <DiffText a={s.from} b={s.to} /> : s.kind === 'status' ? <><StatusPill status={s.from} /> → <StatusPill status={s.to} /></> : <DiffText a={s.from} b={s.to} />}</dd>
                  </div>
                ))}
              </dl>
              {v.open.length > 0 && <ul className="change-verdicts">{v.open.map((x, i) => <li key={i} className={`verdict ${x.kind}`}><b>{x.kind}</b> <SmartTag id={x.other} /> <span className="muted">{x.reason}</span> <span className="pill s question">decide on the block</span></li>)}</ul>}
              <ImpactCard product={product} changeId={c.id} impact={c.impact} me={me} summary={imp.line} collapsed={imp.actionable === 0} />
              <details className="review-more">
                <summary>details</summary>
                <dl className="change-diff">
                  <div className="change-row"><dt>node</dt><dd><SmartTag id={c.node} /> <span className="muted">in {c.doc}</span></dd></div>
                  <div className="change-row"><dt>edited</dt><dd className="muted">{c.by}{c.also?.length ? `, then ${c.also.join(', ')}` : ''} · {when(c.updatedAt)}{v.line ? ` · ${v.line}` : ''}</dd></div>
                  <div className="change-row frame"><dt>unchanged</dt><dd className="muted">{frame.join(' · ')}</dd></div>
                  {(c.verdicts ?? []).filter(x => !v.open.includes(x)).length > 0 && <div className="change-row"><dt>verdicts</dt><dd><ul className="change-verdicts">{(c.verdicts ?? []).filter(x => !v.open.includes(x)).map((x, i) => <li key={i} className={`verdict ${x.kind}`}><b>{x.kind}</b> <SmartTag id={x.other} /> <span className="muted">{x.reason}</span></li>)}</ul></dd></div>}
                </dl>
              </details>
              <div className="sec-actions review-acts">
                <button className="pri" disabled={busy === c.id || blocked} title={blocked ? 'an open contradicts / duplicate verdict on the new value — supersede, refine or dismiss it on the block first' : 'keep the new value; the record closes'} onClick={() => act(c, 'accept')}>Accept</button>
                <button disabled={busy === c.id || !c.exists} title="write the old value back through the writer; recorded as a change of its own" onClick={() => act(c, 'revert', c.stale && confirm('The node changed since this record. Write the old value back anyway?'))}>Revert</button>
                <button className="linkish" onClick={() => open(c.node)}>open</button>
                {msg[c.id] && <span className="notice bad">{msg[c.id]}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
