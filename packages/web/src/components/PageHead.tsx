'use client';
import { useEffect, useRef, useState } from 'react';
import type { PropDef, TypeDef } from '@/lib/graph';

// The Notion-shaped parts of a page's head (req:wf2.page.head-notion): the cover band, the big icon with its picker,
// the Tags row, and the Comments section under the properties. Each saves through the same front-matter patch the
// rest of the head uses (`save`), so a page's icon, cover and tags are keys in its markdown like everything else.

const EMOJI = ['📄', '📘', '📗', '📕', '📙', '📓', '📝', '🗂', '🗺', '🧭', '🎯', '🚀', '🧪', '🔬', '🧩', '🛠', '⚙️', '🔧', '🧱', '🏗', '🏛', '🏠', '🍽', '🍳', '🥡', '🛒', '📦', '🚚', '💳', '💰', '📈', '📊', '📅', '⏱', '🔔', '💡', '🔒', '🔑', '👤', '👥', '🤖', '🧠', '💬', '❓', '⚠️', '✅', '⭐', '❤️', '🔥', '🌊', '🌱', '🌍'];

export function IconPicker({ value, onPick, onClose }: { value: string; onPick: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return (
    <div className="icon-pick pg-menu" ref={ref} role="dialog" aria-label="Page icon">
      <div className="icon-grid">{EMOJI.map(e => <button key={e} type="button" className={e === value ? 'on' : ''} onClick={() => onPick(e)} aria-label={e}>{e}</button>)}</div>
      <form className="icon-any" onSubmit={e => { e.preventDefault(); if (text.trim()) onPick(text.trim()); }}>
        <input autoFocus value={text} placeholder="any emoji or short text" maxLength={8} onChange={e => setText(e.target.value)} />
        <button type="submit" disabled={!text.trim()}>Set</button>
        {value && <button type="button" className="linkish" onClick={() => onPick('')}>Remove</button>}
      </form>
    </div>
  );
}

// The cover: an image band above the head. `assets/<file>` (uploaded through the project's asset route) or a URL;
// hover shows Change / Remove; a page without one offers "Add cover" beside "Add icon".
export function Cover({ product, project, value, onChange }: { product: string; project: string; value: string; onChange: (v: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f: File | undefined) {
    if (!f) return; setBusy(true);
    const fd = new FormData(); fd.append('file', f, f.name);
    const r = await fetch(`/api/${product}/${project}/asset`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok && j.url) onChange(j.url);
  }
  const src = /^(https?:)?\/\//.test(value) || value.startsWith('/') ? value : `/${product}/${project}/d/${value}`;
  const tools = (
    <>
      <input ref={file} type="file" accept="image/*" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className={value ? '' : 'doc-ghost'} onClick={() => file.current?.click()} disabled={busy}>{busy ? 'Uploading…' : value ? 'Change cover' : '🖼 Add cover'}</button>
      <button type="button" className={value ? '' : 'doc-ghost'} onClick={() => { const u = prompt('Image URL or assets/<file>', value); if (u !== null) onChange(u.trim()); }}>URL…</button>
      {value && <button type="button" onClick={() => onChange('')}>Remove</button>}
    </>);
  // without a cover the tools sit in the icon row as ghosts ("Add cover" beside "Add icon"); with one, on the band
  if (!value) return <span className="doc-cover-ghosts">{tools}</span>;
  return <div className="doc-cover"><img src={src} alt="" /><div className="doc-cover-tools">{tools}</div></div>;
}

// Tags as chips. The type may narrow them (`tags: manyOf[a, b]` on the type card): then the picker offers those
// values and a new one is written to the type — "defined on the page's type" — before it goes on the page; a base
// type keeps a free list in the front matter. Values are `[a, b]` in the front matter.
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export function TagsRow({ product, type, prop, value, onChange }: { product: string; type: TypeDef | null; prop: PropDef | null; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const tags = value.replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean);
  const defined = prop?.enum ?? null;
  const isBase = !type || !type.file || type.file.startsWith('schema/');
  const write = (list: string[]) => onChange(list.length ? `[${[...new Set(list)].join(', ')}]` : '');
  async function add(raw: string) {
    const t = raw.trim().replace(/,+$/, ''); if (!t) return;
    if (defined && !defined.includes(t) && type && !isBase) {
      // extend the type's enum so the tag exists on the type (op:api.types.props)
      const own = type.props.filter(p => p.from === type.id).map(p => ({ name: p.name, required: p.required, inverse: p.inverse ?? '', type: p.name === prop!.name ? `manyOf[${[...defined, t].join(', ')}]` : specOf(p) }));
      const r = await fetch(`/api/${product}/types/${type.slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ props: own }) });
      if (!r.ok) { setMsg('could not add the tag to the type'); return; }
      setMsg(`${t} added to ${type.id}`);
    }
    write([...tags, t]); setText('');
  }
  return (
    <span className="tags-row">
      {tags.map(t => <span key={t} className="tag-chip" style={{ '--h': hue(t) } as React.CSSProperties}>{t}<button type="button" aria-label={`remove ${t}`} onClick={() => write(tags.filter(x => x !== t))}>×</button></span>)}
      <input className="tag-in" list={defined ? `wf-tags-${type?.slug}` : undefined} value={text} placeholder={tags.length ? '+ tag' : 'add a tag'} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); } if (e.key === 'Backspace' && !text && tags.length) write(tags.slice(0, -1)); }} onBlur={() => { if (text.trim()) add(text); }} />
      {defined && <datalist id={`wf-tags-${type?.slug}`}>{defined.filter(d => !tags.includes(d)).map(d => <option key={d} value={d} />)}</datalist>}
      {msg && <span className="muted small">{msg}</span>}
    </span>
  );
}
const specOf = (p: PropDef) => p.ref ? (p.many ? `list of ${p.ref}` : `ref ${p.ref}`) + (p.required ? '' : '?') : p.enum ? (p.many ? `manyOf[${p.enum.join(', ')}]` : `enum [${p.enum.join(', ')}]`) + (p.required ? '' : '?') : p.type + (p.required ? '' : '?');

// Comments on the page's node: the ones in the project's Comments document (`on:` this page), oldest first, and a
// box to add one — the same path as a comment from a block's menu (op:api.comments).
type Comment = { id: string; text: string; by: string; date: string };
export function PageComments({ product, node }: { product: string; node: string }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState('');
  const load = async () => { const r = await fetch(`/api/${product}/comments?on=${encodeURIComponent(node)}`, { cache: 'no-store' }); const j = await r.json().catch(() => ({})); setList(j.comments ?? []); };
  useEffect(() => { void load(); try { setMe(localStorage.getItem('wf-me') ?? ''); } catch { /* ignore */ } }, [product, node]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send() {
    if (!text.trim()) return; setBusy(true);
    const r = await fetch(`/api/${product}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: node, text: text.trim(), by: me || undefined }) });
    setBusy(false); if (r.ok) { setText(''); await load(); }
  }
  async function remove(id: string) { await fetch(`/api/${product}/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); }
  return (
    <section className="page-comments">
      <h3>Comments{list && list.length ? <small> {list.length}</small> : null}</h3>
      {list && list.length > 0 && <ul>{list.map(c => <li key={c.id}><span className="avatar">{(c.by || '?').slice(0, 1).toUpperCase()}</span><div><div className="meta"><b>{c.by || 'someone'}</b>{c.date && <span className="muted"> · {c.date}</span>}<button className="linkish" onClick={() => remove(c.id)} aria-label="delete comment">×</button></div><div className="text">{c.text}</div></div></li>)}</ul>}
      <div className="comment-add">
        <span className="avatar">{(me || '?').slice(0, 1).toUpperCase()}</span>
        <input value={text} placeholder="Add a comment…" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={busy} />
        {text.trim() && <button className="pri" onClick={send} disabled={busy}>Comment</button>}
      </div>
    </section>
  );
}
