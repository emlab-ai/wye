'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TEMPLATES } from '@/lib/templates';

export function NewDoc({ product, project: initialProject, projects, docs, defaultParent, open: forceOpen, onClose }: { product: string; project: string; projects?: { slug: string; title: string }[]; docs: { slug: string; title: string; project?: string }[]; defaultParent: string; open?: boolean; onClose?: () => void }) {
  const [project, setProject] = useState(initialProject);
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const open = forceOpen ?? openState;
  const setOpen = (v: boolean) => { setOpenState(v); if (!v) onClose?.(); };
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<string>('blank');
  const [parent, setParent] = useState(defaultParent);
  // a document lives in its parent's project; without a parent the project can be picked when there are several
  const parentProject = docs.find(d => d.slug === parent)?.project;
  const effectiveProject = parentProject ?? project;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function create() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/${effectiveProject}/doc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, template, parent }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setOpen(false); setTitle(''); router.push(`/${product}/${effectiveProject}/d/${j.slug}`); router.refresh();
  }
  if (!open) return <button className="newdoc" onClick={() => setOpen(true)}>+ New document</button>;
  return (
    <div className="newdoc-form form">
      <label><span>title</span><input autoFocus value={title} placeholder="e.g. Inventory PRD" onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setOpen(false); }} /></label>
      <label><span>template</span><select value={template} onChange={e => setTemplate(e.target.value)}>{TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label><span>parent</span><select value={parent} onChange={e => setParent(e.target.value)}><option value="">(top level)</option>{docs.map(d => <option key={d.slug} value={d.slug}>{d.title}</option>)}</select></label>
      {!parent && projects && projects.length > 1 && <label><span>folder</span><select value={project} onChange={e => setProject(e.target.value)}>{projects.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}</select></label>}
      <div className="sec-actions"><button className="pri" disabled={busy || !title.trim()} onClick={create}>{busy ? 'Creating…' : 'Create'}</button><button disabled={busy} onClick={() => setOpen(false)}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
    </div>
  );
}
