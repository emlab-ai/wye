'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { usePeek } from './PeekProvider';
import { railAgents, type RailAgent, type RailSession } from '@/lib/rail-agents';

const AGENT: Record<string, string> = { 'claude-code': 'Claude Code', codex: 'Codex', clerk: 'Wye' };
const STATE: Record<RailAgent['state'], string> = { working: 'working', idle: 'idle — waiting for a message', asking: 'waiting for your answer', queued: 'queued for a free agent slot' };

// The rail's Agents folder (decision:wf2.rail-shows-running-agents): the heading opens the Agents page; under it the
// agents running in this product now — state, what each works on, what it is doing, for how long — a click opens the
// conversation in the column. Refreshed on every change event, and every 5 s while one runs.
export function AgentFolder({ product }: { product: string }) {
  const path = usePathname(); const { open: openPeek } = usePeek();
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<RailAgent[]>([]);
  useEffect(() => { try { setOpen(localStorage.getItem('wf-agents-open') !== '0'); } catch { /* ignore */ } }, []);
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-agents-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/${product}/sessions`, { cache: 'no-store' }); if (!r.ok) return; const j = await r.json() as { sessions: RailSession[] }; setRows(railAgents(j.sessions)); } catch { /* keep what we have */ }
  }, [product]);
  useEffect(() => { void load(); const h = () => void load(); window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), rows.length ? 5000 : 30000); return () => clearInterval(t); }, [load, rows.length]);
  const href = `/${product}/sessions`;
  return (
    <li className="pr-folder agent-folder">
      <div className={`pf-head ${path === href ? 'on' : ''}`}>
        <button className="pf-caret" onClick={toggle} aria-label={open ? 'collapse agents' : 'expand agents'} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <Link href={href}><i>⚡</i>Agents{rows.length > 0 && <small className="af-count">{rows.length}</small>}</Link>
      </div>
      {open && <ul className="pf-list">
        {rows.map(a => (
          <li key={a.id} className={`af-row af-${a.state}`}>
            <button className="af-link" onClick={() => openPeek(`session:${a.id}`)} title={`${AGENT[a.agent] ?? a.agent} · ${STATE[a.state]} · ${a.since}`}>
              <span className="af-state" aria-label={STATE[a.state]}>{a.state === 'asking' ? '?' : a.state === 'queued' ? '◷' : ''}</span>
              <span className="af-body">
                <span className="af-title">{a.title}</span>
                {a.doing && <span className="af-doing">{a.doing}</span>}
              </span>
              <span className="af-since">{a.since}</span>
            </button>
          </li>))}
        {!rows.length && <li className="pf-empty muted">no agents running</li>}
      </ul>}
    </li>
  );
}
