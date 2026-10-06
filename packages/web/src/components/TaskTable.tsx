'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePeek } from './PeekProvider';
import { KindPill, StatusPill } from './Pills';
import { requestSend } from './CommandBox';
import { useMe } from './WorkList';
import { docRoute } from '@/lib/doc';
import { fitMenu } from '@/lib/menu-fit';
import { TASK_STATUSES } from '@/lib/props';
import { isOpen, type InstanceRow, type InstanceTable as Table } from '@/lib/instance-table';

// The Tasks table (page:web/work, req:exec.work-view), issue-tracker style: one row per task — and per block of any
// type that extends task (a bug, a chore), with the kind shown — its title with where it is written, who holds it, its
// status as a control, its due date, Start (the row sent to an agent) and a menu. Open / Assigned to me, a search, a
// filter by type and, over a workspace, by vault; done rows out of the way unless asked. The choices are this
// browser's for the moment, never written to the view's line.
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
const items = (v: string) => v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
type Menu = { r: InstanceRow; x: number; y: number };

export function TaskTable({ product, table, onNew }: { product: string; table: Table; onNew?: (title: string) => Promise<string | null> }) {
  const { open, openId } = usePeek(); const router = useRouter();
  const [me] = useMe();
  const [q, setQ] = useState(''); const [onlyOpen, setOnlyOpen] = useState(true); const [mine, setMine] = useState(false);
  const [kind, setKind] = useState(''); const [vault, setVault] = useState(''); const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null); const menuEl = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(''); const [addErr, setAddErr] = useState('');
  const across = !!table.vaults && table.vaults.length > 1;
  const kinds = useMemo(() => [...new Set(table.rows.map(r => r.kind))].sort(), [table.rows]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return table.rows.filter(r => (!onlyOpen || isOpen(r)) && (!mine || [r.props.owner, r.props.worker].some(w => w && me && items(w).includes(me))) && (!kind || r.kind === kind) && (!vault || r.vault === vault)
      && (!t || r.id.toLowerCase().includes(t) || plain(r.title).toLowerCase().includes(t) || Object.values(r.props).some(v => v.toLowerCase().includes(t))));
  }, [table.rows, q, onlyOpen, mine, me, kind, vault]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target instanceof Node && menuEl.current?.contains(e.target))) setMenu(null); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  useLayoutEffect(() => { if (menu) fitMenu(menuEl.current, menu.x, menu.y); }, [menu]);
  const at = (r: InstanceRow) => r.vault && r.vault !== product ? r.vault : product;
  const hrefOf = (r: InstanceRow) => { const w = docRoute(r.file); return w ? `/${at(r)}/${w.project}/d/${w.doc}#n-${encodeURIComponent(r.id)}` : `/${at(r)}/n/${encodeURIComponent(r.id)}`; };
  const far = (r: InstanceRow) => at(r) !== product;
  // the status written on the line (op:api.node PUT), in the row's own vault; the table refreshes on the graph's change
  const setStatus = async (r: InstanceRow, status: string) => {
    setBusy(r.id);
    try { const res = await fetch(`/api/${at(r)}/node/${encodeURIComponent(r.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }); if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.message ?? j.error ?? 'could not change the status'); } }
    finally { setBusy(''); }
  };
  const start = (r: InstanceRow) => requestSend({ refs: [r.id], text: `${r.id}: ${plain(r.title)}`, source: docRoute(r.file) ? { project: docRoute(r.file)!.project, doc: docRoute(r.file)!.doc, link: location.origin + hrefOf(r) } : {} });
  const add = async () => { const t = adding.trim(); if (!t || !onNew) return; setAddErr(''); const e = await onNew(t); if (e) setAddErr(e); else setAdding(''); };
  const short = (id: string) => id.slice(id.indexOf(':') + 1);
  // the pickable statuses: the task ones, and the row's own when it is something else
  const statuses = (r: InstanceRow) => [...new Set([...(r.status ? [r.status] : []), ...TASK_STATUSES])];
  const ORDER = ['in-progress', 'review', 'blocked', 'open', 'todo', '', 'done'];
  const sections = useMemo(() => { const m = new Map<string, InstanceRow[]>(); for (const r of rows) { const k = ORDER.includes(r.status) ? r.status : r.status; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); } return [...m].sort((a, b) => (ORDER.indexOf(a[0]) + 1 || 50) - (ORDER.indexOf(b[0]) + 1 || 50)); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = { open: table.rows.filter(isOpen).length, mine: me ? table.rows.filter(r => [r.props.owner, r.props.worker].some(w => w && items(w).includes(me))).length : 0 };
  return (
    <div className="ttask">
      <div className="ttask-bar">
        <span className="seg-group" role="tablist">
          <button type="button" role="tab" aria-selected={onlyOpen} className={`seg ${onlyOpen ? 'on' : ''}`} onClick={() => setOnlyOpen(o => !o)} title="Only what is still open">Open <small>{n.open}</small></button>
          <button type="button" role="tab" aria-selected={mine} className={`seg ${mine ? 'on' : ''}`} onClick={() => setMine(m => !m)} title={me ? `Held by ${me}` : 'Say who you are first: your name in the Tasks page of the rail'}>Assigned to me{me ? <small> {n.mine}</small> : null}</button>
        </span>
        <input type="search" className="ttask-q" placeholder="Search tasks…" value={q} onChange={e => setQ(e.target.value)} />
        {kinds.length > 1 && <select className="itable-select" value={kind} onChange={e => setKind(e.target.value)} title="The kind of task shown"><option value="">all types ({table.rows.length})</option>{kinds.map(k => <option key={k} value={k}>{k} ({table.rows.filter(r => r.kind === k).length})</option>)}</select>}
        {across && <select className="itable-select" value={vault} onChange={e => setVault(e.target.value)} title="The vault whose tasks are shown"><option value="">all vaults</option>{table.vaults!.map(v => <option key={v.slug} value={v.slug}>{v.title} ({table.rows.filter(r => r.vault === v.slug).length})</option>)}</select>}
        <span className="muted small ttask-count">{rows.length}{rows.length !== table.rows.length ? ` of ${table.rows.length}` : ''}</span>
      </div>
      <div className="ttask-scroll"><table className="ttask-grid">
        <thead><tr><th className="ttask-th-name">Task</th><th>Owner</th><th>Due</th><th>Status</th><th>Where</th><th /></tr></thead>
        {sections.map(([st, rs]) => <Section key={st} label={st || 'no status'} n={rs.length} closed={st === 'done'}>
          {rs.map(r => { const where = docRoute(r.file); const href = hrefOf(r); const f = far(r); const done = r.status === 'done'; return (
            <tr key={`${r.vault ?? ''}/${r.id}`} className={`ttask-row ${!f && r.id === openId ? 'on' : ''} ${done ? 'done' : ''}`} onClick={() => f ? router.push(href) : open(r.id)} role="button">
              <td className="ttask-name">
                <button type="button" className={`ttask-check ${done ? 'on' : ''}`} disabled={f || busy === r.id} onClick={e => { e.stopPropagation(); void setStatus(r, done ? 'open' : 'done'); }} title={done ? 'Done — click to reopen' : 'Mark done'} aria-label={done ? 'Reopen' : 'Mark done'}><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><circle cx="9" cy="9" r="7.5" /><path d="m5.5 9.2 2.3 2.3 4.7-4.8" /></svg></button>
                <span className="ttask-t">{plain(r.title) || r.id}</span>
                <span className="ttask-ctx">{r.kind !== 'task' && <KindPill kind={r.kind} />}{items(r.props.tags ?? '').map(t => <span key={t} className="ttask-tag">{t}</span>)}{r.props.ready === 'true' && <span className="ttask-tag">ready</span>}<code className="ttask-id" title={r.id}>{short(r.id)}</code></span>
              </td>
              <td className="ttask-owner">{r.props.owner || r.props.worker ? <span className="ttask-avatar" title={r.props.owner || r.props.worker}>{(r.props.owner || r.props.worker).slice(0, 2)}</span> : <span className="muted">–</span>}<span className="ttask-owner-name">{r.props.owner || r.props.worker || ''}</span></td>
              <td className="ttask-due">{r.props.due ?? ''}</td>
              <td className="ttask-status" onClick={e => e.stopPropagation()}>
                <span className={`ttask-sel s-${r.status || 'none'}`}><StatusPill status={r.status || '—'} />
                  <select value={r.status} disabled={busy === r.id || f} onChange={e => setStatus(r, e.target.value)} aria-label="Status">{statuses(r).map(s => <option key={s} value={s}>{s}</option>)}</select></span>
              </td>
              <td className="ttask-where">{where && <Link className="ttask-doc" href={href} onClick={e => e.stopPropagation()} title={r.doc}>{where.doc}</Link>}{r.vault && across && <span className="vault-chip">{r.vaultTitle}</span>}{r.props['part-of'] && <span className="muted small"> · {items(r.props['part-of']).map(short).join(', ')}</span>}</td>
              <td className="ttask-acts" onClick={e => e.stopPropagation()}>
                {f ? <Link className="ttask-start" href={href} title={`Opens in ${r.vaultTitle}`}>Open →</Link> : <button type="button" className="ttask-start" onClick={() => start(r)} title="Send this task to an agent (the command box opens with it)">Start →</button>}
                <button type="button" className="ttask-more" aria-label="More" onClick={e => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ r, x: b.left, y: b.bottom + 2 }); }}>⋮</button>
              </td>
            </tr>); })}
        </Section>)}
        {!rows.length && <tbody><tr><td colSpan={6} className="muted ttask-none">{table.rows.length ? 'No task matches.' : 'No tasks yet.'}</td></tr></tbody>}
      </table></div>
      {onNew && <div className="ilist-new ttask-new"><input value={adding} placeholder="New task… (Enter)" onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} />{addErr && <span className="notice">{addErr}</span>}</div>}
      {menu && <div ref={menuEl} className="pg-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
        {!far(menu.r) && <button role="menuitem" onClick={() => { const r = menu.r; setMenu(null); open(r.id); }}>Open in the context column</button>}
        <button role="menuitem" onClick={() => { const r = menu.r; setMenu(null); router.push(hrefOf(r)); }}>Open in its document</button>
        <button role="menuitem" onClick={() => { const r = menu.r; setMenu(null); navigator.clipboard?.writeText(r.id).catch(() => {}); }}>Copy id</button>
        {!far(menu.r) && menu.r.status !== 'done' && <button role="menuitem" onClick={() => { const r = menu.r; setMenu(null); void setStatus(r, 'done'); }}>Mark done</button>}
      </div>}
    </div>
  );
}

// a status section of the table: its head row folds it; done starts folded
function Section({ label, n, closed, children }: { label: string; n: number; closed: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!closed);
  return <tbody className="ttask-section">
    <tr className="ttask-sec" onClick={() => setOpen(o => !o)}><td colSpan={6}><span className="tchev">{open ? '▾' : '▸'}</span><StatusPill status={label} /><small className="muted"> {n}</small></td></tr>
    {open && children}
  </tbody>;
}
