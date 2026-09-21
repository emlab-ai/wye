'use client';
import { useContext } from 'react';
import { EditorScope } from './EditorScope';
import { useEffect, useRef, useState } from 'react';
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
      const { slug, query: rawQuery } = props.block.props as { slug: string; query: string };
      const scope = useContext(EditorScope);   // inside a node's column: the table starts folded (decision:wf2.column-is-content)
      // `as=table` on the line asks for the table; the block form is the default (req:wf2.instances.view-as-blocks)
      const asTable = /(^|\s)as=table(\s|$)/.test(rawQuery);
      // `scope=project` keeps the rows of this document's project; the default is the whole product (decision:wf2.views-are-pages)
      const scopeProject = /(^|\s)scope=project(\s|$)/.test(rawQuery);
      const query = rawQuery.replace(/(^|\s)as=(table|list)(?=\s|$)/, '').replace(/(^|\s)scope=(project|product)(?=\s|$)/, '').trim();
      const withAs = (q: string) => [q, asTable ? 'as=table' : '', scopeProject ? 'scope=project' : ''].filter(Boolean).join(' ');
      const hostRef = useRef<HTMLDivElement>(null);
      const [project, setProject] = useState('');
      useEffect(() => { setProject((hostRef.current?.closest('.doc-editor') as HTMLElement | null)?.dataset.project ?? ''); }, []);
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
      const onChange = (f: Filters) => { const q = viewQuery(f); if (q !== query) props.editor.updateBlock(props.block, { props: { query: withAs(q) } } as never); };
      const setAs = (t: boolean) => props.editor.updateBlock(props.block, { props: { query: [query, t ? 'as=table' : '', scopeProject ? 'scope=project' : ''].filter(Boolean).join(' ') } } as never);
      const setScope = (proj: boolean) => props.editor.updateBlock(props.block, { props: { query: [query, asTable ? 'as=table' : '', proj ? 'scope=project' : ''].filter(Boolean).join(' ') } } as never);
      const scoped = table && scopeProject && project ? { ...table, rows: table.rows.filter(r => r.file.includes(`/projects/${project}/`)) } : table;
      return (
        <div className="view-block" contentEditable={false} ref={el => { stop(el); (hostRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}>
          <div className="view-head">
            <span className="chips-label">view</span>
            <select className="collection-kind" value={slug} title="the type this view lists" onChange={e => props.editor.updateBlock(props.block, { props: { slug: e.target.value, query: '' } } as never)}>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {table && <span className="muted small">{table.rows.length} {table.typed ? '' : '· not a declared type'}</span>}
            <button type="button" className="collection-view-toggle" title={asTable ? 'show as blocks' : 'show as a table'} onClick={() => setAs(!asTable)}>{asTable ? '☰ blocks' : '▤ table'}</button>
            <select className="collection-kind" value={scopeProject ? 'project' : 'product'} title="where the blocks come from: the whole product, or this document's project" onChange={e => setScope(e.target.value === 'project')}>
              <option value="product">whole product</option><option value="project">this project</option>
            </select>
            {err && <span className="bad">{err}</span>}
          </div>
          {scoped && initial && <InstanceTable product={product} table={scoped} initial={initial} onChange={onChange} as={asTable ? 'table' : 'list'} readOnly compact={!!scope} />}
          {scoped && !scoped.rows.length && <p className="muted small">No {slug}s yet.</p>}
        </div>
      );
    },
  },
);
