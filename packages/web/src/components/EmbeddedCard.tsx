'use client';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { NodeCard, contentBlocks, type CardP, type CardHost } from './NodeCards';
import { EditorScope } from './EditorScope';
import { cardFromNode, cardText, cardPatchToNodePatch, type ApiNode } from '@/lib/embed';
import { setBodyField } from '@/lib/yaml-form';
import { requestSend } from './CommandBox';
import type { NodePatch } from '@/lib/node-edit';

// the card's text becomes the block editor on a click (req:wf2.editor.embed-text-is-editor): the same scoped DocEditor
// the column uses — the node's text its first block, its content after — so the selection menu, @ tags, links and
// slash blocks work in a card exactly as on a page. Loaded lazily: DocEditor imports the embed block, which imports
// this file.
const ScopedEditor = dynamic(() => import('./DocEditor'), { ssr: false, loading: () => <div className="embed-text muted">…</div> });

// An embedded node (component:embed-block, decision:wf2.embed-renders-source-card): the node's card rendered with
// the same components its source page uses, editable in place. There is one store — the node's defining line or
// yaml card in its source document — so every field change goes through op:node.edit (700 ms after the last
// keystroke, patches merged), the watcher rebuilds the graph, and every embed refetches on the graph change event.
// The slug is read-only: renaming a node happens on its source page.
export function EmbeddedCard({ id, badge, className, inEditor }: { id: string; badge?: React.ReactNode; className?: string; inEditor?: boolean }) {
  const { product, index, hrefFor, open, select: selectRoot } = usePeek();
  // in a content editor (the column) a click opens the node one level deeper; on a page it selects (rule:block-select)
  const scope = useContext(EditorScope);
  const select = scope ? open : selectRoot;
  const [p, setP] = useState<CardP | null>(null);
  // the node's content (req:wf2.ui.card-preview): only its block count shows, as the chip that opens the node
  const [content, setContent] = useState('');
  // the text slot keeps its own draft: the body's parsed value is trimmed, which would eat a space just typed
  const [text, setText] = useState('');
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const pending = useRef<NodePatch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<{ kinds: string[] }>).detail.kinds.includes('graph')) setVersion(v => v + 1); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, []);
  const known = index[id]?.defined === true; // the index refreshes with the graph; an unknown or stub id is not fetched
  useEffect(() => {
    if (!known) { setMissing(true); return; }
    let live = true;
    fetch(`/api/${product}/node/${encodeURIComponent(id)}`).then(async r => {
      if (!live) return;
      if (!r.ok) { setMissing(true); return; }
      const j = await r.json() as { node: ApiNode & { defined?: boolean }; content?: string | null };
      if (!live) return;
      if (!j.node?.defined) { setMissing(true); return; }
      setContent(j.content ?? '');
      // a refresh while an edit is on its way would clobber what is being typed: the next graph event brings it
      if (pending.current || timer.current) return;
      const card = cardFromNode(j.node);
      setMissing(false); setP(card); setText(cardText(card));
    }).catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [product, id, version, known]);
  const flush = useCallback(async () => {
    timer.current = null;
    const patch = pending.current; pending.current = null;
    if (!patch || !Object.keys(patch).length) return;
    setState('saving');
    const r = await fetch(`/api/${product}/node/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    setState(r.ok ? 'idle' : 'error');
    if (r.ok && !pending.current) setVersion(v => v + 1);
  }, [product, id]);
  const set = (patch: Partial<CardP>) => {
    if (!p) return;
    const np = cardPatchToNodePatch(p, patch);
    setP({ ...p, ...patch, slug: p.slug });
    if (!Object.keys(np).length) return;
    const cur = pending.current ?? {};
    pending.current = { ...cur, ...np, props: np.props || cur.props ? { ...(cur.props ?? {}), ...(np.props ?? {}) } : undefined };
    if (!pending.current.props) delete pending.current.props;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  // the editor mounts on the first click into the text, with the node's text and content from the content route
  const [editing, setEditing] = useState<'loading' | { project: string; doc: string; body: string; hash: string } | null>(null);
  useEffect(() => { setEditing(null); }, [id]);
  const activate = async () => {
    if (editing) return; setEditing('loading');
    const r = await fetch(`/api/${product}/node/${encodeURIComponent(id)}/content`); const j = r.ok ? await r.json() as { text: string; content: string; bodyHash: string; project: string; doc: string } : null;
    if (!j) { setEditing(null); return; }
    const body = j.text.trim() ? j.text.trim() + (j.content.trim() ? '\n\n' + j.content : '\n') : j.content;
    setEditing({ project: j.project, doc: j.doc, body, hash: j.bodyHash });
  };
  const e = index[id];
  const from = e?.file ? e.file.split('/').pop()?.replace(/\.md$/, '') : '';
  if (missing || !p && e && !e.defined) return <div className={`embed embed-stub ${className ?? ''}`} contentEditable={false}>{badge}<SmartTag id={id} /><span className="muted small">not defined — referenced only</span></div>;
  if (!p) return <div className={`embed ${className ?? ''}`} contentEditable={false}>{badge}<SmartTag id={id} /><span className="muted small">loading…</span></div>;
  const host: CardHost = {
    text: cls => editing
      ? <div className={`${cls} embed-editor`} onClick={e => e.stopPropagation()} onFocus={e => e.stopPropagation()} onBlur={e => e.stopPropagation()}>
          {editing === 'loading' ? <div className="embed-text muted">…</div> : <ScopedEditor product={product} project={editing.project} slug={editing.doc} body={editing.body} ifMatch={editing.hash} scope={id} autoFocus />}
        </div>
      : <textarea className={`${cls} embed-text`} value={text} rows={1} spellCheck={false} readOnly onMouseDown={e => { e.preventDefault(); void activate(); }} onFocus={() => void activate()} onChange={ev => { setText(ev.target.value); set({ body: setBodyField(p.body, p.textKey, ev.target.value) }); }} />,
    // in a document the pill selects like the rest of the card (rule:block-select, the .embed click below); in the column it pushes
    peek: () => inEditor ? select(id) : open(id),
    copyLink: async () => { const url = `${location.origin}${hrefFor(id) ?? ''}`; try { await navigator.clipboard.writeText(url); } catch { /* clipboard unavailable */ } },
    send: () => requestSend({ text, refs: [id], source: { link: `${location.origin}${hrefFor(id) ?? ''}` } }),
    hostRef, slugReadOnly: true, extraClass: 'embedded',
    fold: content ? { count: contentBlocks(content).length, folded: true, open: () => select(id) } : undefined,
    // an embedded question shows how many blocks its answer has and opens the node for them (decision:wf2.answer-is-content)
    answer: p.kind === 'question' ? { count: content ? contentBlocks(content).length : 0, open: () => inEditor ? select(id) : open(id) } : undefined,
  };
  return (
    <div className={`embed ${className ?? ''} ${state}`} contentEditable={false} ref={inEditor ? stop : undefined} onClick={inEditor ? e => { if (!(e.target as Element).closest('a')) select(id); } : undefined}>
      <div className="embed-from muted small">{badge}<span>from </span>{hrefFor(id) ? <Link href={hrefFor(id)!}>{from}</Link> : <span>{from}</span>}{state === 'saving' && <span> · saving…</span>}{state === 'error' && <span className="bad"> · save failed</span>}</div>
      <NodeCard p={p} set={set} host={host} />
    </div>
  );
}

// ProseMirror listens natively on the editor root; stop mouse-down and keys at the embed so its inputs behave
// normally (the same rule as the table header and the view block).
function stop(el: HTMLElement | null) {
  if (!el || (el as unknown as { __stopped?: boolean }).__stopped) return;
  (el as unknown as { __stopped?: boolean }).__stopped = true;
  for (const ev of ['mousedown', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
}

// The picker a fresh embed shows (the /ref slash item inserts an embed with no id): search by id or title.
export function EmbedPicker({ onPick }: { onPick: (id: string) => void }) {
  const { index } = usePeek();
  const [q, setQ] = useState('');
  const hits = useMemo(() => { const n = q.trim().toLowerCase(); if (!n) return []; return Object.values(index).filter(e => e.defined && (e.id.toLowerCase().includes(n) || e.title.toLowerCase().includes(n))).slice(0, 8); }, [q, index]);
  return (
    <div className="embed embed-picker" contentEditable={false} ref={stop}>
      <div className="embed-from muted small">embed a node</div>
      {/* keydown and mousedown are stopped before React's root sees them (stop): key-up and click carry the choice */}
      <input autoFocus className="embed-search" value={q} placeholder="search a node by id or title…" onChange={e => setQ(e.target.value)} onKeyUp={e => { if (e.key === 'Enter' && hits[0]) onPick(hits[0].id); }} />
      {hits.length > 0 && <ul className="embed-hits">{hits.map(h => <li key={h.id}><button type="button" onClick={() => onPick(h.id)}><span className={`tag k-${h.kind}`}><i />{h.id}</span><small>{h.title}</small></button></li>)}</ul>}
    </div>
  );
}
