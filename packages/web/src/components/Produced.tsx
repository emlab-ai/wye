'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import type { Session } from '@/lib/session-types';
import type { InboxItem } from '@/lib/inbox';
import { agentLabel, when } from './SessionView';

// Everything that came out of the sessions that worked on a task: the sessions themselves (with their logs), the
// documents they wrote, the nodes they changed, and the inbox items (questions, decisions, notes) they filed.
export function Produced({ sessions, produced }: { sessions: string[]; produced: string[] }) {
  const { product, open } = usePeek();
  const [data, setData] = useState<{ sessions: Session[]; inbox: InboxItem[] } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([Promise.all(sessions.map(id => fetch(`/api/${product}/sessions/${id}`).then(r => r.ok ? r.json() : null))), fetch(`/api/${product}/inbox`).then(r => r.ok ? r.json() : { items: [] })])
      .then(([ss, inb]) => { if (live) setData({ sessions: (ss as (Session | null)[]).filter(Boolean) as Session[], inbox: (inb.items as InboxItem[]).filter(i => i.session && sessions.includes(i.session)) }); });
    return () => { live = false; };
  }, [product, sessions]);
  const docs = [...new Set([...produced, ...(data?.sessions.flatMap(s => s.artifacts?.docs ?? []) ?? [])])];
  const nodes = [...new Set(data?.sessions.flatMap(s => s.artifacts?.nodes ?? []) ?? [])];
  return (
    <section className="produced">
      <h5>Produced</h5>
      {!data && <p className="muted">loading…</p>}
      {data && (
        <>
          <div className="produced-group"><small>sessions</small>
            <ul>{data.sessions.map(s => <li key={s.id}><button className="linkish" onClick={() => open(`session:${s.id}`)}>session {s.id.slice(0, 6)}</button><StatusPill status={s.status} /><span className="muted">{agentLabel(s.agent)} · {when(s.createdAt)}{s.mode === 'chat' ? ' · conversation' : ''}</span>{s.result && <span className="rt">{s.result.split('\n')[0].slice(0, 140)}</span>}</li>)}</ul>
          </div>
          {docs.length > 0 && <div className="produced-group"><small>documents</small><div className="tags">{docs.map(m => <SmartTag key={m} id={m} />)}</div></div>}
          {nodes.length > 0 && <div className="produced-group"><small>nodes changed</small><div className="tags">{nodes.map(n => <SmartTag key={n} id={n} />)}</div></div>}
          {data.inbox.length > 0 && (
            <div className="produced-group"><small>inbox</small>
              <ul>{data.inbox.map(i => <li key={i.name}><span className="pill k" style={{ background: `var(--k-${i.type === 'requirement' ? 'req' : i.type}, var(--k-other))` }}>{i.type}</span><a href={`/${product}/inbox`}>{i.title}</a><StatusPill status={i.status} />{i.node && <SmartTag id={i.node} />}</li>)}</ul>
            </div>
          )}
          {!docs.length && !nodes.length && !data.inbox.length && <p className="muted">the sessions left no documents, nodes or inbox items yet</p>}
        </>
      )}
    </section>
  );
}
