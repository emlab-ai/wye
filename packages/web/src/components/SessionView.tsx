'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import type { Session } from '@/lib/session-types';
import { AGENTS } from '@/lib/session-types';

export const agentLabel = (id: string) => AGENTS.find(a => a.id === id)?.label ?? id;
export const when = (iso: string) => { const d = new Date(iso); const m = (Date.now() - d.getTime()) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : d.toLocaleDateString(); };

// One agent session in the right column: what was sent, its status, and the live log (polled while active).
export function SessionView({ id }: { id: string }) {
  const { product } = usePeek();
  const [s, setS] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let live = true; let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const r = await fetch(`/api/${product}/sessions/${id}`); const j = r.ok ? await r.json() : null;
      if (!live) return; setS(j);
      if (j && (j.status === 'queued' || j.status === 'running')) timer = setTimeout(load, 2500);
    };
    load();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [product, id]);
  const patch = async (body: object) => { const r = await fetch(`/api/${product}/sessions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) setS(await r.json()); };
  if (s === undefined) return <p className="muted">Loading session…</p>;
  if (!s) return <p className="notice">Session {id} not found.</p>;
  const active = s.status === 'queued' || s.status === 'running';
  return (
    <div className="session">
      <div className="session-head">
        <span className={`pill s ${s.status} session-status`}>{s.status}</span>
        <strong>{agentLabel(s.agent)}</strong>
        <span className="muted">{when(s.createdAt)}</span>
        {active && <button className="mini" onClick={() => patch({ status: 'cancelled' })}>Cancel</button>}
      </div>
      {s.refs.length > 0 && <div className="tags session-refs">{s.refs.map(r => <SmartTag key={r} id={r} />)}</div>}
      <pre className="session-instruction">{s.instruction}</pre>
      {s.source?.doc && <p className="muted session-src">from {s.source.project ? `${s.source.project} / ` : ''}{s.source.doc}</p>}
      <h5>Log {active && <span className="live-dot" title="following" />}</h5>
      <pre className="session-log">{s.log.map((l, i) => <span key={i}><time>{new Date(l.t).toLocaleTimeString()}</time> {l.line}{'\n'}</span>)}{s.status === 'queued' && <span className="muted">waiting for an agent runner to pick this up…{'\n'}</span>}</pre>
      {s.result && <><h5>Result</h5><pre className="session-result">{s.result}</pre></>}
    </div>
  );
}
