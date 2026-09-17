'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { AGENTS, type Session } from '@/lib/session-types';

// "Send to agent": a block, node or free text goes into an ACTIVE conversation (a running chat session, which always
// has a working folder), or starts a new one — a new conversation needs an agent and a folder. Anything in the UI
// opens the dialog by dispatching a `wf:send` window event with { text, refs, source }.
export type SendRequest = { text?: string; refs?: string[]; source?: { project?: string; doc?: string; blockId?: string; link?: string } };
export function requestSend(detail: SendRequest) { window.dispatchEvent(new CustomEvent('wf:send', { detail })); }
type Live = Session & { live?: boolean };

export function SendToAgentHost() {
  const { product, open } = usePeek();
  const [req, setReq] = useState<SendRequest | null>(null);
  const [sessions, setSessions] = useState<Live[]>([]);
  const [defaults, setDefaults] = useState<{ cwd: string; waterfall: string }>({ cwd: '', waterfall: '' });
  const [target, setTarget] = useState<string>('new'); // session id or 'new' | 'runner'
  const [agent, setAgent] = useState(AGENTS[0].id);
  const [cwd, setCwd] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const h = async (e: Event) => {
      const d = (e as CustomEvent<SendRequest>).detail;
      setReq(d); setMsg(null);
      const ids = d.refs?.length ? d.refs.join(', ') : '';
      setInstruction(d.text ? `${ids ? `Work on ${ids}.\n\n` : ''}${d.text.trim()}` : ids ? `Work on ${ids}.` : '');
      try {
        const j = await (await fetch(`/api/${product}/sessions`)).json();
        const active = (j.sessions as Live[]).filter(s => s.mode === 'chat' && s.live);
        setSessions(active); setDefaults(j.defaults ?? { cwd: '', waterfall: '' });
        setTarget(active[0]?.id ?? 'new');
        let remembered = ''; try { remembered = localStorage.getItem(`wf-cwd-${product}`) ?? ''; } catch { /* ignore */ }
        setCwd(remembered || j.defaults?.cwd || '');
      } catch { setSessions([]); setTarget('new'); }
    };
    window.addEventListener('wf:send', h); return () => window.removeEventListener('wf:send', h);
  }, [product]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setReq(null); }; if (req) window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [req]);
  if (!req) return null;
  const isNew = target === 'new' || target === 'runner';
  const send = async () => {
    setBusy(true); setMsg(null);
    if (!isNew) {
      const r = await fetch(`/api/${product}/sessions/${target}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: instruction, refs: req.refs ?? [], link: req.source?.link }) });
      const j = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not send'); return; }
      setReq(null); open(`session:${target}`); return;
    }
    const mode = target === 'runner' ? 'run' : 'chat';
    const r = await fetch(`/api/${product}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent, instruction, refs: req.refs ?? [], source: { ...(req.source ?? {}), text: req.text?.slice(0, 2000) }, mode, cwd }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    try { localStorage.setItem(`wf-cwd-${product}`, cwd); } catch { /* ignore */ }
    setReq(null); open(`session:${j.id}`);
  };
  const label = (s: Live) => `${AGENTS.find(a => a.id === s.agent)?.label ?? s.agent} · ${s.instruction.split('\n').find(l => l.trim())?.slice(0, 60) ?? s.id}`;
  return createPortal(
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) setReq(null); }}>
      <div className="modal send" role="dialog" aria-label="Send to agent">
        <h3>Send to agent</h3>
        {req.refs && req.refs.length > 0 && <div className="tags send-refs">{req.refs.map(id => <SmartTag key={id} id={id} />)}</div>}
        <label className="send-field"><span>to</span>
          <select value={target} onChange={e => setTarget(e.target.value)}>
            {sessions.length > 0 && <optgroup label="active conversations">{sessions.map(s => <option key={s.id} value={s.id}>{label(s)} — {s.cwd?.replace(/^\/Users\/[^/]+/, '~')}</option>)}</optgroup>}
            <optgroup label="new"><option value="new">New conversation in the app</option><option value="runner">Queue for a runner (wf agent listen)</option></optgroup>
          </select>
        </label>
        {!isNew && <p className="muted send-src">goes into that conversation as your next message; the agent keeps its context and folder.</p>}
        {isNew && (
          <>
            <label className="send-field"><span>agent</span><select value={agent} onChange={e => setAgent(e.target.value)}>{AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            {target === 'new' && <label className="send-field"><span>working folder (required)</span>
              <input value={cwd} placeholder={defaults.cwd || 'the code repository the agent works in, e.g. /Users/you/Projects/app'} onChange={e => setCwd(e.target.value)} spellCheck={false} />
              <small className="muted">{defaults.cwd ? `product default: ${defaults.cwd} (set repo: in _product.md)` : `set repo: in data/products/${product}/_product.md for a default`}{defaults.waterfall ? ` · Waterfall itself: ${defaults.waterfall}` : ''}</small>
            </label>}
          </>
        )}
        <label className="send-field"><span>{isNew ? 'instruction' : 'message'}</span>
          <textarea autoFocus rows={7} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="What should the agent do with this?" onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }} />
        </label>
        {req.source?.doc && <p className="muted send-src">from {req.source.project ? `${req.source.project} / ` : ''}{req.source.doc}{req.source.blockId ? ' · this block' : ''} — the block text, its link and the ids above travel with it.</p>}
        <div className="sec-actions"><button className="pri" disabled={busy || !instruction.trim() || (target === 'new' && !cwd.trim())} onClick={send}>{busy ? 'Sending…' : isNew ? 'Start' : 'Send'}</button><button onClick={() => setReq(null)}>Cancel</button>{msg && <span className="notice">{msg}</span>}<span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>⌘↵</span></div>
      </div>
    </div>, document.body);
}
