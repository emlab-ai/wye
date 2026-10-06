'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { fitMenu } from '@/lib/menu-fit';
import { useRouter } from 'next/navigation';
import { railAgents, type RailAgent, type RailSession } from '@/lib/rail-agents';
import { requestSend } from './CommandBox';
import { usePeekMaybe } from './PeekProvider';

type ImportRow = { requestSlug: string; project: string; title: string; total: number; done: number; current: string | null; stopped: boolean; legacy: boolean };
const AGENT: Record<string, string> = { 'claude-code': 'Claude Code', codex: 'Codex', clerk: 'Wye' };
const STATE: Record<RailAgent['state'], string> = { working: 'working', idle: 'idle — waiting for a message', asking: 'waiting for your answer', queued: 'queued for a free agent slot' };

// The rail's Agents folder (decision:wf2.rail-shows-running-agents): the heading opens the Agents page; under it the
// agents running in this product now — state, what each works on, what it is doing, for how long — a click opens the
// conversation as the page (/sessions/<id>/chat), in the main window. Refreshed on every change event, and every 5 s while one runs.
export function AgentFolder({ product }: { product: string }) {
  const path = usePathname(); const router = useRouter();
  // the row's menu (right-click, or the hover ⋯): open, and cancel an agent / pause or resume an import
  type Menu = { x: number; y: number; above?: number } & ({ kind: 'agent'; id: string } | { kind: 'import'; b: ImportRow } | { kind: 'head' });
  // a new session by hand (the head's right-click or its +): the command box opens for a fresh agent in the workspace's folder — at home, the product's code folder
  const ws = usePeekMaybe()?.workspace;
  const newSession = () => { setMenu(null); requestSend({ fresh: true, ...(ws?.path ? { cwd: ws.path } : {}) }); };
  const [menu, setMenu] = useState<Menu | null>(null); const menuEl = useRef<HTMLDivElement>(null);
  useEffect(() => {   // a press outside, Escape or a scroll closes it (React listens on document too: check the target)
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target instanceof Node && menuEl.current?.contains(e.target))) setMenu(null); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  useLayoutEffect(() => { if (menu) fitMenu(menuEl.current, menu.x, menu.y, menu.above); }, [menu]);
  const at = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === 'contextmenu') return { x: e.clientX, y: e.clientY }; const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: b.left, y: b.bottom + 2, above: b.top }; };
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<RailAgent[]>([]);
  // background imports (lib:import-run) are a queue of their own, not agent slots: one row each; pause/resume is on its page
  const [imports, setImports] = useState<ImportRow[]>([]);
  useEffect(() => { try { setOpen(localStorage.getItem('wf-agents-open') !== '0'); } catch { /* ignore */ } }, []);
  const toggle = () => setOpen(o => { const n = !o; try { localStorage.setItem('wf-agents-open', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/${product}/sessions`, { cache: 'no-store' }); if (r.ok) { const j = await r.json() as { sessions: RailSession[] }; setRows(railAgents(j.sessions)); } } catch { /* keep what we have */ }
    try { const r = await fetch(`/api/${product}/imports`, { cache: 'no-store' }); if (r.ok) setImports(((await r.json()) as { batches: ImportRow[] }).batches); } catch { /* keep what we have */ }
  }, [product]);
  useEffect(() => { void load(); const h = () => void load(); window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h); }, [load]);
  useEffect(() => { const t = setInterval(() => void load(), rows.length || imports.some(i => !i.stopped) ? 5000 : 30000); return () => clearInterval(t); }, [load, rows.length, imports]);
  const act = async (fn: () => Promise<unknown>) => { setMenu(null); await fn().catch(() => undefined); void load(); };
  const cancel = (id: string) => act(() => fetch(`/api/${product}/sessions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }));
  const importAct = (slug: string, action: 'stop' | 'resume') => act(() => fetch(`/api/${product}/imports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, action }) }));
  const href = `/${product}/sessions`;
  return (
    <li className="pr-folder agent-folder">
      <div className={`pf-head ${path === href ? 'on' : ''}`} onContextMenu={e => setMenu({ ...at(e), kind: 'head' })}>
        <button className="pf-caret" onClick={toggle} aria-label={open ? 'collapse agents' : 'expand agents'} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <Link href={href}><i>⚡</i>Agents{rows.length + imports.length > 0 && <small className="af-count">{rows.length + imports.length}</small>}</Link>
        <button className="pf-add" onClick={newSession} title={`New agent session${ws?.path ? ` in ${ws.path}` : ''}`} aria-label="New agent session">+</button>
      </div>
      {open && <ul className="pf-list">
        {rows.map(a => (
          <li key={a.id} className={`af-row af-${a.state} ${path === `/${product}/sessions/${a.id}/chat` ? 'on' : ''}`} onContextMenu={e => setMenu({ ...at(e), kind: 'agent', id: a.id })}>
            <Link className="af-link" href={`/${product}/sessions/${a.id}/chat`} title={`${AGENT[a.agent] ?? a.agent} · ${STATE[a.state]} · ${a.since}`}>
              <span className="af-state" aria-label={STATE[a.state]}>{a.state === 'asking' ? '?' : a.state === 'queued' ? '◷' : ''}</span>
              <span className="af-body">
                <span className="af-title">{a.title}</span>
                {a.doing && <span className="af-doing">{a.doing}</span>}
              </span>
              <span className="af-since">{a.since}</span>
            </Link>
            <button className="af-more" onClick={e => setMenu({ ...at(e), kind: 'agent', id: a.id })} aria-label="agent menu">⋯</button>
          </li>))}
        {imports.map(b => (
          <li key={b.requestSlug} className={`af-row ${b.stopped ? 'af-idle' : 'af-working'}`} onContextMenu={e => setMenu({ ...at(e), kind: 'import', b })}>
            <Link className="af-link" href={`/${product}/${b.project}/d/${b.requestSlug}`} title="A background import — it hands the files to an agent one at a time. Open it to pause or resume.">
              <span className="af-state" aria-label={b.stopped ? 'paused' : 'importing'}>{b.stopped ? '⏸' : ''}</span>
              <span className="af-body">
                <span className="af-title">{b.title}</span>
                <span className="af-doing">{b.done} of {b.total} files{b.stopped ? ' · paused' : ''}</span>
              </span>
            </Link>
            <button className="af-more" onClick={e => setMenu({ ...at(e), kind: 'import', b })} aria-label="import menu">⋯</button>
          </li>))}
        {!rows.length && !imports.length && <li className="pf-empty muted">no agents running</li>}
      </ul>}
      {menu && <div ref={menuEl} className="pg-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
        {menu.kind === 'head' ? <>
          <button role="menuitem" onClick={newSession} title={ws?.path ? `A fresh agent in ${ws.path}` : 'A fresh agent in the product\'s code folder'}>New session{ws?.path ? ` in ${ws.path.split('/').pop()}` : ''}…</button>
        </> : menu.kind === 'agent' ? <>
          <button role="menuitem" onClick={() => { setMenu(null); router.push(`/${product}/sessions/${menu.id}/chat`); }}>Open</button>
          <button role="menuitem" className="danger" onClick={() => void cancel(menu.id)}>Cancel agent</button>
        </> : <>
          <button role="menuitem" onClick={() => { setMenu(null); router.push(`/${product}/${menu.b.project}/d/${menu.b.requestSlug}`); }}>Open import</button>
          {menu.b.stopped ? <button role="menuitem" onClick={() => void importAct(menu.b.requestSlug, 'resume')}>Resume import</button>
            : !menu.b.legacy && <button role="menuitem" onClick={() => void importAct(menu.b.requestSlug, 'stop')}>Pause import</button>}
        </>}
        <button role="menuitem" onClick={() => { setMenu(null); router.push(href); }}>Queue overview</button>
      </div>}
    </li>
  );
}
