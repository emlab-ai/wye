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
import { loadRecent, rememberRecent } from '@/lib/recent';

// The one command box (decision:wf2.one-command-box): ⌘P / Ctrl+P opens it with what the person is looking at (the
// document, the node under the cursor); every "Send to agent" opens it with the block's text, refs and source
// prefilled (requestSend). Two modes (decision:wf2.cmd-modes), remembered per browser: PR — what is typed becomes a
// Prompt Request: a page under PRs, a refining librarian session on it until the person approves it there; Ad-hoc —
// a conversation with a coding agent on what you are looking at, no page (rule:clean-slate: a fresh agent reads what
// it needs from Wye; the agent and the folder are the ones used last), or a message into an active conversation
// chosen in "to" — with "clear context first" ticked that conversation's agent restarts from nothing — or queued for
// a runner; Workflow — a run of a named pipeline on what you are looking at (decision:wf2.workflow-is-a-skill): the
// stages produce their documents and each one waits for your Advance, and with nothing under the cursor the typed idea
// becomes the document the run starts from. Images pasted or dropped into the box go along (req:wf2.ui.palette-images).
export type CmdMode = 'pr' | 'adhoc' | 'workflow' | 'remember';
// the box's modes, in the order ⌘1–4 picks them
const MODES: { key: CmdMode; label: string; icon: string; title: string }[] = [
  { key: 'pr', label: 'PR', icon: '◆', title: 'A Prompt Request: a page under PRs, refined with Wye until it is clear, approved by you, then built' },
  { key: 'adhoc', label: 'Ad-hoc', icon: '⇢', title: 'A conversation with a coding agent on what you are looking at' },
  { key: 'workflow', label: 'Workflow', icon: '⇉', title: 'Run a workflow: each stage writes its document and waits for you' },
  { key: 'remember', label: 'Remember', icon: '✦', title: 'Paste information: Wye files it as knowledge, linked to what it knows' },
];
// `mode` opens the box in that mode whatever was used last (⌘M → remember)
export type SendRequest = { text?: string; refs?: string[]; source?: { project?: string; doc?: string; blockId?: string; link?: string }; mode?: CmdMode };
export function requestSend(detail: SendRequest) { window.dispatchEvent(new CustomEvent('wf:send', { detail })); }
type Live = Session & { live?: boolean };
const refsOf = (r: SendRequest | null) => r?.refs ?? [];

export function CommandBox() {
  const { product, open, editing, index } = usePeek();
  const path = usePathname();
  const [req, setReq] = useState<SendRequest | null>(null); // null: closed
  const [text, setText] = useState('');
  const [sessions, setSessions] = useState<Live[]>([]);
  const [target, setTarget] = useState<string>('new'); // session id | 'new' | 'runner'
  const [agent, setAgent] = useState(AGENTS[0].id);
  const [cwd, setCwd] = useState('');
  const [defaults, setDefaults] = useState<{ cwd: string; wye: string }>({ cwd: '', wye: '' });
  const [mode, setModeState] = useState<CmdMode>('pr');
  const [workflows, setWorkflows] = useState<{ id: string; title: string; stages: { id: string; title: string }[] }[]>([]);
  const [wf, setWf] = useState('');
  const [attachTo, setAttachTo] = useState<Attach>({ skills: [], hooks: [] }); // skills / hooks for the request (decision:wf2.hooks-and-skills)
  const setMode = (m: CmdMode) => { setModeState(m); try { localStorage.setItem('wf-cmd-mode', m); } catch { /* ignore */ } };
  const [fresh, setFresh] = useState(false); // clear context first, when the target is a live conversation
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // what was sent before, per product (task:palette-recent-commands): ↑ in the empty box walks back, ↓ forward,
  // Escape leaves the history; `at` is where the walk is, -1 when the box is the person's own text
  const [recent, setRecent] = useState<string[]>([]);
  const [at, setAt] = useState(-1);
  const remember = (sent: string) => { setRecent(rememberRecent(product, sent)); setAt(-1); };
  const attach = useImageAttachments();
  const box = useRef<HTMLTextAreaElement>(null);
  // where the person is: the document page and the node under the cursor, so the agent starts from there
  const m = path.match(/^\/[^/]+\/([^/]+)\/d\/([^/#?]+)/);
  const here = (): SendRequest => ({ refs: [...new Set([...(editing?.nodeId ? [editing.nodeId] : []), ...(m ? [docNodeOf(index, m[2]) ?? []].flat() : [])])], source: m ? { project: m[1], doc: m[2], link: `${location.origin}${path}${editing?.nodeId ? `#n-${encodeURIComponent(editing.nodeId)}` : ''}` } : {} });
  const show = (d: SendRequest) => {
    const ids = d.refs?.length ? d.refs.join(', ') : '';
    setText(d.text ? `${ids ? `Work on ${ids}.\n\n` : ''}${d.text.trim()}` : '');
    setReq(d); setMsg(null); setFresh(false); attach.clear(); setAt(-1); setRecent(loadRecent(product));
  };
  // the history keys: ↑ from an empty box recalls the last command, then walks back; ↓ walks forward and out of it
  const history = (e: { key: string; preventDefault: () => void }): boolean => {
    if (e.key === 'ArrowUp' && (at >= 0 || !text.trim())) {
      const n = Math.min(at + 1, recent.length - 1);
      if (n < 0 || n === at) return false;
      e.preventDefault(); setAt(n); setText(recent[n]); return true;
    }
    if (e.key === 'ArrowDown' && at >= 0) {
      const n = at - 1;
      e.preventDefault(); setAt(n); setText(n < 0 ? '' : recent[n]); return true;
    }
    return false;
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); if (req) setReq(null); else show(here()); }
      // ⌘M (Ctrl+M in a browser, where ⌘M minimizes the window): the box in Remember mode — paste, and Wye files it
      else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); if (req && mode === 'remember') setReq(null); else { show({ ...here(), mode: 'remember' }); setModeState('remember'); } }
      else if (req && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); setMode(MODES[Number(e.key) - 1].key); }
      // Escape leaves a recalled command behind first, and closes the box on the next press (task:palette-recent-commands)
      else if (e.key === 'Escape' && req) { if (at >= 0) { e.preventDefault(); e.stopPropagation(); setAt(-1); setText(''); } else setReq(null); }
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
        setSessions(active); setDefaults(j.defaults ?? { cwd: '', wye: '' });
        let remembered = '', lastAgent = '', lastMode = ''; try { remembered = localStorage.getItem(`wf-cwd-${product}`) ?? ''; lastAgent = localStorage.getItem(`wf-agent-${product}`) ?? ''; lastMode = localStorage.getItem('wf-cmd-mode') ?? ''; } catch { /* ignore */ }
        if (req.mode) setModeState(req.mode);
        else if (lastMode === 'adhoc' || lastMode === 'pr' || lastMode === 'workflow' || lastMode === 'remember') setModeState(lastMode);
        // on a PR page with a live conversation the box talks to that PR (decision:wf2.pr-talk); else a clean slate (rule:clean-slate)
        const here = m ? index[docNodeOf(index, m[2]) ?? ''] : undefined;
        const mine = here?.kind === 'pr' ? active.find(s => (here.sessions ?? []).includes(s.id)) : undefined;
        if (mine && !req.mode) { setTarget(mine.id); setModeState('adhoc'); } else setTarget('new');
        setCwd(c => c || remembered || j.defaults?.cwd || j.defaults?.wye || '');
        if (AGENTS.some(a => a.id === lastAgent)) setAgent(lastAgent);
      } catch { setSessions([]); setTarget('new'); }
    })();
  }, [req, product]);
  // the workflows that run on what the box was opened on (decision:wf2.workflow-is-a-skill): `takes:` filters them
  useEffect(() => {
    if (!req || mode !== 'workflow') return;
    const on = req.refs?.[0];
    let live = true;
    fetch(`/api/${product}/workflows${on ? `?node=${encodeURIComponent(on)}` : ''}`).then(r => r.ok ? r.json() : { workflows: [] })
      .then(j => { if (!live) return; setWorkflows(j.workflows ?? []); setWf(w => (j.workflows ?? []).some((x: { id: string }) => x.id === w) ? w : j.workflows?.[0]?.id ?? ''); })
      .catch(() => { if (live) setWorkflows([]); });
    return () => { live = false; };
  }, [req, product, mode]);
  if (!req) return null;
  const isPr = mode === 'pr';
  const isWf = mode === 'workflow';
  const isRem = mode === 'remember';
  const isNew = isPr || isRem || target === 'new' || target === 'runner';
  const run = async () => {
    const instruction = text.trim(); if ((!instruction && !attach.images.length) || busy) return;
    // A workflow on what you are looking at (decision:wf2.workflow-is-a-skill). With no node under the cursor the idea
    // has nothing to hang on, so the box makes the document first and runs on that — "I had an idea" and "start from
    // this document" are then the same mechanism.
    if (isWf) {
      if (!wf) { setMsg('no workflow runs on this'); return; }
      setBusy(true); setMsg(null);
      let on = req.refs?.[0] ?? '';
      if (!on) {
        const project = req.source?.project || await fetch(`/api/${product}/projects`).then(r => r.json()).then(j => j.main ?? j.projects?.[0]?.slug ?? '').catch(() => '');
        if (!project) { setMsg('no project to put the idea in'); setBusy(false); return; }
        const title = instruction.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80);
        if (!title) { setMsg('type the idea first — its first line names the document'); setBusy(false); return; }
        const made = await fetch(`/api/${product}/${project}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, template: 'blank' }) }).then(r => r.json()).catch(() => ({}));
        if (!made.ok) { setMsg(made.message ?? 'the document could not be created'); setBusy(false); return; }
        on = made.node;
      }
      const r = await fetch(`/api/${product}/workflows`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: wf, on }) });
      const j = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) { setMsg(j.message ?? 'the run could not be started'); return; }
      remember(instruction);
      setReq(null); open(on); return;
    }
    if (isRem) {
      // Remember (skill:remember): a librarian files what was pasted as knowledge, linked to what exists — no PR
      setBusy(true); setMsg(null);
      const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ remember: true, instruction, refs: req.refs ?? [], source: { ...(req.source ?? {}) }, images: attach.images }) });
      const j = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not start'); return; }
      remember(instruction);
      setReq(null); open(`session:${j.id}`); return;
    }
    if (isPr) {
      // a Prompt Request (decision:wf2.cmd-modes): the page is created as draft, a librarian refines it (decision:exec.librarian-on-the-host)
      setBusy(true); setMsg(null);
      const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pr: true, instruction, refs: req.refs ?? [], source: { ...(req.source ?? {}), ...(req.text ? { text: req.text.slice(0, 2000) } : {}) }, images: attach.images, skills: attachTo.skills, hooks: attachTo.hooks }) });
      const j = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not start'); return; }
      remember(instruction);
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
      remember(instruction);
      setReq(null); open(`session:${target}`); return;
    }
    const sessionMode = target === 'runner' ? 'run' : 'chat';
    const source = { ...(req.source ?? {}), ...(req.text ? { text: req.text.slice(0, 2000) } : {}) };
    const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent, instruction, refs, source, mode: sessionMode, cwd: cwd.trim(), pr: false, images: attach.images }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not start'); return; }
    try { localStorage.setItem(`wf-cwd-${product}`, cwd.trim()); localStorage.setItem(`wf-agent-${product}`, agent); } catch { /* ignore */ }
    remember(instruction);
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
    remember(instruction);
    setReq(null); open(j.id);
  };
  const label = (s: Live) => `${AGENTS.find(a => a.id === s.agent)?.label ?? s.agent} · ${s.instruction.split('\n').find(l => l.trim())?.slice(0, 50) ?? s.id}`;
  const refs = req.refs ?? [];
  const M = MODES.find(m => m.key === mode) ?? MODES[0];
  const placeholder = isRem ? 'Paste notes, a message, an update…' : isWf ? 'The idea, in a line or two' : isPr ? 'What do you want to change?' : isNew ? 'What should the agent do?' : 'Your next message to that conversation';
  const about = isPr ? 'A Prompt Request — Wye\u2019s librarian on Claude Code reads what the product knows, asks what it must and proposes the blocks; you approve on the PR\u2019s page before anything is built.'
    : isRem ? 'Filed as knowledge in the right documents, linked to what Wye already knows — by Wye\u2019s librarian on Claude Code. You review it in the Inbox.'
    : isWf ? 'Runs a workflow on what you are looking at — each stage writes its document and waits for you to advance it.'
    : !isNew ? (fresh ? 'Restarts that conversation\u2019s agent from nothing, then sends this as its first message.' : 'Goes into that conversation as your next message; the agent keeps its context and folder.')
    : target === 'runner' ? 'Queued until a runner for that agent picks it up (wye agent listen).' : 'A conversation with a coding agent on what you are looking at — nothing is written unless you ask.';
  const verb = busy ? 'Sending…' : isWf ? 'Run' : isRem ? 'Remember' : isPr ? 'Start the PR' : !isNew ? (fresh ? 'Restart & send' : 'Send') : target === 'runner' ? 'Queue' : 'Talk';
  const canLater = isNew && !isWf && !isRem;
  const empty = !text.trim() && !attach.images.length && !(isWf && refsOf(req).length);
  return createPortal(
    <div className="modal-back palette-back" onMouseDown={e => { if (e.target === e.currentTarget) setReq(null); }}>
      <div className={`modal palette mode-${mode}`} role="dialog" aria-label="Command" onDragOver={attach.onDragOver} onDrop={attach.onDrop}>
        <div className="palette-modes" role="tablist" aria-label="Mode">
          {MODES.map((m, i) => <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} className={`pm ${mode === m.key ? 'on' : ''}`} onClick={() => setMode(m.key)} title={`${m.title} (⌘${i + 1})`}><i aria-hidden>{m.icon}</i>{m.label}</button>)}
        </div>
        <textarea ref={box} className="palette-in" value={text} rows={text.split('\n').length > 3 ? 6 : 3} placeholder={placeholder} onChange={e => setText(e.target.value)} onPaste={attach.onPaste} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (e.altKey && canLater) later(); else run(); } else history(e); }} disabled={busy} />
        <AttachStrip images={attach.images} remove={attach.remove} />
        {refs.length > 0 && <div className="palette-ctx"><span className="muted">with</span>{refs.map(id => <SmartTag key={id} id={id} />)}{req.source?.blockId && <span className="muted">· this block</span>}</div>}
        <div className="palette-opts">
          <p className="palette-about"><i aria-hidden>{M.icon}</i><span>{about}</span></p>
          {isWf && <div className="palette-fields">
            <label className="palette-field"><span>Workflow</span>
              <select value={wf} onChange={e => setWf(e.target.value)}>
                {workflows.length === 0 && <option value="">no workflow runs on this</option>}
                {workflows.map(w => <option key={w.id} value={w.id}>{w.title} — {w.stages.length} stages</option>)}
              </select>
            </label>
            <span className="muted palette-note">{(() => { const w = workflows.find(x => x.id === wf); const on = refsOf(req)[0]; return w ? `${on ? `on ${on}` : 'the first line becomes a new document'} · stage 1 of ${w.stages.length}: ${w.stages[0]?.title ?? ''}` : ''; })()}</span>
          </div>}
          {mode === 'adhoc' && <div className="palette-fields">
            <label className="palette-field"><span>To</span>
              <select value={target} onChange={e => setTarget(e.target.value)}>
                {sessions.length > 0 && <optgroup label="active conversations">{sessions.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}</optgroup>}
                <optgroup label="new"><option value="new">New conversation</option><option value="runner">Queue for a runner</option></optgroup>
              </select>
            </label>
            {isNew && <label className="palette-field"><span>Agent</span><select value={agent} onChange={e => setAgent(e.target.value)}>{AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>}
            {target === 'new' && <label className="palette-field palette-field-wide"><span>Folder</span><input className="palette-cwd" value={cwd} placeholder={defaults.cwd || 'the code repository the agent works in'} onChange={e => setCwd(e.target.value)} spellCheck={false} /></label>}
            {!isNew && <label className="palette-check" title="Stop that agent and start a fresh one in the same folder before this message: it forgets the conversation so far and reads what it needs from Wye"><input type="checkbox" checked={fresh} onChange={e => setFresh(e.target.checked)} /> clear context first</label>}
          </div>}
          {isPr && <div className="palette-fields"><AttachPicker product={product} value={attachTo} onChange={setAttachTo} compact /></div>}
        </div>
        {msg && <p className="bad palette-msg">{msg}</p>}
        <div className="palette-actions">
          {canLater && <button className="palette-later" onClick={later} disabled={!text.trim() || busy} title="Keep it as a task on the backlog — unassigned, on the Work view — without sending it to anyone">Later <kbd>⌥↵</kbd></button>}
          <button className="palette-go" onClick={run} disabled={empty || busy}>{verb}{!busy && <kbd>↵</kbd>}</button>
        </div>
        <p className="muted palette-hint">↵ {verb.replace(/^./, c => c.toLowerCase())} · ⇧↵ new line{canLater ? ' · ⌥↵ later' : ''}{recent.length > 0 ? ' · ↑ what you asked before' : ''} · ⌘1–4 mode · {isRem ? '⌘M' : '⌘P'} opens this anywhere · Esc close</p>
      </div>
    </div>, document.body);
}
