'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePeek } from './PeekProvider';

// A node's comments in the context column (req:ontology.comment-home): every surface that opens a node here — its card,
// its row in a table, a column entry, its page — shows the comments made on it, oldest first, and a box to add one.
// A comment is a row of the project's Comments document with `on:` the node (decision:ontology.comment-is-a-ref);
// the list is the inverse edge, refetched on every graph change.
type Comment = { id: string; text: string; by: string; date: string };
export function Comments({ id }: { id: string }) {
  const { product } = usePeek();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [went, setWent] = useState<{ href: string; title: string; created: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<{ kinds: string[] }>).detail.kinds.includes('graph')) setVersion(v => v + 1); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, []);
  useEffect(() => {
    let live = true;
    fetch(`/api/${product}/comments?on=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then(j => { if (live) setList(j?.comments ?? []); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [id, product, version]);
  // a comment goes when its × is pressed: the row leaves the Comments document (op:api.comments)
  const remove = async (cid: string) => {
    const r = await fetch(`/api/${product}/comments?id=${encodeURIComponent(cid)}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.message ?? 'could not delete the comment'); return; }
    setList(cur => (cur ?? []).filter(c => c.id !== cid));
  };
  const submit = async () => {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setErr('');
    const r = await fetch(`/api/${product}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: id, text: t }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.message ?? 'could not write the comment'); return; }
    setText('');
    setList(cur => [...(cur ?? []), { id: j.id, text: t, by: 'person', date: new Date().toISOString().slice(0, 10) }]);
    if (j.doc) setWent({ href: `/${product}/${j.doc.project}/d/${j.doc.doc}#n-${encodeURIComponent(j.id)}`, title: j.doc.title, created: !!j.created });
  };
  return (
    <section className="comments">
      <h4>Comments{list && list.length > 0 && <span className="muted">{list.length}</span>}</h4>
      {list && list.length > 0 && (
        <ul className="comment-list">
          {list.map(c => <li key={c.id}><div className="comment-meta"><b>{c.by}</b> <span className="muted">{c.date}</span><button className="comment-del" title="Delete this comment" aria-label="delete comment" onClick={() => remove(c.id)}>×</button></div><div className="comment-text">{c.text}</div></li>)}
        </ul>
      )}
      <form className="comment-box" onSubmit={e => { e.preventDefault(); submit(); }}>
        <textarea rows={2} placeholder="Comment on this…" value={text} disabled={busy} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }} />
        {(text.trim() || err || went) && <div className="comment-actions">
          {text.trim() && <button type="submit" disabled={busy}>Comment</button>}
          {err && <span className="bad">{err}</span>}
          {went && !text.trim() && <span className="muted">in <Link href={went.href}>{went.title}</Link>{went.created ? ' — new, every comment of this project goes there' : ''}</span>}
        </div>}
      </form>
    </section>
  );
}
