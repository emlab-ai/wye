'use client';
import { useState } from 'react';
import type { QueueItemView } from '@/lib/session-types';

// A conversation's queue with the state of every item (decision:wf2.queue-item-state): the working item first, the
// waiting ones in order — each with its fresh mark (toggle) and a remove button — and the finished ones folded under
// "n done". Rendered in the console's queue panel and under an Agents row (req:wf2.sessions.queue-on-agents).
export function QueueList({ items, control, compact }: { items: QueueItemView[]; control: (body: object) => Promise<unknown>; compact?: boolean }) {
  const [showDone, setShowDone] = useState(false);
  const working = items.filter(q => q.state === 'working');
  const waiting = items.filter(q => q.state === 'waiting');
  const ended = items.filter(q => q.state === 'done' || q.state === 'failed');
  const first = (t: string) => t.split('\n').find(l => l.trim())?.slice(0, 120) ?? '';
  const row = (q: QueueItemView) => (
    <li key={q.id} className={`qi ${q.state}`} onClick={e => e.stopPropagation()}>
      <span className={`pill s ${q.state}`} title={q.error ?? q.state}>{q.state}</span>
      <span className="qi-text" title={q.text}>{first(q.text)}</span>
      {q.state === 'waiting'
        ? <button className={`qi-fresh ${q.fresh ? 'on' : ''}`} title={q.fresh ? 'Clear context first: the agent restarts from nothing before this item — click to keep the context' : 'The agent keeps its context — click to clear it before this item'} onClick={() => control({ action: 'item', itemId: q.id, fresh: !q.fresh })}>{q.fresh ? 'fresh' : 'keep'}</button>
        : q.fresh ? <span className="qi-fresh on" title="the agent restarted from nothing before this item">fresh</span> : null}
      {q.state === 'waiting' && <button className="peek-chip-x" title="Remove from the queue" onClick={() => control({ action: 'unqueue', itemId: q.id })}>×</button>}
    </li>
  );
  if (!items.length) return null;
  return (
    <ol className={`queue-list ${compact ? 'compact' : ''}`}>
      {working.map(row)}
      {waiting.map(row)}
      {ended.length > 0 && <li className="qi fold" onClick={e => { e.stopPropagation(); setShowDone(v => !v); }}><button className="linkish">{showDone ? 'hide' : 'show'} {ended.length} {ended.every(q => q.state === 'done') ? 'done' : `finished (${ended.filter(q => q.state === 'failed').length} failed)`}</button></li>}
      {showDone && ended.map(row)}
    </ol>
  );
}
