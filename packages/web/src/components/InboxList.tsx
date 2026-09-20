'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import type { InboxItem } from '@/lib/inbox';

type Suggestion = { doc: string | null; project: string | null; kind: string; id: string; similar: { id: string; score: number }[] };
type Docs = { file: string; slug: string; title: string; project: string }[];

// Inbox items to review: each one can be filed into a document as a node (with a suggested document and id) or
// dismissed. Filed and dismissed items stay for the record.
export function InboxList({ product, initial }: { product: string; initial: InboxItem[] }) {
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
  const act = async (name: string, body: object) => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/inbox/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setOpenName(null); router.refresh();
    if (j.id) open(j.id);
  };
  const shown = items.filter(i => filter === 'all' || i.status === 'new');
  const counts = { new: items.filter(i => i.status === 'new').length, all: items.length };
  return (
    <div className="inbox">
      <div className="track-tools"><div className="chips">
        <button className={`chip ${filter === 'new' ? 'on' : ''}`} onClick={() => setFilter('new')}>To review <small>{counts.new}</small></button>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All <small>{counts.all}</small></button>
      </div></div>
      {!shown.length && <p className="muted">Nothing to review. Agents drop decisions, requirements and questions here with <code>wye inbox add</code>; people with the form above.</p>}
      <ul className="inbox-items">
        {shown.map(i => (
          <li key={i.name} className={`inbox-item ${i.status} ${openName === i.name ? 'open' : ''}`}>
            <div className="inbox-head" onClick={() => setOpenName(openName === i.name ? null : i.name)}>
              <span className={`pill k`} style={{ background: `var(--k-${i.type === 'requirement' ? 'req' : i.type}, var(--k-other))` }}>{i.type}</span>
              <span className="inbox-title">{i.title}</span>
              {i.status !== 'new' && <span className={`pill s ${i.status}`}>{i.status}</span>}
              <span className="muted inbox-meta">{i.from}{i.session ? ` · session ${i.session.slice(0, 6)}` : ''} · {i.added.slice(0, 16).replace('T', ' ')}</span>
            </div>
            {openName === i.name && (
              <div className="inbox-detail">
                {i.body && <p className="inbox-body">{i.body}</p>}
                {Object.entries(i.fields).map(([k, v]) => <p key={k} className="inbox-field"><b>{k}</b> {v}</p>)}
                {i.refs.length > 0 && <div className="tags">{i.refs.map(r => <SmartTag key={r} id={r} />)}</div>}
                {i.status === 'filed' && i.node && <p className="muted">filed as <SmartTag id={i.node} /> in {i.filedTo}</p>}
                {i.status === 'new' && (detail ? (
                  <div className="inbox-file form">
                    {detail.suggestion.similar.length > 0 && <p className="muted inbox-similar">closest existing knowledge: {detail.suggestion.similar.map(s => <span key={s.id}><SmartTag id={s.id} /> <small>{Math.round(s.score * 100)}%</small> </span>)}— if one of these already says it, dismiss or refine that node instead.</p>}
                    <label><span>document</span><select value={`${target.project}/${target.doc}`} onChange={e => { const [project, doc] = e.target.value.split('/'); setTarget(t => ({ ...t, project, doc })); }}>{detail.docs.map(d => <option key={d.file} value={`${d.project}/${d.slug}`}>{d.project} / {d.title}</option>)}</select></label>
                    <label><span>node id</span><input value={target.id} onChange={e => setTarget(t => ({ ...t, id: e.target.value }))} spellCheck={false} /></label>
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
