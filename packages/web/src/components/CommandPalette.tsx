'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { AGENTS } from '@/lib/session-types';

// ⌘P / Ctrl+P: a command box in the middle of the screen. What is typed becomes a chat session for an agent that
// plans first — understands which part of the app and the knowledge base the request touches, proposes the change,
// asks for confirmation in the conversation, then builds (rule:plan-first). What the person is looking at (the
// document, the node under the cursor) travels along as context.
export function CommandPalette() {
  const { product, open, editing } = usePeek();
  const path = usePathname();
  const [on, setOn] = useState(false);
  const [text, setText] = useState('');
  const [agent, setAgent] = useState(AGENTS[0].id);
  const [cwd, setCwd] = useState('');
  const [defaults, setDefaults] = useState<{ cwd: string; waterfall: string }>({ cwd: '', waterfall: '' });
  const [plan, setPlan] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setOn(o => !o); }
      else if (e.key === 'Escape' && on) setOn(false);
    };
    // capture phase: the shortcut works wherever the focus is, even inside controls that stop key events
    window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true);
  }, [on]);
  useEffect(() => {
    if (!on) return;
    setMsg(null); setTimeout(() => box.current?.focus(), 0);
    (async () => {
      try {
        const j = await (await fetch(`/api/${product}/sessions`)).json();
        setDefaults(j.defaults ?? { cwd: '', waterfall: '' });
        let remembered = ''; try { remembered = localStorage.getItem(`wf-cwd-${product}`) ?? ''; } catch { /* ignore */ }
        setCwd(c => c || remembered || j.defaults?.cwd || j.defaults?.waterfall || '');
      } catch { /* offline */ }
    })();
  }, [on, product]);
  if (!on) return null;
  // where the person is: the document page and the node under the cursor, so the agent starts from there
  const m = path.match(/^\/[^/]+\/([^/]+)\/d\/([^/#?]+)/);
  const refs = [...new Set([...(editing?.nodeId ? [editing.nodeId] : []), ...(m ? [`module:${m[2]}`] : [])])];
  const source = m ? { project: m[1], doc: m[2], link: `${location.origin}${path}${editing?.nodeId ? `#n-${encodeURIComponent(editing.nodeId)}` : ''}` } : {};
  const run = async () => {
    const instruction = text.trim(); if (!instruction || busy) return;
    if (!cwd.trim()) { setMsg('a working folder is required — the code repository the agent works in'); return; }
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent, instruction, refs, source, mode: 'chat', cwd: cwd.trim(), plan }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not start'); return; }
    try { localStorage.setItem(`wf-cwd-${product}`, cwd.trim()); } catch { /* ignore */ }
    setText(''); setOn(false); open(`session:${j.id}`);
  };
  return createPortal(
    <div className="modal-back palette-back" onMouseDown={e => { if (e.target === e.currentTarget) setOn(false); }}>
      <div className="modal palette" role="dialog" aria-label="Command">
        <textarea ref={box} className="palette-in" value={text} rows={3} placeholder="What should the agent do? — fix …, build …, change … (Enter to run, Shift+Enter for a new line)" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }} disabled={busy} />
        {refs.length > 0 && <div className="palette-ctx"><span className="muted">with</span>{refs.map(id => <SmartTag key={id} id={id} />)}</div>}
        <div className="palette-row">
          <label className="palette-plan" title="The agent reads Waterfall, works out what the request touches, proposes the change and asks you before building">
            <input type="checkbox" checked={plan} onChange={e => setPlan(e.target.checked)} /> plan first — understand, propose, confirm, then build
          </label>
          <select value={agent} onChange={e => setAgent(e.target.value)} title="agent">{AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        </div>
        <div className="palette-row">
          <input className="palette-cwd" value={cwd} placeholder={defaults.cwd || 'working folder: the code repository the agent works in'} onChange={e => setCwd(e.target.value)} spellCheck={false} title="working folder" />
          <button className="palette-go" onClick={run} disabled={!text.trim() || busy}>{busy ? 'Starting…' : plan ? 'Plan & build ↵' : 'Run ↵'}</button>
        </div>
        {msg && <p className="bad palette-msg">{msg}</p>}
        <p className="muted palette-hint">⌘P opens this anywhere · the session opens in the right column; the agent asks you to confirm its plan there</p>
      </div>
    </div>, document.body);
}
