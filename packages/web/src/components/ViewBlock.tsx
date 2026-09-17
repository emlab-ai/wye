'use client';
import { useEffect, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { usePeek } from './PeekProvider';
import { InstanceTable } from './InstanceTable';
import { KINDS } from '@/lib/ids';
import { parseViewQuery, viewQuery, type Filters, type InstanceTable as Table } from '@/lib/instance-table';

// the kinds a view can list: the product's own types first, then the base kinds people look at as lists
const BASE_VIEW_KINDS = KINDS.filter(k => !['field', 'prop', 'block', 'product', 'module', 'type', 'value', 'state', 'flag', 'setting', 'drift', 'tool'].includes(k));

// ProseMirror listens natively on the editor root; stop mouse-down and keys at the block so the search box, chips and
// selects behave normally (click and change still reach React — the same rule as the table header in DocEditor)
function stop(el: HTMLElement | null) {
  if (!el || (el as unknown as { __stopped?: boolean }).__stopped) return;
  (el as unknown as { __stopped?: boolean }).__stopped = true;
  for (const ev of ['mousedown', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
}

// A live view of a type's instances inside a document (req:wf2.instances.view-block): the markdown is one line,
// `<!-- view:<slug> key=value … -->`; the rows come from the graph, the filters from the line and go back to it.
export const ViewBlock = createReactBlockSpec(
  { type: 'view', propSchema: { slug: { default: 'task' }, query: { default: '' } }, content: 'none' },
  {
    render: props => {
      const { slug, query } = props.block.props as { slug: string; query: string };
      const { product, ownTypes } = usePeek();
      const [table, setTable] = useState<Table | null>(null);
      const [err, setErr] = useState('');
      const [version, setVersion] = useState(0);
      useEffect(() => { // refetch when the graph changes on disk (LiveRefresh relays the server's events)
        const h = (e: Event) => { if ((e as CustomEvent<{ kinds: string[] }>).detail.kinds.includes('graph')) setVersion(v => v + 1); };
        window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
      }, []);
      useEffect(() => {
        let live = true;
        fetch(`/api/${product}/view/${slug}`).then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? r.statusText); return r.json() as Promise<Table>; })
          .then(t => { if (live) { setTable(t); setErr(''); } }).catch(e => { if (live) setErr(String(e.message ?? e)); });
        return () => { live = false; };
      }, [product, slug, version]);
      const options = [...ownTypes.map(t => t.slug), ...BASE_VIEW_KINDS.filter(k => !ownTypes.some(t => t.slug === k))]; if (!options.includes(slug)) options.push(slug);
      const initial = table ? parseViewQuery(query, table.columns.map(c => c.name)) : undefined;
      const onChange = (f: Filters) => { const q = viewQuery(f); if (q !== query) props.editor.updateBlock(props.block, { props: { query: q } } as never); };
      return (
        <div className="view-block" contentEditable={false} ref={stop}>
          <div className="view-head">
            <span className="chips-label">view</span>
            <select className="collection-kind" value={slug} title="the type this view lists" onChange={e => props.editor.updateBlock(props.block, { props: { slug: e.target.value, query: '' } } as never)}>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {table && <span className="muted small">{table.rows.length} {table.typed ? '' : '· not a declared type'}</span>}
            {err && <span className="bad">{err}</span>}
          </div>
          {table && initial && <InstanceTable product={product} table={table} initial={initial} onChange={onChange} readOnly />}
          {table && !table.rows.length && <p className="muted small">No {slug}s yet.</p>}
        </div>
      );
    },
  },
);
