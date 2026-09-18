'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TranscriptMarkdown, keepBreaks } from './TranscriptMarkdown';
import { docTitles, plainAppLinks } from '@/lib/app-link';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { StatusPill } from './Pills';
import { shownStatus } from './SessionList';
import { agentLabel, when } from './SessionView';
import { QueueList } from './QueueList';
import { queueSummary, queueView, type Session } from '@/lib/session-types';
import type { SessionPageData, TodoRow, KindRow } from '@/lib/session-page';

export type SessionPageInitial = SessionPageData & { session: Session };

// The body of page:web/session: the task (instruction, refs, source, follow-up messages), "plan on" (the pages the
// session opened), the todo list with the check state the graph has now, the blocks it touched by kind with their
// status now, the result. Refetches op:api.sessions.page on every graph or session change while the session is live.
export function SessionPage({ product, id, initial }: { product: string; id: string; initial: SessionPageInitial }) {
  const { open, index } = usePeek();
  const [origin, setOrigin] = useState(''); useEffect(() => { setOrigin(window.location.origin); }, []);
  const [d, setD] = useState<SessionPageInitial>(initial);
  const s = d.session;
  const live = s.live || s.busy || s.status === 'running' || s.status === 'queued';
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!live) return;
    const h = (e: Event) => { const k = (e as CustomEvent<{ kinds: string[] }>).detail?.kinds ?? []; if (k.includes('graph') || k.includes('session')) setVersion(v => v + 1); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, [live]);
  useEffect(() => {
    if (version === 0) return;
    let on = true;
    fetch(`/api/${product}/sessions/${id}/page`).then(r => r.ok ? r.json() : null).then(j => { if (on && j) setD(j); });
    return () => { on = false; };
  }, [product, id, version]);
  // the first line of the instruction, app URLs shown as their targets (rule:app-link)
  const title = plainAppLinks(s.instruction.split('\n').find(l => l.trim())?.trim() || '(no instruction)', origin, docTitles(index));
  const counts = [d.counts.added && `+${d.counts.added}`, d.counts.changed && `~${d.counts.changed}`, d.counts.removed && `−${d.counts.removed}`, d.prose && `${d.prose}¶`].filter(Boolean).join(' ');
  const queue = queueView(s.queue, s.batch).items;
  return (
    <div className="page spage">
      <header className="doc-head">
        <p className="crumbs"><Link href={`/${product}/sessions`}>Agents</Link> / session {id.slice(0, 6)}</p>
        <h1 className="prop-in h1" style={{ margin: 0 }}>{title}</h1>
        <p className="sub spage-sub">
          <span className={`pill s ${shownStatus(s)}`} title={s.live ? `process up · recorded status: ${s.status}` : s.status}>{shownStatus(s)}</span>
          <span>{agentLabel(s.agent)}{s.mode === 'chat' ? ' · chat' : ''}{s.plan ? ' · plan-first' : ''} · {when(s.createdAt)}{s.finishedAt ? ` · finished ${when(s.finishedAt)}` : ''}</span>
          {s.cwd && <code>{s.cwd.replace(/^\/Users\/[^/]+/, '~')}</code>}
          <span className="spage-acts">
            <button className="mini" onClick={() => open(`session:${id}`)} title="The conversation, in the context column">conversation</button>
            <Link className="mini linkish" href={`/${product}/sessions/${id}/changes`} title="every block this session changed, per document">changes{counts ? ` ${counts}` : ''}</Link>
          </span>
        </p>
      </header>

      <section className="spage-sec">
        <h2>Task</h2>
        {/* a line break in what the person typed stays a line break */}
        <div className="spage-instruction"><TranscriptMarkdown>{keepBreaks(s.instruction)}</TranscriptMarkdown></div>
        {(s.refs.length > 0 || s.source?.doc) && <p className="tags spage-refs">{s.source?.doc && <small className="muted">from {s.source.project ? `${s.source.project} / ` : ''}{s.source.doc}</small>}{s.refs.map(r => <SmartTag key={r} id={r} />)}</p>}
        {queue.length > 0 && <div className="spage-queue"><h5 className="muted">follow-up messages · {queueSummary(s.queue ?? [])}</h5><QueueList items={queue} control={body => fetch(`/api/${product}/sessions/${id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })} compact /></div>}
      </section>

      {d.opened.length > 0 && (
        <section className="spage-sec">
          <h2>Plan on</h2>
          <ul className="spage-opened">{d.opened.map(o => <li key={o.path}><Link href={o.path}>{o.doc}</Link>{o.node && <> <SmartTag id={o.node} /></>}<small className="muted">{when(o.at)}</small></li>)}</ul>
        </section>)}

      <section className="spage-sec">
        <h2>Todo <span className="muted">{d.todo.length ? `${d.todoDone} of ${d.todo.length} done` : 'none'}</span></h2>
        {d.todo.length === 0 ? <p className="muted small">No task line came out of this session{live ? ' yet' : ''}.</p> : (
          <ul className="spage-todo">{d.todo.map(t => <Todo key={t.id} t={t} onOpen={() => t.exists && open(t.id)} />)}</ul>)}
      </section>

      <section className="spage-sec">
        <h2>Blocks <span className="muted">{counts || 'none'}</span></h2>
        {d.kinds.length === 0 && !d.prose ? <p className="muted small">This session added or changed no block{live ? ' yet' : ''}.</p> : d.kinds.map(k => (
          <div key={k.kind} className="spage-kind">
            <h5>{k.kind} <small className="muted">{k.rows.length}</small></h5>
            <ul className="schanges-list">{k.rows.map(r => <Block key={r.id} r={r} onOpen={() => r.exists && open(r.id)} />)}</ul>
          </div>))}
        {d.prose > 0 && <p className="muted small">{d.prose} paragraph{d.prose === 1 ? '' : 's'} added or changed — <Link href={`/${product}/sessions/${id}/changes`}>per document</Link></p>}
      </section>

      {s.result && <section className="spage-sec"><h2>Result</h2><div className="spage-result"><TranscriptMarkdown>{s.result}</TranscriptMarkdown></div></section>}
    </div>
  );
}

// a task line as the graph has it now: the check state is read-only here (the document or the task's card changes it)
function Todo({ t, onOpen }: { t: TodoRow; onOpen: () => void }) {
  return (
    <li className={`spage-task ${t.done ? 'done' : ''} ${t.exists ? '' : 'gone'}`} onClick={onOpen} role={t.exists ? 'button' : undefined} title={t.exists ? 'open in the context column' : 'no longer in the documents'}>
      <input type="checkbox" checked={t.done} readOnly tabIndex={-1} />
      {t.change && <span className={`badge ch-${t.change}`}>{t.change === 'added' ? '+' : t.change === 'changed' ? '~' : '−'}</span>}
      <SmartTag id={t.id} />
      <span className="schange-title">{t.title !== t.id && !t.id.endsWith(':' + t.title) ? t.title : ''}</span>
      {t.status && t.status !== 'done' && t.status !== 'open' && <StatusPill status={t.status} />}
      {t.partOf && <small className="muted spage-partof">part of <SmartTag id={t.partOf} /></small>}
    </li>
  );
}
function Block({ r, onOpen }: { r: KindRow; onOpen: () => void }) {
  return (
    <li className={`schange ch-${r.change} ${r.exists ? '' : 'gone'}`} onClick={onOpen} role={r.exists ? 'button' : undefined} title={r.exists ? 'open in the context column' : 'no longer in the documents'}>
      <span className={`badge ch-${r.change}`}>{r.change === 'added' ? '+' : r.change === 'changed' ? '~' : '−'}</span>
      <SmartTag id={r.id} />{r.status && <StatusPill status={r.status} />}
      <span className="schange-title">{r.title !== r.id && !r.id.endsWith(':' + r.title) ? r.title : ''}</span>
      <small className="muted"><SmartTag id={r.doc} /></small>
    </li>
  );
}
