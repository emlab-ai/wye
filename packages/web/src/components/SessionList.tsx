'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { agentLabel, when } from './SessionView';
import type { Session } from '@/lib/session-types';

// All agent sessions of a product, active first; polls while any is active. A row opens the session in the right column.
export function SessionList({ product, initial }: { product: string; initial: Session[] }) {
  const { open, openId } = usePeek();
  const [sessions, setSessions] = useState(initial);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  useEffect(() => {
    let live = true; let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => { const r = await fetch(`/api/${product}/sessions`); if (!r.ok || !live) return; const j = await r.json(); setSessions(j.sessions); if (j.sessions.some((s: Session) => s.status === 'queued' || s.status === 'running')) timer = setTimeout(load, 4000); };
    timer = setTimeout(load, 4000);
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [product]);
  const isActive = (s: Session) => s.status === 'queued' || s.status === 'running';
  const shown = sessions.filter(s => filter === 'all' || isActive(s));
  const activeCount = sessions.filter(isActive).length;
  return (
    <div className="sessions">
      <div className="track-tools"><div className="chips">
        <button className={`chip ${filter === 'active' ? 'on' : ''}`} onClick={() => setFilter('active')}>Active <small>{activeCount}</small></button>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All <small>{sessions.length}</small></button>
      </div></div>
      {!shown.length && <p className="muted">{filter === 'active' ? 'No active sessions. Send any block, node or goal to an agent to start one.' : 'No sessions yet.'}</p>}
      <ul className="session-rows">
        {shown.map(s => (
          <li key={s.id} className={`session-row ${openId === `session:${s.id}` ? 'on' : ''}`} onClick={() => open(`session:${s.id}`)}>
            <span className={`pill s ${s.status}`}>{s.status}</span>
            <div className="session-row-main">
              <div className="session-row-title">{s.instruction.split('\n').find(l => l.trim()) ?? '(no instruction)'}</div>
              <div className="session-row-sub"><span>{agentLabel(s.agent)}</span><span>·</span><span>{when(s.createdAt)}</span>{s.source?.doc && <><span>·</span><span>{s.source.project ? `${s.source.project} / ` : ''}{s.source.doc}</span></>}{s.refs.length > 0 && <span className="tags">{s.refs.slice(0, 4).map(r => <SmartTag key={r} id={r} />)}{s.refs.length > 4 && <span className="muted">+{s.refs.length - 4}</span>}</span>}</div>
            </div>
            <code className="session-id">{s.id}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
