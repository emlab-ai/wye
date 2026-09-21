'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Import… on the Documents head, and the drop zone the rail shows for files (component:import-docs,
// req:wf2.import.markdown, req:wf2.import.code). Two modes: markdown files or a folder of them become documents
// of a project — unchanged, the tree kept — and, when "Analyse with agent" stays on, a hook hands each one to an
// agent with the Import skill; From code points at a folder of source and gets a feature's definition read from
// it, its describe tasks handed to an agent with the Describe-module skill.
export type Picked = { path: string; file: File };
type Doc = { slug: string; title: string; folder: boolean; parent: string | null; from: string | null };
type MdResult = { docs: Doc[]; skipped: { path: string; reason: string }[]; assets: string[]; analyse: boolean };
type CodeResult = { project: string; written: number; skipped: number; areas: { slug: string; title: string; dir: string; files: number }[]; tasks: { id: string; session?: string; error?: string }[] };

// A drop's items, walked: folders keep their paths ("notes/2026/plan.md"). Files only, markdown or images.
export async function filesOfDrop(dt: DataTransfer): Promise<Picked[]> {
  const out: Picked[] = [];
  const entries = [...dt.items].map(i => (i as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.() ?? null);
  if (entries.some(Boolean)) {
    const walk = async (e: FileSystemEntry, prefix: string): Promise<void> => {
      if (e.isFile) { const f = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)); out.push({ path: prefix + e.name, file: f }); return; }
      if (e.isDirectory) {
        const reader = (e as FileSystemDirectoryEntry).createReader();
        const all: FileSystemEntry[] = [];
        for (;;) { const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej)); if (!batch.length) break; all.push(...batch); }
        for (const c of all) if (!c.name.startsWith('.') && c.name !== 'node_modules') await walk(c, prefix + e.name + '/');
      }
    };
    for (const e of entries) if (e) await walk(e, '');
  } else for (const f of [...dt.files]) out.push({ path: f.name, file: f });
  return out.filter(p => /\.(md|markdown|png|jpe?g|gif|webp|svg)$/i.test(p.path));
}

export function ImportDocs({ product, project: initialProject, projects, docs, defaultParent = '', initial = [], onClose }: { product: string; project: string; projects: { slug: string; title: string }[]; docs: { slug: string; title: string; project?: string }[]; defaultParent?: string; initial?: Picked[]; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<'md' | 'code'>('md');
  const [project, setProject] = useState(initialProject);
  const [parent, setParent] = useState(defaultParent);
  const [analyse, setAnalyse] = useState(true);
  const [picked, setPicked] = useState<Picked[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<MdResult | null>(null);
  const [name, setName] = useState('');
  const [codePath, setCodePath] = useState('');
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null);
  const fileIn = useRef<HTMLInputElement>(null); const dirIn = useRef<HTMLInputElement>(null);
  useEffect(() => { if (dirIn.current) dirIn.current.setAttribute('webkitdirectory', ''); }, []);
  const parentProject = docs.find(d => d.slug === parent)?.project;
  const effectiveProject = parentProject ?? project;
  const mdCount = picked.filter(p => /\.(md|markdown)$/i.test(p.path)).length;

  const pick = (list: FileList | null, keepPath: boolean) => {
    if (!list) return;
    const add: Picked[] = [...list].map(f => ({ path: keepPath ? ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name) : f.name, file: f }));
    setPicked(ps => [...ps, ...add.filter(a => !ps.some(p => p.path === a.path))]);
  };
  async function importMd() {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    for (const p of picked) fd.append(p.path, p.file, p.path);
    if (parent) fd.append('parent', parent);
    fd.append('analyse', analyse ? '1' : '0');
    const r = await fetch(`/api/${product}/${effectiveProject}/import`, { method: 'POST', body: fd });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setResult(j); setPicked([]); router.refresh();
  }
  async function importCode() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/import-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, path: codePath, analyse }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setCodeResult(j); router.refresh();
  }
  const first = result?.docs.find(d => !d.folder) ?? result?.docs[0];
  return (
    <div className="newdoc-form form import-form" onDragOver={e => { e.preventDefault(); }} onDrop={async e => { e.preventDefault(); const got = await filesOfDrop(e.dataTransfer); setPicked(ps => [...ps, ...got.filter(a => !ps.some(p => p.path === a.path))]); setMode('md'); }}>
      <div className="import-modes" role="tablist">
        <button role="tab" aria-selected={mode === 'md'} className={mode === 'md' ? 'on' : ''} onClick={() => setMode('md')}>Markdown</button>
        <button role="tab" aria-selected={mode === 'code'} className={mode === 'code' ? 'on' : ''} onClick={() => setMode('code')}>From code</button>
      </div>
      {mode === 'md' && !result && <>
        <p className="muted small">Files or a folder of <code>.md</code>: each becomes a document, unchanged, the folder's tree kept. Drop them here too.</p>
        <div className="import-pick">
          <button onClick={() => fileIn.current?.click()}>Choose files…</button>
          <button onClick={() => dirIn.current?.click()}>Choose a folder…</button>
          <input ref={fileIn} type="file" multiple accept=".md,.markdown,text/markdown" hidden onChange={e => { pick(e.target.files, false); e.target.value = ''; }} />
          <input ref={dirIn} type="file" multiple hidden onChange={e => { pick(e.target.files, true); e.target.value = ''; }} />
          {picked.length > 0 && <span className="muted small">{mdCount} markdown file{mdCount === 1 ? '' : 's'}{picked.length > mdCount ? ` + ${picked.length - mdCount} image${picked.length - mdCount === 1 ? '' : 's'}` : ''}</span>}
        </div>
        {picked.length > 0 && <ul className="import-list">{picked.slice(0, 12).map(p => <li key={p.path}><code>{p.path}</code><button className="linkish" onClick={() => setPicked(ps => ps.filter(x => x.path !== p.path))} aria-label={`remove ${p.path}`}>×</button></li>)}{picked.length > 12 && <li className="muted">… and {picked.length - 12} more</li>}</ul>}
        <label><span>under</span><select value={parent} onChange={e => setParent(e.target.value)}><option value="">(top level)</option>{docs.map(d => <option key={d.slug} value={d.slug}>{d.title}</option>)}</select></label>
        {!parent && projects.length > 1 && <label><span>folder</span><select value={project} onChange={e => setProject(e.target.value)}>{projects.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}</select></label>}
        <label className="check"><input type="checkbox" checked={analyse} onChange={e => setAnalyse(e.target.checked)} /> Analyse with agent — extract types, requirements, facts and decisions as proposed blocks</label>
        <div className="sec-actions"><button className="pri" disabled={busy || !mdCount} onClick={importMd}>{busy ? 'Importing…' : `Import ${mdCount || ''}`}</button><button disabled={busy} onClick={onClose}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
      </>}
      {mode === 'md' && result && <>
        <p><b>{result.docs.filter(d => !d.folder).length} document{result.docs.filter(d => !d.folder).length === 1 ? '' : 's'}</b> imported{result.docs.some(d => d.folder) ? ` in ${result.docs.filter(d => d.folder).length} folder page${result.docs.filter(d => d.folder).length === 1 ? '' : 's'}` : ''}{result.assets.length ? `, ${result.assets.length} image${result.assets.length === 1 ? '' : 's'}` : ''}.
          {result.analyse ? ' An agent is analysing each one; its blocks arrive in the Inbox as proposed.' : ' Not analysed — each page has an Analyse button.'}</p>
        <ul className="import-list">{result.docs.filter(d => !d.folder).slice(0, 12).map(d => <li key={d.slug}><a href={`/${product}/${effectiveProject}/d/${d.slug}`}>{d.title}</a> <span className="muted small">{d.from}</span></li>)}</ul>
        {result.skipped.length > 0 && <p className="muted small">skipped: {result.skipped.map(s => `${s.path} (${s.reason})`).join(', ')}</p>}
        <div className="sec-actions">{first && <button className="pri" onClick={() => { onClose(); router.push(`/${product}/${effectiveProject}/d/${first.slug}`); }}>Open {first.title}</button>}<button onClick={onClose}>Close</button></div>
      </>}
      {mode === 'code' && !codeResult && <>
        <p className="muted small">Point at a folder of source: its definition is read from the code — every module, page, component, library, operation and test, shallow — as a project of its own, and an agent maps each module to requirements in the person's words (reverse engineering, skill:describe-module).</p>
        <label><span>name</span><input autoFocus value={name} placeholder="e.g. Inventory" onChange={e => setName(e.target.value)} /></label>
        <label><span>folder</span><input value={codePath} placeholder="src/inventory — relative to the product's repo, or absolute" onChange={e => setCodePath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim() && codePath.trim()) importCode(); }} /></label>
        <label className="check"><input type="checkbox" checked={analyse} onChange={e => setAnalyse(e.target.checked)} /> Describe with agent — one session per module, requirements mapped to the code</label>
        <div className="sec-actions"><button className="pri" disabled={busy || !name.trim() || !codePath.trim()} onClick={importCode}>{busy ? 'Reading the code…' : 'Import'}</button><button disabled={busy} onClick={onClose}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
      </>}
      {mode === 'code' && codeResult && <>
        <p><b>{codeResult.written} page{codeResult.written === 1 ? '' : 's'}</b> written in project <code>{codeResult.project}</code>{codeResult.skipped ? ` (${codeResult.skipped} existed and were kept)` : ''}: {codeResult.areas.length} module{codeResult.areas.length === 1 ? '' : 's'}.
          {codeResult.tasks.length ? ` ${codeResult.tasks.filter(t => t.session).length} describe task${codeResult.tasks.filter(t => t.session).length === 1 ? '' : 's'} handed to an agent — the Agents page shows them.` : ''}</p>
        <ul className="import-list">{codeResult.areas.map(a => <li key={a.slug}>{a.title} <span className="muted small">{a.dir} · {a.files} files{codeResult.tasks.find(t => t.id.endsWith('.' + a.slug))?.error ? ` · ${codeResult.tasks.find(t => t.id.endsWith('.' + a.slug))!.error}` : ''}</span></li>)}</ul>
        <div className="sec-actions"><button className="pri" onClick={() => { onClose(); router.push(`/${product}/${codeResult.project}/d/${codeResult.project}`); }}>Open</button><button onClick={onClose}>Close</button></div>
      </>}
    </div>
  );
}
