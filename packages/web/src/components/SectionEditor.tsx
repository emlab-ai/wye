'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

const BlockEditor = dynamic(() => import('./BlockEditor'), { ssr: false, loading: () => <p className="muted">Loading editor…</p> });

// Wraps a server-rendered prose section. View shows the children; Edit opens BlockNote (or a raw textarea) and
// saves the section back through the doc API with the section's hash.
export function SectionEditor({ project, slug, index, text, ifMatch, children }: { project: string; slug: string; index: number; text: string; ifMatch: string; children: ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'blocks' | 'raw'>('view');
  const [draft, setDraft] = useState(text);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'replace-segment', index, ifMatch, text: draft }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(j.error === 'conflict' ? 'This section changed on disk. Reload the page and edit again.' : `Save failed: ${j.error}`); return; }
    if (!j.lintOk) setMsg(`Saved. Lint reports: ${(j.lintErrors as string[]).join(' · ') || 'see ctx check'}`); else setMsg(null);
    setMode('view'); router.refresh();
  }

  if (mode === 'view') {
    return (
      <div className="sec">
        <div className="sec-tools"><button onClick={() => { setDraft(text); setMode('blocks'); }}>Edit</button><button onClick={() => { setDraft(text); setMode('raw'); }}>Raw</button></div>
        {children}
        {msg && <p className="notice">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="sec editing">
      {mode === 'blocks' ? <BlockEditor markdown={text} onMarkdown={setDraft} /> : <textarea className="raw" value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(30, draft.split('\n').length + 2)} />}
      <div className="sec-actions">
        <button className="pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button disabled={busy} onClick={() => { setMode('view'); setMsg(null); }}>Cancel</button>
        <button disabled={busy} onClick={() => setMode(mode === 'blocks' ? 'raw' : 'blocks')}>{mode === 'blocks' ? 'Raw markdown' : 'Blocks'}</button>
        {msg && <span className="notice">{msg}</span>}
      </div>
    </div>
  );
}
