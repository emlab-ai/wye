'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePeek } from './PeekProvider';
import type { ChatEvent, Session } from '@/lib/session-types';

// The live conversation with an agent: every event of the transcript, streamed over SSE, plus a message box.
export function Console({ session, onStatus }: { session: Session; onStatus: (s: string) => void }) {
  const { product } = usePeek();
  const [events, setEvents] = useState<ChatEvent[]>(session.transcript ?? []);
  const [live, setLive] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const id = session.id;
  useEffect(() => {
    const es = new EventSource(`/api/${product}/sessions/${id}/stream`);
    es.addEventListener('snapshot', e => { const j = JSON.parse((e as MessageEvent).data); setEvents(j.transcript); setLive(j.live); });
    es.addEventListener('event', e => { const ev = JSON.parse((e as MessageEvent).data) as ChatEvent; setEvents(evs => [...evs, ev]); if (ev.kind === 'exit') { setLive(false); onStatus(ev.code === 0 ? 'done' : 'failed'); } if (ev.kind === 'init') setLive(true); });
    es.addEventListener('ping', e => { const j = JSON.parse((e as MessageEvent).data); setLive(j.live); });
    es.onerror = () => { /* the browser reconnects */ };
    return () => es.close();
  }, [product, id, onStatus]);
  useEffect(() => { if (stick.current) bottom.current?.scrollIntoView({ block: 'end' }); }, [events]);
  const send = async () => {
    const t = text.trim(); if (!t) return;
    setBusy(true); setText('');
    const r = await fetch(`/api/${product}/sessions/${id}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t }) });
    setBusy(false); if (!r.ok) setEvents(evs => [...evs, { t: new Date().toISOString(), kind: 'stderr', text: 'could not send the message' }]);
  };
  const control = (body: object) => fetch(`/api/${product}/sessions/${id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answered = new Set(events.filter(e => e.kind === 'note' && e.requestId).map(e => e.requestId));
  const thinking = events.some(e => e.kind === 'thinking');
  const turnOpen = (() => { for (let i = events.length - 1; i >= 0; i--) { const k = events[i].kind; if (k === 'result' || k === 'exit') return false; if (k === 'user') return true; } return false; })();
  return (
    <div className="console">
      <div className="console-bar">
        <span className={`rdot ${live ? (turnOpen ? 'busy' : '') : 'off'}`} /><span className="muted">{live ? (turnOpen ? 'working…' : 'idle, waiting for you') : 'agent not running'}</span>
        {thinking && <label className="console-opt"><input type="checkbox" checked={showThinking} onChange={e => setShowThinking(e.target.checked)} /> thinking</label>}
        <span className="console-acts">
          {live ? <button className="mini" onClick={() => control({ action: 'stop' })}>Stop</button> : <button className="mini" onClick={() => control({ action: 'resume' }).then(() => setLive(true))}>Resume</button>}
        </span>
      </div>
      <div className="console-log" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {events.map((e, i) => <Event key={i} e={e} answered={answered} showThinking={showThinking} answer={(requestId, allow, input) => control({ action: 'permission', requestId, allow, input })} />)}
        <div ref={bottom} />
      </div>
      <form className="console-input" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea value={text} rows={2} placeholder={live ? 'Reply to the agent… (⌘↵ to send)' : 'Type to resume the agent…'} onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); } }} />
        <button className="pri" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}

function Event({ e, answered, showThinking, answer }: { e: ChatEvent; answered: Set<string | undefined>; showThinking: boolean; answer: (requestId: string, allow: boolean, input?: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const time = <time>{e.t.slice(11, 19)}</time>;
  switch (e.kind) {
    case 'user': return <div className="ev ev-user">{time}<div className="ev-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{e.text ?? ''}</ReactMarkdown></div></div>;
    case 'assistant': return <div className="ev ev-assistant">{time}<div className="ev-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{e.text ?? ''}</ReactMarkdown></div></div>;
    case 'thinking': return showThinking ? <div className="ev ev-thinking">{time}<div className="ev-body">{e.text}</div></div> : null;
    case 'tool_use': {
      const input = e.input as Record<string, unknown> | undefined;
      const summary = e.name === 'Bash' ? String(input?.command ?? '') : e.name === 'Read' || e.name === 'Edit' || e.name === 'Write' ? String(input?.file_path ?? '') : e.name === 'Grep' ? String(input?.pattern ?? '') : JSON.stringify(input ?? {}).slice(0, 120);
      return <div className="ev ev-tool">{time}<button className="ev-tool-head" onClick={() => setOpen(o => !o)}><b>{e.name}</b> <span>{summary.slice(0, 160)}</span></button>{open && <pre className="ev-pre">{JSON.stringify(input, null, 2)}</pre>}</div>;
    }
    case 'tool_result': return <div className={`ev ev-result ${e.isError ? 'err' : ''}`}>{time}<button className="ev-tool-head" onClick={() => setOpen(o => !o)}><span className="muted">{e.isError ? 'error' : 'result'}</span> <span>{(e.output ?? '').split('\n')[0].slice(0, 160)}</span></button>{open && <pre className="ev-pre">{e.output}</pre>}</div>;
    case 'permission': return <div className="ev ev-perm">{time}<div className="ev-body"><b>{e.name}</b> asks permission{e.text ? `: ${e.text}` : ''}<pre className="ev-pre">{JSON.stringify(e.input, null, 2)}</pre>{answered.has(e.requestId) ? <span className="muted">answered</span> : <span className="sec-actions"><button className="pri" onClick={() => answer(e.requestId!, true, e.input)}>Allow</button><button onClick={() => answer(e.requestId!, false)}>Deny</button></span>}</div></div>;
    case 'result': return <div className="ev ev-turn">{time}<span className="muted">turn done{e.durationMs ? ` · ${(e.durationMs / 1000).toFixed(1)} s` : ''}{e.costUsd !== undefined ? ` · $${e.costUsd.toFixed(3)} total` : ''}{e.isError ? ' · error' : ''}</span></div>;
    case 'init': return <div className="ev ev-note">{time}<span className="muted">{e.text}{e.cwd ? ` · ${e.cwd}` : ''}</span></div>;
    case 'note': return e.requestId ? null : <div className="ev ev-note">{time}<span className="muted">{e.text}</span></div>;
    case 'stderr': return <div className="ev ev-stderr">{time}<pre className="ev-pre">{e.text}</pre></div>;
    case 'exit': return <div className="ev ev-note">{time}<span className="muted">{e.text}</span></div>;
    default: return null;
  }
}
