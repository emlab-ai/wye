'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import type { InboxItem } from '@/lib/inbox';

type Suggestion = { doc: string | null; project: string | null; kind: string; id: string; similar: { id: string; score: number; p?: number }[] };
type Docs = { file: string; slug: string; title: string; project: string }[];

// Inbox items to review: each one can be filed into a document as a node (with a suggested document and id) or
// dismissed. Filed and dismissed items stay for the record.
// `quiet`: the page already shows the Inbox's empty state, so no second "nothing" line under the form
export function InboxList({ product, initial, quiet }: { product: string; initial: InboxItem[]; quiet?: boolean }) {
  const router = useRouter(); const { open } = usePeek();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<'new' | 'all'>('new');
  const [openName, setOpenName] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ suggestion: Suggestion; docs: Docs } | null>(null);
  const [target, setTarget] = useState<{ project: string; doc: string; id: string }>({ project: '', doc: '', id: '' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setItems(initial); }, [initial]);
  useEffect(() => {
    if (!openName) { setDetail(null); return; }
    let live = true; setDetail(null); setMsg(null);
    fetch(`/api/${product}/inbox/${encodeURIComponent(openName)}`).then(r => r.json()).then(j => { if (!live) return; setDetail({ suggestion: j.suggestion, docs: j.docs }); setTarget({ project: j.suggestion.project ?? j.docs[0]?.project ?? '', doc: j.suggestion.doc ?? j.docs[0]?.slug ?? '', id: j.suggestion.id }); });
    return () => { live = false; };
  }, [openName, product]);
  // `stay`: the item stays open (a raw item after Digest / Impact again) and shows what came back
  const act = async (name: string, body: object, stay = false) => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/inbox/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    if (stay) { setItems(xs => xs.map(x => x.name === name ? { ...x, ...(j.impact ? { impact: j.impact } : {}), ...(j.session ? { session: j.session } : {}) } : x)); setMsg(j.session ? `digesting in session ${String(j.session).slice(0, 6)}` : 'impact judged'); router.refresh(); return; }
    setOpenName(null); router.refresh();
    if (j.id) open(j.id);
  };
  const impactSummary = (cs: NonNullable<InboxItem['impact']>['candidates']) => { const n: Record<string, number> = {}; for (const c of cs) n[c.verdict] = (n[c.verdict] ?? 0) + 1; return Object.entries(n).map(([v, k]) => `${k} ${v}`).join(' · '); };
  const shown = items.filter(i => filter === 'all' || i.status === 'new');
  const counts = { new: items.filter(i => i.status === 'new').length, all: items.length };
  return (
    <div className="inbox">
      {!(quiet && !items.length) && <div className="track-tools"><div className="chips">
        <button className={`chip ${filter === 'new' ? 'on' : ''}`} onClick={() => setFilter('new')}>To review <small>{counts.new}</small></button>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All <small>{counts.all}</small></button>
      </div></div>}
      {!shown.length && !(quiet && !items.length) && <p className="muted">Nothing here. Agents keep a person&apos;s words here with <code>wye remember</code> (raw input, digested at once) and drop notes with <code>wye inbox add</code>; people use the form above.</p>}
      <ul className="inbox-items">
        {shown.map(i => (
          <li key={i.name} className={`inbox-item ${i.status} ${openName === i.name ? 'open' : ''}`}>
            <div className="inbox-head" onClick={() => setOpenName(openName === i.name ? null : i.name)}>
              {i.raw ? <span className="pill k raw" title="the person's words as they were said — not a block to approve; the digest files what they mean">raw</span> : <span className={`pill k`} style={{ background: `var(--k-${i.type === 'requirement' ? 'req' : i.type}, var(--k-other))` }}>{i.type}</span>}
              <span className="inbox-title">{i.title}</span>
              {i.raw && i.impact && i.impact.candidates.length > 0 && <span className="inbox-impact-count" title="what this input touches in what is known">{impactSummary(i.impact.candidates)}</span>}
              {i.status !== 'new' && <span className={`pill s ${i.status}`}>{i.status}</span>}
              <span className="muted inbox-meta">{i.from}{i.session ? ` · session ${i.session.slice(0, 6)}` : ''} · {i.added.slice(0, 16).replace('T', ' ')}</span>
            </div>
            {openName === i.name && (
              <div className="inbox-detail">
                {i.body && <p className="inbox-body">{i.body}</p>}
                {Object.entries(i.fields).map(([k, v]) => <p key={k} className="inbox-field"><b>{k}</b> {v}</p>)}
                {i.refs.length > 0 && <div className="tags">{i.refs.map(r => <SmartTag key={r} id={r} />)}</div>}
                {i.status === 'filed' && i.node && <p className="muted">filed as <SmartTag id={i.node} /> in {i.filedTo}</p>}
                {i.raw && (
                  // raw input: never filed as a block — what it touches (the impact judged on arrival) and the digest that files what it means
                  <div className="inbox-file inbox-raw">
                    {i.impact ? (i.impact.candidates.length ? <ul className="inbox-impact">{i.impact.candidates.map(c => <li key={c.id}><span className={`pill s impact-${c.verdict}`}>{c.verdict}</span> <SmartTag id={c.id} /> <span className="muted">{c.question ?? c.reason}</span></li>)}</ul>
                      : <p className="muted">no impact on what is known — nothing among the {i.impact.judged} closest block{i.impact.judged === 1 ? '' : 's'} needs an update, is contradicted or asks a question.</p>)
                      : <p className="muted">impact not judged yet.</p>}
                    {i.status === 'new' && <div className="sec-actions">
                      <button className="pri" disabled={busy} onClick={() => act(i.name, { action: 'digest' }, true)} title="judge the impact again and start a new Remember session that files what the input means">{i.session ? 'Digest again' : 'Digest'}</button>
                      <button disabled={busy} onClick={() => act(i.name, { action: 'impact' }, true)} title="judge again what this input touches in what is known">Impact again</button>
                      {i.session && <a className="btn" href={`/${product}/sessions/${i.session}`}>session {i.session.slice(0, 6)}</a>}
                      <button disabled={busy} onClick={() => act(i.name, { action: 'dismiss' })}>Dismiss</button>
                      {msg && <span className="notice">{msg}</span>}
                    </div>}
                  </div>
                )}
                {!i.raw && i.status === 'new' && (detail ? (
                  <div className="inbox-file">
                    {detail.suggestion.similar.length > 0 && <p className="muted inbox-similar">closest existing knowledge: {detail.suggestion.similar.map(s => <span key={s.id} className="inbox-similar-one"><SmartTag id={s.id} /> <small title={s.p !== undefined ? `Jev ${Math.round(s.p * 100)}% · search ${Math.round(s.score * 100)}%` : 'search'}>{Math.round((s.p ?? s.score) * 100)}%</small></span>)} — if one of these already says it, dismiss or refine that node instead.</p>}
                    <div className="form">
                      <label><span>document</span><select value={`${target.project}/${target.doc}`} onChange={e => { const [project, doc] = e.target.value.split('/'); setTarget(t => ({ ...t, project, doc })); }}>{detail.docs.map(d => <option key={d.file} value={`${d.project}/${d.slug}`}>{d.project} / {d.title}</option>)}</select></label>
                      <label><span>node id</span><input value={target.id} onChange={e => setTarget(t => ({ ...t, id: e.target.value }))} spellCheck={false} /></label>
                    </div>
                    <div className="sec-actions"><button className="pri" disabled={busy} onClick={() => act(i.name, { action: 'file', ...target })}>File as node</button><button disabled={busy} onClick={() => act(i.name, { action: 'task', project: target.project })} title="A task line on the backlog — the Work view's Unassigned group">As a task</button><button disabled={busy} onClick={() => act(i.name, { action: 'dismiss' })}>Dismiss</button>{msg && <span className="notice">{msg}</span>}</div>
                  </div>
                ) : <p className="muted">looking for where it belongs…</p>)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
