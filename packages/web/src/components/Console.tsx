'use client';
import Link from 'next/link';
import { AskQuestions, type AskInput } from './AskQuestions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { TranscriptMarkdown } from './TranscriptMarkdown';
import { usePeek } from './PeekProvider';
import { useRouter } from 'next/navigation';
import { queueSummary, type ChatEvent, type QueueView, type Session } from '@/lib/session-types';
import { QueueList } from './QueueList';
import { AttachStrip, useImageAttachments } from './Attachments';
import { SmartTag } from './SmartTag';

// The live conversation with an agent: every event of the transcript, streamed over SSE, plus a message box.
// The nearest scrolling ancestor — the column's body (rule:column-frame) — or the page when there is none.
function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  return document.scrollingElement as HTMLElement;
}
const k = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
export function Console({ session, onStatus, onKnowledge }: { session: Session; onStatus: (s: string) => void; onKnowledge?: (ids: string[]) => void }) {
  const { product } = usePeek();
  const [events, setEvents] = useState<ChatEvent[]>(session.transcript ?? []);
  const [live, setLive] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const attach = useImageAttachments(); const images = attach.images;
  const [showThinking, setShowThinking] = useState(false);
  const [queue, setQueue] = useState<QueueView>({ items: [], batch: 'one' });
  const [fresh, setFresh] = useState(false); const [plan, setPlan] = useState(false); // clear context before this message (req:wf2.sessions.fresh-in-queue)
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const id = session.id;
  const router = useRouter();
  // `wye session log` lines and the `wye session done` summary are part of the conversation, placed by time
  const flow = useMemo(() => {
    const extra: ChatEvent[] = (session.log ?? []).map(l => ({ t: l.t, kind: 'log' as const, text: l.line }));
    if (session.result) extra.push({ t: session.finishedAt ?? session.updatedAt, kind: 'summary', text: session.result });
    if (!extra.length) return events;
    return [...events, ...extra].sort((a, b) => a.t.localeCompare(b.t));
  }, [events, session.log, session.result, session.finishedAt, session.updatedAt]);
  // `wye session open` moves the page only when it arrives live; a replayed transcript (snapshot) never navigates
  useEffect(() => {
    const es = new EventSource(`/api/${product}/sessions/${id}/stream`);
    es.addEventListener('snapshot', e => { const j = JSON.parse((e as MessageEvent).data); setEvents(j.transcript); setLive(j.live); if (j.queue) setQueue(j.queue); });
    es.addEventListener('queue', e => setQueue(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('event', e => { const ev = JSON.parse((e as MessageEvent).data) as ChatEvent; setEvents(evs => [...evs, ev]); if (ev.kind === 'open' && ev.text) router.push(ev.text); if (ev.kind === 'exit') { setLive(false); onStatus(ev.code === 0 ? 'done' : 'failed'); } if (ev.kind === 'init') setLive(true); if (ev.kind === 'knowledge' && ev.refs?.length) onKnowledge?.(ev.refs); });
    es.addEventListener('ping', e => { const j = JSON.parse((e as MessageEvent).data); setLive(j.live); });
    es.onerror = () => { /* the browser reconnects */ };
    return () => es.close();
  }, [product, id, onStatus, onKnowledge, router]);
  // the conversation has no scroll of its own: "at the end" is read from the scroller it lives in, and a new event
  // scrolls that to the end when the person was there (req:wf2.ui.column-frame)
  const scroller = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const sc = bottom.current ? scrollParent(bottom.current) : null; if (!sc) return;
    scroller.current = sc;
    const target: EventTarget = sc === document.scrollingElement ? window : sc;
    const onScroll = () => { stick.current = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 40; };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { const sc = scroller.current; if (!stick.current) return; if (sc) sc.scrollTop = sc.scrollHeight; else bottom.current?.scrollIntoView({ block: 'end' }); }, [flow]);
  // images from the clipboard (or dropped files) ride along with the message (useImageAttachments)
  const send = async () => {
    const t = text.trim(); if (!t && !images.length) return;
    setBusy(true); setText(''); const imgs = attach.take(); const f = fresh; setFresh(false);
    const r = await fetch(`/api/${product}/sessions/${id}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, images: imgs, fresh: f, plan: f && plan }) });
    setBusy(false); if (!r.ok) setEvents(evs => [...evs, { t: new Date().toISOString(), kind: 'stderr', text: 'could not send the message' }]); else setLive(true);
  };
  const control = (body: object) => fetch(`/api/${product}/sessions/${id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answered = new Set(events.filter(e => e.kind === 'note' && e.requestId).map(e => e.requestId));
  const answers = new Map<string | undefined, unknown | 'denied'>(events.filter(e => e.kind === 'note' && e.requestId).map(e => [e.requestId, e.answered === 'deny' ? 'denied' : (e.input ?? {})]));
  const thinking = events.some(e => e.kind === 'thinking');
  // tokens: spent = every turn's usage added up (the transcript replays earlier processes too); context = the last turn's
  const usage = useMemo(() => { let inn = 0, out = 0, context: number | undefined, window: number | undefined; for (const e of events) { if (e.kind !== 'result' || !e.usage) continue; inn += e.usage.in; out += e.usage.out; if (e.usage.context !== undefined) context = e.usage.context; if (e.usage.window) window = e.usage.window; } return { in: inn, out, context, window }; }, [events]);
  const turnOpen = (() => { for (let i = events.length - 1; i >= 0; i--) { const k = events[i].kind; if (k === 'result' || k === 'exit') return false; if (k === 'user') return true; } return false; })();
  return (
    <div className="console">
      <div className="console-bar">
        <span className={`rdot ${live ? (turnOpen ? 'busy' : '') : 'off'}`} /><span className="muted">{live ? (turnOpen ? 'working…' : 'idle') : 'not running'}</span>
        {(usage.context !== undefined || usage.in > 0) && <span className="muted console-usage" title={`context: the prompt of the last call${usage.window ? ` of a ${k(usage.window)} window` : ''} · spent: tokens read (fresh and cached) / written over the whole session`}>{usage.context !== undefined && <>context {k(usage.context)}{usage.window ? ` (${Math.round(usage.context / usage.window * 100)}% of ${k(usage.window)})` : ''} · </>}{k(usage.in)} in · {k(usage.out)} out</span>}
        {thinking && <label className="console-opt"><input type="checkbox" checked={showThinking} onChange={e => setShowThinking(e.target.checked)} /> thinking</label>}
        <span className="console-acts">
          {live ? <button className="mini" onClick={() => control({ action: 'stop' })}>Stop</button> : <button className="mini" onClick={() => control({ action: 'resume' }).then(() => setLive(true))}>Resume</button>}
        </span>
      </div>
      {queue.items.some(q => q.state === 'waiting' || q.state === 'working') && (
        <div className="console-queue">
          <div className="console-queue-head"><b>Queue</b> <span className="muted">{queueSummary(queue.items)} · sent {queue.batch === 'all' ? 'all at once' : 'one at a time'} when the agent is idle</span>
            <span className="seg small"><button className={queue.batch === 'one' ? 'on' : ''} onClick={() => control({ action: 'batch', batch: 'one' })}>one</button><button className={queue.batch === 'all' ? 'on' : ''} onClick={() => control({ action: 'batch', batch: 'all' })}>batch</button></span></div>
          <QueueList items={queue.items} control={control} />
        </div>
      )}
      <div className="console-log">
        {foldActivity(groupSubagents(flow)).map((g, i) => g.parent
          ? <Subagent key={'s' + i} events={g.events} task={events.find(e => e.kind === 'tool_use' && e.toolUseId === g.parent)} finished={events.some(e => e.kind === 'tool_result' && e.toolUseId === g.parent)} answered={answered} answers={answers} showThinking={showThinking} answer={(requestId, allow, input) => control({ action: 'permission', requestId, allow, input })} />
          : g.activity
            ? <Activity key={'a' + i} events={g.events} live={live && i === foldActivity(groupSubagents(flow)).length - 1} answered={answered} answers={answers} showThinking={showThinking} answer={(requestId, allow, input) => control({ action: 'permission', requestId, allow, input })} />
            : <Event key={i} e={g.events[0]} answered={answered} answers={answers} showThinking={showThinking} answer={(requestId, allow, input) => control({ action: 'permission', requestId, allow, input })} />)}
        <div ref={bottom} />
      </div>
      <form className="console-input" onSubmit={e => { e.preventDefault(); send(); }} onDragOver={attach.onDragOver} onDrop={attach.onDrop}>
        <AttachStrip images={images} remove={attach.remove} />
        <div className="console-row">
          <textarea value={text} rows={2} placeholder={live ? (turnOpen ? 'Queue the next message… (⌘↵; paste images too)' : 'Reply to the agent… (⌘↵ to send; paste images too)') : 'Type to resume the agent…'} onChange={e => setText(e.target.value)} onPaste={attach.onPaste} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); } }} />
          <button className="pri" type="submit" disabled={busy || (!text.trim() && !images.length)}>{fresh ? 'Restart & send' : 'Send'}</button>
        </div>
        <div className="console-fresh">
          <label className="console-opt" title="Before this message the agent restarts from nothing in the same folder — after the current turn when one is open — and reads what it needs from Wye"><input type="checkbox" checked={fresh} onChange={e => setFresh(e.target.checked)} /> clear context first</label>
          {fresh && <label className="console-opt" title="The agent understands, writes the plan on a page and asks before building"><input type="checkbox" checked={plan} onChange={e => setPlan(e.target.checked)} /> plan first</label>}
          {fresh && <span className="muted">{turnOpen ? 'the current turn finishes, then a fresh agent takes this' : 'a fresh agent takes this as its first message'}</span>}
        </div>
      </form>
    </div>
  );
}

function Event({ e, answered, answers, showThinking, answer }: { e: ChatEvent; answered: Set<string | undefined>; answers: Map<string | undefined, unknown | 'denied'>; showThinking: boolean; answer: (requestId: string, allow: boolean, input?: unknown) => void }) {
  void answered;
  const [open, setOpen] = useState(false);
  const time = <time dateTime={e.t} title={e.t}>{e.t.slice(11, 19)}</time>; // hidden until the row is hovered
  switch (e.kind) {
    case 'user': return <div className="ev ev-user">{time}<div className="ev-body"><TranscriptMarkdown>{e.text ?? ''}</TranscriptMarkdown>{e.images && e.images.length > 0 && <div className="ev-images">{e.images.map(u => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="attachment" /></a>)}</div>}
      {/* the first message's Wye wrapper is the agent's, not the person's words: folded (req:wf2.console.first-message-is-the-request) */}
      {e.prompt && e.prompt !== e.text && <details className="ev-prompt"><summary>what the agent received</summary><TranscriptMarkdown>{e.prompt}</TranscriptMarkdown></details>}</div></div>;
    case 'assistant': return <div className="ev ev-assistant">{time}<div className="ev-body"><TranscriptMarkdown>{e.text ?? ''}</TranscriptMarkdown></div></div>;
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
    case 'log': return <div className="ev ev-note ev-log">{time}<span className="muted"><i>log</i> {e.text}</span></div>;
    case 'knowledge': { // each tag carries its change (+ added, ~ changed, − removed) when block attribution knows it
      const ch = new Map((e.changes ?? []).map(c => [c.id, c.change]));
      const prose = (e.changes ?? []).filter(c => c.id.startsWith('block:')).length;
      return <div className="ev ev-note ev-know">{time}<span className="muted"><i>knowledge</i></span><span className="tags">{(e.refs ?? []).map(r => <span key={r} className={ch.has(r) ? `ch-${ch.get(r)}` : ''}><SmartTag id={r} /></span>)}{prose > 0 && <small className="muted">{prose} paragraph{prose === 1 ? '' : 's'}</small>}</span></div>;
    }
    case 'open': return <div className="ev ev-note ev-log">{time}<span className="muted"><i>opened</i> <Link href={e.text ?? '#'}>{e.text}</Link></span></div>;
    case 'summary': return <div className="ev ev-summary">{time}<div className="ev-body"><span className="ev-summary-tag">session summary</span><TranscriptMarkdown>{e.text ?? ''}</TranscriptMarkdown></div></div>;
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
// Runs of tool calls, results and thinking between two messages are one collapsed "activity" row: the count and
// the latest step; open it to read every call. Questions, permissions, messages and turn ends stay in the flow.
const NOISE = new Set(['tool_use', 'tool_result', 'thinking', 'stderr']);
function foldActivity(groups: { parent?: string; events: ChatEvent[] }[]): { parent?: string; activity?: boolean; events: ChatEvent[] }[] {
  const out: { parent?: string; activity?: boolean; events: ChatEvent[] }[] = [];
  for (const g of groups) {
    const e = g.events[0];
    const noise = !g.parent && g.events.length === 1 && NOISE.has(e.kind) && !(e.kind === 'tool_use' && e.name === 'AskUserQuestion');
    const last = out[out.length - 1];
    if (noise && last?.activity) last.events.push(e);
    else if (noise) out.push({ activity: true, events: [e] });
    else out.push(g);
  }
  return out;
}
function Activity({ events, live, answered, answers, showThinking, answer }: { events: ChatEvent[]; live: boolean; answered: Set<string | undefined>; answers: Map<string | undefined, unknown | 'denied'>; showThinking: boolean; answer: (requestId: string, allow: boolean, input?: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const calls = events.filter(e => e.kind === 'tool_use');
  const errors = events.filter(e => e.kind === 'tool_result' && e.isError).length;
  const lastCall = calls[calls.length - 1];
  const input = lastCall?.input as Record<string, unknown> | undefined;
  const step = lastCall ? `${lastCall.name} ${String(input?.command ?? input?.file_path ?? input?.pattern ?? input?.description ?? input?.query ?? '').split('\n')[0]}` : events[events.length - 1].kind;
  const span = (new Date(events[events.length - 1].t).getTime() - new Date(events[0].t).getTime()) / 1000;
  if (calls.length <= 1 && !open && events.length <= 2 && !live) return <>{events.map((e, i) => <Event key={i} e={e} answered={answered} answers={answers} showThinking={showThinking} answer={answer} />)}</>;
  return (
    <div className={`ev ev-act ${open ? 'open' : ''}`}>
      <time dateTime={events[0].t} title={events[0].t}>{events[0].t.slice(11, 19)}</time>
      <div className="ev-act-body">
        <button className="ev-act-head" onClick={() => setOpen(o => !o)} title={open ? 'Collapse' : 'Show every step'}>
          <span className="ev-act-tri">{open ? '▾' : '▸'}</span>
          <b>{calls.length} step{calls.length === 1 ? '' : 's'}</b>
          {span >= 1 && <span className="muted">· {span < 90 ? `${Math.round(span)} s` : `${Math.round(span / 60)} min`}</span>}
          {errors > 0 && <span className="ev-act-err">· {errors} error{errors === 1 ? '' : 's'}</span>}
          {!open && <span className="ev-act-step">{live ? <i className="live-dot" /> : null}{step.slice(0, 140)}</span>}
        </button>
        {open && <div className="ev-act-events">{events.map((e, i) => <Event key={i} e={e} answered={answered} answers={answers} showThinking={showThinking} answer={answer} />)}</div>}
      </div>
    </div>
  );
}
function Subagent({ events, task, finished, answered, answers, showThinking, answer }: { events: ChatEvent[]; task?: ChatEvent; finished: boolean; answered: Set<string | undefined>; answers: Map<string | undefined, unknown | 'denied'>; showThinking: boolean; answer: (requestId: string, allow: boolean, input?: unknown) => void }) {
  const [open, setOpen] = useState(true);
  const input = task?.input as { description?: string; subagent_type?: string; prompt?: string } | undefined;
  const tools = events.filter(e => e.kind === 'tool_use').length;
  const done = finished;
  return (
    <div className="ev ev-sub">
      <time dateTime={events[0].t} title={events[0].t}>{events[0].t.slice(11, 19)}</time>
      <div className="ev-sub-body">
        <button className="ev-sub-head" onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'} <b>subagent</b> {input?.subagent_type ? <span className="muted">{input.subagent_type}</span> : null} <span>{input?.description ?? (input?.prompt ?? '').slice(0, 80)}</span> <span className="muted">· {events.length} events, {tools} tool calls{done ? '' : ' · working'}</span></button>
        {open && <div className="ev-sub-events">{events.map((e, i) => <Event key={i} e={e} answered={answered} answers={answers} showThinking={showThinking} answer={answer} />)}</div>}
      </div>
    </div>
  );
}
