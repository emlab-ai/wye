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
import { ImpactCard } from './ImpactCard';

export type ChangeView = Omit<ChangeRecord, 'impact'> & { stale: boolean; exists: boolean; verdicts?: ItemVerdict[]; impact?: ImpactSet };
const FRAME = ['part-of', 'refines', 'satisfied-by', 'governs', 'affects', 'scope', 'when', 'then', 'unless'];

export function DiffText({ a, b }: { a: string; b: string }) {
  return <span className="cdiff">{wordDiff(a, b).map((r, i) => r.kind === 'same' ? <span key={i}>{r.text}</span> : r.kind === 'del' ? <del key={i}>{r.text}</del> : <ins key={i}>{r.text}</ins>)}</span>;
}

// Changes in the Inbox (component:change-card, req:exec.change-kept, req:exec.change-review): a pending edit of a
// typed node with the old and new value side by side — property by property, word by word in a text — the fields
// that frame it, the write-time verdicts on the new value, the impact set (E.3), and Accept / Revert. A record whose
// node moved on since says so and asks for a fresh look before Accept.
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
      <h3 className="review-group-head">Changes <span className="muted">{changes.length} edit{changes.length === 1 ? '' : 's'} of existing blocks, old and new side by side</span></h3>
      <ul className="change-items">
        {changes.map(c => {
          const blocked = (c.verdicts ?? []).some(v => (v.kind === 'contradicts' || v.kind === 'duplicate') && v.open);
          return (
            <li key={c.id} className={`change-item ${c.stale ? 'stale' : ''}`}>
              <div className="review-head" onClick={() => open(c.node)}>
                <KindPill kind={c.kind} />
                <span className="review-title"><SmartTag id={c.node} /> <span className="muted">{c.after.title !== c.node ? c.after.title : ''}</span></span>
                <span className="muted review-where">{c.by} · {new Date(c.updatedAt).toLocaleString()} · {c.changed.join(', ')}</span>
                {c.stale && <span className="pill s at-risk" title="the node was edited again after this record — look again before you accept">changed since</span>}
                {!c.exists && <span className="pill s blocked">node gone</span>}
              </div>
              <dl className="change-diff">
                {c.changed.map(k => (
                  <div key={k} className="change-row">
                    <dt>{k === 'text' ? c.after.textKey : k}</dt>
                    <dd>{k === 'text' ? <DiffText a={c.before.text} b={c.after.text} /> : k === 'status' ? <><StatusPill status={c.before.status || '—'} /> → <StatusPill status={c.after.status || '—'} /></> : <DiffText a={c.before.props[k] ?? ''} b={c.after.props[k] ?? ''} />}</dd>
                  </div>
                ))}
                <div className="change-row frame"><dt>unchanged</dt><dd className="muted">{[`status ${c.after.status || '—'}`, ...FRAME.filter(k => !c.changed.includes(k) && c.after.props[k]).map(k => `${k}: ${c.after.props[k].slice(0, 80)}`)].join(' · ')}</dd></div>
              </dl>
              {(c.verdicts ?? []).length > 0 && <ul className="change-verdicts">{c.verdicts!.map((v, i) => <li key={i} className={`verdict ${v.kind}`}><b>{v.kind}</b> <SmartTag id={v.other} /> <span className="muted">{v.reason}</span>{v.open && <span className="pill s question">open</span>}</li>)}</ul>}
              <ImpactCard product={product} changeId={c.id} impact={c.impact} me={me} />
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
