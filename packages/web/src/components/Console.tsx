'use client';
import { AskQuestions, type AskInput } from './AskQuestions';
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
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([]);
  const [showThinking, setShowThinking] = useState(false);
  const [queue, setQueue] = useState<{ pending: { id: string; text: string; addedAt: string }[]; batch: 'one' | 'all' }>({ pending: [], batch: 'one' });
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const id = session.id;
  useEffect(() => {
    const es = new EventSource(`/api/${product}/sessions/${id}/stream`);
    es.addEventListener('snapshot', e => { const j = JSON.parse((e as MessageEvent).data); setEvents(j.transcript); setLive(j.live); if (j.queue) setQueue(j.queue); });
    es.addEventListener('queue', e => setQueue(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('event', e => { const ev = JSON.parse((e as MessageEvent).data) as ChatEvent; setEvents(evs => [...evs, ev]); if (ev.kind === 'exit') { setLive(false); onStatus(ev.code === 0 ? 'done' : 'failed'); } if (ev.kind === 'init') setLive(true); });
    es.addEventListener('ping', e => { const j = JSON.parse((e as MessageEvent).data); setLive(j.live); });
    es.onerror = () => { /* the browser reconnects */ };
    return () => es.close();
  }, [product, id, onStatus]);
  useEffect(() => { if (stick.current) bottom.current?.scrollIntoView({ block: 'end' }); }, [events]);
  // images from the clipboard (or dropped files) ride along with the message, the way Claude Code takes them
  const addFiles = (files: FileList | File[]) => {
    for (const f of Array.from(files)) { if (!f.type.startsWith('image/')) continue; const rd = new FileReader(); rd.onload = () => setImages(im => [...im, { name: f.name || 'pasted.png', dataUrl: String(rd.result) }].slice(0, 8)); rd.readAsDataURL(f); }
  };
  const onPaste = (e: React.ClipboardEvent) => { const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); addFiles(files); } };
  const send = async () => {
    const t = text.trim(); if (!t && !images.length) return;
    setBusy(true); setText(''); const imgs = images; setImages([]);
    const r = await fetch(`/api/${product}/sessions/${id}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, images: imgs }) });
    setBusy(false); if (!r.ok) setEvents(evs => [...evs, { t: new Date().toISOString(), kind: 'stderr', text: 'could not send the message' }]); else setLive(true);
  };
  const control = (body: object) => fetch(`/api/${product}/sessions/${id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answered = new Set(events.filter(e => e.kind === 'note' && e.requestId).map(e => e.requestId));
  const answers = new Map<string | undefined, unknown | 'denied'>(events.filter(e => e.kind === 'note' && e.requestId).map(e => [e.requestId, e.answered === 'deny' ? 'denied' : (e.input ?? {})]));
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
      {queue.pending.length > 0 && (
        <div className="console-queue">
          <div className="console-queue-head"><b>Queue</b> <span className="muted">{queue.pending.length} waiting · sent {queue.batch === 'all' ? 'all at once' : 'one at a time'} when the agent is idle</span>
            <span className="seg small"><button className={queue.batch === 'one' ? 'on' : ''} onClick={() => control({ action: 'batch', batch: 'one' })}>one</button><button className={queue.batch === 'all' ? 'on' : ''} onClick={() => control({ action: 'batch', batch: 'all' })}>batch</button></span></div>
          <ol>{queue.pending.map(q => <li key={q.id}><span>{q.text.split('\n').find(l => l.trim())?.slice(0, 120)}</span><button className="peek-chip-x" title="Remove from the queue" onClick={() => control({ action: 'unqueue', itemId: q.id })}>×</button></li>)}</ol>
        </div>
      )}
      <div className="console-log" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {groupSubagents(events).map((g, i) => g.parent
          ? <Subagent key={'s' + i} events={g.events} task={events.find(e => e.kind === 'tool_use' && e.toolUseId === g.parent)} finished={events.some(e => e.kind === 'tool_result' && e.toolUseId === g.parent)} answered={answered} answers={answers} showThinking={showThinking} answer={(requestId, allow, input) => control({ action: 'permission', requestId, allow, input })} />
          : <Event key={i} e={g.events[0]} answered={answered} answers={answers} showThinking={showThinking} answer={(requestId, allow, input) => control({ action: 'permission', requestId, allow, input })} />)}
        <div ref={bottom} />
      </div>
      <form className="console-input" onSubmit={e => { e.preventDefault(); send(); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        {images.length > 0 && <div className="console-attach">{images.map((im, i) => <span key={i} className="console-thumb"><img src={im.dataUrl} alt={im.name} /><button type="button" onClick={() => setImages(x => x.filter((_, k) => k !== i))} title="Remove">×</button></span>)}</div>}
        <div className="console-row">
          <textarea value={text} rows={2} placeholder={live ? (turnOpen ? 'Queue the next message… (⌘↵; paste images too)' : 'Reply to the agent… (⌘↵ to send; paste images too)') : 'Type to resume the agent…'} onChange={e => setText(e.target.value)} onPaste={onPaste} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); } }} />
          <button className="pri" type="submit" disabled={busy || (!text.trim() && !images.length)}>Send</button>
        </div>
      </form>
    </div>
  );
}

function Event({ e, answered, answers, showThinking, answer }: { e: ChatEvent; answered: Set<string | undefined>; answers: Map<string | undefined, unknown | 'denied'>; showThinking: boolean; answer: (requestId: string, allow: boolean, input?: unknown) => void }) {
  void answered;
  const [open, setOpen] = useState(false);
  const time = <time>{e.t.slice(11, 19)}</time>;
  switch (e.kind) {
    case 'user': return <div className="ev ev-user">{time}<div className="ev-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{e.text ?? ''}</ReactMarkdown>{e.images && e.images.length > 0 && <div className="ev-images">{e.images.map(u => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="attachment" /></a>)}</div>}</div></div>;
    case 'assistant': return <div className="ev ev-assistant">{time}<div className="ev-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{e.text ?? ''}</ReactMarkdown></div></div>;
    case 'thinking': return showThinking ? <div className="ev ev-thinking">{time}<div className="ev-body">{e.text}</div></div> : null;
    case 'tool_use': {
      const input = e.input as Record<string, unknown> | undefined;
      const summary = e.name === 'Bash' ? String(input?.command ?? '') : e.name === 'Read' || e.name === 'Edit' || e.name === 'Write' ? String(input?.file_path ?? '') : e.name === 'Grep' ? String(input?.pattern ?? '') : JSON.stringify(input ?? {}).slice(0, 120);
      return <div className="ev ev-tool">{time}<button className="ev-tool-head" onClick={() => setOpen(o => !o)}><b>{e.name}</b> <span>{summary.slice(0, 160)}</span></button>{open && <pre className="ev-pre">{JSON.stringify(input, null, 2)}</pre>}</div>;
    }
    case 'tool_result': return <div className={`ev ev-result ${e.isError ? 'err' : ''}`}>{time}<button className="ev-tool-head" onClick={() => setOpen(o => !o)}><span className="muted">{e.isError ? 'error' : 'result'}</span> <span>{(e.output ?? '').split('\n')[0].slice(0, 160)}</span></button>{open && <pre className="ev-pre">{e.output}</pre>}</div>;
    case 'permission': {
      // the agent's questions are a form; any other permission shows what the tool wants to do, with the raw input folded away
      const ans = answers.get(e.requestId);
      if (e.name === 'AskUserQuestion') return <div className="ev ev-ask">{time}<div className="ev-body"><AskQuestions input={(e.input ?? {}) as AskInput} requestId={e.requestId!} answer={answer} done={ans === undefined ? undefined : ans === 'denied' ? 'denied' : ((ans as AskInput).answers ?? {})} /></div></div>;
      const input = e.input as Record<string, unknown> | undefined;
      const summary = e.name === 'Bash' ? String(input?.command ?? '') : ['Read', 'Edit', 'Write', 'MultiEdit'].includes(e.name ?? '') ? String(input?.file_path ?? '') : e.text || '';
      return <div className="ev ev-perm">{time}<div className="ev-body"><p className="perm-head"><b>{e.name}</b> <span className="muted">asks permission</span></p>{summary && <pre className="ev-pre perm-summary">{summary.slice(0, 600)}</pre>}<details className="perm-raw"><summary className="muted">input</summary><pre className="ev-pre">{JSON.stringify(e.input, null, 2)}</pre></details>{ans !== undefined ? <span className="muted">{ans === 'denied' ? 'denied' : 'allowed'}</span> : <span className="sec-actions"><button className="pri" onClick={() => answer(e.requestId!, true, e.input)}>Allow</button><button onClick={() => answer(e.requestId!, false)}>Deny</button></span>}</div></div>;
    }
    case 'result': return <div className="ev ev-turn">{time}<span className="muted">turn done{e.durationMs ? ` · ${(e.durationMs / 1000).toFixed(1)} s` : ''}{e.costUsd !== undefined ? ` · $${e.costUsd.toFixed(3)} total` : ''}{e.isError ? ' · error' : ''}</span></div>;
    case 'init': return <div className="ev ev-note">{time}<span className="muted">{e.text}{e.cwd ? ` · ${e.cwd}` : ''}</span></div>;
    case 'note': return e.requestId ? null : <div className="ev ev-note">{time}<span className="muted">{e.text}</span></div>;
    case 'stderr': return <div className="ev ev-stderr">{time}<pre className="ev-pre">{e.text}</pre></div>;
    case 'exit': return <div className="ev ev-note">{time}<span className="muted">{e.text}</span></div>;
    default: return null;
  }
}

// Consecutive events from the same subagent form one group under the Task call that started it.
function groupSubagents(events: ChatEvent[]): { parent?: string; events: ChatEvent[] }[] {
  const out: { parent?: string; events: ChatEvent[] }[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (e.parent && last?.parent === e.parent) last.events.push(e);
    else out.push({ parent: e.parent, events: [e] });
  }
  return out;
}
function Subagent({ events, task, finished, answered, answers, showThinking, answer }: { events: ChatEvent[]; task?: ChatEvent; finished: boolean; answered: Set<string | undefined>; answers: Map<string | undefined, unknown | 'denied'>; showThinking: boolean; answer: (requestId: string, allow: boolean, input?: unknown) => void }) {
  const [open, setOpen] = useState(true);
  const input = task?.input as { description?: string; subagent_type?: string; prompt?: string } | undefined;
  const tools = events.filter(e => e.kind === 'tool_use').length;
  const done = finished;
  return (
    <div className="ev ev-sub">
      <time>{events[0].t.slice(11, 19)}</time>
      <div className="ev-sub-body">
        <button className="ev-sub-head" onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'} <b>subagent</b> {input?.subagent_type ? <span className="muted">{input.subagent_type}</span> : null} <span>{input?.description ?? (input?.prompt ?? '').slice(0, 80)}</span> <span className="muted">· {events.length} events, {tools} tool calls{done ? '' : ' · working'}</span></button>
        {open && <div className="ev-sub-events">{events.map((e, i) => <Event key={i} e={e} answered={answered} answers={answers} showThinking={showThinking} answer={answer} />)}</div>}
      </div>
    </div>
  );
}
