'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePeek, type OwnType } from './PeekProvider';
import { EmbeddedCard } from './EmbeddedCard';
import { parseViewQuery, viewQuery, isOpen, type Filters, type InstanceRow, type InstanceTable } from '@/lib/instance-table';
import { tableSql, oneLine } from '@/lib/table-sql';
import { statusOptions } from '@/lib/props';
import { DateField } from './DateField';
import { detailOf, knowledgeChanged } from '@/lib/change';

// Every Data table and Data list is a query (decision:wf2.table-is-sql). Its rows are what its SQL returns, over the
// graph of the whole product: a table on a page starts as this page's items of its kind (`page = 'module:…'`), "⊕ whole
// product" drops that line, and each switch of the filter bar adds its line (lib/table-sql). The SQL shows under the
// bar; edited by hand it is the table's own (`sql=` on the marker) and the switches step aside until "Back to filters".
// A result with an `id` column is the items: each row looks and edits like any row — status, date, owner, a type's
// columns — and an edit is written where the item lives: in this page's editor when the item is defined here (`own`),
// else through the node API. A result's other columns show beside, read only; a result with no `id` is a plain table.

// the rows a table on a page keeps in the page (the blocks under its marker): new rows go there, and an item the page
// defines is edited in the editor that holds it — a write to the file under an open editor would conflict
export type OwnRows = {
  has: (id: string) => 'table' | 'page' | null;   // the item is a row of this table, defined elsewhere on the page, or not here
  add: (title: string) => string | null;   // the new item's id
  edit: (id: string, patch: RowPatch) => boolean;   // false: the item is not in this page
  remove: (id: string) => boolean;
};
export type RowPatch = { status?: string; props?: Record<string, string>; title?: string };
type Props = { product: string; kind: string; query: string; view: string; type?: OwnType; head: React.ReactNode; onQuery: (q: string) => void; page?: string; own?: OwnRows };
type QResult = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; ms: number };
const TASKISH = new Set(['goal', 'task', 'commitment']);
const DUE_WINDOWS = ['', 'late', 'today', '7d', '14d', '30d'];
const SHOWN = new Set(['id', 'title', 'status', 'kind', 'open']);   // shown by every row of items already

export function LiveTable({ product, kind, query, view, type, head, onQuery, page, own }: Props) {
  const { statuses: byKind, open: openNode, index } = usePeek();
  // inside a page's editor a row selects its item (the column follows the editor); elsewhere — a Knowledge page — it opens it
  const rootRef = useRef<HTMLDivElement>(null); const [inEditor, setInEditor] = useState(true);
  useEffect(() => { setInEditor(!!rootRef.current?.closest('.doc-editor')); }, []);
  // Enter in a card's text (a list's cards are one line each) goes to the next item: the "New …" field
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const next = (e: Event) => { const input = el.querySelector<HTMLInputElement>('.live-new input'); if (input) { e.stopPropagation(); input.focus(); } };
    el.addEventListener('wf:next', next); return () => el.removeEventListener('wf:next', next);
  });
  const [table, setTable] = useState<InstanceTable | null>(null);
  const [res, setRes] = useState<QResult | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Record<string, Partial<InstanceRow>>>({});   // edits not yet back from the graph
  const [pending, setPending] = useState<{ id: string; title: string }[]>([]);   // rows added here, not yet in the graph
  // a row edited here stays until the page is opened again — completing it does not make it vanish (rule:table-hides-done)
  const touched = useRef(new Set<string>()); const lastIds = useRef<string[]>([]);

  const cols = useMemo(() => (table?.columns ?? []).map(c => c.name), [table]);
  const f: Filters = useMemo(() => parseViewQuery(query, cols), [query, cols]);
  const set = (patch: Partial<Filters>) => onQuery(viewQuery({ ...f, ...patch, props: { ...(patch.props ?? f.props) } }));
  const generated = useMemo(() => tableSql({ kind, page, f, me: table?.me }), [kind, page, f, table?.me]);
  const sql = f.sql || generated;
  // another query is another set of rows: what was kept for having been edited goes
  useEffect(() => { touched.current.clear(); lastIds.current = []; }, [sql]);

  const load = useCallback(() => {
    fetch(`/api/${product}/view/${kind}`).then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? r.statusText); return r.json() as Promise<InstanceTable>; })
      .then(t => { setTable(t); setLocal({}); }).catch(e => setErr(String(e.message ?? e)));
  }, [product, kind]);
  const run = useCallback(() => {
    if (!table) return;   // the generated SQL needs who `me` is
    fetch(`/api/${product}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message ?? r.statusText); setRes(j); setErr(''); })
      .catch(e => setErr(String(e.message ?? e)));
  }, [product, sql, table]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { run(); }, [run]);
  useEffect(() => {   // the graph changed on disk (an edit here, an agent, an import): fetch again
    const h = (e: Event) => { if (knowledgeChanged(detailOf(e))) load(); };   // not for a save of prose (lib/change)
    window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
  }, [load]);

  const hasId = !!res?.columns.includes('id');
  const byId = useMemo(() => new Map((table?.rows ?? []).map(r => [r.id, r])), [table]);
  const rowOf = useCallback((id: string, row?: Record<string, unknown>): InstanceRow => {
    const r = byId.get(id); const e = index[id];
    const base: InstanceRow = r ?? { id, kind: e?.kind ?? id.split(':')[0], title: String(row?.title ?? e?.title ?? id), status: String(row?.status ?? e?.status ?? ''), file: e?.file ?? '', doc: e?.doc ?? '', props: {} };
    const l = local[id]; return l ? { ...base, ...l, props: { ...base.props, ...(l.props ?? {}) } } : base;
  }, [byId, index, local]);
  const ids = useMemo(() => {
    if (!res || !hasId) return [];
    const got = res.rows.map(r => String(r.id ?? '')).filter(Boolean);
    // a row edited here keeps its place until the page is opened again, though the query no longer returns it
    const kept = lastIds.current.filter(id => touched.current.has(id) && !got.includes(id));
    const out = [...got]; for (const id of kept) out.splice(Math.min(lastIds.current.indexOf(id), out.length), 0, id);
    return out;
  }, [res, hasId]);
  useEffect(() => { lastIds.current = ids; }, [ids]);
  useEffect(() => { if (pending.length) setPending(p => p.filter(x => !ids.includes(x.id))); }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const valuesByRow = useMemo(() => new Map((res?.rows ?? []).map(r => [String(r.id ?? ''), r])), [res]);
  // a query that selects columns shows those (an item's own property stays editable); `SELECT id` shows the kind's own
  const selected = (res?.columns ?? []).filter(c => hasId ? !SHOWN.has(c) : true);

  const edit = async (r: InstanceRow, patch: RowPatch) => {
    touched.current.add(r.id);
    setLocal(l => ({ ...l, [r.id]: { ...l[r.id], ...(patch.status !== undefined ? { status: patch.status } : {}), ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.props ? { props: { ...(l[r.id]?.props ?? {}), ...patch.props } } : {}) } }));
    if (own?.edit(r.id, patch)) return;
    if (patch.title !== undefined) return;   // a title is edited where the item is
    const res = await fetch(`/api/${product}/node/${encodeURIComponent(r.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(patch.status !== undefined ? { status: patch.status } : {}), ...(patch.props ? { props: Object.fromEntries(Object.entries(patch.props).map(([k, v]) => [k, v || null])) } : {}) }) }).catch(() => null);
    if (!res?.ok) setErr(`could not save ${r.id}`);
  };
  const add = (title: string) => { const id = own?.add(title); if (id) { touched.current.add(id); setPending(p => [...p, { id, title }]); } };

  const dateKey = kind === 'goal' ? 'target' : 'due';
  const grid = selected.length ? `minmax(240px, 1fr) 112px${selected.map(() => ' minmax(96px, 220px)').join('')}`
    : type ? `minmax(360px, 520px) 128px${type.cols.map(c => (c.type === 'bool' ? ' 56px' : c.ref ? ' minmax(140px, 200px)' : ' minmax(112px, 180px)')).join('')}` : 'minmax(360px, 520px) 128px 112px 140px';
  const custom = !!f.sql;
  const filterOn = !!(f.q || f.status || f.open || f.due || custom || Object.values(f.props).some(Boolean));
  const mine = Object.values(f.props).includes('me');
  const ownerKey = cols.includes('owner') || !type ? 'owner' : cols.find(c => c === 'to' || c === 'from') ?? 'owner';
  const bar = (
    <div className="live-filter-wrap" onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <fieldset className="live-filter" disabled={custom} title={custom ? 'this table runs its own SQL — "Back to filters" to use these again' : undefined}>
        <input type="search" placeholder="Search…" value={f.q} onChange={e => set({ q: e.target.value })} />
        <label><input type="checkbox" checked={f.open === '1'} onChange={e => set({ open: e.target.checked ? '1' : '' })} /> open only</label>
        <label>due <select value={f.due ?? ''} onChange={e => set({ due: e.target.value })}>{DUE_WINDOWS.map(w => <option key={w} value={w}>{w === '' ? 'any time' : w === 'late' ? 'late' : w === 'today' ? 'today or late' : `within ${w.replace('d', ' days')}`}</option>)}</select></label>
        <label><input type="checkbox" checked={mine} onChange={e => set({ props: { ...f.props, [ownerKey]: e.target.checked ? 'me' : '' } })} /> mine</label>
        {(table?.statuses ?? []).length > 1 && <label>status <select value={f.status} onChange={e => set({ status: e.target.value })}><option value="">any</option>{table!.statuses.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}</select></label>}
        <label><input type="checkbox" checked={f.done === 'show'} onChange={e => set({ done: e.target.checked ? 'show' : '' })} /> show done</label>
      </fieldset>
      <SqlBox sql={sql} custom={custom} ctx={{ product, kind, page, me: table?.me }} onRun={q => set({ sql: q && oneLine(q) !== oneLine(generated) ? oneLine(q) : '' })} />
    </div>
  );
  const count = res ? `${ids.length}${res.truncated ? '+' : ''}` : '…';
  const summary = (
    <span className="live-scope muted small" title={page ? "this page's items — the query is under ⏷" : 'items from the whole product: edit one here and it changes where it is defined'}>
      {count}
      <button type="button" className={`collection-filter-toggle ${filterOn ? 'on' : ''}`} onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(o => !o)}>{custom ? '⏷ SQL' : '⏷ filter'}</button>
    </span>
  );
  const newRow = own && page && !custom ? <NewRow kind={kind} onAdd={add} /> : null;   // a page's own table takes new rows; one of the whole product only shows

  if (res && !hasId) return (   // not items: a plain result
    <div ref={rootRef} className={`collection c-live c-query c-${kind}`} contentEditable={false}>
      <div className="nrow nrow-head" style={{ gridTemplateColumns: selected.map(() => 'minmax(110px, 280px)').join(' ') || '1fr' }}>
        {selected.map((c, i) => <div key={c} className={`nrow-cell ${i ? '' : 'nrow-name'}`}>{i ? '' : <>{head}{summary}</>}{c}</div>)}
      </div>
      {open && bar}
      {err && <p className="notice live-empty">{err}</p>}
      {res.rows.map((row, i) => <div key={i} className="nrow live-row" style={{ gridTemplateColumns: selected.map(() => 'minmax(110px, 280px)').join(' ') }}>{selected.map(c => <div key={c} className="nrow-cell live-cell" title={cell(row[c])}>{cell(row[c])}</div>)}</div>)}
      {!res.rows.length && <p className="muted small live-empty">The query returned nothing.</p>}
    </div>
  );
  if (view === 'list') return (
    <div ref={rootRef} className={`collection c-list c-live c-${kind}`} contentEditable={false}>
      <div className="collection-list-head">{head}{summary}</div>
      {open && bar}
      {err && <p className="notice">{err}</p>}
      <div className="ilist">{ids.map(id => <div key={id} onClickCapture={e => { if (!inEditor && !(e.target as Element).closest('a, button, select, input, .embed-editor')) openNode(id); }}><EmbeddedCard id={id} className="ilist-item" inEditor={inEditor} /></div>)}
        {pending.map(p => <div key={p.id} className="ilist-item muted">{p.title}</div>)}</div>
      {newRow}
      {res && !ids.length && !pending.length && !own && <p className="muted small live-empty">Nothing here right now.</p>}
    </div>
  );
  return (
    <div ref={rootRef} className={`collection c-live c-${kind}`} contentEditable={false}>
      <div className="nrow nrow-head" style={{ gridTemplateColumns: grid }}>
        <div className="nrow-cell nrow-name">{head}{summary}</div><div className="nrow-cell">Status</div>
        {selected.length ? selected.map(c => <div key={c} className="nrow-cell">{c}</div>)
          : type ? type.cols.map(c => <div key={c.name} className="nrow-cell">{c.name}</div>) : <><div className="nrow-cell">{dateKey === 'target' ? 'Target' : 'Due'}</div><div className="nrow-cell">Owner</div></>}
      </div>
      {open && bar}
      {err && <p className="notice">{err}</p>}
      {ids.map(id => { const r = rowOf(id, valuesByRow.get(id));
        return <LiveRow key={id} r={r} grid={grid} type={type} dateKey={TASKISH.has(r.kind) ? (r.kind === 'goal' ? 'target' : 'due') : ''} statuses={[...new Set([...statusOptions(byKind, r.kind, r.status), 'done'])]}
          selected={selected.length ? { cols: selected, values: valuesByRow.get(id) ?? {} } : undefined} onEdit={p => edit(r, p)} onOpen={inEditor ? undefined : () => openNode(id)}
          onTitle={own?.has(id) ? t => edit(r, { title: t }) : undefined} onRemove={own?.has(id) === 'table' ? () => { if (own.remove(id)) { touched.current.delete(id); setRes(x => x && { ...x, rows: x.rows.filter(y => y.id !== id) }); } } : undefined} />; })}
      {pending.map(p => <div key={p.id} className="nrow live-row pending" style={{ gridTemplateColumns: grid }}><div className="nrow-cell nrow-name"><span className="nrow-open"><i /></span><span className="nrow-text muted">{p.title}</span></div></div>)}
      {newRow}
      {res && !ids.length && !pending.length && !own && <p className="muted small live-empty">Nothing here right now.</p>}
    </div>
  );
}

// keys heard on the element itself: inside a page's editor the table's wrapper stops keydown before React's root listener
function useKeys(handler: (e: KeyboardEvent) => void) {
  const h = useRef(handler); h.current = handler;
  return useCallback((el: HTMLElement | null) => { if (el && !(el as unknown as { __keys?: boolean }).__keys) { (el as unknown as { __keys?: boolean }).__keys = true; el.addEventListener('keydown', e => h.current(e)); } }, []);
}
const colKey = (k: string) => k.replace(/-/g, '_');
const cell = (v: unknown) => v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

// the last row of a table on a page: typing a title and Enter adds the item to this page, under the table's marker
function NewRow({ kind, onAdd }: { kind: string; onAdd: (title: string) => void }) {
  const [v, setV] = useState('');
  const keys = useKeys(e => { if (e.key === 'Enter' && v.trim()) { e.preventDefault(); onAdd(v.trim()); setV(''); } if (e.key === 'Escape') setV(''); });
  return (
    <div className="nrow live-row live-new">
      <div className="nrow-cell nrow-name">
        <span className="nrow-open"><i style={{ background: `var(--k-${kind}, var(--k-other))` }} /></span>
        <input className="nrow-in live-title" value={v} placeholder={`New ${kind}…`} onMouseDown={e => e.stopPropagation()} ref={keys} onChange={e => setV(e.target.value)} />
      </div>
    </div>
  );
}

function LiveRow({ r, grid, type, dateKey, statuses, selected, onEdit, onOpen, onTitle, onRemove }: { r: InstanceRow; grid: string; type?: OwnType; dateKey: string; statuses: string[]; selected?: { cols: string[]; values: Record<string, unknown> }; onEdit: (p: RowPatch) => void; onOpen?: () => void; onTitle?: (t: string) => void; onRemove?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const peek = () => onOpen ? onOpen() : ref.current?.dispatchEvent(new CustomEvent('wf:select', { detail: r.id, bubbles: true }));
  const cellOf = (key: string, placeholder: string, kind = '') => kind === 'date' || kind === 'month'
    ? <DateField className="nrow-in" value={r.props[key] ?? ''} month={kind === 'month'} placeholder={placeholder} onCommit={v => onEdit({ props: { [key]: v } })} />
    : <LiveInput value={r.props[key] ?? ''} placeholder={placeholder} onCommit={v => onEdit({ props: { [key]: v } })} />;
  return (
    <div ref={ref} className={`nrow live-row k-${r.kind} ${isOpen(r) ? '' : 'done'}`} style={{ gridTemplateColumns: grid }} data-id={r.id}>
      <div className="nrow-cell nrow-name">
        <button type="button" className="nrow-open" title={r.id} onMouseDown={e => e.stopPropagation()} onClick={peek}><i style={{ background: `var(--k-${r.kind}, var(--k-other))` }} /></button>
        {onTitle ? <LiveInput className="nrow-in live-title" value={plainTitle(r.title)} placeholder="title" onCommit={t => t && onTitle(t)} />
          : <span className="nrow-text live-text" onClick={peek} title={`${plainTitle(r.title)} — ${r.doc}`}>{plainTitle(r.title)}</span>}
        {onRemove && <button type="button" className="nrow-send nrow-del" title="Delete this row" onMouseDown={e => e.stopPropagation()} onClick={onRemove}>×</button>}
      </div>
      <div className="nrow-cell">
        <select className={`status-sel s-${r.status}`} value={r.status} onMouseDown={e => e.stopPropagation()} onChange={e => onEdit({ status: e.target.value })}>
          {statuses.map(st => <option key={st} value={st}>{st || '— status'}</option>)}
        </select>
      </div>
      {selected ? selected.cols.map(c => {
        // the item's own property — named as it is and holding its value — is edited in place; a joined value only shows
        const key = [c, c.replace(/_/g, '-')].find(k => k in r.props || k === 'due' || k === 'owner' || k === 'target' || type?.cols.some(t => t.name === k));
        const v = selected.values[c]; const own = key && (v ?? '') === (r.props[key] ?? '') ? key : null;
        const col = own ? type?.cols.find(t => t.name === own) : undefined;
        return <div key={c} className="nrow-cell">{own ? (col?.enum
          ? <select className="nrow-in" value={r.props[own] ?? ''} onMouseDown={e => e.stopPropagation()} onChange={e => onEdit({ props: { [own]: e.target.value } })}>{['', ...col.enum].map(x => <option key={x} value={x}>{x || `— ${own}`}</option>)}</select>
          : cellOf(own, own, own === 'due' ? 'date' : own === 'target' ? 'month' : col?.type ?? '')) : <span className="live-cell" title={cell(v)}>{cell(v)}</span>}</div>;
      })
      : type ? type.cols.map(c => <div key={c.name} className="nrow-cell">{c.enum
        ? <select className="nrow-in" value={r.props[c.name] ?? ''} onMouseDown={e => e.stopPropagation()} onChange={e => onEdit({ props: { [c.name]: e.target.value } })}>{(r.props[c.name] && !c.enum.includes(r.props[c.name]) ? [r.props[c.name]] : []).concat(['', ...c.enum]).map(v => <option key={v} value={v}>{v || `— ${c.name}`}</option>)}</select>
        : cellOf(c.name, c.ref ? `${c.ref}:…` : c.name, c.type)}</div>)
        : <>{dateKey ? <div className="nrow-cell">{cellOf(dateKey, dateKey, dateKey === 'target' ? 'month' : 'date')}</div> : <div className="nrow-cell" />}<div className="nrow-cell">{cellOf('owner', 'owner')}</div></>}
    </div>
  );
}

// a cell edited in place, written when it loses focus or on Enter — not on every keystroke (each write is a file edit)
function LiveInput({ value, placeholder, onCommit, className = 'nrow-in' }: { value: string; placeholder: string; onCommit: (v: string) => void; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v.trim()); };
  const keys = useKeys(e => { const t = e.target as HTMLInputElement; if (e.key === 'Enter') t.blur(); if (e.key === 'Escape') { setV(value); setTimeout(() => t.blur()); } });
  return <input ref={keys} className={className} value={v} placeholder={placeholder} onMouseDown={e => e.stopPropagation()} onChange={e => setV(e.target.value)} onBlur={commit} />;
}

// a title as it reads: markdown emphasis, links ([text](id) → text) and inline code taken off
const plainTitle = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '').replace(/(^|\s)[*_](\S)/g, '$1$2').replace(/\s+/g, ' ').trim();

// the SQL under a table's filter bar: what the switches made, or the table's own once edited — Run (⌘↵) keeps it on
// the table's marker; "Back to filters" drops it
export function SqlBox({ sql, custom, ctx, onRun }: { sql: string; custom: boolean; ctx: { product: string; kind: string; page?: string; me?: string[] }; onRun: (q: string) => void }) {
  const [v, setV] = useState(sql); const [msg, setMsg] = useState('');
  // ask an agent (decision:wf2.query-from-words): the words → a query the server has run once → into the box, and run
  const [ask, setAsk] = useState(''); const [busy, setBusy] = useState(false);
  const write = async () => {
    if (!ask.trim() || busy) return; setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/${ctx.product}/query/write`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask, sql: v, kind: ctx.kind, page: ctx.page, me: ctx.me }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.sql) { setV(j.sql); setAsk(''); onRun(j.sql); } else { if (j.sql) setV(j.sql); setMsg(j.message ?? 'the agent could not write a query'); }
    } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  const askKeys = useKeys(e => { if (e.key === 'Enter') { e.preventDefault(); void write(); } });
  useEffect(() => setV(sql), [sql]);
  const go = () => { const q = v.trim(); if (q.includes('-->')) { setMsg('the query cannot contain -->'); return; } setMsg(''); onRun(q); };
  const keys = useKeys(e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
  return (
    <div className="sql-box" onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <div className="sql-ask">
        <span className="sql-ask-mark" aria-hidden>✦</span>
        <input ref={askKeys} value={ask} disabled={busy} spellCheck={false} data-gramm="false" placeholder="Ask an agent: what should this table show? e.g. open commitments with their project, soonest first" onChange={e => setAsk(e.target.value)} />
        <button type="button" onClick={() => void write()} disabled={busy || !ask.trim()}>{busy ? 'writing…' : 'Write query'}</button>
      </div>
      <textarea ref={keys} data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" data-lt-active="false" autoComplete="off" autoCorrect="off" value={v} rows={Math.min(10, Math.max(3, v.split('\n').length + 1))} spellCheck={false} onChange={e => setV(e.target.value)} />
      <div className="sql-actions">
        <button type="button" className="pri" onClick={go} disabled={v === sql}>Run ⌘↵</button>
        {custom && <button type="button" onClick={() => onRun('')}>Back to filters</button>}
        <span className="muted small">{custom ? 'this table runs its own SQL' : 'the filters above write this SQL — edit it to make the table your own'}: <code>nodes</code> (id, kind, title, status, open, page, due, owner, project, state …, props), <code>edges</code> (src, dst, verb), <code>has(cell, v)</code>, graph patterns <code>FROM GRAPH_TABLE (wye MATCH (a:nodes)-[e:edges]-&gt;(b:nodes) COLUMNS (…))</code>. An <code>id</code> column makes each row the item.</span>
        {msg && <span className="notice">{msg}</span>}
      </div>
    </div>
  );
}
