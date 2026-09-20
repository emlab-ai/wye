'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill, KindPill } from './Pills';
import { requestSend } from './CommandBox';
import type { ReviewItem } from '@/lib/review';
import { describeBlock, verdictSummary } from '@/lib/review-summary';

const LABEL: Record<string, string> = { question: 'Questions', contradiction: 'Contradictions', decision: 'Decisions', req: 'Requirements', rule: 'Rules', constraint: 'Constraints', lesson: 'Lessons', goal: 'Goals', entity: 'Entities', task: 'Tasks' };
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// Review what agents wrote into the documents: approve, reject or resolve in place; open the node or its document.
// Each card is laid out for the decision (rule:review-readable): the title; one description that is enough to
// understand the block — a requirement as its behaviour, a decision as its choice, a question as its question; the
// open conflicts that need a choice; where it is and how it was checked, muted; everything else (the other fields,
// the refs, consistent verdicts) under "details".
export function ReviewList({ product, items }: { product: string; items: ReviewItem[] }) {
  const { open, openId } = usePeek(); const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const put = async (id: string, body: Record<string, unknown>) => { const r = await fetch(`/api/${product}/node/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${id}: ${j.message ?? j.error}`); };
  const setStatus = async (it: ReviewItem, status: string) => {
    setBusy(it.id); setMsg(null);
    try { await put(it.id, { status }); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setBusy(null); return; }
    setBusy(null); router.refresh();
  };
  // Approving a block with an open contradicts / duplicate verdict asks what to do with the other side
  // (req:memory.verdicts): supersede it, say this refines it, or dismiss the verdict with a reason. Each choice edits
  // the block and resolves the contradiction node; approving the block then retires what it supersedes.
  const [choosing, setChoosing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const openConflicts = (it: ReviewItem) => (it.verdicts ?? []).filter(v => (v.kind === 'contradicts' || v.kind === 'duplicate') && v.open);
  const approve = (it: ReviewItem) => { if (openConflicts(it).length) { setChoosing(it.id); setReason(''); } else void setStatus(it, 'approved'); };
  const resolveWith = async (it: ReviewItem, how: 'supersede' | 'refine' | 'dismiss') => {
    setBusy(it.id); setMsg(null);
    try {
      for (const v of openConflicts(it)) {
        if (how === 'supersede') await put(it.id, { props: { supersedes: v.other } });
        if (how === 'refine') await put(it.id, { props: { refines: v.other } });
        if (v.contradiction) await put(v.contradiction, { status: how === 'dismiss' ? 'dismissed' : 'resolved', props: { resolution: how === 'dismiss' ? `dismissed: ${reason.trim() || 'not a contradiction'}` : how === 'supersede' ? `${it.id} supersedes ${v.other}` : `${it.id} refines ${v.other}` } });
      }
      await put(it.id, { status: 'approved' });
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setBusy(null); return; }
    setBusy(null); setChoosing(null); router.refresh();
  };
  const kinds = [...new Set(items.map(i => i.kind))];
  const shown = items.filter(i => !filter || i.kind === filter);
  const groups = [...new Map(shown.map(i => [i.kind, shown.filter(x => x.kind === i.kind)]))];
  return (
    <div className="review">
      <div className="track-tools"><div className="chips">
        <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter('')}>All <small>{items.length}</small></button>
        {kinds.map(k => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(filter === k ? '' : k)}>{LABEL[k] ?? k} <small>{items.filter(i => i.kind === k).length}</small></button>)}
      </div></div>
      {msg && <p className="notice">{msg}</p>}
      {!shown.length && <p className="muted">Nothing waits for review: every decision, requirement and rule is approved and every question is resolved.</p>}
      {groups.map(([kind, its]) => (
        <section key={kind} className="review-group">
          <h4>{LABEL[kind] ?? kind} <span className="muted">{its.length}</span>{kind !== 'question' && its.length > 1 && <button className="mini" disabled={busy === 'all'} onClick={async () => { setBusy('all'); for (const it of its) await fetch(`/api/${product}/node/${encodeURIComponent(it.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) }); setBusy(null); router.refresh(); }} title="Approve every item in this group">Approve all {its.length}</button>}</h4>
          <ul className="review-items">
            {its.map(it => (
              <li key={it.id} className={`review-item ${openId === it.id ? 'on' : ''}`}>
                {(() => {
                  const d = describeBlock(it.kind, it.text, it.fields);
                  const v = verdictSummary(it.verdicts, it.checked, it.classifying);
                  const rest = (it.verdicts ?? []).filter(x => !v.open.includes(x));
                  // a prose node's title is its clipped first sentence: when the description starts with it, the
                  // description is the title — said once, in full
                  const t = plain(it.title); const clipped = t.length >= 50 && d.description.startsWith(t.replace(/[…. ]+$/, '').slice(0, 50));
                  return <>
                    <div className="review-head" onClick={() => open(it.id)}>
                      <KindPill kind={it.kind} /><span className="review-title">{clipped ? d.description.slice(0, 400) : t}</span><StatusPill status={it.status} />
                    </div>
                    {!clipped && d.description && d.description !== t && <p className="review-text">{d.description.slice(0, 700)}</p>}
                    {v.open.map((x, i) => <p key={i} className={`verdict v-${x.kind} open`}><b>{x.kind}</b> <SmartTag id={x.other} />{x.conflict && <small className="muted"> {x.conflict}</small>} <span>{plain(x.reason)}</span></p>)}
                    <p className="review-meta muted">{it.project} / {it.doc}{it.session ? ` · session ${it.session.slice(0, 6)}` : ''}{v.line ? ` · ${v.line}` : ''}</p>
                    {(d.secondary.length > 0 || it.refs.length > 0 || rest.length > 0) && (
                      <details className="review-more">
                        <summary>details</summary>
                        <p className="inbox-field"><b>id</b> <SmartTag id={it.id} /></p>
                        {d.secondary.map(([k, val]) => <p key={k} className="inbox-field"><b>{k}</b> {val.slice(0, 600)}</p>)}
                        {it.refs.length > 0 && <div className="tags">{it.refs.map(r => <SmartTag key={r} id={r} />)}</div>}
                        {rest.map((x, i) => <p key={i} className={`verdict v-${x.kind}`}><b>{x.kind}</b> <SmartTag id={x.other} /> <span>{plain(x.reason)}</span>{x.contradiction && !x.open && <small className="muted"> · resolved</small>}</p>)}
                      </details>)}
                  </>;
                })()}
                {choosing === it.id && (
                  <div className="verdict-choice">
                    <p>This block contradicts or duplicates {openConflicts(it).map(v => <SmartTag key={v.other} id={v.other} />)}. Approve it and…</p>
                    <div className="sec-actions">
                      <button className="pri" disabled={busy === it.id} onClick={() => resolveWith(it, 'supersede')} title="This block replaces the other: it gets supersedes:, the other is retired">Supersede the other</button>
                      <button disabled={busy === it.id} onClick={() => resolveWith(it, 'refine')} title="Both hold; this one narrows the other: it gets refines:">This refines it</button>
                      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="why it is not a contradiction" />
                      <button disabled={busy === it.id || !reason.trim()} onClick={() => resolveWith(it, 'dismiss')}>Dismiss with reason</button>
                      <button className="linkish" onClick={() => setChoosing(null)}>Cancel</button>
                    </div>
                  </div>)}
                <div className="sec-actions review-acts">
                  {it.kind === 'question'
                    ? <><button className="pri" disabled={busy === it.id} onClick={() => setStatus(it, 'resolved')} title="The answer is recorded (as a decision) — close the question">Resolve</button><button disabled={busy === it.id} onClick={() => setStatus(it, 'rejected')}>Reject</button></>
                    : it.kind === 'contradiction'
                    ? <><button className="pri" disabled={busy === it.id} onClick={() => setStatus(it, 'resolved')} title="One side was superseded or refined — close it">Resolved</button><button disabled={busy === it.id} onClick={() => setStatus(it, 'dismissed')} title="Not a contradiction">Dismiss</button></>
                    : <><button className="pri" disabled={busy === it.id || choosing === it.id} onClick={() => approve(it)}>Approve{openConflicts(it).length ? '…' : ''}</button><button disabled={busy === it.id} onClick={() => setStatus(it, 'rejected')}>Reject</button></>}
                  <a href={it.href} className="linkish" onClick={e => e.stopPropagation()}>Open in document</a>
                  <button className="linkish" onClick={() => requestSend({ refs: [it.id], text: `${it.kind}: ${plain(it.title)}\n\n${plain(it.text)}`, source: { project: it.project, doc: it.doc, link: location.origin + it.href } })}>⇢ agent</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
