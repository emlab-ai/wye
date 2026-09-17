'use client';
import { useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { requestSend } from './SendToAgent';

export type QuestionRow = { key: string; source: 'doc' | 'inbox'; id?: string; title: string; text?: string; status: string; where: string; href?: string; when: string; refs: string[]; node?: string };
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

export function QuestionList({ product, rows }: { product: string; rows: QuestionRow[] }) {
  const { open } = usePeek();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const isOpen = (r: QuestionRow) => r.source === 'inbox' ? r.status === 'new' : !['done', 'resolved', 'dismissed', 'answered'].includes(r.status);
  const shown = rows.filter(r => filter === 'all' || isOpen(r));
  return (
    <div className="track">
      <div className="track-tools"><div className="chips">
        <button className={`chip ${filter === 'open' ? 'on' : ''}`} onClick={() => setFilter('open')}>Open <small>{rows.filter(isOpen).length}</small></button>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All <small>{rows.length}</small></button>
      </div></div>
      {!shown.length && <p className="muted">No open questions.</p>}
      <ul className="qlist">
        {shown.map(r => (
          <li key={r.key} className={`qrow ${isOpen(r) ? '' : 'done'}`} onClick={() => { if (r.id) open(r.id); else if (r.node) open(r.node); else if (r.href) location.href = r.href; }}>
            <div className="qhead"><span className={`pill k`} style={{ background: 'var(--k-question)' }}>{r.source === 'inbox' ? 'inbox' : 'doc'}</span><span className="qtitle">{plain(r.title)}</span><StatusPill status={r.source === 'inbox' ? r.status : r.status} /><span className="muted qwhere">{r.where}{r.when ? ` · ${r.when.slice(0, 16).replace('T', ' ')}` : ''}</span>
              <button className="tsend" title="Send to agent" onClick={e => { e.stopPropagation(); requestSend({ refs: r.id ? [r.id] : r.refs.slice(0, 5), text: `Question: ${plain(r.title)}${r.text ? `\n\n${r.text}` : ''}`, source: r.href ? { link: location.origin + r.href } : undefined }); }}>⇢</button></div>
            {r.text && r.text !== r.title && <p className="qtext">{r.text.slice(0, 600)}</p>}
            {r.refs.length > 0 && <div className="tags">{r.refs.map(x => <SmartTag key={x} id={x} />)}</div>}
            {r.source === 'inbox' && r.status === 'new' && <p className="muted qhint">review it in the <a href={`/${product}/inbox`} onClick={e => e.stopPropagation()}>inbox</a>: file it as a question node, or record the answer as a decision and dismiss it</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
