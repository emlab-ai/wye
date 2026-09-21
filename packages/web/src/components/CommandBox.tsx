'use client';
import { AttachPicker, type Attach } from './AttachPicker';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { docNodeOf } from '@/lib/doc';
import { prDocPath } from '@/lib/pr-doc';
import { SmartTag } from './SmartTag';
import { AGENTS, type Session } from '@/lib/session-types';
import { AttachStrip, useImageAttachments } from './Attachments';

// The one command box (decision:wf2.one-command-box): ⌘P / Ctrl+P opens it with what the person is looking at (the
// document, the node under the cursor); every "Send to agent" opens it with the block's text, refs and source
// prefilled (requestSend). Two modes (decision:wf2.cmd-modes), remembered per browser: PR — what is typed becomes a
// Prompt Request: a page under PRs, a refining librarian session on it until the person approves it there; Ad-hoc —
// a conversation with a coding agent on what you are looking at, no page (rule:clean-slate: a fresh agent reads what
// it needs from Wye; the agent and the folder are the ones used last), or a message into an active conversation
// chosen in "to" — with "clear context first" ticked that conversation's agent restarts from nothing — or queued for
// a runner. Images pasted or dropped into the box go along (req:wf2.ui.palette-images).
export type SendRequest = { text?: string; refs?: string[]; source?: { project?: string; doc?: string; blockId?: string; link?: string } };
export function requestSend(detail: SendRequest) { window.dispatchEvent(new CustomEvent('wf:send', { detail })); }
type Live = Session & { live?: boolean };

export function CommandBox() {
  const { product, open, editing, index } = usePeek();
  const path = usePathname();
  const [req, setReq] = useState<SendRequest | null>(null); // null: closed
  const [text, setText] = useState('');
  const [sessions, setSessions] = useState<Live[]>([]);
  const [target, setTarget] = useState<string>('new'); // session id | 'new' | 'runner'
  const [agent, setAgent] = useState(AGENTS[0].id);
  const [cwd, setCwd] = useState('');
  const [defaults, setDefaults] = useState<{ cwd: string; waterfall: string }>({ cwd: '', waterfall: '' });
  const [mode, setModeState] = useState<'pr' | 'adhoc'>('pr');
  const [attachTo, setAttachTo] = useState<Attach>({ skills: [], hooks: [] }); // skills / hooks for the request (decision:wf2.hooks-and-skills)
  const setMode = (m: 'pr' | 'adhoc') => { setModeState(m); try { localStorage.setItem('wf-cmd-mode', m); } catch { /* ignore */ } };
  const [fresh, setFresh] = useState(false); // clear context first, when the target is a live conversation
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const attach = useImageAttachments();
  const box = useRef<HTMLTextAreaElement>(null);
  // where the person is: the document page and the node under the cursor, so the agent starts from there
  const m = path.match(/^\/[^/]+\/([^/]+)\/d\/([^/#?]+)/);
  const here = (): SendRequest => ({ refs: [...new Set([...(editing?.nodeId ? [editing.nodeId] : []), ...(m ? [docNodeOf(index, m[2]) ?? []].flat() : [])])], source: m ? { project: m[1], doc: m[2], link: `${location.origin}${path}${editing?.nodeId ? `#n-${encodeURIComponent(editing.nodeId)}` : ''}` } : {} });
  const show = (d: SendRequest) => {
    const ids = d.refs?.length ? d.refs.join(', ') : '';
    setText(d.text ? `${ids ? `Work on ${ids}.\n\n` : ''}${d.text.trim()}` : '');
    setReq(d); setMsg(null); setFresh(false); attach.clear();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); if (req) setReq(null); else show(here()); }
      else if (e.key === 'Escape' && req) setReq(null);
    };
    const send = (e: Event) => show((e as CustomEvent<SendRequest>).detail);
    // capture phase: the shortcut works wherever the focus is, even inside controls that stop key events
    window.addEventListener('keydown', key, true); window.addEventListener('wf:send', send);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('wf:send', send); };
  }); // no deps: `here` and `req` are read fresh on every event
  useEffect(() => {
    if (!req) return;
    setTimeout(() => box.current?.focus(), 0);
    (async () => {
      try {
        const j = await (await fetch(`/api/${product}/sessions`)).json();
        const active = (j.sessions as Live[]).filter(s => s.mode === 'chat' && s.live).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setSessions(active); setDefaults(j.defaults ?? { cwd: '', waterfall: '' });
        let remembered = '', lastAgent = '', lastMode = ''; try { remembered = localStorage.getItem(`wf-cwd-${product}`) ?? ''; lastAgent = localStorage.getItem(`wf-agent-${product}`) ?? ''; lastMode = localStorage.getItem('wf-cmd-mode') ?? ''; } catch { /* ignore */ }
        if (lastMode === 'adhoc' || lastMode === 'pr') setModeState(lastMode);
        // on a PR page with a live conversation the box talks to that PR (decision:wf2.pr-talk); else a clean slate (rule:clean-slate)
        const here = m ? index[docNodeOf(index, m[2]) ?? ''] : undefined;
        const mine = here?.kind === 'pr' ? active.find(s => (here.sessions ?? []).includes(s.id)) : undefined;
        if (mine) { setTarget(mine.id); setModeState('adhoc'); } else setTarget('new');
        setCwd(c => c || remembered || j.defaults?.cwd || j.defaults?.waterfall || '');
        if (AGENTS.some(a => a.id === lastAgent)) setAgent(lastAgent);
      } catch { setSessions([]); setTarget('new'); }
    })();
  }, [req, product]);
  if (!req) return null;
  const isPr = mode === 'pr';
  const isNew = isPr || target === 'new' || target === 'runner';
  const run = async () => {
    const instruction = text.trim(); if ((!instruction && !attach.images.length) || busy) return;
    if (isPr) {
      // a Prompt Request (decision:wf2.cmd-modes): the page is created as draft, a librarian refines it (decision:exec.librarian-on-the-host)
      setBusy(true); setMsg(null);
      const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pr: true, instruction, refs: req.refs ?? [], source: { ...(req.source ?? {}), ...(req.text ? { text: req.text.slice(0, 2000) } : {}) }, images: attach.images, skills: attachTo.skills, hooks: attachTo.hooks }) });
      const j = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not start'); return; }
      // the PR's page, the conversation in the column
      setReq(null); open(`session:${j.id}`); if (j.prDoc) location.assign(prDocPath(j.prDoc)); return;
    }
    if (target === 'new' && !cwd.trim()) { setMsg('a working folder is required — the code repository the agent works in'); return; }
    setBusy(true); setMsg(null);
    const refs = req.refs ?? [];
    if (!isNew) {
      const r = await fetch(`/api/${product}/sessions/${target}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: instruction, refs, link: req.source?.link, images: attach.images, fresh }) });
      const j = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not send'); return; }
      setReq(null); open(`session:${target}`); return;
    }
    const sessionMode = target === 'runner' ? 'run' : 'chat';
    const source = { ...(req.source ?? {}), ...(req.text ? { text: req.text.slice(0, 2000) } : {}) };
    const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent, instruction, refs, source, mode: sessionMode, cwd: cwd.trim(), pr: false, images: attach.images }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not start'); return; }
    try { localStorage.setItem(`wf-cwd-${product}`, cwd.trim()); localStorage.setItem(`wf-agent-${product}`, agent); } catch { /* ignore */ }
    setReq(null); open(`session:${j.id}`);
  };
  // Later (req:exec.capture, decision:exec.backlog-is-unassigned-work): the text becomes a task line — under the node
  // it was opened on, else on the project's plan document — unassigned, on the Work view at once; nothing is sent.
  const later = async () => {
    const instruction = text.trim(); if (!instruction || busy) return;
    setBusy(true); setMsg(null);
    let me = ''; try { me = localStorage.getItem('wf-me') ?? ''; } catch { /* ignore */ }
    const partOf = (req.refs ?? []).find(r => !/^(module|pr|block|session):/.test(r));
    const r = await fetch(`/api/${product}/work`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: instruction, partOf, project: req.source?.project, by: me || undefined }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not capture'); return; }
    setReq(null); open(j.id);
  };
  const label = (s: Live) => `${AGENTS.find(a => a.id === s.agent)?.label ?? s.agent} · ${s.instruction.split('\n').find(l => l.trim())?.slice(0, 50) ?? s.id}`;
  const refs = req.refs ?? [];
  return createPortal(
    <div className="modal-back palette-back" onMouseDown={e => { if (e.target === e.currentTarget) setReq(null); }}>
      <div className="modal palette" role="dialog" aria-label="Command" onDragOver={attach.onDragOver} onDrop={attach.onDrop}>
        <textarea ref={box} className="palette-in" value={text} rows={text.split('\n').length > 3 ? 6 : 3} placeholder={isPr ? 'What do you want? — improve …, allow …, change … (Enter starts the PR; Shift+Enter for a new line)' : isNew ? 'What should the agent do? — fix …, build …, change … (Enter to run, Shift+Enter for a new line; paste a screenshot too)' : 'Your next message to that conversation (Enter to send, Shift+Enter for a new line; paste a screenshot too)'} onChange={e => setText(e.target.value)} onPaste={attach.onPaste} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (e.altKey) later(); else run(); } }} disabled={busy} />
        <AttachStrip images={attach.images} remove={attach.remove} />
        {refs.length > 0 && <div className="palette-ctx"><span className="muted">with</span>{refs.map(id => <SmartTag key={id} id={id} />)}{req.source?.blockId && <span className="muted">· this block</span>}</div>}
        <div className="palette-row palette-intent" role="radiogroup" aria-label="Mode">
          <button type="button" className={`chip ${isPr ? 'on' : ''}`} onClick={() => setMode('pr')} title="A Prompt Request: a page under PRs, refined with Wye until it is clear, approved by you, then built">PR</button>
          <button type="button" className={`chip ${!isPr ? 'on' : ''}`} onClick={() => setMode('adhoc')} title="A conversation with a coding agent on what you are looking at; nothing is written unless you ask">Ad-hoc</button>
          <span className="muted palette-note">{isPr ? 'a request: refine → approve → build' : 'a conversation, no PR'}</span>
        </div>
        {!isPr && <div className="palette-row">
          <label className="palette-to"><span className="muted">to</span>
            <select value={target} onChange={e => setTarget(e.target.value)} title="where the message goes">
              {sessions.length > 0 && <optgroup label="active conversations">{sessions.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}</optgroup>}
              <optgroup label="new"><option value="new">New conversation — a coding agent</option><option value="runner">Queue for a runner (wye agent listen)</option></optgroup>
            </select>
          </label>
          {isNew && <select value={agent} onChange={e => setAgent(e.target.value)} title="agent">{AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>}
        </div>}
        {isPr && <div className="palette-row"><AttachPicker product={product} value={attachTo} onChange={setAttachTo} compact /></div>}
        {isPr && <div className="palette-row"><span className="muted palette-note">Wye reads what the product already knows, explains the current state, asks what it must, and proposes the requirements, decisions, questions and tasks as blocks on the PR's page — you approve there; nothing is built before that</span></div>}
        {!isNew && (
          <div className="palette-row">
            <label className="palette-plan" title="Stop that agent and start a fresh one in the same folder before this message: it forgets the conversation so far and reads what it needs from Wye">
              <input type="checkbox" checked={fresh} onChange={e => setFresh(e.target.checked)} /> clear context first — a fresh agent, same folder, for an unrelated task
            </label>
          </div>
        )}
        <div className="palette-row">
          {!isPr && target === 'new' && <input className="palette-cwd" value={cwd} placeholder={defaults.cwd || 'working folder: the code repository the agent works in'} onChange={e => setCwd(e.target.value)} spellCheck={false} title="working folder" />}
          {!isNew && <span className="muted palette-note">{fresh ? 'restarts that conversation\u2019s agent from nothing — after its current turn when one is open — then sends this as its first message' : 'goes into that conversation as your next message; the agent keeps its context and folder'}</span>}
          {target === 'runner' && <span className="muted palette-note">queued until a runner for that agent picks it up</span>}
          {isNew && <button className="palette-later" onClick={later} disabled={!text.trim() || busy} title="Keep it as a task on the backlog — unassigned, on the Work view — without sending it to anyone (⌥↵)">Later</button>}
          <button className="palette-go" onClick={run} disabled={(!text.trim() && !attach.images.length) || busy}>{busy ? 'Sending…' : isPr ? 'Start the PR ↵' : !isNew ? (fresh ? 'Restart & send ↵' : 'Send ↵') : target === 'runner' ? 'Queue ↵' : 'Talk ↵'}</button>
        </div>
        {msg && <p className="bad palette-msg">{msg}</p>}
        <p className="muted palette-hint">⌘P opens this anywhere · Send to agent on any block opens it with the block · the conversation opens in the right column · Later (⌥↵) keeps it as a task for anyone</p>
      </div>
    </div>, document.body);
}
