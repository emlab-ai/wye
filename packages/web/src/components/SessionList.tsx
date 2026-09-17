'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { agentLabel, when } from './SessionView';
import { requestSend } from './CommandBox';
import type { Session, Runner } from '@/lib/session-types';

// All agent sessions of a product, active first; polls while any is active. A row opens the session in the right column.
export function SessionList({ product, initial, initialRunners }: { product: string; initial: Session[]; initialRunners: Runner[] }) {
  const { open, openId } = usePeek();
  const [sessions, setSessions] = useState(initial);
  const [runners, setRunners] = useState(initialRunners);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  useEffect(() => {
    let live = true; let timer: ReturnType<typeof setTimeout> | null = null;
    // poll while anything is active or a runner is online, so the board follows the agents
    const load = async () => { const r = await fetch(`/api/${product}/sessions`); if (!r.ok || !live) return; const j = await r.json(); setSessions(j.sessions); setRunners(j.runners ?? []); timer = setTimeout(load, j.sessions.some((s: Session) => s.status === 'queued' || s.status === 'running') || (j.runners ?? []).length ? 4000 : 15000); };
    timer = setTimeout(load, 4000);
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [product]);
  const isActive = (s: Session) => s.status === 'queued' || s.status === 'running';
  const shown = sessions.filter(s => filter === 'all' || isActive(s));
  const activeCount = sessions.filter(isActive).length;
  const working = sessions.filter(s => s.status === 'running').length;
  return (
    <div className="sessions">
      <div className="runners">
        <h4>Runners <span className="muted">{runners.length} online · {working} working</span><button className="mini" style={{ marginLeft: 'auto' }} onClick={() => requestSend({})}>+ New conversation</button></h4>
        {runners.length
          ? <ul>{runners.map(r => <li key={r.name}><span className={`rdot ${r.busy ? 'busy' : ''}`} /><strong>{r.name}</strong><span className="muted">{agentLabel(r.agent)} · {r.host}{r.cwd ? ' · ' + r.cwd.replace(/^\/Users\/[^/]+/, '~') : ''}</span>{r.busy ? <button className="linkish" onClick={() => open(`session:${r.busy}`)}>on session {r.busy.slice(0, 6)}</button> : <span className="muted">idle</span>}</li>)}</ul>
          : <p className="muted">No runner is connected. Start one next to the code it should work on:<br /><code>wf agent listen --product {product} --agent claude-code</code> (or <code>--agent codex</code>). It picks up queued sessions for that agent and streams its output here.</p>}
      </div>
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
              <div className="session-row-sub"><span>{agentLabel(s.agent)}{s.mode === 'chat' ? ' · chat' : ''}</span>{s.cwd && <><span>·</span><span>{s.cwd.replace(/^\/Users\/[^/]+/, '~')}</span></>}<span>·</span><span>{when(s.createdAt)}</span>{s.source?.doc && <><span>·</span><span>{s.source.project ? `${s.source.project} / ` : ''}{s.source.doc}</span></>}{s.refs.length > 0 && <span className="tags">{s.refs.slice(0, 4).map(r => <SmartTag key={r} id={r} />)}{s.refs.length > 4 && <span className="muted">+{s.refs.length - 4}</span>}</span>}</div>
            </div>
            <code className="session-id">{s.id}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
