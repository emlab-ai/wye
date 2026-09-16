'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { ProgressBar } from './Progress';
import type { IndexEntry } from '@/lib/doc';
import { GOAL_STATUSES, TASK_STATUSES } from '@/lib/props';

// Asana-style editing of a goal or task in the right column: title text, status, target/due, owner, progress and
// the goal it is part of. Every change writes back to the node's defining line and rebuilds the graph.
export function TrackEditor({ entry, index, text, form, onSaved }: { entry: IndexEntry; index: Record<string, IndexEntry>; text: string; form?: string; onSaved: () => void }) {
  const { product } = usePeek(); const router = useRouter();
  const isGoal = entry.kind === 'goal';
  const [title, setTitle] = useState(text);
  const [status, setStatus] = useState(entry.status);
  const [target, setTarget] = useState(entry.target ?? '');
  const [owner, setOwner] = useState(entry.owner ?? '');
  const [progress, setProgress] = useState(entry.parts && entry.progress !== undefined && !explicitProgress(entry) ? '' : entry.progress !== undefined ? String(entry.progress) : '');
  const [parent, setParent] = useState(entry.parent ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  // Sync a field from the document only when the document's value for it changed (a refresh after our own save must
  // not clobber what the user is typing in another field).
  const prev = useRef({ text, status: entry.status, target: entry.target ?? '', owner: entry.owner ?? '', parent: entry.parent ?? '', progress: explicitProgress(entry) ? String(entry.progress) : '' });
  useEffect(() => {
    const now = { text, status: entry.status, target: entry.target ?? '', owner: entry.owner ?? '', parent: entry.parent ?? '', progress: explicitProgress(entry) ? String(entry.progress) : '' };
    const p = prev.current;
    if (now.text !== p.text) setTitle(now.text); if (now.status !== p.status) setStatus(now.status); if (now.target !== p.target) setTarget(now.target);
    if (now.owner !== p.owner) setOwner(now.owner); if (now.parent !== p.parent) setParent(now.parent); if (now.progress !== p.progress) setProgress(now.progress);
    prev.current = now;
  }, [entry, text]);
  const goals = Object.values(index).filter(e => e.kind === 'goal' && e.defined && e.id !== entry.id).sort((a, b) => a.id.localeCompare(b.id));
  const editable = form !== 'yaml';
  const save = async (patch: { status?: string; text?: string; props?: Record<string, string | null> }) => {
    setState('saving'); setMsg('');
    const r = await fetch(`/api/${product}/node/${encodeURIComponent(entry.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    const j = await r.json();
    if (!r.ok) { setState('error'); setMsg(j.message ?? j.error); return; }
    setState('saved'); onSaved(); router.refresh();
  };
  const statuses = isGoal ? GOAL_STATUSES : TASK_STATUSES;
  const computed = entry.parts && !explicitProgress(entry) ? entry.progress : undefined;
  return (
    <section className={`tracking edit ${editable ? '' : 'readonly'}`}>
      <textarea className="track-title" value={title} rows={Math.min(6, Math.max(2, Math.ceil(title.length / 70)))} onChange={e => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== text) save({ text: title }); }} disabled={!editable} spellCheck={false} />
      <div className="tracking-grid">
        <div><small>status</small>
          <select className={`status-sel s-${status}`} value={status} onChange={e => { setStatus(e.target.value); save({ status: e.target.value }); }} disabled={!editable}>
            {(statuses.includes(status) || !status ? [] : [status]).concat(['', ...statuses]).map(st => <option key={st} value={st}>{st || '— status'}</option>)}
          </select>
        </div>
        <div><small>{isGoal ? 'target' : 'due'}</small><input className="nrow-in" value={target} placeholder="2026-10 or a date" onChange={e => setTarget(e.target.value)} onKeyDown={enterBlurs} onBlur={() => { if (target !== (entry.target ?? '')) save({ props: { [isGoal ? 'target' : 'due']: target || null } }); }} disabled={!editable} /></div>
        <div><small>owner</small><input className="nrow-in" value={owner} placeholder="who" onChange={e => setOwner(e.target.value)} onKeyDown={enterBlurs} onBlur={() => { if (owner !== (entry.owner ?? '')) save({ props: { owner: owner || null } }); }} disabled={!editable} /></div>
        <div className="tracking-prog"><small>progress</small>
          <span><ProgressBar value={progress ? Number(progress) : computed} width={90} /><input className="nrow-in nrow-pct" value={progress} placeholder={computed !== undefined ? `${computed}%` : '—'} onChange={e => setProgress(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={enterBlurs} onBlur={() => { const cur = explicitProgress(entry) ? String(entry.progress) : ''; if (progress !== cur) save({ props: { progress: progress || null } }); }} disabled={!editable} title={computed !== undefined ? `computed from ${entry.parts!.done} of ${entry.parts!.total} parts; type a number to override` : 'percentage'} /></span>
          {entry.parts && <em className="muted">{entry.parts.done} of {entry.parts.total} parts done</em>}
        </div>
        <div className="tracking-parent-sel"><small>part of goal</small>
          <select value={parent} onChange={e => { setParent(e.target.value); save({ props: { 'part-of': e.target.value || null } }); }} disabled={!editable}>
            <option value="">— none</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.id.replace(/^goal:/, '')} — {plain(g.title).slice(0, 50)}</option>)}
          </select>
          {parent && <SmartTag id={parent} />}
        </div>
      </div>
      <p className="track-state">{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved to the document' : state === 'error' ? `save failed: ${msg}` : editable ? 'changes save to the defining line in the document' : 'defined in yaml — edit it in its document'}</p>
    </section>
  );
}
const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); };
const explicitProgress = (e: IndexEntry) => e.progress !== undefined && !(e.parts && e.progress === Math.round(100 * e.parts.done / e.parts.total));
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
