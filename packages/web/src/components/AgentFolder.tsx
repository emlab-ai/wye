'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { railAgents, type RailAgent, type RailSession } from '@/lib/rail-agents';

type ImportRow = { requestSlug: string; project: string; title: string; total: number; done: number; current: string | null; stopped: boolean; legacy: boolean };
const AGENT: Record<string, string> = { 'claude-code': 'Claude Code', codex: 'Codex', clerk: 'Wye' };
const STATE: Record<RailAgent['state'], string> = { working: 'working', idle: 'idle — waiting for a message', asking: 'waiting for your answer', queued: 'queued for a free agent slot' };

// The rail's Agents folder (decision:wf2.rail-shows-running-agents): the heading opens the Agents page; under it the
// agents running in this product now — state, what each works on, what it is doing, for how long — a click opens the
// conversation as the page (/sessions/<id>/chat), in the main window. Refreshed on every change event, and every 5 s while one runs.
export function AgentFolder({ product }: { product: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<RailAgent[]>([]);
  // background imports (lib:import-run) are a queue of their own, not agent slots: one row each, with Stop / Resume
  const [imports, setImports] = useState<ImportRow[]>([]);
  useEffect(() => { try { setOpen(localStorage.getItem('wf-agents-open') !== '0'); } catch { /* ignore */ } }, []);
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-agents-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/${product}/sessions`, { cache: 'no-store' }); if (r.ok) { const j = await r.json() as { sessions: RailSession[] }; setRows(railAgents(j.sessions)); } } catch { /* keep what we have */ }
    try { const r = await fetch(`/api/${product}/imports`, { cache: 'no-store' }); if (r.ok) setImports(((await r.json()) as { batches: ImportRow[] }).batches); } catch { /* keep what we have */ }
  }, [product]);
  useEffect(() => { void load(); const h = () => void load(); window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), rows.length || imports.some(i => !i.stopped) ? 5000 : 30000); return () => clearInterval(t); }, [load, rows.length, imports]);
  const control = async (slug: string, action: 'stop' | 'resume') => { await fetch(`/api/${product}/imports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, action }) }).catch(() => undefined); void load(); };
  const href = `/${product}/sessions`;
  return (
    <li className="pr-folder agent-folder">
      <div className={`pf-head ${path === href ? 'on' : ''}`}>
        <button className="pf-caret" onClick={toggle} aria-label={open ? 'collapse agents' : 'expand agents'} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <Link href={href}><i>⚡</i>Agents{rows.length + imports.length > 0 && <small className="af-count">{rows.length + imports.length}</small>}</Link>
      </div>
      {open && <ul className="pf-list">
        {rows.map(a => (
          <li key={a.id} className={`af-row af-${a.state} ${path === `/${product}/sessions/${a.id}/chat` ? 'on' : ''}`}>
            <Link className="af-link" href={`/${product}/sessions/${a.id}/chat`} title={`${AGENT[a.agent] ?? a.agent} · ${STATE[a.state]} · ${a.since}`}>
              <span className="af-state" aria-label={STATE[a.state]}>{a.state === 'asking' ? '?' : a.state === 'queued' ? '◷' : ''}</span>
              <span className="af-body">
                <span className="af-title">{a.title}</span>
                {a.doing && <span className="af-doing">{a.doing}</span>}
              </span>
              <span className="af-since">{a.since}</span>
            </Link>
          </li>))}
        {imports.map(b => (
          <li key={b.requestSlug} className={`af-row af-import ${b.stopped ? 'af-idle' : 'af-working'}`}>
            <Link className="af-link" href={`/${product}/${b.project}/d/${b.requestSlug}`} title="A background import: it hands the files to an agent one at a time. Its page lists every file.">
              <span className="af-state" aria-label={b.stopped ? 'stopped' : 'importing'}>⇩</span>
              <span className="af-body">
                <span className="af-title">{b.title}</span>
                <span className="af-doing">{b.done} of {b.total}{b.stopped ? ' · stopped' : b.current ? ` · now ${b.current}` : ''}</span>
              </span>
            </Link>
            {b.stopped
              ? <button className="af-ctl" onClick={() => void control(b.requestSlug, 'resume')} title="Go on from the first file not done">Resume</button>
              : b.legacy ? null : <button className="af-ctl" onClick={() => void control(b.requestSlug, 'stop')} title="Start no further file; the one running finishes (or Cancel it)">Stop</button>}
          </li>))}
        {!rows.length && !imports.length && <li className="pf-empty muted">no agents running</li>}
      </ul>}
    </li>
  );
}
