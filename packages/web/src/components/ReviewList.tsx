'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill, KindPill } from './Pills';
import { requestSend } from './SendToAgent';
import type { ReviewItem } from '@/lib/review';

const LABEL: Record<string, string> = { question: 'Questions', decision: 'Decisions', req: 'Requirements', rule: 'Rules', goal: 'Goals', entity: 'Entities', task: 'Tasks' };
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

// Review what agents wrote into the documents: approve, reject or resolve in place; open the node or its document.
export function ReviewList({ product, items }: { product: string; items: ReviewItem[] }) {
  const { open, openId } = usePeek(); const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const setStatus = async (it: ReviewItem, status: string) => {
    setBusy(it.id); setMsg(null);
    const r = await fetch(`/api/${product}/node/${encodeURIComponent(it.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setMsg(`${it.id}: ${j.message ?? j.error}`); return; }
    router.refresh();
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
                <div className="review-head" onClick={() => open(it.id)}>
                  <KindPill kind={it.kind} /><span className="review-title">{plain(it.title)}</span><StatusPill status={it.status} />
                  <span className="muted review-where">{it.project} / {it.doc}{it.session ? ` · session ${it.session.slice(0, 6)}` : ''}</span>
                </div>
                {it.text && it.text !== it.title && <p className="review-text">{plain(it.text).slice(0, 500)}</p>}
                {Object.entries(it.fields).filter(([k]) => k !== 'date').map(([k, v]) => <p key={k} className="inbox-field"><b>{k}</b> {plain(v).slice(0, 400)}</p>)}
                {it.refs.length > 0 && <div className="tags">{it.refs.map(r => <SmartTag key={r} id={r} />)}</div>}
                <div className="sec-actions review-acts">
                  {it.kind === 'question'
                    ? <><button className="pri" disabled={busy === it.id} onClick={() => setStatus(it, 'resolved')} title="The answer is recorded (as a decision) — close the question">Resolve</button><button disabled={busy === it.id} onClick={() => setStatus(it, 'rejected')}>Reject</button></>
                    : <><button className="pri" disabled={busy === it.id} onClick={() => setStatus(it, 'approved')}>Approve</button><button disabled={busy === it.id} onClick={() => setStatus(it, 'rejected')}>Reject</button></>}
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
