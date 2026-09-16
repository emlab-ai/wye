'use client';
import { useEffect, useRef, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';

type Hit = { id: string; score: number; semantic: number; keyword: number; snippet: string };

// Context for what is being written: the current block's text goes to the product's local semantic search and the
// closest knowledge comes back; "+ link" inserts a smart tag at the cursor, the tag opens the node.
export function ContextPanel() {
  const { product, index, editing, open } = usePeek();
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef('');
  const text = editing?.text ?? '';
  const linkedKey = (editing?.linked ?? []).join(',');
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const key = text.trim() + '|' + linkedKey;
    if (text.trim().length < 12) { setHits([]); setState('idle'); return; }
    if (key === last.current) return;
    timer.current = setTimeout(async () => {
      last.current = key; setState('loading');
      try {
        const r = await fetch(`/api/${product}/context`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, exclude: editing?.linked ?? [], limit: 12 }) });
        const j = await r.json();
        if (!r.ok) { setState('error'); setMsg(j.message ?? j.error); return; }
        setHits(j.hits); setState('ready');
      } catch (e) { setState('error'); setMsg(e instanceof Error ? e.message : String(e)); }
    }, 600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text, linkedKey, product, editing]);
  if (!editing) return <p className="muted rels-empty">Put the cursor in a paragraph or block: the knowledge closest to what you are writing shows up here.</p>;
  const shown = hits.filter(h => h.score > 0.3);
  return (
    <div className="ctx">
      <p className="ctx-src"><span className="muted">for</span> “{text.slice(0, 140)}{text.length > 140 ? '…' : ''}”</p>
      {state === 'loading' && !hits.length && <p className="muted">Searching…</p>}
      {state === 'error' && <p className="notice">Search failed: {msg}</p>}
      {state === 'idle' && text.trim().length < 12 && <p className="muted">Keep typing — a few words are enough.</p>}
      {state !== 'idle' && !shown.length && state !== 'loading' && <p className="muted">Nothing close enough in this product's knowledge yet.</p>}
      <ul className="ctx-hits">
        {shown.map(h => {
          const e = index[h.id];
          return (
            <li key={h.id} className={state === 'loading' ? 'stale' : ''}>
              <div className="ctx-row">
                <SmartTag id={h.id} />
                {e?.status && <StatusPill status={e.status} />}
                <span className="ctx-score" title={`semantic ${h.semantic.toFixed(2)} · keywords ${h.keyword.toFixed(2)}`}>{Math.round(h.score * 100)}%</span>
                <button className="ctx-link" onClick={() => editing.insert(h.id)} title="Insert a smart tag for this node at the cursor">+ link</button>
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
