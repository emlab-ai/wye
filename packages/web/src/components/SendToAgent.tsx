'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { AGENTS } from '@/lib/session-types';

// The "Send to agent" dialog. Anything in the UI opens it by dispatching a `wf:send` window event with
// { text, refs, source }; sending creates a queued session and opens it in the right column.
export type SendRequest = { text?: string; refs?: string[]; source?: { project?: string; doc?: string; blockId?: string } };
export function requestSend(detail: SendRequest) { window.dispatchEvent(new CustomEvent('wf:send', { detail })); }

export function SendToAgentHost() {
  const { product, open } = usePeek();
  const [req, setReq] = useState<SendRequest | null>(null);
  const [agent, setAgent] = useState(AGENTS[0].id);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<SendRequest>).detail;
      setReq(d); setMsg(null);
      const ids = d.refs?.length ? d.refs.join(', ') : '';
      setInstruction(d.text ? `${ids ? `Work on ${ids}.\n\n` : ''}${d.text.trim()}` : ids ? `Work on ${ids}.` : '');
    };
    window.addEventListener('wf:send', h); return () => window.removeEventListener('wf:send', h);
  }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setReq(null); }; if (req) window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [req]);
  if (!req) return null;
  const send = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent, instruction, refs: req.refs ?? [], source: { ...(req.source ?? {}), text: req.text?.slice(0, 2000) } }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setReq(null); open(`session:${j.id}`);
  };
  return createPortal(
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) setReq(null); }}>
      <div className="modal send" role="dialog" aria-label="Send to agent">
        <h3>Send to agent</h3>
        {req.refs && req.refs.length > 0 && <div className="tags send-refs">{req.refs.map(id => <SmartTag key={id} id={id} />)}</div>}
        <label className="send-field"><span>agent</span>
          <select value={agent} onChange={e => setAgent(e.target.value)}>{AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        </label>
        <label className="send-field"><span>instruction</span>
          <textarea autoFocus rows={7} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="What should the agent do with this?" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }} />
        </label>
        {req.source?.doc && <p className="muted send-src">from {req.source.project ? `${req.source.project} / ` : ''}{req.source.doc}{req.source.blockId ? ' · this block' : ''} — the session carries the block text and the ids above as context.</p>}
        <div className="sec-actions"><button className="pri" disabled={busy || !instruction.trim()} onClick={send}>{busy ? 'Sending…' : 'Send'}</button><button onClick={() => setReq(null)}>Cancel</button>{msg && <span className="notice">{msg}</span>}<span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>⌘↵ to send</span></div>
      </div>
    </div>, document.body);
}
