'use client';
import { useContext } from 'react';
import { EditorScope } from './EditorScope';
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { usePeek } from './PeekProvider';
import { InstanceTable } from './InstanceTable';
import { TaskTable } from './TaskTable';
import { KINDS } from '@/lib/ids';
import { KIND_LABELS, kindExample } from '@/lib/knowledge';
import { EmptyState } from './EmptyState';
import { GoalsEmpty } from './TrackList';
import { WorkEmpty } from './WorkList';
import { detailOf, knowledgeChanged } from '@/lib/change';
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
      const scopeNamed = rawQuery.match(/(?:^|\s)scope=(project|product|workspace)(?=\s|$)/)?.[1] ?? '';
      // `coverage=1` on a req view adds the coverage cell: what satisfies each requirement, what verifies it, its tasks,
      // and a gap where either side is missing (decision:wf2.traceability-is-the-verb)
      const coverage = /(^|\s)coverage=1(\s|$)/.test(rawQuery);
      const query = rawQuery.replace(/(^|\s)as=(table|list)(?=\s|$)/, '').replace(/(^|\s)scope=(project|product|workspace)(?=\s|$)/, '').replace(/(^|\s)coverage=1(?=\s|$)/, '').trim();
      const withAs = (q: string, sc = scopeNamed) => [q, asTable ? 'as=table' : '', sc ? `scope=${sc}` : '', coverage ? 'coverage=1' : ''].filter(Boolean).join(' ');
      const hostRef = useRef<HTMLDivElement>(null);
      const [project, setProject] = useState('');
      useEffect(() => { setProject((hostRef.current?.closest('.doc-editor') as HTMLElement | null)?.dataset.project ?? ''); }, []);
      const { product, ownTypes, workspace } = usePeek();
      const [docOf, setDocOf] = useState('');
      useEffect(() => { setDocOf((hostRef.current?.closest('.doc-editor') as HTMLElement | null)?.dataset.doc ?? ''); }, []);
      // every vault of the workspace (req:wf2.workspace-open): asked for on the line (`scope=workspace`), and what the
      // app's own Goals and Work pages show when a folder with several vaults is open and the line names no scope
      const many = workspace.vaults.length > 1;
      const scopeAll = many && (scopeNamed === 'workspace' || (!scopeNamed && workspace.folder && /^~(goals|work)$/.test(docOf)));
      const [table, setTable] = useState<Table | null>(null);
      const [err, setErr] = useState('');
      const [version, setVersion] = useState(0);
      useEffect(() => { // refetch when the graph changes on disk (LiveRefresh relays the server's events)
        const h = (e: Event) => { if (knowledgeChanged(detailOf(e))) setVersion(v => v + 1); };   // not for a save of prose (lib/change)
        window.addEventListener('wf:change', h); return () => window.removeEventListener('wf:change', h);
      }, []);
      useEffect(() => {
        let live = true;
        fetch(`/api/${product}/view/${slug}${scopeAll ? '?scope=workspace' : ''}`).then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? r.statusText); return r.json() as Promise<Table>; })
          .then(t => { if (live) { setTable(t); setErr(''); } }).catch(e => { if (live) setErr(String(e.message ?? e)); });
        return () => { live = false; };
      }, [product, slug, version, scopeAll]);
      const options = [...ownTypes.map(t => t.slug), ...BASE_VIEW_KINDS.filter(k => !ownTypes.some(t => t.slug === k))]; if (!options.includes(slug)) options.push(slug);
      const initial = table ? parseViewQuery(query, table.columns.map(c => c.name)) : undefined;
      const onChange = (f: Filters) => { const q = viewQuery(f); if (q !== query) props.editor.updateBlock(props.block, { props: { query: withAs(q) } } as never); };
      const setAs = (t: boolean) => props.editor.updateBlock(props.block, { props: { query: [query, t ? 'as=table' : '', scopeNamed ? `scope=${scopeNamed}` : '', coverage ? 'coverage=1' : ''].filter(Boolean).join(' ') } } as never);
      const setScope = (sc: string) => props.editor.updateBlock(props.block, { props: { query: withAs(query, sc) } } as never);
      const scoped = table && scopeProject && project ? { ...table, rows: table.rows.filter(r => r.file.includes(`/projects/${project}/`)) } : table;
      // a new instance from the list's empty last line: the document this view is in as its home (a base kind has no
      // collection), `part-of` from the view's own filter so the row lands where the list shows it
      const docSlug = (hostRef.current?.closest('.doc-editor') as HTMLElement | null)?.dataset.doc ?? '';
      const onNew = async (title: string): Promise<string | null> => {
        const idSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        if (!idSlug) return 'a title, please';
        const partOf = (query.match(/(?:^|\s)part-of=("([^"]*)"|(\S+))/) ?? [])[2] ?? (query.match(/(?:^|\s)part-of=("([^"]*)"|(\S+))/) ?? [])[3];
        const r = await fetch(`/api/${product}/types/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: partOf ? `${partOf.slice(partOf.indexOf(':') + 1)}.${idSlug}` : idSlug, title, home: project && docSlug ? `${project}/${docSlug}` : undefined, props: partOf ? { 'part-of': partOf } : {} }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); return j.message ?? j.error ?? 'could not write'; }
        setVersion(v => v + 1); return null;
      };
      return (
        <div className="view-block" contentEditable={false} ref={el => { stop(el); (hostRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}>
          <div className="view-head">
            <span className="chips-label">view</span>
            <select className="collection-kind" value={slug} title="the type this view lists" onChange={e => props.editor.updateBlock(props.block, { props: { slug: e.target.value, query: '' } } as never)}>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {table && <span className="muted small">{table.rows.length} {table.typed ? '' : '· not a declared type'}</span>}
            <button type="button" className="collection-view-toggle" title={asTable ? 'show as blocks' : 'show as a table'} onClick={() => setAs(!asTable)}>{asTable ? '☰ blocks' : '▤ table'}</button>
            <select className="collection-kind" value={scopeAll ? 'workspace' : scopeProject ? 'project' : 'product'} title="where the blocks come from: every vault of the workspace, this vault, or this document's project" onChange={e => setScope(e.target.value)}>
              {many && <option value="workspace">all vaults</option>}<option value="product">{many ? 'this vault' : 'whole product'}</option><option value="project">this project</option>
            </select>
            {err && <span className="bad">{err}</span>}
          </div>
          {scoped && initial && asTable && slug === 'task' && <TaskTable product={product} table={scoped} onNew={onNew} />}
          {scoped && initial && !(asTable && slug === 'task') && <InstanceTable product={product} table={scoped} initial={initial} onChange={onChange} as={asTable ? 'table' : 'list'} readOnly compact={!!scope} onNew={onNew} coverage={coverage} empty={scope ? undefined : viewEmpty(slug, !asTable)} />}
          {scoped && !scoped.rows.length && scope && <p className="muted small">No {slug}s yet.</p>}
        </div>
      );
    },
  },
);

// a view with nothing to list yet (the system Goals and Work pages first of all, decision:wf2.views-are-pages): what
// the kind is for and the line that makes one; the list's own new line below it writes one here
function viewEmpty(slug: string, list: boolean) {
  if (slug === 'goal') return <GoalsEmpty />;
  if (slug === 'task') return <WorkEmpty />;
  return (
    <EmptyState title={`No ${(KIND_LABELS[slug] ?? slug).toLowerCase()} yet`}>
      <p>Write one as a line in any document{list ? ', or type a title below' : ''}:</p>
      <p><code>{kindExample(slug)}</code></p>
    </EmptyState>
  );
}
