'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePeek } from './PeekProvider';
import { kindOf } from '@/lib/ids';
import { parseBody } from '@/lib/graph';
import { useRouter } from 'next/navigation';

// A hover on a tag shows the node's card (req:wf2.ui.tag-hover): kind, title, status, its text and the properties
// that say something — fetched once per node and kept; the card can be entered (a link in it, "open ›") and goes
// when the pointer leaves both. Cmd-click opens the document; a click opens the node in the column.
type Hover = { id: string; kind: string; title: string; status: string; text: string; props: [string, string][]; doc?: string };
const cache = new Map<string, Promise<Hover | null>>();
const TEXT_KEYS = ['text', 'statement', 'purpose', 'q', 'description', 'reason', 'choice', 'scenario'];
const SKIP = new Set(['id', 'title', 'status', 'session', 'produced', 'evidence', 'last-verified', 'owner', 'by', 'date', 'since', 'part-of']);
function loadHover(product: string, id: string): Promise<Hover | null> {
  if (!cache.has(id)) cache.set(id, fetch(`/api/${product}/node/${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then(j => {
    if (!j?.node) return null; const n = j.node; const rows = parseBody(n.body ?? '');
    const text = rows.find(r => TEXT_KEYS.includes(r.key))?.value ?? '';
    const props = rows.filter(r => !TEXT_KEYS.includes(r.key) && !SKIP.has(r.key) && r.value.trim()).slice(0, 6).map(r => [r.key, r.value.length > 160 ? r.value.slice(0, 157) + '…' : r.value] as [string, string]);
    // a prose node's title is its clipped first sentence: when the text begins with it, the text alone is shown
    const norm = (x: string) => x.replace(/\s+/g, ' ').replace(/[…. ]+$/, '').trim();
    const dup = !!text && norm(text).startsWith(norm(n.title).slice(0, 60));
    return { id, kind: n.kind, title: dup ? '' : n.title, status: n.status, text, props };
  }).catch(() => null));
  return cache.get(id)!;
}
if (typeof window !== 'undefined') window.addEventListener('wf:change', e => { if ((e as CustomEvent<{ kinds: string[] }>).detail.kinds.includes('graph')) cache.clear(); });

function TagHover({ id, anchor, onEnter, onLeave }: { id: string; anchor: DOMRect; onEnter: () => void; onLeave: () => void }) {
  const { product, index, open } = usePeek();
  const [h, setH] = useState<Hover | null | undefined>(undefined);
  useEffect(() => { let live = true; loadHover(product, id).then(v => { if (live) setH(v); }); return () => { live = false; }; }, [product, id]);
  const e = index[id];
  const w = Math.min(440, (typeof window !== 'undefined' ? window.innerWidth : 800) - 24);
  const left = Math.max(12, Math.min(anchor.left, (typeof window !== 'undefined' ? window.innerWidth : 800) - w - 12));
  const below = anchor.bottom + 6; const flip = typeof window !== 'undefined' && below > window.innerHeight - 220;
  const style: React.CSSProperties = { position: 'fixed', left, width: w, zIndex: 70, ...(flip ? { bottom: window.innerHeight - anchor.top + 6 } : { top: below }) };
  const kind = h?.kind ?? kindOf(id);
  return createPortal(
    <div className="tag-hover" style={style} onMouseEnter={onEnter} onMouseLeave={onLeave} role="tooltip">
      <div className="tag-hover-head"><span className="pill k" style={{ background: `var(--k-${kind}, var(--k-other))` }}>{kind}</span>{(h === undefined ? e?.title : h?.title) ? <b>{h === undefined ? e?.title : h?.title}</b> : null}{(h?.status ?? e?.status) && <span className={`pill s s-${h?.status ?? e?.status}`}>{h?.status ?? e?.status}</span>}<button className="linkish" onClick={() => open(id)} title="open in the column">open ›</button></div>
      <div className="tag-hover-id muted">{id}{e && !e.defined ? ' · referenced only' : ''}</div>
      {h === undefined && <div className="muted">…</div>}
      {h?.text && <div className="tag-hover-text">{h.text}</div>}
      {h && h.props.length > 0 && <dl className="tag-hover-props">{h.props.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    </div>, document.body);
}

export function SmartTag({ id, label }: { id: string; label?: string }) {
  const { index, open, hrefFor } = usePeek();
  const router = useRouter();
  const e = index[id]; const kind = kindOf(id);
  const text = label ?? (kind === 'req' ? id.slice(4) : id);
  const ref = useRef<HTMLAnchorElement>(null);
  const [hover, setHover] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inCard = useRef(false);
  const show = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { if (ref.current) setHover(ref.current.getBoundingClientRect()); }, 350); };
  const hide = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { if (!inCard.current) setHover(null); }, 180); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <>
      <a ref={ref} href={`#tag:${id}`} className={`tag k-${kind} ${e && !e.defined ? 'stub' : ''} ${e?.status ? 's-' + e.status : ''}`}
         onMouseEnter={show} onMouseLeave={hide} onMouseDown={() => { if (timer.current) clearTimeout(timer.current); setHover(null); }}
         onClick={ev => { ev.preventDefault(); if ((ev.metaKey || ev.ctrlKey) && e?.doc) { const doc = hrefFor(id); if (doc) { router.push(doc.replace(/#.*$/, '')); return; } } open(id); }}>
        <i />{text}
      </a>
      {hover && <TagHover id={id} anchor={hover} onEnter={() => { inCard.current = true; if (timer.current) clearTimeout(timer.current); }} onLeave={() => { inCard.current = false; hide(); }} />}
    </>
  );
}
