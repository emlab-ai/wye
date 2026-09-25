'use client';
import { useEffect, useRef, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';

type Hit = { id: string; score: number; semantic: number; keyword: number; snippet: string; p?: number };

// Context for what is being written: what the person selected — or, with nothing selected, the block's own text —
// goes to the product's local semantic search and the closest knowledge comes back. Select the words a link belongs
// to and "link" attaches the node to those very words (decision:wf2.a-link-is-on-the-words); the search box finds
// anything the search did not think of. With a Jev key the percentage is Jev's probability and the ones at or above
// the threshold are what leaving the editor will link.
export function ContextPanel() {
  const { product, index, editing, open } = usePeek();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [min, setMin] = useState<number | null>(null); // the link threshold when Jev judged the hits
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef('');
  const selection = editing?.selection ?? '';
  // what the panel is looking for: what you typed in the box, else the words you selected, else this block
  const text = q.trim() || selection || editing?.text || '';
  const linkedKey = (editing?.linked ?? []).join(',');
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const key = text.trim() + '|' + linkedKey;
    if (text.trim().length < 3) { setHits([]); setState('idle'); return; }
    if (key === last.current) return;
    timer.current = setTimeout(async () => {
      last.current = key; setState('loading');
      try {
        const r = await fetch(`/api/${product}/context`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, exclude: editing?.linked ?? [], limit: 12, judge: true }) });
        const j = await r.json();
        if (!r.ok) { setState('error'); setMsg(j.message ?? j.error); return; }
        setHits(j.hits); setMin(j.jev ? j.min : null); setState('ready');
      } catch (e) { setState('error'); setMsg(e instanceof Error ? e.message : String(e)); }
    }, 600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text, linkedKey, product, editing]);
  if (!editing) return <p className="muted rels-empty">Put the cursor in a paragraph or block: the knowledge closest to what you are writing shows up here.</p>;
  const shown = hits.filter(h => h.score > 0.3 || (min !== null && (h.p ?? 0) >= min)); // a hit Jev is sure of shows whatever the search score
  return (
    <div className="ctx">
      <input className="ctx-find" value={q} placeholder="find anything in this product…" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQ(''); }} />
      <p className="ctx-src">
        {selection && !q.trim()
          ? <><span className="muted">linking</span> “{selection.slice(0, 80)}{selection.length > 80 ? '…' : ''}”</>
          : <><span className="muted">for</span> “{text.slice(0, 140)}{text.length > 140 ? '…' : ''}”</>}
      </p>
      {!selection && <p className="muted small ctx-hint">Select the words a link belongs to — a link with nothing to hold onto says nothing.</p>}
      {state === 'loading' && !hits.length && <p className="muted">Searching…</p>}
      {state === 'error' && <p className="notice">Search failed: {msg}</p>}
      {state === 'idle' && text.trim().length < 3 && <p className="muted">Keep typing — a few words are enough.</p>}
      {state !== 'idle' && !shown.length && state !== 'loading' && <p className="muted">Nothing close enough in this product's knowledge yet.</p>}
      <ul className="ctx-hits">
        {shown.map(h => {
          const e = index[h.id];
          return (
            <li key={h.id} className={state === 'loading' ? 'stale' : ''}>
              <div className="ctx-row">
                <SmartTag id={h.id} />
                {e?.status && <StatusPill status={e.status} />}
                <span className={`ctx-score ${min !== null && h.p !== undefined && h.p >= min ? 'ctx-sure' : ''}`} title={h.p !== undefined ? `Jev ${Math.round(h.p * 100)}% — ${min !== null && h.p >= min ? 'linked when you leave the editor' : 'below the link threshold'} · search ${h.score.toFixed(2)}` : `semantic ${h.semantic.toFixed(2)} · keywords ${h.keyword.toFixed(2)}`}>{Math.round((h.p ?? h.score) * 100)}%</span>
                <button className="ctx-link" onClick={() => editing.attach(h.id)} disabled={!selection} title={selection ? `Link “${selection.slice(0, 40)}” to ${h.id}` : 'Select the words this belongs to first'}>link</button>
              </div>
              <button className="ctx-text" onClick={() => open(h.id)} title="Open in the panel">{e?.title && e.title !== h.id ? plain(e.title) : ''}{h.snippet && (!e?.title || !h.snippet.startsWith(plain(e.title))) ? ' — ' + h.snippet : ''}</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
