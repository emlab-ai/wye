'use client';
import { PlanList } from './PlanList';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePeek } from './PeekProvider';
import { useRouter } from 'next/navigation';
import { SmartTag } from './SmartTag';
import { agentLabel, when } from './SessionView';
import { requestSend } from './CommandBox';
import { queueSummary, queueView, type Session, type Runner } from '@/lib/session-types';
import { QueueList } from './QueueList';
import { docTitles, plainAppLinks } from '@/lib/app-link';

// The Agents page: every conversation and run of a product. A conversation whose claude/codex process is up counts as
// active whatever its recorded status (working while a turn is open, live when idle) — the process is the agent
// (task:new-917). Polls while anything is active. A row opens the conversation in the right column; under the
// instruction it shows the queue with each item's state (req:wf2.sessions.queue-on-agents); on hover it offers Stop
// (live rows: the process ends, the context survives) and Close (active rows: cancelled, waiting items dropped), and
// the header "Stop idle (n)" ends every live conversation with no open turn and nothing waiting
// (req:wf2.sessions.stop-from-list). A row opens the conversation as a page of its own (a tab), not in the column.
export const isActive = (s: Session) => s.status === 'queued' || s.status === 'running' || !!s.live;
// the pill a conversation shows: what its process is doing when it has one, its recorded status otherwise
export const shownStatus = (s: Session) => s.busy ? 'working' : s.live ? 'live' : s.status;
// live, no open turn, nothing waiting: what "Stop idle" ends
export const isIdle = (s: Session) => !!s.live && !s.busy && !(s.queue ?? []).some(q => !q.sentAt);
export function SessionList({ product, initial, initialRunners }: { product: string; initial: Session[]; initialRunners: Runner[] }) {
  const { openId, index } = usePeek(); const router = useRouter();
  const [origin, setOrigin] = useState(''); useEffect(() => { setOrigin(window.location.origin); }, []);
  const titles = docTitles(index);
  const [sessions, setSessions] = useState(initial);
  const [runners, setRunners] = useState(initialRunners);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const alive = useRef(true);
  const refresh = useCallback(async () => { const r = await fetch(`/api/${product}/sessions`); if (!r.ok || !alive.current) return null; const j = await r.json(); setSessions(j.sessions); setRunners(j.runners ?? []); return j as { sessions: Session[]; runners: Runner[] }; }, [product]);
  useEffect(() => {
    alive.current = true; let timer: ReturnType<typeof setTimeout> | null = null;
    // poll while anything is active or a runner is online, so the board follows the agents
    const load = async () => { const j = await refresh(); if (!j || !alive.current) return; timer = setTimeout(load, j.sessions.some(isActive) || (j.runners ?? []).length ? 4000 : 15000); };
    timer = setTimeout(load, 4000);
    return () => { alive.current = false; if (timer) clearTimeout(timer); };
  }, [refresh]);
  // a row's actions never open the conversation; the list is refetched right after so the row moves at once
  const control = useCallback(async (id: string, body: object) => { await fetch(`/api/${product}/sessions/${id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); await refresh(); }, [product, refresh]);
  const idleOnes = sessions.filter(isIdle);
  const stopIdle = async () => { await Promise.all(idleOnes.map(s => fetch(`/api/${product}/sessions/${s.id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) }))); await refresh(); };
  const shown = sessions.filter(s => filter === 'all' || isActive(s));
  const activeCount = sessions.filter(isActive).length;
  const working = sessions.filter(s => s.busy || (s.status === 'running' && !s.live)).length;
  const idle = sessions.filter(s => s.live && !s.busy).length;
  return (
    <div className="sessions">
      <div className="runners">
        <h4>Agents <span className="muted">{working} working · {idle} live and idle · {runners.length} runner{runners.length === 1 ? '' : 's'} online</span><span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{idleOnes.length > 0 && <button className="mini" title="End the process of every live conversation that has no open turn and nothing waiting; their context comes back with Resume or a message" onClick={stopIdle}>Stop idle ({idleOnes.length})</button>}<button className="mini" onClick={() => requestSend({})}>+ New conversation</button></span></h4>
        {runners.length
          ? <ul>{runners.map(r => <li key={r.name}><span className={`rdot ${r.busy ? 'busy' : ''}`} /><strong>{r.name}</strong><span className="muted">{agentLabel(r.agent)} · {r.host}{r.cwd ? ' · ' + r.cwd.replace(/^\/Users\/[^/]+/, '~') : ''}</span>{r.busy ? <button className="linkish" onClick={() => router.push(`/${product}/sessions/${r.busy}/chat`)}>on session {r.busy.slice(0, 6)}</button> : <span className="muted">idle</span>}</li>)}</ul>
          : <p className="muted">No runner is connected. Start one next to the code it should work on:<br /><code>wf agent listen --product {product} --agent claude-code</code> (or <code>--agent codex</code>). It picks up queued work for that agent and streams its output here.</p>}
      </div>
      <div className="track-tools"><div className="chips">
        <button className={`chip ${filter === 'active' ? 'on' : ''}`} onClick={() => setFilter('active')}>Active <small>{activeCount}</small></button>
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All <small>{sessions.length}</small></button>
      </div></div>
      {!shown.length && <p className="muted">{filter === 'active' ? 'No agent is active. ⌘P or Send to agent on any block starts one.' : 'No agents have worked here yet.'}</p>}
      <ul className="session-rows">
        {shown.map(s => (
          <li key={s.id} className={`session-row ${openId === `session:${s.id}` ? 'on' : ''}`} onClick={() => router.push(`/${product}/sessions/${s.id}/chat`)}>
            <span className={`pill s ${shownStatus(s)}`} title={s.live ? `process up · recorded status: ${s.status}` : s.status}>{shownStatus(s)}</span>
            <div className="session-row-main">
              <div className="session-row-title">{plainAppLinks(s.instruction.split('\n').find(l => l.trim()) ?? '(no instruction)', origin, titles)}</div>
              <div className="session-row-sub"><span>{agentLabel(s.agent)}{s.mode === 'chat' ? ' · chat' : ''}</span>{s.cwd && <><span>·</span><span>{s.cwd.replace(/^\/Users\/[^/]+/, '~')}</span></>}<span>·</span><span>{when(s.createdAt)}</span>{s.source?.doc && <><span>·</span><span>{s.source.project ? `${s.source.project} / ` : ''}{s.source.doc}</span></>}{s.refs.length > 0 && <span className="tags">{s.refs.slice(0, 4).map(r => <SmartTag key={r} id={r} />)}{s.refs.length > 4 && <span className="muted">+{s.refs.length - 4}</span>}</span>}</div>
              {/* the worker's work items: every plan of the session, the current one marked (decision:wf2.plan-per-request) */}
              <PlanList session={s} plans={s.plans ?? []} />
              {(s.queue?.length ?? 0) > 0 && <div className="session-row-queue"><span className="muted">queue · {queueSummary(s.queue!)}</span><QueueList items={queueView(s.queue, s.batch).items} control={body => control(s.id, body)} compact /></div>}
            </div>
            <span className="session-row-acts" onClick={e => e.stopPropagation()}>
              {s.live && <button className="mini" title="End the agent's process; the context comes back with Resume or a message" onClick={() => control(s.id, { action: 'stop' })}>Stop</button>}
              {isActive(s) && <button className="mini" title="End the process, drop the waiting items and mark the conversation cancelled (it stays under All)" onClick={() => control(s.id, { action: 'close' })}>Close</button>}
            </span>
            <code className="session-id">{s.id}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
