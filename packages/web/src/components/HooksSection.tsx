'use client';
import { useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';

type Hook = { id: string; title: string; on: string; where: Record<string, string>; actions: { kind: string; skill?: string; template?: string; text?: string; task?: string; worker?: string; workflow?: string; doc?: string }[]; once: boolean; status: string; firings: number };
type Firing = { id: string; hook: string; event: string; at: string; depth: number; actions: { kind: string; session?: string; added?: string[]; error?: string }[] };

const actionText = (a: Hook['actions'][number]) => a.kind === 'run' ? `run ${a.skill}` : a.kind === 'workflow' ? `run ${a.workflow}` : a.kind === 'dispatch' ? `dispatch ${a.doc}` : a.kind === 'add' ? `add ${a.template}` : a.kind === 'task' ? `task "${a.text}"${a.worker ? ` → ${a.worker}` : ''}` : a.kind === 'assign' ? `assign ${a.task}${a.worker ? ` → ${a.worker}` : ''}` : `notify "${a.text}"`;

// The column's Hooks section (decision:wf2.hooks-and-skills, H2): the hooks that can fire on this node's kind — on
// which event, doing what — and what fired on it so far (the session, the blocks); "Run now" fires one by hand, the
// once rule set aside, so a harness can be tried on one node without changing its status.
export function HooksSection({ id }: { id: string }) {
  const { product, open } = usePeek();
  const [data, setData] = useState<{ on: boolean; hooks: Hook[]; firings: Firing[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [version, setVersion] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { const k = (e as CustomEvent<{ kinds: string[] }>).detail.kinds; if (k.includes('graph') || k.includes('session')) setVersion(v => v + 1); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, []);
  useEffect(() => {
    let live = true;
    fetch(`/api/${product}/hooks?node=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then(j => { if (live) setData(j); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [id, product, version]);
  if (!data || !data.hooks.length) return null;
  const run = async (hook: string) => {
    setBusy(hook); setMsg('');
    const r = await fetch(`/api/${product}/hooks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hook, node: id }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) { setMsg(j.message ?? 'could not run the hook'); return; }
    const f = (j.firings as Firing[])[0];
    setMsg(f ? f.actions.map(a => a.error ? `${a.kind} failed — ${a.error}` : a.session ? `${a.kind} → session ${a.session}` : a.added?.length ? `${a.kind} → ${a.added.join(', ')}` : a.kind).join('; ') : 'nothing matched');
    setVersion(v => v + 1);
  };
  const fired = data.firings.filter(f => f.hook);
  return (
    <section className="hooks-sec">
      <h4><button className="linkish" onClick={() => setShow(s => !s)}>{show ? '▾' : '▸'} Hooks <span className="muted">{data.hooks.length}{fired.length ? ` · fired ${fired.length}` : ''}{!data.on ? ' · off' : ''}</span></button></h4>
      {show && <ul className="hooks-list">
        {data.hooks.map(h => (
          <li key={h.id} className={`hook-row s-${h.status}`}>
            <div className="hook-head"><SmartTag id={h.id} /> <span className="muted">on {h.on}{h.status === 'paused' ? ' · paused' : ''}</span><button className="mini" disabled={!!busy || !data.on} title="Fire this hook on this node now" onClick={() => run(h.id)}>{busy === h.id ? 'running…' : 'Run now'}</button></div>
            <div className="hook-do muted">{h.actions.map(actionText).join(' · ')}</div>
            {fired.filter(f => f.hook === h.id).map(f => (
              <div key={f.id} className="hook-firing">
                <span className="muted">{f.at.slice(0, 16).replace('T', ' ')} · {f.event}</span>
                {f.actions.map((a, i) => <span key={i}> {a.error ? <span className="notice">{a.kind} failed — {a.error}</span> : a.session ? <button className="linkish" onClick={() => open(`session:${a.session}`)}>{a.kind} → session {a.session.slice(0, 6)}</button> : a.added?.length ? <>{a.kind} → {a.added.map(x => <SmartTag key={x} id={x} />)}</> : a.kind}</span>)}
              </div>
            ))}
          </li>
        ))}
        {msg && <li className="muted">{msg}</li>}
      </ul>}
    </section>
  );
}
