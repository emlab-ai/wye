'use client';
import { useState } from 'react';
import type { Citation } from '@/lib/ask/types';

const LABEL: Record<Citation['source'], string> = { node: 'block', doc: 'doc', code: 'code', session: 'session' };
const SHOWN = 8;
// The sources the deep lane has opened so far, in the order it found them — the first few, the rest behind "+N more"
// so a long search does not push the results out of the panel.
export function SourceChips({ items, onPick, onHover }: { items: Citation[]; onPick: (c: Citation) => void; onHover: (c: Citation) => void }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div className="ask-found">
      <span className="muted">Sources found</span>
      {shown.map(c => (
        <button key={c.n} type="button" className={`ask-chip ask-chip-${c.source}`} title={c.snippet || c.ref} onMouseEnter={() => onHover(c)} onClick={() => onPick(c)}>
          <b>{c.n}</b> <span className="muted">{LABEL[c.source]}</span> {c.title.length > 40 ? c.title.slice(0, 40) + '…' : c.title}
        </button>))}
      {items.length > SHOWN && <button type="button" className="ask-chips-more" onClick={() => setAll(a => !a)}>{all ? 'fewer' : `+${items.length - SHOWN} more`}</button>}
    </div>
  );
}
