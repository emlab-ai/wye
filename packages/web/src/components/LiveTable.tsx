'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePeek, type OwnType } from './PeekProvider';
import { EmbeddedCard } from './EmbeddedCard';
import { filterRows, parseViewQuery, viewQuery, sortRows, isOpen, type Filters, type InstanceRow, type InstanceTable } from '@/lib/instance-table';
import { statusOptions } from '@/lib/props';
import { DateField } from './DateField';

// A Data table or Data list from the whole product (decision:wf2.live-collections): `scope=product` on the table's
// marker. Its rows are not written in this page — they are the product's items of the kind, wherever each is defined,
// that the filter on the marker keeps (open=1, due=7d, owner=me, a status, a column value). Each row looks and edits
// like a row of any table — the status, the date, the owner, a type's columns — and an edit is written where the item
// lives (the node API), so the table is always current and an edit here is an edit there.

type Props = { product: string; kind: string; query: string; view: string; type?: OwnType; head: React.ReactNode; onQuery: (q: string) => void };
const TASKISH = new Set(['goal', 'task', 'commitment']);
const DUE_WINDOWS = ['', 'late', 'today', '7d', '14d', '30d'];

export function LiveTable({ product, kind, query, view, type, head, onQuery }: Props) {
  const { statuses: byKind } = usePeek();
  const [table, setTable] = useState<InstanceTable | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Record<string, Partial<InstanceRow>>>({});   // edits not yet back from the graph
  // a row edited here stays until the page is opened again — completing it does not make it vanish (rule:table-hides-done)
  const touched = useRef(new Set<string>());
  const load = useCallback(() => {
    fetch(`/api/${product}/view/${kind}`).then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? r.statusText); return r.json() as Promise<InstanceTable>; })
      .then(t => { setTable(t); setErr(''); setLocal({}); }).catch(e => setErr(String(e.message ?? e)));
  }, [product, kind]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {   // the graph changed on disk (an edit here, an agent, an import): fetch again
    const h = (e: Event) => { if ((e as CustomEvent<{ kinds: string[] }>).detail?.kinds?.includes('graph')) load(); };
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, [load]);

  const cols = useMemo(() => (table?.columns ?? []).map(c => c.name), [table]);
  const f: Filters = useMemo(() => parseViewQuery(query, cols), [query, cols]);
  const set = (patch: Partial<Filters>) => onQuery(viewQuery({ ...f, ...patch, props: { ...(patch.props ?? f.props) } }));
  const rows = useMemo(() => {
    if (!table) return [];
    const merged = table.rows.map(r => (local[r.id] ? { ...r, ...local[r.id], props: { ...r.props, ...(local[r.id].props ?? {}) } } : r));
    // like any table, what is done is hidden unless asked for — a filter that says open, a done status or done=show
    const shown = merged.filter(r => touched.current.has(r.id) || filterRows([r], f, { me: table.me }).length).filter(r => touched.current.has(r.id) || f.done === 'show' || f.status || isOpen(r));
    return f.sort ? sortRows(shown, f.sort) : [...shown].sort((a, b) => (a.props.due || a.props.target || '9999').localeCompare(b.props.due || b.props.target || '9999') || a.title.localeCompare(b.title));
  }, [table, f, local]);

  const edit = async (r: InstanceRow, patch: { status?: string; props?: Record<string, string> }) => {
    touched.current.add(r.id);
    setLocal(l => ({ ...l, [r.id]: { ...l[r.id], ...(patch.status !== undefined ? { status: patch.status } : {}), ...(patch.props ? { props: { ...(l[r.id]?.props ?? {}), ...patch.props } } : {}) } }));
    const res = await fetch(`/api/${product}/node/${encodeURIComponent(r.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(patch.status !== undefined ? { status: patch.status } : {}), ...(patch.props ? { props: Object.fromEntries(Object.entries(patch.props).map(([k, v]) => [k, v || null])) } : {}) }) }).catch(() => null);
    if (!res?.ok) setErr(`could not save ${r.id}`);
  };

  const dateKey = kind === 'goal' ? 'target' : 'due';
  const grid = type ? `minmax(360px, 520px) 128px${type.cols.map(c => (c.type === 'bool' ? ' 56px' : c.ref ? ' minmax(140px, 200px)' : ' minmax(112px, 180px)')).join('')}` : 'minmax(360px, 520px) 128px 112px 140px';
  const filterOn = !!(f.q || f.status || f.open || f.due || Object.values(f.props).some(Boolean));
  const mine = Object.values(f.props).includes('me');
  const ownerKey = cols.includes('owner') || !type ? 'owner' : cols.find(c => c === 'to' || c === 'from') ?? 'owner';
  const bar = (
    <div className="live-filter" onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <input type="search" placeholder="Search…" value={f.q} onChange={e => set({ q: e.target.value })} />
      <label><input type="checkbox" checked={f.open === '1'} onChange={e => set({ open: e.target.checked ? '1' : '' })} /> open only</label>
      <label>due <select value={f.due ?? ''} onChange={e => set({ due: e.target.value })}>{DUE_WINDOWS.map(w => <option key={w} value={w}>{w === '' ? 'any time' : w === 'late' ? 'late' : w === 'today' ? 'today or late' : `within ${w.replace('d', ' days')}`}</option>)}</select></label>
      <label><input type="checkbox" checked={mine} onChange={e => set({ props: { ...f.props, [ownerKey]: e.target.checked ? 'me' : '' } })} /> mine</label>
      {(table?.statuses ?? []).length > 1 && <label>status <select value={f.status} onChange={e => set({ status: e.target.value })}><option value="">any</option>{table!.statuses.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}</select></label>}
      <label><input type="checkbox" checked={f.done === 'show'} onChange={e => set({ done: e.target.checked ? 'show' : '' })} /> show done</label>
    </div>
  );
  const summary = (
    <span className="live-scope muted small" title="rows from the whole product: edit one here and it changes where it is defined">
      {table ? `${rows.length}${table.rows.length !== rows.length ? ` of ${table.rows.length}` : ''}` : '…'}
      <button type="button" className={`collection-filter-toggle ${filterOn ? 'on' : ''}`} onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(o => !o)}>⏷ filter</button>
    </span>
  );

  if (view === 'list') return (
    <div className={`collection c-list c-live c-${kind}`} contentEditable={false}>
      <div className="collection-list-head">{head}{summary}</div>
      {open && bar}
      {err && <p className="notice">{err}</p>}
      <div className="ilist">{rows.map(r => <EmbeddedCard key={r.id} id={r.id} className="ilist-item" inEditor />)}</div>
      {table && !rows.length && <p className="muted small live-empty">Nothing here right now.</p>}
    </div>
  );
  return (
    <div className={`collection c-live c-${kind}`} contentEditable={false}>
      <div className="nrow nrow-head" style={{ gridTemplateColumns: grid }}>
        <div className="nrow-cell nrow-name">{head}{summary}</div><div className="nrow-cell">Status</div>
        {type ? type.cols.map(c => <div key={c.name} className="nrow-cell">{c.name}</div>) : <><div className="nrow-cell">{dateKey === 'target' ? 'Target' : 'Due'}</div><div className="nrow-cell">Owner</div></>}
      </div>
      {open && bar}
      {err && <p className="notice">{err}</p>}
      {rows.map(r => <LiveRow key={r.id} r={r} grid={grid} type={type} dateKey={TASKISH.has(kind) ? dateKey : ''} statuses={[...new Set([...statusOptions(byKind, r.kind, r.status), 'done'])]} onEdit={p => edit(r, p)} />)}
      {table && !rows.length && <p className="muted small live-empty">Nothing here right now.</p>}
    </div>
  );
}

function LiveRow({ r, grid, type, dateKey, statuses, onEdit }: { r: InstanceRow; grid: string; type?: OwnType; dateKey: string; statuses: string[]; onEdit: (p: { status?: string; props?: Record<string, string> }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const peek = () => ref.current?.dispatchEvent(new CustomEvent('wf:select', { detail: r.id, bubbles: true }));
  const cell = (key: string, placeholder: string, kind = '') => kind === 'date' || kind === 'month'
    ? <DateField className="nrow-in" value={r.props[key] ?? ''} month={kind === 'month'} placeholder={placeholder} onCommit={v => onEdit({ props: { [key]: v } })} />
    : <LiveInput value={r.props[key] ?? ''} placeholder={placeholder} onCommit={v => onEdit({ props: { [key]: v } })} />;
  return (
    <div ref={ref} className={`nrow live-row k-${r.kind} ${isOpen(r) ? '' : 'done'}`} style={{ gridTemplateColumns: grid }} data-id={r.id}>
      <div className="nrow-cell nrow-name">
        <button type="button" className="nrow-open" title={r.id} onMouseDown={e => e.stopPropagation()} onClick={peek}><i style={{ background: `var(--k-${r.kind}, var(--k-other))` }} /></button>
        <span className="nrow-text live-text" onClick={peek} title={`${r.title} — ${r.doc}`}>{r.title}</span>
      </div>
      <div className="nrow-cell">
        <select className={`status-sel s-${r.status}`} value={r.status} onMouseDown={e => e.stopPropagation()} onChange={e => onEdit({ status: e.target.value })}>
          {statuses.map(st => <option key={st} value={st}>{st || '— status'}</option>)}
        </select>
      </div>
      {type ? type.cols.map(c => <div key={c.name} className="nrow-cell">{c.enum
        ? <select className="nrow-in" value={r.props[c.name] ?? ''} onMouseDown={e => e.stopPropagation()} onChange={e => onEdit({ props: { [c.name]: e.target.value } })}>{(r.props[c.name] && !c.enum.includes(r.props[c.name]) ? [r.props[c.name]] : []).concat(['', ...c.enum]).map(v => <option key={v} value={v}>{v || `— ${c.name}`}</option>)}</select>
        : cell(c.name, c.ref ? `${c.ref}:…` : c.name, c.type)}</div>)
        : <>{dateKey ? <div className="nrow-cell">{cell(dateKey, dateKey, dateKey === 'target' ? 'month' : 'date')}</div> : <div className="nrow-cell" />}<div className="nrow-cell">{cell('owner', 'owner')}</div></>}
    </div>
  );
}

// a cell edited in place, written when it loses focus or on Enter — not on every keystroke (each write is a file edit)
function LiveInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v.trim()); };
  return <input className="nrow-in" value={v} placeholder={placeholder} onMouseDown={e => e.stopPropagation()} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur(); } }} />;
}
