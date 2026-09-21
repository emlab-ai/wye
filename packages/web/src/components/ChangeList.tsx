'use client';
import { useEffect, useState } from 'react';
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
  const { open: openNode } = usePeek(); const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const act = async (c: ChangeView, action: 'accept' | 'revert', force = false) => {
    setBusy(c.id); setMsg(m => ({ ...m, [c.id]: '' }));
    const r = await fetch(`/api/${product}/changes/${c.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, by: me || undefined, force }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setMsg(m => ({ ...m, [c.id]: `${j.message ?? j.error}${j.before ? ` — old value: ${j.before.text}` : ''}` })); return; }
    router.refresh();
  };
  // the way out of a long list: accept every record shown, or only the person's own (and the migrations') edits —
  // an agent's stay for a look
  const mine = changes.filter(c => c.by === 'person' || c.by === 'migration' || c.by === me);
  const acceptAll = async (which: 'all' | 'mine') => {
    const ids = (which === 'mine' ? mine : changes).map(c => c.id);
    if (!ids.length || !window.confirm(`Accept ${ids.length} change${ids.length === 1 ? '' : 's'}${which === 'mine' ? ' of your own' : ''}? Nothing moves in the documents; the records are marked accepted.`)) return;
    setBusy('all');
    await fetch(`/api/${product}/changes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'accept-all', ids, by: me || undefined }) });
    setBusy(null); router.refresh();
  };
  // Revert all: each record through its own route, the stale ones (the node moved on since) left alone — what
  // stayed is said in the notice. Nothing is forced from here.
  const [note, setNote] = useState('');
  const revertAll = async () => {
    const live = changes.filter(c => c.exists && !c.stale);
    if (!live.length || !window.confirm(`Revert ${live.length} change${live.length === 1 ? '' : 's'}? The old value of each block is written back into its document${changes.length > live.length ? `; ${changes.length - live.length} whose node changed since (or is gone) stay for a look` : ''}.`)) return;
    setBusy('all'); let done = 0, failed = 0;
    for (const c of live) { const r = await fetch(`/api/${product}/changes/${c.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'revert', by: me || undefined }) }); if (r.ok) done++; else failed++; }
    setBusy(null); setNote(`${done} reverted${failed ? `, ${failed} refused` : ''}${changes.length > live.length ? `, ${changes.length - live.length} left (changed since)` : ''}`); router.refresh();
  };
  // the section folds to its head, and every card to its own; both remembered per browser (a long list opens folded)
  const [open, setOpen] = useState<boolean | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [allFolded, setAllFolded] = useState<boolean | null>(null);
  useEffect(() => { try { const v = localStorage.getItem('wf-changes-open'); setOpen(v === null ? changes.length <= 20 : v === '1'); const f = localStorage.getItem('wf-changes-folded'); setAllFolded(f === null ? changes.length > 20 : f === '1'); } catch { setOpen(true); setAllFolded(false); } }, [changes.length]);
  const toggleOpen = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-changes-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const foldAll = (v: boolean) => { setAllFolded(v); setFolded(new Set()); try { localStorage.setItem('wf-changes-folded', v ? '1' : '0'); } catch { /* ignore */ } };
  const isFolded = (id: string) => folded.has(id) ? !allFolded : !!allFolded;
  const toggleFold = (id: string) => setFolded(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!changes.length) return null;
  return (
    <section className={`changes ${open === false ? 'closed' : ''}`}>
      <h3 className="review-group-head"><button className="linkish fold-toggle" onClick={toggleOpen} aria-expanded={open !== false}>{open === false ? '▸' : '▾'}</button> Changes <span className="muted">{changes.length} edit{changes.length === 1 ? '' : 's'} of existing blocks</span>
        <span className="review-group-acts">
          {open !== false && <button className="mini" onClick={() => foldAll(!allFolded)} title="fold every card to its head, or open them all">{allFolded ? 'Expand all' : 'Collapse all'}</button>}
          {mine.length > 0 && mine.length < changes.length && <button className="mini" disabled={busy === 'all'} onClick={() => acceptAll('mine')}>Accept mine ({mine.length})</button>}
          <button className="mini" disabled={busy === 'all'} onClick={() => acceptAll('all')}>Accept all ({changes.length})</button>
          <button className="mini danger" disabled={busy === 'all'} onClick={revertAll} title="write the old value of every change back — the ones whose node changed since stay">Revert all</button>
          {note && <span className="muted">{note}</span>}
        </span></h3>
      {open !== false && <ul className="change-items">
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
            <li key={c.id} className={`change-item ${c.stale ? 'stale' : ''} ${isFolded(c.id) ? 'folded' : ''}`}>
              <div className={`review-head ${clipped ? 'long' : ''}`} onClick={() => openNode(c.node)}>
                <button className="linkish fold-toggle" onClick={e => { e.stopPropagation(); toggleFold(c.id); }} aria-expanded={!isFolded(c.id)} title={isFolded(c.id) ? 'expand' : 'collapse'}>{isFolded(c.id) ? '▸' : '▾'}</button>
                <KindPill kind={c.kind} />
                {!clipped && <span className="review-title">{title}</span>}
                {clipped && <span className="review-title"><DiffText a={c.before.text} b={c.after.text} /></span>}
                {c.stale && <span className="pill s at-risk" title="the node was edited again after this record — look again before you accept">changed since</span>}
                {!c.exists && <span className="pill s blocked">node gone</span>}
              </div>
              {isFolded(c.id) && <div className="change-fold muted">{c.changed.join(', ')} · {c.by} · {when(c.updatedAt)}<span className="sec-actions review-acts inline"><button className="pri mini" disabled={busy === c.id || blocked} onClick={e => { e.stopPropagation(); act(c, 'accept'); }}>Accept</button></span></div>}
              {!isFolded(c.id) && <>
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
                <button className="linkish" onClick={() => openNode(c.node)}>open</button>
                {msg[c.id] && <span className="notice bad">{msg[c.id]}</span>}
              </div>
              </>}
            </li>
          );
        })}
      </ul>}
    </section>
  );
}
