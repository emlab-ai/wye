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
type CodeResult = { project: string; slug: string; node: string; task: string; session?: string; error?: string };

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

// What the person wants the agent to do with these pages, on top of the skill: kept as `brief:` on each imported page
// (skill:import reads it first) or as the import task's note. Always in view, beside the form.
function BriefBox({ brief, setBrief, placeholder, skill, on }: { brief: string; setBrief: (v: string) => void; placeholder: string; skill: string; on: boolean }) {
  return (
    <aside className={`import-brief ${on ? '' : 'off'}`} aria-label="Brief for the agent">
      <h4>What should the agent do?</h4>
      <textarea value={brief} rows={8} placeholder={placeholder} disabled={!on} onChange={e => setBrief(e.target.value)} />
      <p className="muted small">{on ? <>On top of the <code>{skill}</code> skill — the base instruction, editable on the Skills page.</> : 'Turn "Analyse with agent" on to use it.'}</p>
    </aside>
  );
}

export function ImportDocs({ product, project: initialProject, projects, docs, defaultParent = '', initial = [], onClose }: { product: string; project: string; projects: { slug: string; title: string }[]; docs: { slug: string; title: string; project?: string }[]; defaultParent?: string; initial?: Picked[]; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<'md' | 'code'>('md');
  const project = initialProject;   // the sheet's Add to says the folder; no picker here
  const [parent, setParent] = useState(defaultParent);
  const [analyse, setAnalyse] = useState(true);
  const [brief, setBrief] = useState('');
  const [pasted, setPasted] = useState('');   // a document typed or pasted in, imported as one page
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
  const count = mdCount + (pasted.trim() ? 1 : 0);

  const pick = (list: FileList | null, keepPath: boolean) => {
    if (!list) return;
    const add: Picked[] = [...list].map(f => ({ path: keepPath ? ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name) : f.name, file: f }));
    setPicked(ps => [...ps, ...add.filter(a => !ps.some(p => p.path === a.path))]);
  };
  async function importMd() {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    for (const p of picked) fd.append(p.path, p.file, p.path);
    if (pasted.trim()) { const name = (pasted.match(/^#\s+(.+?)\s*$/m)?.[1] ?? 'pasted').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'pasted'; fd.append(`${name}.md`, new Blob([pasted], { type: 'text/markdown' }), `${name}.md`); }
    if (parent) fd.append('parent', parent);
    fd.append('analyse', analyse ? '1' : '0');
    if (analyse && brief.trim()) fd.append('brief', brief.trim());
    const r = await fetch(`/api/${product}/${effectiveProject}/import`, { method: 'POST', body: fd });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setResult(j); setPicked([]); setPasted(''); router.refresh();
  }
  async function importCode() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/${product}/import-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, path: codePath, project: effectiveProject, parent: parent || undefined, analyse, brief: analyse && brief.trim() ? brief.trim() : undefined }) });
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
      {mode === 'md' && !result && <div className="import-split">
        <div className="import-main">
          <p className="muted small">Paste a document, or pick <code>.md</code> files or a folder (the folder's tree is kept). Each becomes a page, unchanged. Drop files here too.</p>
          <textarea className="import-paste" value={pasted} rows={7} placeholder={'Paste markdown here — a PRD, meeting notes, a glossary… The first heading becomes the title.'} onChange={e => setPasted(e.target.value)} />
          <div className="import-pick">
            <button onClick={() => fileIn.current?.click()}>Choose files…</button>
            <button onClick={() => dirIn.current?.click()}>Choose a folder…</button>
            <input ref={fileIn} type="file" multiple accept=".md,.markdown,text/markdown" hidden onChange={e => { pick(e.target.files, false); e.target.value = ''; }} />
            <input ref={dirIn} type="file" multiple hidden onChange={e => { pick(e.target.files, true); e.target.value = ''; }} />
            {picked.length > 0 && <span className="muted small">{mdCount} markdown file{mdCount === 1 ? '' : 's'}{picked.length > mdCount ? ` + ${picked.length - mdCount} image${picked.length - mdCount === 1 ? '' : 's'}` : ''}</span>}
          </div>
          {picked.length > 0 && <ul className="import-list">{picked.slice(0, 12).map(p => <li key={p.path}><code>{p.path}</code><button className="linkish" onClick={() => setPicked(ps => ps.filter(x => x.path !== p.path))} aria-label={`remove ${p.path}`}>×</button></li>)}{picked.length > 12 && <li className="muted">… and {picked.length - 12} more</li>}</ul>}
          <label className="check"><input type="checkbox" checked={analyse} onChange={e => setAnalyse(e.target.checked)} /><span><b>Analyse with agent</b> — an agent reads each page and rewrites it in place into requirements, decisions, facts, entities and tasks, all proposed; types the product lacks are proposed too.</span></label>
          <div className="sec-actions"><button className="pri" disabled={busy || (!mdCount && !pasted.trim())} onClick={importMd}>{busy ? 'Importing…' : `Import${count ? ` ${count}` : ''}`}</button><button disabled={busy} onClick={onClose}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
        </div>
        <BriefBox brief={brief} setBrief={setBrief} on={analyse} placeholder={'e.g. Only the requirements and open questions; keep the rest as prose. Treat every bullet under "Facts" as a fact. These are meeting notes: decisions and tasks, nothing else.'} skill="skill:import" />
      </div>}
      {mode === 'md' && result && <>
        <p><b>{result.docs.filter(d => !d.folder).length} document{result.docs.filter(d => !d.folder).length === 1 ? '' : 's'}</b> imported{result.docs.some(d => d.folder) ? ` in ${result.docs.filter(d => d.folder).length} folder page${result.docs.filter(d => d.folder).length === 1 ? '' : 's'}` : ''}{result.assets.length ? `, ${result.assets.length} image${result.assets.length === 1 ? '' : 's'}` : ''}.
          {result.analyse ? ' An agent is analysing each one; its blocks arrive in the Inbox as proposed.' : ' Not analysed — each page has an Analyse button.'}</p>
        <ul className="import-list">{result.docs.filter(d => !d.folder).slice(0, 12).map(d => <li key={d.slug}><a href={`/${product}/${effectiveProject}/d/${d.slug}`}>{d.title}</a> <span className="muted small">{d.from}</span></li>)}</ul>
        {result.skipped.length > 0 && <p className="muted small">skipped: {result.skipped.map(s => `${s.path} (${s.reason})`).join(', ')}</p>}
        <div className="sec-actions">{first && <button className="pri" onClick={() => { onClose(); router.push(`/${product}/${effectiveProject}/d/${first.slug}`); }}>Open {first.title}</button>}<button onClick={onClose}>Close</button></div>
      </>}
      {mode === 'code' && !codeResult && <div className="import-split">
        <div className="import-main">
          <p className="muted small">A page for the module, under the parent you chose, and an agent on it at once: it surveys the folder and writes the definition — purpose, requirements in the person's words, rules, entities, operations, tests — as proposed blocks. Nothing waits on the scan.</p>
          <div className="import-grid">
            <label><span>Name</span><input autoFocus value={name} placeholder="Inventory" onChange={e => setName(e.target.value)} /></label>
            <label><span>Folder</span><input value={codePath} placeholder="src/inventory — relative to the repo, or absolute" onChange={e => setCodePath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim() && codePath.trim()) importCode(); }} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={analyse} onChange={e => setAnalyse(e.target.checked)} /><span><b>Describe with agent</b> — the session starts now; without it the page and its task are created for you to assign later.</span></label>
          <div className="sec-actions"><button className="pri" disabled={busy || !name.trim() || !codePath.trim()} onClick={importCode}>{busy ? 'Creating…' : 'Import'}</button><button disabled={busy} onClick={onClose}>Cancel</button>{msg && <span className="notice">{msg}</span>}</div>
        </div>
        <BriefBox brief={brief} setBrief={setBrief} on={analyse} placeholder={'e.g. Focus on the public API and the data model; skip the tests. Every calculation as a rule with its formula. Write the requirements for the warehouse role, not the admin.'} skill="skill:import-code" />
      </div>}
      {mode === 'code' && codeResult && <>
        <p><b>{name.trim()}</b> is a page now{parent ? ` under ${docs.find(d => d.slug === parent)?.title ?? parent}` : ''}, with its import task on it{codeResult.session ? <> — an agent is reading the code in session <code>{codeResult.session.slice(0, 6)}</code>; the definition lands on the page as proposed blocks, and the Inbox shows them.</> : codeResult.error ? <> — not handed to an agent: {codeResult.error}. Assign the task from the page or the Work board.</> : '.'}</p>
        <div className="sec-actions"><button className="pri" onClick={() => { onClose(); router.push(`/${product}/${codeResult.project}/d/${codeResult.slug}`); }}>Open {name.trim()}</button><button onClick={onClose}>Close</button></div>
      </>}
    </div>
  );
}
