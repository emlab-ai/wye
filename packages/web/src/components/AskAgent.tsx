'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { requestSend } from './CommandBox';
import { AGENTS, type Session } from '@/lib/session-types';

export type AskRequest = { selection: string; blockText: string; blockLink: string; pageLink: string; refs: string[]; doc: string; project: string; x: number; y: number };
type Live = Session & { live?: boolean };

// A command box at the selection: what you type goes to an active conversation together with the selected text,
// the block it sits in, and a link to the page. "New conversation…" hands the same payload to the full dialog.
export function AskAgentBox({ req, onClose }: { req: AskRequest; onClose: () => void }) {
  const { product, open } = usePeek();
  const [sessions, setSessions] = useState<Live[]>([]);
  const [target, setTarget] = useState<string>('');
  const [cmd, setCmd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/${product}/sessions`).then(r => r.json()).then(j => { const act = (j.sessions as Live[]).filter(s => s.mode === 'chat' && s.live); setSessions(act); setTarget(act[0]?.id ?? 'new'); }).catch(() => setTarget('new')); }, [product]);
  const payload = () => [cmd.trim(), req.selection.trim() ? `\nSelected text:\n> ${req.selection.trim().replace(/\n/g, '\n> ')}` : '', req.blockText.trim() && req.blockText.trim() !== req.selection.trim() ? `\nThe block it is in:\n> ${req.blockText.trim().replace(/\n/g, '\n> ')}` : '', `\nBlock: ${req.blockLink}\nPage: ${req.pageLink} (${req.project} / ${req.doc})`].filter(Boolean).join('\n');
  const send = async () => {
    if (!cmd.trim()) return;
    if (target === 'new') { requestSend({ text: payload(), refs: req.refs, source: { project: req.project, doc: req.doc, link: req.blockLink } }); onClose(); return; }
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/sessions/${target}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: payload(), refs: req.refs, link: req.blockLink }) });
    setBusy(false);
    if (!r.ok) { setMsg('could not send'); return; }
    onClose(); open(`session:${target}`);
  };
  const label = (s: Live) => `${AGENTS.find(a => a.id === s.agent)?.label ?? s.agent} · ${s.instruction.split('\n').find(l => l.trim())?.slice(0, 40) ?? s.id}`;
  return (
    <div className="askbox" style={{ left: Math.min(req.x, window.innerWidth - 420), top: req.y }} onMouseDown={e => e.stopPropagation()}>
      <div className="askbox-ctx"><span className="muted">to</span>
        <select value={target} onChange={e => setTarget(e.target.value)}>{sessions.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}<option value="new">New conversation…</option></select>
      </div>
      <textarea autoFocus rows={3} value={cmd} placeholder={`What should the agent do with "${req.selection.trim().slice(0, 40)}${req.selection.trim().length > 40 ? '…' : ''}"?`} onChange={e => setCmd(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); } if (e.key === 'Escape') onClose(); }} />
      <div className="askbox-foot"><span className="muted">sends your command, the selection, this block and a link to the page</span><button className="pri" disabled={busy || !cmd.trim()} onClick={send}>{busy ? 'Sending…' : target === 'new' ? 'Continue…' : 'Send'}</button><button onClick={onClose}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
    </div>
  );
}
