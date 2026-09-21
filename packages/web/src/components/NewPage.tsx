'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TEMPLATES } from '@/lib/templates';
import { usePeek } from './PeekProvider';
import { ImportDocs, type Picked } from './ImportDocs';
import { requestSend } from './CommandBox';

// New page, the way Notion opens one (req:wf2.page.new-dialog): a large sheet with "Add to <parent>" on top, the
// title as a big placeholder, and "Get started with" underneath — a template, a typed page, Import… (markdown, a
// folder, or code: the same dialog as the rail's ↥), or Ask an agent. Enter on the title makes a blank page;
// everything goes through the document route (op:doc.create) and the import route.
type Doc = { slug: string; title: string; project?: string; icon?: string };
export function NewPage({ product, project: initialProject, projects, docs, defaultParent = '', initial = [], onClose }: { product: string; project: string; projects: { slug: string; title: string }[]; docs: Doc[]; defaultParent?: string; initial?: Picked[]; onClose: () => void }) {
  const router = useRouter();
  const { ownTypes } = usePeek();
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState(defaultParent);
  const [project, setProject] = useState(initialProject);
  const [mode, setMode] = useState<'page' | 'import'>(initial.length ? 'import' : 'page');
  const [pick, setPick] = useState<'template' | 'type' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const parentProject = docs.find(d => d.slug === parent)?.project;
  const effectiveProject = parentProject ?? project;
  const parentDoc = docs.find(d => d.slug === parent);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);

  async function create(opts: { template?: string; type?: string; ask?: boolean } = {}) {
    const t = title.trim() || (opts.template && opts.template !== 'blank' ? opts.template.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()) : opts.type ? `New ${opts.type}` : 'New page');
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/${effectiveProject}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t, template: opts.template ?? 'blank', parent, type: opts.type ?? 'module' }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error ?? 'could not create the page'); return; }
    onClose();
    router.push(`/${product}/${effectiveProject}/d/${j.slug}`); router.refresh();
    // Ask an agent: the new page attached to the command box, the title as the first words of the request
    if (opts.ask) setTimeout(() => requestSend({ refs: [j.node], text: title.trim() ? `${title.trim()}: ` : '', source: { project: effectiveProject, doc: j.slug } }), 400);
  }
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
          <input ref={titleRef} autoFocus className="np-title" value={title} placeholder="New page" onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !busy) create(); }} />
          <div className="np-body" onClick={() => titleRef.current?.focus()} />
          <div className="np-start">
            <span className="muted">Get started with</span>
            <div className="np-chips">
              {chip('Ask an agent', '⇢', () => create({ ask: true }))}
              {chip('Import…', '↥', () => setMode('import'))}
              {chip('Template', '▤', () => setPick(p => (p === 'template' ? null : 'template')), pick === 'template' ? 'on' : '')}
              {ownTypes.length > 0 && chip('Typed page', '◇', () => setPick(p => (p === 'type' ? null : 'type')), pick === 'type' ? 'on' : '')}
              {chip('Blank', '＋', () => create())}
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
