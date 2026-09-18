'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import type { Session } from '@/lib/session-types';
import { AGENTS } from '@/lib/session-types';
import { Console } from './Console';
import { shownStatus } from './SessionList';
import { SessionChanges } from './SessionChanges';

export const agentLabel = (id: string) => AGENTS.find(a => a.id === id)?.label ?? id;
export const when = (iso: string) => { const d = new Date(iso); const m = (Date.now() - d.getTime()) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : d.toLocaleDateString(); };

// One agent session in the right column: what was sent, its status, and the live log (polled while active).
export function SessionView({ id }: { id: string }) {
  const { product, open } = usePeek();
  const [s, setS] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let live = true; let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const r = await fetch(`/api/${product}/sessions/${id}`); const j = r.ok ? await r.json() : null;
      if (!live) return; setS(j);
      if (j && j.mode !== 'chat' && (j.status === 'queued' || j.status === 'running')) timer = setTimeout(load, 2500);
    };
    load();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [product, id]);
  // what the session changed in the knowledge base so far: its artifacts, plus every `knowledge` event as it arrives
  const [known, setKnown] = useState<string[]>([]);
  const onKnowledge = useCallback((ids: string[]) => setKnown(k => [...new Set([...k, ...ids])]), []);
  const [handoff, setHandoff] = useState<{ agent: string; note: string } | null>(null);
  const doHandoff = async () => {
    if (!handoff) return;
    const r = await fetch(`/api/${product}/sessions/${id}/handoff`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(handoff) });
    if (r.ok) { const j = await r.json(); setHandoff(null); open(`session:${j.id}`); }
  };
  const patch = async (body: object) => { const r = await fetch(`/api/${product}/sessions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) setS(await r.json()); };
  if (s === undefined) return <p className="muted">Loading session…</p>;
  if (!s) return <p className="notice">Session {id} not found.</p>;
  const active = s.status === 'queued' || s.status === 'running';
  const knowledge = [...new Set([...(s.artifacts?.docs ?? []), ...(s.artifacts?.nodes ?? []), ...known])];
  // the blocks the session changed (block attribution): counts in the strip, the list in a fold under it
  const blocks = s.artifacts?.blocks ?? [];
  const bc = { added: blocks.filter(b => b.change === 'added' && !b.id.startsWith('block:')).length, changed: blocks.filter(b => b.change === 'changed' && !b.id.startsWith('block:')).length, removed: blocks.filter(b => b.change === 'removed' && !b.id.startsWith('block:')).length, prose: blocks.filter(b => b.id.startsWith('block:')).length };
  const bcLine = [bc.added && `+${bc.added}`, bc.changed && `~${bc.changed}`, bc.removed && `−${bc.removed}`, bc.prose && `${bc.prose}¶`].filter(Boolean).join(' ');
  return (
    <div className="session">
      <div className="session-head">
        <span className={`pill s ${shownStatus(s)} session-status`} title={s.live ? `process up · recorded status: ${s.status}` : s.status}>{shownStatus(s)}</span>
        <strong>{agentLabel(s.agent)}</strong>{s.mode === 'chat' && <span className="pill">chat</span>}
        <span className="muted">{when(s.createdAt)}</span>
        <span className="session-acts">
          <button className="mini" onClick={() => setHandoff(h => h ? null : { agent: AGENTS.find(a => a.id !== s.agent)?.id ?? s.agent, note: '' })} title="Continue this work under another agent">Hand off…</button>
          {active && <button className="mini" onClick={() => patch({ status: 'cancelled' })}>Cancel</button>}
        </span>
      </div>
      {(s.runner || s.cwd) && <p className="muted session-src">{s.cwd && <>folder <code>{s.cwd.replace(/^\/Users\/[^/]+/, '~')}</code>{s.runner ? ' · ' : ''}</>}{s.runner && <>runner {s.runner}</>}{s.startedAt ? ` · started ${when(s.startedAt)}` : ''}{s.finishedAt ? ` · finished ${when(s.finishedAt)}` : ''}</p>}
      {(s.parent || (s.children && s.children.length > 0)) && <p className="session-src">{s.parent && <>continues <button className="linkish" onClick={() => open(`session:${s.parent}`)}>session {s.parent.slice(0, 6)}</button></>}{s.children && s.children.length > 0 && <> handed off to {s.children.map(c => <button key={c} className="linkish" onClick={() => open(`session:${c}`)}>session {c.slice(0, 6)}</button>)}</>}</p>}
      {handoff && (
        <div className="handoff form">
          <label><span>to agent</span><select value={handoff.agent} onChange={e => setHandoff({ ...handoff, agent: e.target.value })}>{AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
          <label><span>note</span><input value={handoff.note} placeholder="what the next agent should know" onChange={e => setHandoff({ ...handoff, note: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') doHandoff(); }} /></label>
          <div className="sec-actions"><button className="pri" onClick={doHandoff}>Hand off</button><button onClick={() => setHandoff(null)}>Cancel</button><span className="muted" style={{ fontSize: 11 }}>a new session for that agent continues this one with its log and result; this one is cancelled if still active</span></div>
        </div>
      )}
      {s.refs.length > 0 && <div className="tags session-refs">{s.refs.map(r => <SmartTag key={r} id={r} />)}</div>}
      {knowledge.length > 0 && <div className="tags session-know" title="documents and nodes this session changed"><small className="muted">knowledge</small>{knowledge.map(r => <SmartTag key={r} id={r} />)}{(blocks.length > 0 || known.length > 0) && <a className="know-open muted small" href={`/${product}/sessions/${id}/changes`} title="every block this session changed, as a page">{bcLine || 'changes'} ↗</a>}</div>}
      {(blocks.length > 0 || known.length > 0) && <details className="session-changes-fold"><summary>changes {bcLine && <span className="muted">{bcLine}</span>}</summary><SessionChanges product={product} id={id} live={active || s.mode === 'chat'} /></details>}
      {s.mode === 'chat' ? <details className="session-instr-fold"><summary className="muted">instruction</summary><pre className="session-instruction">{s.instruction}</pre></details> : <pre className="session-instruction">{s.instruction}</pre>}
      {s.source?.doc && <p className="muted session-src">from {s.source.project ? `${s.source.project} / ` : ''}{s.source.doc}</p>}
      {s.mode === 'chat' && <Console session={s} onStatus={st => setS(x => x ? { ...x, status: st as Session['status'] } : x)} onKnowledge={onKnowledge} />}
      {s.mode !== 'chat' && <><h5>Log {active && <span className="live-dot" title="following" />}</h5>
      <pre className="session-log">{s.log.map((l, i) => <span key={i}><time>{new Date(l.t).toLocaleTimeString()}</time> {l.line}{'\n'}</span>)}{s.status === 'queued' && <span className="muted">waiting for an agent runner to pick this up…{'\n'}</span>}</pre></>}
      {s.result && s.mode !== 'chat' && <><h5>Result</h5><pre className="session-result">{s.result}</pre></>}
    </div>
  );
}
