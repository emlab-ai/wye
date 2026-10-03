'use client';
import type { Citation } from '@/lib/ask/types';

const LABEL: Record<Citation['source'], string> = { node: 'block', doc: 'doc', code: 'code', session: 'session' };
// The sources the deep lane has opened so far, in the order it found them.
export function SourceChips({ items, onPick, onHover }: { items: Citation[]; onPick: (c: Citation) => void; onHover: (c: Citation) => void }) {
  if (!items.length) return null;
  return (
    <div className="ask-found">
      <span className="muted">Sources found</span>
      {items.map(c => (
        <button key={c.n} type="button" className={`ask-chip ask-chip-${c.source}`} title={c.snippet || c.ref} onMouseEnter={() => onHover(c)} onClick={() => onPick(c)}>
          <b>{c.n}</b> <span className="muted">{LABEL[c.source]}</span> {c.title.length > 40 ? c.title.slice(0, 40) + '…' : c.title}
        </button>))}
    </div>
  );
}
