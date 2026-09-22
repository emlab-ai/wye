'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TEMPLATES } from '@/lib/templates';
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
  const [parent, setParent] = useState(defaultParent);
  const [project, setProject] = useState(initialProject);
  const [mode, setMode] = useState<'page' | 'import'>(startImport || initial.length ? 'import' : 'page');
  const [pick, setPick] = useState<'template' | 'type' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // the page once it exists: its slug, project and the editor's starting body + hash
  const [page, setPage] = useState<{ slug: string; node: string; project: string; body: string; hash: string } | null>(null);
  const making = useRef<Promise<typeof page> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentProject = docs.find(d => d.slug === parent)?.project;
  const effectiveProject = parentProject ?? project;
  const parentDoc = docs.find(d => d.slug === parent);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);

  // make the page (once) and load its body for the editor; a template or a type shapes it when chosen before writing
  async function ensurePage(opts: { template?: string; type?: string } = {}): Promise<typeof page> {
    if (page) return page;
    if (making.current) return making.current;
    making.current = (async () => {
      const t = titleRefLatest.current.trim() || (opts.template && opts.template !== 'blank' ? opts.template.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) : opts.type ? `New ${opts.type}` : 'New page');
      setBusy(true); setMsg(null);
      const r = await fetch(`/api/${product}/${effectiveProject}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, template: opts.template ?? 'blank', parent, type: opts.type ?? 'module' }) });
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

  return (
    <div className="modal-back np-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal np-sheet" role="dialog" aria-label="New page">
        <div className="np-top">
          <span className="muted">Add to</span>
          <select className="np-parent" value={parent} onChange={e => setParent(e.target.value)} title="The page this one goes under">
            <option value="">{projects.length > 1 ? `(top level of ${projects.find(p => p.slug === project)?.title ?? project})` : '(top level)'}</option>
            {docs.map(d => <option key={d.slug} value={d.slug}>{d.icon ? `${d.icon} ` : ''}{d.title}</option>)}
          </select>
          {!parent && projects.length > 1 && <select className="np-parent" value={project} onChange={e => setProject(e.target.value)} title="Folder">{projects.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}</select>}
          <span className="np-spacer" />
          <button type="button" className="np-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {mode === 'page' && <>
          <input ref={titleRef} autoFocus className="np-title" value={title} placeholder="New page" onChange={e => onTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); void ensurePage().then(() => setTimeout(() => (document.querySelector('.np-editor .bn-editor') as HTMLElement | null)?.focus(), 200)); } }} />
          <div className="np-body" onClick={() => { if (!page) void ensurePage(); }}>
            {page
              ? <div className="np-editor"><PageEditor product={product} project={page.project} slug={page.slug} body={page.body} ifMatch={page.hash} autoFocus /></div>
              : <p className="np-hint muted">{busy ? 'Making the page…' : 'Type a title, or start writing here.'}</p>}
          </div>
          {page && <div className="np-open"><button type="button" className="linkish" onClick={openPage}>Open as a page ↗</button></div>}
          <div className="np-start">
            <span className="muted">Get started with</span>
            <div className="np-chips">
              {chip('Ask an agent', '⇢', () => create({ ask: true }))}
              {!page && chip('Import…', '↥', () => setMode('import'))}
              {!page && chip('Template', '▤', () => setPick(p => (p === 'template' ? null : 'template')), pick === 'template' ? 'on' : '')}
              {!page && ownTypes.length > 0 && chip('Typed page', '◇', () => setPick(p => (p === 'type' ? null : 'type')), pick === 'type' ? 'on' : '')}
              {!page && chip('Blank', '＋', () => ensurePage())}
            </div>
            {pick === 'template' && <div className="np-picks">{TEMPLATES.filter(t => t !== 'blank').map(t => <button key={t} type="button" onClick={() => create({ template: t })} disabled={busy}>{t.replace(/-/g, ' ')}</button>)}</div>}
            {pick === 'type' && <div className="np-picks">{ownTypes.map(t => <button key={t.slug} type="button" onClick={() => create({ type: t.slug })} disabled={busy} title={t.slug}>{t.slug}</button>)}</div>}
            {msg && <p className="notice">{msg}</p>}
            {parentDoc && <p className="muted small">under {parentDoc.icon ? `${parentDoc.icon} ` : ''}{parentDoc.title}</p>}
          </div>
        </>}
        {mode === 'import' && <div className="np-import">
          <button type="button" className="linkish" onClick={() => setMode('page')}>‹ New page</button>
          <ImportDocs product={product} project={effectiveProject} projects={projects} docs={docs} defaultParent={parent} initial={initial} onClose={onClose} />
        </div>}
      </div>
    </div>
  );
}
