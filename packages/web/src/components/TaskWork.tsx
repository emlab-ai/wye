'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { StatusPill } from './Pills';
import { SmartTag } from './SmartTag';
import { Assign } from './Assign';
import { useMe } from './WorkList';
import type { WorkItem } from '@/lib/work';
import type { ProducedBlock } from '@/lib/work-io';
import { agentLabel, when } from './SessionView';

type Detail = { item: WorkItem; sessions: { id: string; status: string; agent: string; result?: string; createdAt: string; finishedAt?: string; prDoc?: string }[]; blocks: ProducedBlock[] };
const REVIEWABLE = new Set(['proposed', 'draft', 'open', 'question']);

// A task's work in the right column (req:exec.dispatch, req:exec.done-comes-back): who holds it and what is
// happening, Assign, and — once a session on it ended — the result summary, the blocks it produced with their Inbox
// state, the open questions and proposed decisions, a Review action, and the tick that marks it done.
export function TaskWork({ id }: { id: string }) {
  const { product, open } = usePeek();
  const [me] = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [assigning, setAssigning] = useState<false | 'assign' | 'build'>(false);
  // a PR's request task carries the PR's Definition (decision:wf2.pr-lifecycle): its state, and Build once approved
  const [plan, setPlan] = useState<{ ref: string; status: string; role: string; definition: { total: number; agreed: number; open: number; missing: number; contradicted: string[]; defined: boolean; items: { id: string; status: string; agreed: boolean }[] } } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/${product}/work?id=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then((j: Detail | null) => {
      if (!live) return; setD(j);
      const it = j?.item; const doc = it?.doc;
      if (it?.requestTask && it.pr && doc) fetch(`/api/${product}/pr?ref=${encodeURIComponent(`${product}/${doc.project}/${doc.slug}`)}`).then(r => r.ok ? r.json() : null).then(p => { if (live && p) setPlan(p); }).catch(() => {});
    });
    const onChange = () => setTick(t => t + 1);
    window.addEventListener('wf:change', onChange);
    return () => { live = false; window.removeEventListener('wf:change', onChange); };
  }, [product, id, tick]);
  if (!d) return null;
  const { item, sessions, blocks } = d;
  const last = sessions[0];
  const toReview = blocks.filter(b => b.exists && REVIEWABLE.has(b.status) && ['question', 'decision', 'req', 'rule', 'constraint', 'contradiction'].includes(b.kind));
  const markDone = async () => {
    await fetch(`/api/${product}/node/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'done', props: { ...(me ? { by: me } : {}) } }) });
    setTick(t => t + 1);
  };
  return (
    <section className="taskwork">
      <div className="peek-bar peek-sub">
        <strong>Work</strong>
        <span className={`wstate ${item.state}`}>{item.state === 'done' ? 'done' : item.state}</span>
        {item.worker && <span className="muted">· {item.worker}</span>}
        {item.ready && <span className="pill ready">ready</span>}
        {item.blocked && <span className="pill blocked-by" title={`blocked by ${item.blockedBy.join(', ')}`}>⛔ blocked</span>}
        <span className="taskwork-acts">
          {plan && plan.status === 'approved' && item.status !== 'done' && item.state !== 'working' && item.state !== 'queued' && <button className="linkish" onClick={() => setAssigning('build')} title="Assign the build with the PR's Definition as context">Build</button>}
          {item.status !== 'done' && <button className="linkish" onClick={() => setAssigning('assign')}>Assign</button>}
          {item.status !== 'done' && <button className="linkish" onClick={markDone} title={me ? `done, by ${me}` : 'done'}>✓ done</button>}
        </span>
      </div>
      {last && (last.status === 'running' || last.status === 'queued') && (
        // assigned and under way (req:exec.dispatch): who holds it, since when, the PR page and the conversation
        <div className="taskwork-assigned">
          <small>{last.status === 'queued' ? 'queued for' : 'assigned to'}</small> <b>{agentLabel(last.agent)}</b> <span className="muted">· {when(last.createdAt)}</span>
          {last.prDoc && <a className="taskwork-plan" href={`/${product}/${last.prDoc.split('/').slice(1).join('/d/')}`} title={last.prDoc}>PR page ↗</a>}
          <button className="linkish" onClick={() => open(`session:${last.id}`)}>conversation {last.id.slice(0, 6)}</button>
        </div>
      )}
      {plan && (
        <div className="taskwork-def">
          <small>plan {plan.status}{plan.role === 'librarian' ? ' · defined with Wye' : ''}</small>
          <span className={`pill s ${plan.definition.defined ? 'done' : plan.definition.total ? 'in-progress' : 'proposed'}`}>{plan.definition.defined ? 'defined' : plan.definition.total ? `${plan.definition.agreed}/${plan.definition.total} agreed` : 'no definition yet'}</span>
          {plan.definition.contradicted.length > 0 && <span className="pill s blocked" title={plan.definition.contradicted.join(', ')}>contradicted</span>}
          {plan.definition.items.length > 0 && <div className="tags">{plan.definition.items.map(it => <span key={it.id} className="ctxcard-item"><SmartTag id={it.id} />{it.status && <StatusPill status={it.status} />}</span>)}</div>}
        </div>
      )}
      {last && (last.status === 'done' || last.status === 'failed' || last.status === 'cancelled') && (
        <div className="taskwork-result">
          <div className="taskwork-head"><small>result</small><button className="linkish" onClick={() => open(`session:${last.id}`)}>session {last.id.slice(0, 6)}</button>{last.prDoc && <a className="linkish" href={`/${product}/${last.prDoc.split('/').slice(1).join('/d/')}`}>plan ↗</a>}<StatusPill status={last.status} /><span className="muted">{agentLabel(last.agent)} · {when(last.finishedAt ?? last.createdAt)}</span></div>
          <p className="taskwork-summary">{(last.result ?? '').trim() || <em className="muted">no summary</em>}</p>
          {blocks.length > 0 && (
            <div className="taskwork-blocks">
              <small>{blocks.length} block{blocks.length === 1 ? '' : 's'} {toReview.length ? `· ${toReview.length} to review` : ''}</small>
              <ul>{blocks.slice(0, 40).map(b => <li key={b.id} className={b.exists ? '' : 'gone'}><span className="muted">{b.change === 'added' ? '+' : b.change === 'changed' ? '~' : '−'}</span><SmartTag id={b.id} />{b.status && <StatusPill status={b.status} />}</li>)}</ul>
              {toReview.length > 0 && <a className="taskwork-review" href={`/${product}/inbox?ids=${encodeURIComponent(toReview.map(b => b.id).join(','))}&task=${encodeURIComponent(id)}`}>Review {toReview.length} in the Inbox →</a>}
            </div>
          )}
        </div>
      )}
      {assigning && <Assign product={product} item={item} people={[]} me={me} build={assigning === 'build' && plan ? plan.ref : undefined} unagreed={assigning === 'build' && plan ? plan.definition.items.filter(i => !i.agreed).map(i => i.id) : undefined} onClose={() => setAssigning(false)} onDone={s => { setAssigning(false); setTick(t => t + 1); if (s) open(`session:${s}`); }} />}
    </section>
  );
}
