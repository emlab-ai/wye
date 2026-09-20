'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { SmartTag } from './SmartTag';
import { EmbeddedCard } from './EmbedBlock';
import { StatusPill } from './Pills';
import { Linkified } from './IdLink';
import { assetBase, docRoute } from '@/lib/doc';
import { EMPTY_FILTERS, filterRows, filtersToQuery, groupRows, sortRows, type Filters, type InstanceRow, type InstanceTable as Table } from '@/lib/instance-table';

const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
const items = (v: string) => v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);

// Every instance of one type (or node of one kind) as a filterable table: search, status chips with counts, a chip
// row per enum / bool column, a select per ref column, group by, sort by column. The filter state is the caller's:
// a page keeps it in the URL (urlState), a view block in its key=value line (onChange).
export function InstanceTable({ product, table, initial, urlState, onChange, readOnly, as = 'table' }: { product: string; table: Table; initial?: Filters; urlState?: boolean; onChange?: (f: Filters) => void; as?: 'table' | 'list'; readOnly?: boolean }) {
  const { open, openId, index } = usePeek();
  const [f, setF] = useState<Filters>(initial ?? EMPTY_FILTERS);
  useEffect(() => { setF(initial ?? EMPTY_FILTERS); }, [initial]);
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch, props: { ...(patch.props ?? f.props) } };
    setF(next); onChange?.(next);
    if (urlState && typeof window !== 'undefined') { const q = filtersToQuery(next); history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); }
  };
  const setProp = (k: string, v: string) => set({ props: { ...f.props, [k]: f.props[k] === v ? '' : v } });
  const rows = useMemo(() => sortRows(filterRows(table.rows, f), f.sort), [table.rows, f]);
  const groups = useMemo(() => groupRows(rows, f.group), [rows, f.group]);
  // values a ref or free column actually holds, for its filter select
  const seen = (name: string) => { const s = new Set<string>(); for (const r of table.rows) for (const v of items(r.props[name] ?? '')) s.add(v); return [...s].sort(); };
  const label = (id: string) => { const e = index[id]; return e && e.title !== id ? plain(e.title) : id; };
  const groupable = ['doc', 'status', ...table.columns.filter(c => c.kind !== 'string').map(c => c.name)];
  const sortOn = (col: string) => set({ sort: f.sort === col ? '-' + col : f.sort === '-' + col ? '' : col });
  const arrow = (col: string) => f.sort === col ? ' ▲' : f.sort === '-' + col ? ' ▼' : '';
  const active = Object.values(f.props).some(Boolean) || f.q || f.status;
  const span = 2 + table.columns.length + (table.typed ? 0 : 1);
  const Row = ({ r }: { r: InstanceRow }) => {
    const where = docRoute(r.file);
    const page = index[r.id]?.doc; // a page instance (rule:page-node-line) links to the document itself
    const href = page && where ? `/${product}/${where.project}/d/${page}` : where ? `/${product}/${where.project}/d/${where.doc}#n-${encodeURIComponent(r.id)}` : '';
    return (
      <tr className={r.id === openId ? 'on' : ''} onClick={() => open(r.id)} role="button">
        <td><div className="itable-id"><SmartTag id={r.id} /><StatusPill status={r.status} />{href && <Link className="klist-doc" href={href} title={page ? 'a page — open it' : r.doc} onClick={e => e.stopPropagation()}>{page ? '📄' : '↗'}</Link>}</div><div className="itable-title">{r.title !== r.id && !r.id.endsWith(':' + r.title) ? plain(r.title) : ''}</div></td>
        {table.columns.map(c => <td key={c.name} className={r.props[c.name] ? '' : 'empty'}>{r.props[c.name] ? <Linkified text={r.props[c.name].replace(/^\[|\]$/g, '')} base={assetBase(r.file)} /> : <span className="muted">—</span>}</td>)}
        {!table.typed && <td className="itable-rels">{(r.rels ?? []).slice(0, 6).map(e => <span key={e.verb + e.to} className="klist-rel"><small>{e.verb}</small><SmartTag id={e.to} /></span>)}</td>}
        <td className="itable-doc">{href ? <Link href={href} onClick={e => e.stopPropagation()}>{r.doc}</Link> : <span className="muted">{r.doc}</span>}</td>
      </tr>);
  };
  return (
    <div className={`itable ${readOnly ? 'ro' : ''}`}>
      <div className="track-tools itable-tools">
        <div className="itable-row">
          <input type="search" placeholder={`Search ${table.slug}s…`} value={f.q} onChange={e => set({ q: e.target.value })} />
          <div className="chips"><span className="chips-label">group by</span>
            <button className={`chip ${!f.group ? 'on' : ''}`} onClick={() => set({ group: '' })}>none</button>
            {groupable.map(g => <button key={g} className={`chip ${f.group === g ? 'on' : ''}`} onClick={() => set({ group: f.group === g ? '' : g })}>{g === 'doc' ? 'document' : g}</button>)}
          </div>
        </div>
        <div className="chips">
          <button className={`chip ${!f.status ? 'on' : ''}`} onClick={() => set({ status: '' })}>All <small>{table.rows.length}</small></button>
          {table.statuses.map(([st, n]) => <button key={st} className={`chip s-${st} ${f.status === st ? 'on' : ''}`} onClick={() => set({ status: f.status === st ? '' : st })}>{st} <small>{n}</small></button>)}
        </div>
        {table.columns.filter(c => c.kind === 'enum' || c.kind === 'bool').map(c => (
          <div key={c.name} className="chips"><span className="chips-label">{c.name}</span>
            {(c.kind === 'bool' ? ['true', 'false'] : c.options ?? []).map(v => <button key={v} className={`chip ${f.props[c.name] === v ? 'on' : ''}`} onClick={() => setProp(c.name, v)}>{v}</button>)}
          </div>))}
        {table.columns.filter(c => c.kind === 'ref').map(c => { const vals = seen(c.name); return vals.length ? (
          <div key={c.name} className="chips"><span className="chips-label">{c.name}</span>
            <select className="itable-select" value={f.props[c.name] ?? ''} onChange={e => set({ props: { ...f.props, [c.name]: e.target.value } })}>
              <option value="">any</option>{vals.map(v => <option key={v} value={v}>{label(v)}</option>)}
            </select>
          </div>) : null; })}
        {active && <div className="chips"><span className="muted small">{rows.length} of {table.rows.length}</span><button className="linkish" onClick={() => set({ ...EMPTY_FILTERS, group: f.group, sort: f.sort })}>clear filters</button></div>}
      </div>
      {as === 'list' ? (
        // the block form (rule:view-block, req:wf2.instances.view-as-blocks): every instance as its own card, editable in place
        <div className="ilist">
          {(groups ?? [['', rows]] as [string, InstanceRow[]][]).map(([k, rs]) => (
            <div key={k} className="ilist-group">
              {k && <div className="ilist-group-head">{k.startsWith(k.split(':')[0] + ':') && index[k] ? label(k) : k} <small className="muted">{rs.length}</small></div>}
              {rs.map(r => <EmbeddedCard key={r.id} id={r.id} className="ilist-item" />)}
            </div>))}
          {!rows.length && <p className="muted">No {table.slug}s match.</p>}
        </div>
      ) : (
      <div className="ttable"><table className="type-instances itable-grid">
        <thead><tr>
          <th onClick={() => sortOn('title')} className="sortable">id{arrow('title')}</th>
          {table.columns.map(c => <th key={c.name} onClick={() => sortOn(c.name)} className="sortable">{c.name}{arrow(c.name)}</th>)}
          {!table.typed && <th>relations</th>}
          <th onClick={() => sortOn('doc')} className="sortable">document{arrow('doc')}</th>
        </tr></thead>
        <tbody>
          {groups
            ? groups.map(([k, rs]) => <GroupRows key={k} label={k.startsWith(k.split(':')[0] + ':') && index[k] ? label(k) : k} count={rs.length} span={span}>{rs.map(r => <Row key={r.id} r={r} />)}</GroupRows>)
            : rows.map(r => <Row key={r.id} r={r} />)}
          {!rows.length && <tr><td colSpan={span} className="muted">No {table.slug}s match.</td></tr>}
        </tbody>
      </table></div>)}
    </div>
  );
}

function GroupRows({ label, count, span, children }: { label: string; count: number; span: number; children: React.ReactNode }) {
  const [closed, setClosed] = useState(false);
  return (<>
    <tr className="itable-group" onClick={() => setClosed(c => !c)}><td colSpan={span}><span className="tchev">{closed ? '▸' : '▾'}</span>{label}<small className="muted"> {count}</small></td></tr>
    {!closed && children}
  </>);
}
