'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, TEMPLATE_INFO } from '@/lib/templates';
import { usePeek } from './PeekProvider';
import { ImportDocs, type Picked } from './ImportDocs';
import { requestSend } from './CommandBox';
import dynamic from 'next/dynamic';

// the sheet's body is the page's editor (req:wf2.page.new-dialog): the page is made the moment the person starts
// writing — a title, or a first keystroke in the body — and edited right there; lazily loaded like the embed's editor
const PageEditor = dynamic(() => import('./DocEditor'), { ssr: false, loading: () => <p className="muted" style={{ margin: '12px 96px' }}>…</p> });

// New page, the way Notion opens one (req:wf2.page.new-dialog): a large sheet with "Add to <parent>" on top, the
// title as a big placeholder, and "Get started with" underneath — a template, a typed page, Import… (markdown, a
// folder, or code: the same dialog as the rail's ↥), or Ask an agent. Enter on the title makes a blank page;
// everything goes through the document route (op:doc.create) and the import route.
type Doc = { slug: string; title: string; project?: string; icon?: string };
export function NewPage({ product, project: initialProject, projects, docs, defaultParent = '', initial = [], startImport = false, onClose }: { product: string; project: string; projects: { slug: string; title: string }[]; docs: Doc[]; defaultParent?: string; initial?: Picked[]; startImport?: boolean; onClose: () => void }) {
  const router = useRouter();
  const { ownTypes } = usePeek();
  const [title, setTitle] = useState('');
  // the parent as <project>/<slug>: two folders can each have a page called plan
  const refOf = (d: Doc) => `${d.project}/${d.slug}`;
  const [parent, setParent] = useState(() => { const d = docs.find(d => refOf(d) === defaultParent) ?? docs.find(d => d.slug === defaultParent); return d ? refOf(d) : ''; });
  const project = initialProject; // a root page goes to the product's main folder; folders are not chosen
  const [mode, setMode] = useState<'page' | 'import'>(startImport || initial.length ? 'import' : 'page');
  const [pick, setPick] = useState<'template' | 'type' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // the page once it exists: its slug, project and the editor's starting body + hash
  const [page, setPage] = useState<{ slug: string; node: string; project: string; body: string; hash: string } | null>(null);
  const making = useRef<Promise<typeof page> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentDoc = docs.find(d => refOf(d) === parent);
  const parentProject = parentDoc?.project;
  const effectiveProject = parentProject ?? project;
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);

  // make the page (once) and load its body for the editor; a template or a type shapes it when chosen before writing
  async function ensurePage(opts: { template?: string; type?: string } = {}): Promise<typeof page> {
    if (page) return page;
    if (making.current) return making.current;
    making.current = (async () => {
      const t = titleRefLatest.current.trim() || (opts.template && opts.template !== 'blank' ? opts.template.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) : opts.type ? `New ${opts.type}` : 'New page');
      setBusy(true); setMsg(null);
      const r = await fetch(`/api/${product}/${effectiveProject}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, template: opts.template ?? 'blank', parent: parentDoc?.slug ?? '', type: opts.type }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setBusy(false); setMsg(j.message ?? j.error ?? 'could not create the page'); making.current = null; return null; }
      const g = await fetch(`/api/${product}/${effectiveProject}/doc/${j.slug}`); const d = await g.json().catch(() => ({}));
      // a blank page's placeholder line goes: the sheet's editor starts on the title alone
      const body = String(d.body ?? '').replace(/^Write here\..*$/m, '').replace(/\n{3,}/g, '\n\n');
      const made = { slug: j.slug as string, node: j.node as string, project: effectiveProject, body, hash: String(d.bodyHash ?? '') };
      setPage(made); setBusy(false); router.refresh();
      return made;
    })();
    return making.current;
  }
  // the title edits the page's front matter once the page exists (debounced), and makes the page on the first letter
  const titleRefLatest = useRef('');
  function onTitle(v: string) {
    setTitle(v); titleRefLatest.current = v;
    if (!page) return;   // the page is made on Enter, a click into the body, or a chip — with the whole title
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => { void fetch(`/api/${product}/${page.project}/doc/${page.slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch: { title: v.trim() || 'New page' } }) }).then(() => router.refresh()); }, 600);
  }
  async function create(opts: { template?: string; type?: string; ask?: boolean } = {}) {
    const made = await ensurePage(opts); if (!made) return;
    if (opts.ask) { onClose(); router.push(`/${product}/${made.project}/d/${made.slug}`); setTimeout(() => requestSend({ refs: [made.node], text: title.trim() ? `${title.trim()}: ` : '', source: { project: made.project, doc: made.slug } }), 400); return; }
    if (opts.template || opts.type) { onClose(); router.push(`/${product}/${made.project}/d/${made.slug}`); return; }   // a shaped page opens as a page
  }
  const openPage = () => { if (page) { onClose(); router.push(`/${product}/${page.project}/d/${page.slug}`); } };
  const chip = (label: string, icon: string, onClick: () => void, extra?: string) => <button type="button" className={`np-chip ${extra ?? ''}`} onClick={onClick} disabled={busy}><i>{icon}</i>{label}</button>;
  const tab = (label: string, icon: string, on: boolean, onClick: () => void) => <button type="button" role="tab" aria-selected={on} className={`np-tab ${on ? 'on' : ''}`} onClick={onClick} disabled={busy}><i>{icon}</i>{label}</button>;
  const view: 'page' | 'template' | 'type' | 'import' = mode === 'import' ? 'import' : pick ?? 'page';

  return (
    <div className="modal-back np-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal np-sheet" role="dialog" aria-label="New page">
        <div className="np-top">
          <span className="muted">Add to</span>
          <select className="np-parent" value={parent} onChange={e => setParent(e.target.value)} title="The page this one goes under">
            <option value="">(top level)</option>
            {docs.map(d => <option key={refOf(d)} value={refOf(d)}>{d.icon ? `${d.icon} ` : ''}{d.title}</option>)}
          </select>
          <span className="np-spacer" />
          <button type="button" className="np-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {/* what to start with — the sheet's tabs: Page (write), Template, Typed page and Import switch what fills the
            sheet below; Ask an agent, Mind map, Timeline make the page at once */}
        {!page && <div className="np-tabs" role="tablist">
          {tab('Page', '✎', view === 'page', () => { setMode('page'); setPick(null); })}
          {tab('Template', '▤', view === 'template', () => { setMode('page'); setPick('template'); })}
          {ownTypes.length > 0 && tab('Typed page', '◇', view === 'type', () => { setMode('page'); setPick('type'); })}
          {tab('Import…', '↥', view === 'import', () => { setMode('import'); setPick(null); })}
          <span className="np-tabs-sep" />
          {chip('Ask an agent', '⇢', () => create({ ask: true }))}
          {chip('Mind map', '◈', () => create({ template: 'map' }))}
          {chip('Timeline', '▤', () => create({ template: 'timeline' }))}
        </div>}
        {msg && <p className="notice">{msg}</p>}
        {view === 'page' && <>
          <input ref={titleRef} autoFocus className="np-title" value={title} placeholder="New page" onChange={e => onTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); void ensurePage().then(() => setTimeout(() => (document.querySelector('.np-editor .bn-editor') as HTMLElement | null)?.focus(), 300)); } }} />
          <div className="np-body" onClick={() => { if (!page) void ensurePage(); }}>
            {page
              ? <div className="np-editor"><PageEditor product={product} project={page.project} slug={page.slug} body={page.body} ifMatch={page.hash} autoFocus /></div>
              : <p className="np-hint muted">{busy ? 'Making the page…' : 'Type a title, or start writing here.'}</p>}
          </div>
          {page && <div className="np-open">{chip('Ask an agent', '⇢', () => create({ ask: true }))}<button type="button" className="linkish" onClick={openPage}>Open as a page ↗</button></div>}
        </>}
        {view === 'template' && <Picker busy={busy} title={title} onTitle={onTitle} label="Templates" onPick={k => create({ template: k })}
          items={TEMPLATES.filter((t): t is TemplateKey => t !== 'blank').map(k => ({ key: k, ...TEMPLATE_INFO[k], use: `Use ${TEMPLATE_INFO[k].title.toLowerCase()}` }))} />}
        {view === 'type' && <Picker busy={busy} title={title} onTitle={onTitle} label="Types" onPick={k => create({ type: k })}
          items={ownTypes.map(t => ({ key: t.slug, icon: '◇', title: t.slug.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()), description: `A ${t.slug} page: its own card with the type's fields, filled in as you write.`, sections: t.cols.map(c => `${c.name}${c.required ? '' : ' (optional)'} — ${c.ref ? `link to ${c.ref}` : c.enum ? c.enum.join(' / ') : c.type}`), sectionsLabel: 'Fields', use: `New ${t.slug}` }))} />}
        {view === 'import' && <div className="np-import">
          <ImportDocs product={product} project={effectiveProject} projects={projects} docs={docs} defaultParent={parentDoc?.slug ?? ''} initial={initial} onClose={onClose} />
        </div>}
      </div>
    </div>
  );
}

// A picker that fills the sheet under its tabs (templates, the product's types): the list on the left; the item under
// the pointer (or the keyboard) described on the right — what it is for and what it starts with — and the new page's
// title above, so a template page can be named before it is made. A click, Enter or the button makes the page.
type TemplateKey = keyof typeof TEMPLATE_INFO;
type PickItem = { key: string; icon: string; title: string; description: string; sections: string[]; sectionsLabel?: string; use: string };
function Picker({ items, busy, title, onTitle, label, onPick }: { items: PickItem[]; busy: boolean; title: string; onTitle: (t: string) => void; label: string; onPick: (key: string) => void }) {
  const [hot, setHot] = useState(items[0]?.key ?? '');
  const info = items.find(i => i.key === hot) ?? items[0];
  const move = (d: number) => setHot(k => { const n = items.findIndex(i => i.key === k); return items[(n + d + items.length) % items.length].key; });
  if (!info) return <p className="muted np-empty">Nothing to pick from.</p>;
  return (
    <div className="np-picker" onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); onPick(hot); } }}>
      <input className="np-picker-title" value={title} placeholder="Title of the new page (optional)" onChange={e => onTitle(e.target.value)} />
      <div className="np-picker-body">
        <ul className="npt-list" role="listbox" aria-label={label}>
          {items.map(it => (
            <li key={it.key}><button type="button" role="option" aria-selected={it.key === hot} className={it.key === hot ? 'on' : ''} disabled={busy}
              onMouseEnter={() => setHot(it.key)} onFocus={() => setHot(it.key)} onClick={() => onPick(it.key)}>
              <i>{it.icon}</i><span>{it.title}</span></button></li>))}
        </ul>
        <div className="npt-about">
          <h3><i>{info.icon}</i>{info.title}</h3>
          <p>{info.description}</p>
          {info.sections.length > 0 && <div className="npt-sections"><span className="muted small">{info.sectionsLabel ?? 'Starts with'}</span><ol>{info.sections.map(x => <li key={x}>{x}</li>)}</ol></div>}
          <button type="button" className="pri" disabled={busy} onClick={() => onPick(info.key)}>{busy ? 'Making the page…' : info.use}</button>
        </div>
      </div>
    </div>
  );
}
