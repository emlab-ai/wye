'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const BlockEditor = dynamic(() => import('./BlockEditor'), { ssr: false });

// A prose section that is always editable. The server-rendered reader (children) shows until the editor is
// ready, then the editor takes over; every change autosaves with the section's current hash.
export function SectionEditor({ project, slug, index, text, ifMatch, children }: { project: string; slug: string; index: number; text: string; ifMatch: string; children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [raw, setRaw] = useState(false);
  const [draft, setDraft] = useState(text);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle');
  const [lint, setLint] = useState<string | null>(null);
  const hash = useRef(ifMatch);
  useEffect(() => { hash.current = ifMatch; setDraft(text); }, [ifMatch, text]);

  async function save(md: string) {
    setState('saving');
    const r = await fetch(`/api/p/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'replace-segment', index, ifMatch: hash.current, text: md }) });
    const j = await r.json();
    if (!r.ok) { setState(j.error === 'conflict' ? 'conflict' : 'error'); return; }
    hash.current = (j.hashes as (string | null)[])[index] ?? hash.current;
    setLint(j.lintOk ? null : (j.lintErrors as string[]).join(' · '));
    setState('saved');
    router.refresh();
  }

  return (
    <div className={`live ${ready ? 'ready' : ''}`}>
      <div className="live-tools">
        <span className={`save-state ${state}`}>{state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : state === 'conflict' ? 'changed on disk — reload' : state === 'error' ? 'save failed' : ''}</span>
        <button onClick={() => setRaw(v => !v)} title="toggle raw markdown">{raw ? 'blocks' : 'md'}</button>
      </div>
      {raw ? (
        <textarea className="raw" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== text) save(draft); }} rows={Math.min(40, draft.split('\n').length + 2)} />
      ) : (
        <>
          {!ready && <div className="reader">{children}</div>}
          <div hidden={!ready}><BlockEditor markdown={text} onMarkdown={save} onReady={() => setReady(true)} /></div>
        </>
      )}
      {lint && <p className="notice">Lint: {lint}</p>}
    </div>
  );
}
