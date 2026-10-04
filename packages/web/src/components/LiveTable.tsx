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
  const { statuses: byKind, open: openNode } = usePeek();
  // inside a page's editor a row selects its item (the column follows the editor); elsewhere — a Knowledge page — it opens it
  const rootRef = useRef<HTMLDivElement>(null); const [inEditor, setInEditor] = useState(true);
  useEffect(() => { setInEditor(!!rootRef.current?.closest('.doc-editor')); }, []);
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
  const filterOn = !!(f.q || f.status || f.open || f.due || f.sql || Object.values(f.props).some(Boolean));
  const [sqlOpen, setSqlOpen] = useState(!!f.sql);
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
      <button type="button" className={`collection-view-toggle ${sqlOpen ? 'on' : ''}`} onClick={() => setSqlOpen(o => !o)} title="Query the graph with SQL — joins, lookups, graph patterns">SQL</button>
    </div>
  );
  const sqlBox = (open || f.sql) && sqlOpen ? <SqlBox sql={f.sql ?? ''} onRun={q => set({ sql: q })} /> : null;
  const summary = (
    <span className="live-scope muted small" title="rows from the whole product: edit one here and it changes where it is defined">
      {table ? `${rows.length}${table.rows.length !== rows.length ? ` of ${table.rows.length}` : ''}` : '…'}
      <button type="button" className={`collection-filter-toggle ${filterOn ? 'on' : ''}`} onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(o => !o)}>⏷ filter</button>
    </span>
  );

  if (f.sql) return (
    <div ref={rootRef} className={`collection c-live c-query c-${kind}`} contentEditable={false}>
      <QueryRows product={product} sql={f.sql} inEditor={inEditor} onOpen={openNode}
        head={head} summaryExtra={<button type="button" className="collection-filter-toggle on" onMouseDown={e => e.stopPropagation()} onClick={() => { setOpen(o => !o); setSqlOpen(true); }}>⏷ query</button>} />
      {open && <SqlBox sql={f.sql} onRun={q => set({ sql: q })} />}
    </div>
  );
  if (view === 'list') return (
    <div ref={rootRef} className={`collection c-list c-live c-${kind}`} contentEditable={false}>
      <div className="collection-list-head">{head}{summary}</div>
      {open && bar}{sqlBox}
      {err && <p className="notice">{err}</p>}
      <div className="ilist">{rows.map(r => <div key={r.id} onClickCapture={e => { if (!inEditor && !(e.target as Element).closest('a, button, select, input, .embed-editor')) openNode(r.id); }}><EmbeddedCard id={r.id} className="ilist-item" inEditor={inEditor} /></div>)}</div>
      {table && !rows.length && <p className="muted small live-empty">Nothing here right now.</p>}
    </div>
  );
  return (
    <div ref={rootRef} className={`collection c-live c-${kind}`} contentEditable={false}>
      <div className="nrow nrow-head" style={{ gridTemplateColumns: grid }}>
        <div className="nrow-cell nrow-name">{head}{summary}</div><div className="nrow-cell">Status</div>
        {type ? type.cols.map(c => <div key={c.name} className="nrow-cell">{c.name}</div>) : <><div className="nrow-cell">{dateKey === 'target' ? 'Target' : 'Due'}</div><div className="nrow-cell">Owner</div></>}
      </div>
      {open && bar}{sqlBox}
      {err && <p className="notice">{err}</p>}
      {rows.map(r => <LiveRow key={r.id} r={r} grid={grid} type={type} dateKey={TASKISH.has(kind) ? dateKey : ''} statuses={[...new Set([...statusOptions(byKind, r.kind, r.status), 'done'])]} onEdit={p => edit(r, p)} onOpen={inEditor ? undefined : () => openNode(r.id)} />)}
      {table && !rows.length && <p className="muted small live-empty">Nothing here right now.</p>}
    </div>
  );
}

function LiveRow({ r, grid, type, dateKey, statuses, onEdit, onOpen }: { r: InstanceRow; grid: string; type?: OwnType; dateKey: string; statuses: string[]; onEdit: (p: { status?: string; props?: Record<string, string> }) => void; onOpen?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const peek = () => onOpen ? onOpen() : ref.current?.dispatchEvent(new CustomEvent('wf:select', { detail: r.id, bubbles: true }));
  const cell = (key: string, placeholder: string, kind = '') => kind === 'date' || kind === 'month'
    ? <DateField className="nrow-in" value={r.props[key] ?? ''} month={kind === 'month'} placeholder={placeholder} onCommit={v => onEdit({ props: { [key]: v } })} />
    : <LiveInput value={r.props[key] ?? ''} placeholder={placeholder} onCommit={v => onEdit({ props: { [key]: v } })} />;
  return (
    <div ref={ref} className={`nrow live-row k-${r.kind} ${isOpen(r) ? '' : 'done'}`} style={{ gridTemplateColumns: grid }} data-id={r.id}>
      <div className="nrow-cell nrow-name">
        <button type="button" className="nrow-open" title={r.id} onMouseDown={e => e.stopPropagation()} onClick={peek}><i style={{ background: `var(--k-${r.kind}, var(--k-other))` }} /></button>
        <span className="nrow-text live-text" onClick={peek} title={`${plainTitle(r.title)} — ${r.doc}`}>{plainTitle(r.title)}</span>
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

// a title as it reads: markdown emphasis, links ([text](id) → text) and inline code taken off
const plainTitle = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '').replace(/(^|\s)[*_](\S)/g, '$1$2').replace(/\s+/g, ' ').trim();

// Query mode (decision:wf2.graph-query): the table's `sql` runs over the graph; a row per result row. With an `id`
// column each row is the item — its title opens it, its status is edited in place — and the other columns show beside;
// without one the result is a read-only table.
type QResult = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; ms: number };
export function QueryRows({ product, sql, head, summaryExtra, inEditor, onOpen }: { product: string; sql: string; head: React.ReactNode; summaryExtra: React.ReactNode; inEditor: boolean; onOpen: (id: string) => void }) {
  const { index, statuses: byKind } = usePeek();
  const [res, setRes] = useState<QResult | null>(null); const [err, setErr] = useState('');
  const run = useCallback(() => {
    fetch(`/api/${product}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message ?? r.statusText); setRes(j); setErr(''); }).catch(e => { setErr(String(e.message ?? e)); setRes(null); });
  }, [product, sql]);
  useEffect(() => { run(); }, [run]);
  useEffect(() => { const h = (e: Event) => { if ((e as CustomEvent<{ kinds: string[] }>).detail?.kinds?.includes('graph')) run(); }; window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h); }, [run]);
  const hasId = !!res?.columns.includes('id');
  const extra = (res?.columns ?? []).filter(c => !(hasId && (c === 'id' || c === 'title' || c === 'status')));
  const grid = hasId ? `minmax(320px, 480px) 128px${extra.map(() => ' minmax(110px, 240px)').join('')}` : extra.map(() => 'minmax(110px, 280px)').join(' ');
  const cell = (v: unknown) => v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const setStatus = async (id: string, status: string) => { await fetch(`/api/${product}/node/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => undefined); };
  return (
    <>
      <div className="nrow nrow-head" style={{ gridTemplateColumns: grid || '1fr' }}>
        <div className="nrow-cell nrow-name">{head}<span className="live-scope muted small">query · {res ? `${res.rows.length}${res.truncated ? '+' : ''}` : '…'}{summaryExtra}</span></div>
        {hasId && <div className="nrow-cell">Status</div>}
        {extra.map(c => <div key={c} className="nrow-cell">{c}</div>)}
      </div>
      {err && <p className="notice live-empty">{err}</p>}
      {res?.rows.map((row, i) => {
        const id = hasId ? String(row.id ?? '') : ''; const e = id ? index[id] : undefined;
        const title = String(row.title ?? e?.title ?? id);
        return (
          <div key={id || i} className="nrow live-row" style={{ gridTemplateColumns: grid || '1fr' }} data-id={id || undefined}>
            {hasId && <div className="nrow-cell nrow-name">
              <button type="button" className="nrow-open" title={id} onMouseDown={ev => ev.stopPropagation()} onClick={ev => inEditor ? ev.currentTarget.dispatchEvent(new CustomEvent('wf:select', { detail: id, bubbles: true })) : onOpen(id)}><i style={{ background: `var(--k-${e?.kind ?? 'other'}, var(--k-other))` }} /></button>
              <span className="nrow-text live-text" onClick={ev => inEditor ? ev.currentTarget.dispatchEvent(new CustomEvent('wf:select', { detail: id, bubbles: true })) : onOpen(id)} title={id}>{plainTitle(title)}</span>
            </div>}
            {hasId && <div className="nrow-cell">{e ? <select className={`status-sel s-${e.status}`} defaultValue={e.status} onMouseDown={ev => ev.stopPropagation()} onChange={ev => void setStatus(id, ev.target.value)}>{[...new Set([...statusOptions(byKind, e.kind, e.status), 'done'])].map(st => <option key={st} value={st}>{st || '— status'}</option>)}</select> : <span className="muted small">{cell(row.status)}</span>}</div>}
            {extra.map(c => <div key={c} className="nrow-cell live-cell" title={cell(row[c])}>{cell(row[c])}</div>)}
          </div>);
      })}
      {res && !res.rows.length && <p className="muted small live-empty">The query returned nothing.</p>}
    </>
  );
}

// the SQL editor of a table's filter bar: run writes it onto the table (quotes in SQL are single; the marker holds it)
export function SqlBox({ sql, onRun }: { sql: string; onRun: (q: string) => void }) {
  const [v, setV] = useState(sql); const [msg, setMsg] = useState('');
  useEffect(() => setV(sql), [sql]);
  const go = () => { const q = v.trim(); if (/"/.test(q)) { setMsg('use single quotes in the query — double quotes cannot be saved on the table'); return; } if (q.includes('-->')) { setMsg('the query cannot contain -->'); return; } setMsg(''); onRun(q); };
  return (
    <div className="sql-box" onMouseDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }}>
      <textarea value={v} rows={Math.min(8, Math.max(3, v.split('\n').length))} spellCheck={false} placeholder={"SELECT c.id, c.due, p.title AS project FROM nodes c JOIN nodes p ON p.id = c.project WHERE c.kind = 'commitment' AND c.state = 'open'"} onChange={e => setV(e.target.value)} />
      <div className="sql-actions">
        <button type="button" className="pri" onClick={go}>Run ⌘↵</button>
        {sql && <button type="button" onClick={() => onRun('')}>Back to filters</button>}
        <span className="muted small">tables <code>nodes</code> (id, kind, title, status, due, owner, project, state …, props) and <code>edges</code> (src, dst, verb); graph patterns: <code>FROM GRAPH_TABLE (wye MATCH (a:nodes)-[e:edges]-&gt;(b:nodes) COLUMNS (…))</code>. An <code>id</code> column makes each row the item.</span>
        {msg && <span className="notice">{msg}</span>}
      </div>
    </div>
  );
}
